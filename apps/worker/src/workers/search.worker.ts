import { getPrismaClient } from "@lhm/database";
import type { Job } from "bullmq";
import type { Logger } from "pino";
import { applyClassifications, classifyMany } from "../ai/classify.js";
import { OpenAiClient } from "../ai/client.js";
import { createBrowserManager } from "../browser/factory.js";
import { classifyError, ErrorCode } from "../browser/errors.js";
import type { Env } from "../config/env.js";
import { extractPosts } from "../extraction/index.js";
import { persistPosts } from "../storage/persistPosts.js";
import type { SearchJobData } from "./types.js";

/**
 * Builds the search worker processor: opens an authenticated browser
 * session, records a SearchRun, extracts posts from LinkedIn search
 * results, deduplicates and persists them (Phases 4/5), and reports
 * results back through the SearchRun. Errors are classified so the
 * scheduler's retry/backoff and the dead-letter queue can react.
 */
export function createSearchProcessor(env: Env, workerName: string, logger: Logger) {
  const prisma = getPrismaClient();

  return async (job: Job<SearchJobData>): Promise<void> => {
    const { searchId, query, keywords, location } = job.data;
    const startedAt = Date.now();

    const run = await prisma.searchRun.create({
      data: { searchId, status: "SUCCESS", startedAt: new Date(startedAt) },
    });

    const browser = createBrowserManager(env, `${workerName}-${job.id}`, logger);
    try {
      const page = await browser.getAuthenticatedPage();
      logger.info({ searchId, query, url: page.url() }, "authenticated browser session ready");

      const { posts, stats } = await extractPosts(page, {
        query,
        keywords,
        location,
        maxPages: env.MAX_SCROLL_PAGES,
        scrollTimeoutMs: env.SCROLL_TIMEOUT_MS,
        overallTimeoutMs: env.SEARCH_TIMEOUT_MS,
      });
      logger.info(
        {
          searchId,
          query,
          postsFound: stats.postsFound,
          postsHiring: stats.postsHiring,
          pageCount: stats.pageCount,
          reachedEnd: stats.reachedEnd,
        },
        "extraction completed",
      );

      const persistResult = await persistPosts(prisma, { posts });
      logger.info({ searchId, ...persistResult }, "posts persisted");

      let postsHiring = persistResult.hiringInserted;
      if (env.OPENAI_API_KEY && persistResult.insertedPosts.length > 0) {
        const client = new OpenAiClient({
          apiKey: env.OPENAI_API_KEY,
          model: env.OPENAI_MODEL,
          baseUrl: env.OPENAI_BASE_URL,
          logger,
        });
        const inputs = persistResult.insertedPosts.map((post) => ({
          postId: post.liPostId ?? post.url ?? post.text,
          text: post.text,
          authorName: post.authorName,
          authorHeadline: post.authorHeadline,
          company: post.company,
        }));
        const outcomes = await classifyMany(client, inputs, { logger });
        const successful = outcomes.filter((outcome) => "result" in outcome);
        const failed = outcomes.length - successful.length;

        const ai = await applyClassifications(prisma, {
          outcomes: successful,
          model: env.OPENAI_MODEL,
        });
        postsHiring = ai.hiring;
        logger.info(
          {
            searchId,
            classified: ai.classified,
            hiring: ai.hiring,
            failed,
            latencyMs: ai.latencyMs,
          },
          "ai classification completed",
        );
      }

      await browser.persistCookies();

      await prisma.searchRun.update({
        where: { id: run.id },
        data: {
          status: stats.reachedEnd ? "SUCCESS" : "PARTIAL",
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt,
          postsFound: stats.postsFound,
          postsNew: persistResult.inserted,
          postsHiring,
          pageCount: stats.pageCount,
        },
      });

      logger.info(
        { searchId, query, keywords, location, postCount: posts.length },
        "search session completed",
      );
    } catch (error) {
      const classified = classifyError(error);
      await prisma.searchRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt,
          error: `${classified.code}: ${error instanceof Error ? error.message : String(error)}`,
        },
      });

      if (classified.code === ErrorCode.LOGIN_EXPIRED || classified.code === ErrorCode.CHECKPOINT) {
        await browser.close().catch(() => {});
        throw error;
      }
      throw error;
    } finally {
      await browser.close().catch(() => {});
    }
  };
}
