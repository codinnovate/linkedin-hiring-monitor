import type { Locator, Page } from "playwright";
import { END_OF_RESULTS_SELECTOR } from "./selectors.js";

export interface ScrollFeedOptions {
  /** Maximum scroll rounds before giving up. */
  maxPages: number;
  /** Max ms to wait for new content after a scroll before giving up. */
  scrollTimeoutMs: number;
  /** Overall budget for the whole scroll session. */
  overallTimeoutMs: number;
  /** Interval between growth polls while waiting for new content. */
  pollIntervalMs?: number;
  /** Consecutive no-growth rounds tolerated before assuming the end. */
  maxIdleRounds?: number;
}

export interface ScrollFeedResult {
  /** Number of scroll rounds performed (1 = initial content only). */
  pageCount: number;
  /** True when LinkedIn's "end of results" marker was seen. */
  reachedEnd: boolean;
}

/**
 * Drives LinkedIn's infinite scroll on a content-search page. Each round
 * scrolls to the bottom, then polls the update-card locator for growth.
 * Stops on the end-of-results marker, repeated no-growth rounds, the page
 * cap, or the overall time budget.
 */
export async function scrollFeed(
  page: Page,
  updateLocator: Locator,
  options: ScrollFeedOptions,
): Promise<ScrollFeedResult> {
  const { maxPages, scrollTimeoutMs, overallTimeoutMs } = options;
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  const maxIdleRounds = options.maxIdleRounds ?? 2;

  const deadline = Date.now() + overallTimeoutMs;
  let pageCount = 0;
  let idleRounds = 0;
  let reachedEnd = false;

  while (pageCount < maxPages && Date.now() < deadline) {
    const before = await updateLocator.count().catch(() => 0);

    await page
      .evaluate(() => {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" });
      })
      .catch(() => {});

    const roundDeadline = Date.now() + scrollTimeoutMs;
    let after = before;
    while (Date.now() < roundDeadline) {
      await page.waitForTimeout(pollIntervalMs);
      after = await updateLocator.count().catch(() => before);
      if (after > before) break;
    }

    const endOfResults = await page
      .evaluate(
        (sel) =>
          Array.from(document.querySelectorAll(sel)).some((el) => {
            const style = getComputedStyle(el);
            return (
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              el.getClientRects().length > 0
            );
          }),
        END_OF_RESULTS_SELECTOR,
      )
      .catch(() => false);

    if (endOfResults) {
      reachedEnd = true;
      pageCount += 1;
      break;
    }

    if (after > before) {
      idleRounds = 0;
    } else {
      idleRounds += 1;
      if (idleRounds >= maxIdleRounds) {
        pageCount += 1;
        break;
      }
    }
    pageCount += 1;
  }

  return { pageCount, reachedEnd };
}
