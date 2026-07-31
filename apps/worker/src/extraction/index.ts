import type { Page } from "playwright";
import { ErrorCode, LinkedInBrowserError } from "../browser/errors.js";
import { heuristicClassifyPost } from "./classify.js";
import { extractPostFromElement, isUsablePost } from "./parsePost.js";
import { scrollFeed } from "./scroll.js";
import { AUTH_WALL_SELECTOR, CHECKPOINT_SELECTOR, UPDATE_SELECTOR } from "./selectors.js";
import type { ExtractionOptions, ExtractionResult } from "./types.js";
import { buildSearchUrl } from "./urls.js";

/** Throws a classified error when LinkedIn shows an auth wall or checkpoint. */
async function assertNotBlocked(page: Page): Promise<void> {
  const authwall = await page
    .locator(AUTH_WALL_SELECTOR)
    .count()
    .catch(() => 0);
  if (authwall > 0) {
    throw new LinkedInBrowserError(
      "LinkedIn auth wall detected; session invalid",
      ErrorCode.LOGIN_EXPIRED,
      false,
    );
  }
  const checkpoint = await page
    .locator(CHECKPOINT_SELECTOR)
    .count()
    .catch(() => 0);
  if (checkpoint > 0) {
    throw new LinkedInBrowserError(
      "LinkedIn verification checkpoint presented",
      ErrorCode.CHECKPOINT,
      false,
    );
  }
}

/**
 * Runs one extraction pass over LinkedIn content-search results: navigates,
 * drives infinite scroll, parses every post card, and runs the conservative
 * heuristic hiring classification. Errors are classified for the worker's
 * retry/backoff machinery.
 */
export async function extractPosts(
  page: Page,
  options: ExtractionOptions,
): Promise<ExtractionResult> {
  const { query, keywords, location, maxPages, scrollTimeoutMs, overallTimeoutMs } = options;
  const url = buildSearchUrl({ query, keywords, location });

  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: Math.min(overallTimeoutMs, 60_000),
  });
  await assertNotBlocked(page);

  const updateLocator = page.locator(UPDATE_SELECTOR);
  const firstCardDeadline = Date.now() + Math.min(scrollTimeoutMs, overallTimeoutMs);
  while (Date.now() < firstCardDeadline) {
    const count = await updateLocator.count().catch(() => 0);
    if (count > 0) break;
    await page.waitForTimeout(1_000);
  }
  await assertNotBlocked(page);

  const initialCount = await updateLocator.count().catch(() => 0);
  if (initialCount === 0) {
    return {
      posts: [],
      stats: { pageCount: 1, postsFound: 0, postsHiring: 0, reachedEnd: true },
    };
  }

  const startedAt = Date.now();
  const { pageCount, reachedEnd } = await scrollFeed(page, updateLocator, {
    maxPages,
    scrollTimeoutMs,
    overallTimeoutMs: Math.max(0, overallTimeoutMs - (Date.now() - startedAt)),
  });

  const baseUrl = page.url();
  const seen = new Set<string>();
  const posts = [];
  const total = await updateLocator.count().catch(() => 0);
  for (let i = 0; i < total; i += 1) {
    const post = await extractPostFromElement(updateLocator.nth(i), {
      baseUrl,
      searchQuery: query,
    });
    if (!isUsablePost(post)) continue;
    const key = post.liPostId ?? post.url ?? post.text;
    if (seen.has(key)) continue;
    seen.add(key);
    posts.push(post);
  }

  const postsHiring = posts.filter((post) => heuristicClassifyPost(post) !== null).length;

  return {
    posts,
    stats: {
      pageCount,
      postsFound: posts.length,
      postsHiring,
      reachedEnd,
    },
  };
}
