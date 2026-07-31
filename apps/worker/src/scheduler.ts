import { getPrismaClient } from "@lhm/database";
import type { Queue } from "bullmq";
import type { Logger } from "pino";
import type { Env } from "./config/env.js";
import type { SearchJobData } from "./workers/types.js";

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

/**
 * Parses simple cron expressions into a millisecond interval. Supports
 * "*" and "every-N" (slash notation) on the seconds (6-part) or minutes
 * (5-part) field. Returns null for anything it can't represent as a
 * fixed interval.
 */
export function cronToIntervalMs(cron: string): number | null {
  const parts = cron.trim().split(/\s+/);

  if (parts.length === 6) {
    // seconds minutes hours dom month dow
    if (parts.every((part) => part === "*")) return 1_000;
    const seconds = parts[0]?.match(/^\*\/(\d+)$/);
    if (seconds && parts.slice(1).every((part) => part === "*")) {
      return Number.parseInt(seconds[1] ?? "0", 10) * 1000;
    }
    return null;
  }

  if (parts.length === 5) {
    // minutes hours dom month dow
    if (parts.every((part) => part === "*")) return MINUTE_MS;
    const minutes = parts[0]?.match(/^\*\/(\d+)$/);
    if (minutes && parts.slice(1).every((part) => part === "*")) {
      return Number.parseInt(minutes[1] ?? "0", 10) * MINUTE_MS;
    }
    const hours = parts[1]?.match(/^\*\/(\d+)$/);
    if (hours && parts[0] === "0" && parts.slice(2).every((part) => part === "*")) {
      return Number.parseInt(hours[1] ?? "0", 10) * HOUR_MS;
    }
    return null;
  }

  return null;
}

export interface SchedulerOptions {
  env: Env;
  queue: Queue;
  logger: Logger;
}

/**
 * Polls enabled searches and enqueues a search job for each search whose
 * configured interval has elapsed. Job IDs are stable per search so an
 * in-flight search is never enqueued twice.
 */
export async function startScheduler({
  env,
  queue,
  logger,
}: SchedulerOptions): Promise<() => Promise<void>> {
  const prisma = getPrismaClient();

  const tick = async (): Promise<void> => {
    try {
      const searches = await prisma.search.findMany({ where: { enabled: true } });
      const now = Date.now();
      let enqueued = 0;

      for (const search of searches) {
        const lastRun = await prisma.searchRun.findFirst({
          where: { searchId: search.id },
          orderBy: { startedAt: "desc" },
          select: { startedAt: true },
        });

        const due =
          !lastRun || now - lastRun.startedAt.getTime() >= search.intervalMinutes * MINUTE_MS;
        if (!due) continue;

        const data: SearchJobData = {
          searchId: search.id,
          userId: search.userId,
          query: search.query,
          keywords: search.keywords,
          location: search.location ?? undefined,
        };

        await queue.add("search", data, {
          jobId: `search-${search.id}`,
          removeOnComplete: 500,
          removeOnFail: 2_000,
          attempts: 3,
          backoff: { type: "exponential", delay: 30_000 },
        });
        enqueued += 1;
      }

      logger.info({ checked: searches.length, enqueued }, "scheduler tick");
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : error },
        "scheduler tick failed",
      );
    }
  };

  const intervalMs = cronToIntervalMs(env.SEARCH_CRON) ?? 5 * MINUTE_MS;
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();

  await tick();

  return async () => {
    clearInterval(timer);
  };
}
