/**
 * Centralized LinkedIn DOM selectors. LinkedIn frequently experiments with
 * its markup, so most selectors are ordered fallback lists (newest first).
 * Phase 9 swaps these for runtime-drift detection without touching callers.
 */

/** One post/update card on a content-search results page. */
export const UPDATE_SELECTOR = [
  "article.feed-shared-update-v2",
  "article.update-components-article",
  "li.feed-shared-update",
  "div[data-urn^='urn:li:activity:']",
].join(", ");

export const AUTHOR_NAME_SELECTORS = [
  ".update-components-actor__name",
  ".feed-shared-actor__name",
  ".update-components-actor__meta-link",
].join(", ");

export const AUTHOR_PROFILE_SELECTORS = [
  ".update-components-actor__meta-link[href]",
  "a[href^='/in/'][href]",
  "a[href^='/company/'][href]",
].join(", ");

export const AUTHOR_HEADLINE_SELECTORS = [
  ".update-components-actor__description",
  ".feed-shared-actor__description",
].join(", ");

export const AUTHOR_ORG_SELECTORS = [
  ".update-components-actor__org-name",
  ".feed-shared-actor__meta-link span",
].join(", ");

/** Body text of a post, including the truncated preview when collapsed. */
export const POST_TEXT_SELECTORS = [
  ".update-components-text__update",
  ".feed-shared-inline-show-more-text",
  ".feed-shared-text",
].join(", ");

export const TIMESTAMP_SELECTORS = [
  ".update-components-actor__sub-description",
  ".feed-shared-actor__sub-description",
].join(", ");

export const IMAGE_SELECTORS = [
  "img.update-components-image__image",
  "img.ivm-image-view-model__img",
  ".update-components-image img",
].join(", ");

export const VIDEO_SELECTORS = [
  "video.update-components-video__player",
  ".update-components-video video",
].join(", ");

export const REACTIONS_SELECTOR = ".social-details-social-counts__reactions-count";
export const COMMENTS_SELECTOR =
  ".social-details-social-counts__comments, .social-details-social-counts__comments span";
export const REPOSTS_SELECTOR = ".social-details-social-counts__reposts-count";

/** Shown at the bottom of a fully-loaded search results list. */
export const END_OF_RESULTS_SELECTOR =
  ".artdeco-empty-state__message, [data-test-id='search-blankstate']";

/** LinkedIn auth-wall shown to unauthenticated visitors. */
export const AUTH_WALL_SELECTOR = "#authwall, .authwall-page, [data-test-id='authwall']";

/** Login checkpoint/verification interstitial. */
export const CHECKPOINT_SELECTOR = "#checkpoint-or-else, [data-test-id='verification-challenge']";

/** Reads `data-urn` attributes on update cards, e.g. "urn:li:activity:7123...". */
export function liActivityIdFromUrn(urn: string | null | undefined): string | undefined {
  if (!urn) return undefined;
  const match = urn.match(/urn:li:activity:(\d+)/);
  return match?.[1];
}

/** Extracts an activity id from a /feed/update/urn:li:(share|activity):<id> URL. */
export function liActivityIdFromUrl(url: string): string | undefined {
  const match = url.match(/urn:li:(?:share|activity):(\d+)/);
  return match?.[1];
}
