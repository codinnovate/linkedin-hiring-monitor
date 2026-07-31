import type { RawPost } from "@lhm/shared";

/** Inputs used to run one extraction pass over LinkedIn search results. */
export interface ExtractionOptions {
  query: string;
  keywords?: string[];
  location?: string;
  /** Maximum scroll rounds before giving up. */
  maxPages: number;
  /** Max ms to wait for new content after a scroll before giving up. */
  scrollTimeoutMs: number;
  /** Overall budget for the whole extraction (navigation + scroll + parse). */
  overallTimeoutMs: number;
}

export interface ExtractionStats {
  /** Number of scroll rounds performed (1 = initial load only). */
  pageCount: number;
  /** Raw posts extracted from the page. */
  postsFound: number;
  /** Posts that heuristically look like hiring announcements. */
  postsHiring: number;
  /** True when LinkedIn's "end of results" marker was seen. */
  reachedEnd: boolean;
}

export interface ExtractionResult {
  posts: RawPost[];
  stats: ExtractionStats;
}
