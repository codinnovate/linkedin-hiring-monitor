import type { RawPost } from "@lhm/shared";
import { parseLinkedInTimeLabel } from "@lhm/shared";
import type { Locator } from "playwright";
import {
  AUTHOR_HEADLINE_SELECTORS,
  AUTHOR_NAME_SELECTORS,
  AUTHOR_ORG_SELECTORS,
  AUTHOR_PROFILE_SELECTORS,
  COMMENTS_SELECTOR,
  IMAGE_SELECTORS,
  liActivityIdFromUrn,
  liActivityIdFromUrl,
  POST_TEXT_SELECTORS,
  REACTIONS_SELECTOR,
  REPOSTS_SELECTOR,
  TIMESTAMP_SELECTORS,
  VIDEO_SELECTORS,
} from "./selectors.js";

/** Parses LinkedIn count labels like "1.2K", "12K+", "1,234" into integers. */
export function parseCount(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().replace(/,/g, "");
  const match = trimmed.match(/^([\d.]+)\s*([KMB]?)/i);
  if (!match) return undefined;
  const number = Number.parseFloat(match[1] ?? "");
  if (!Number.isFinite(number)) return undefined;
  const multiplier =
    (match[2] ?? "").toUpperCase() === "K"
      ? 1_000
      : (match[2] ?? "").toUpperCase() === "M"
        ? 1_000_000
        : (match[2] ?? "").toUpperCase() === "B"
          ? 1_000_000_000
          : 1;
  return Math.round(number * multiplier);
}

/**
 * Reads the first non-empty text of a fallback selector chain. Runs inside
 * the page against a single element, so missing children resolve instantly
 * instead of triggering Playwright's auto-wait.
 */
async function evalFirstText(element: Locator, selectors: string): Promise<string | undefined> {
  const value = await element
    .evaluate((el, sel) => {
      for (const selector of sel.split(",")) {
        const found = el.querySelector<HTMLElement>(selector.trim());
        if (found?.textContent?.trim()) return found.textContent.trim();
      }
      return "";
    }, selectors)
    .catch(() => "");
  return value || undefined;
}

/** Reads the first matching href, resolved to an absolute URL. */
async function evalFirstHref(element: Locator, selectors: string): Promise<string | undefined> {
  const href = await element
    .evaluate((el, sel) => {
      for (const selector of sel.split(",")) {
        const found = el.querySelector<HTMLAnchorElement>(selector.trim());
        const raw = found?.getAttribute("href");
        if (raw && !/^(javascript:|mailto:|#)/.test(raw.trim())) return raw.trim();
      }
      return "";
    }, selectors)
    .catch(() => "");
  return href || undefined;
}

/** Cleans the visible post body: strips collapse markers like "…see more". */
function cleanText(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let text = raw.replace(/\s+/g, " ").trim();
  text = text.replace(/^\s*\.\.\./, "");
  text = text.replace(/\s*see more\s*$/i, "");
  text = text.replace(/\s*…\s*$/, "");
  return text.trim() || undefined;
}

/** Extracts the relative-age label (e.g. "3h") from a LinkedIn sub-description. */
function parsePostedAtLabel(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.trim().match(/\b(\d+\s*(?:s|m|h|d|w|mo|y))\b/i);
  return match?.[1];
}

function absoluteUrl(href: string | undefined, baseUrl: string): string | undefined {
  if (!href) return undefined;
  let base = baseUrl;
  try {
    const parsed = new URL(baseUrl);
    base =
      parsed.protocol === "http:" || parsed.protocol === "https:"
        ? parsed.origin + parsed.pathname
        : "https://www.linkedin.com";
  } catch {
    base = "https://www.linkedin.com";
  }
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

export interface ExtractPostOptions {
  /** The absolute URL of the results page; used to resolve relative hrefs. */
  baseUrl: string;
  /** Search query this post was surfaced by. */
  searchQuery: string;
}

/**
 * Best-effort extraction of one LinkedIn post from its DOM element.
 * Every field is optional; the DOM varies between sessions and A/B groups.
 */
export async function extractPostFromElement(
  element: Locator,
  { baseUrl, searchQuery }: ExtractPostOptions,
): Promise<RawPost> {
  const urn = await element.getAttribute("data-urn").catch(() => null);
  let liPostId = liActivityIdFromUrn(urn);

  const url = absoluteUrl(
    await element
      .evaluate(
        (el) =>
          el.querySelector<HTMLAnchorElement>("a[href*='/feed/update/']")?.getAttribute("href") ??
          "",
      )
      .catch(() => ""),
    baseUrl,
  );

  if (!liPostId) {
    liPostId = liActivityIdFromUrl(url ?? "");
  }

  const authorName = await evalFirstText(element, AUTHOR_NAME_SELECTORS);
  const profileUrl = absoluteUrl(await evalFirstHref(element, AUTHOR_PROFILE_SELECTORS), baseUrl);
  const headline = await evalFirstText(element, AUTHOR_HEADLINE_SELECTORS);
  const company = await evalFirstText(element, AUTHOR_ORG_SELECTORS);
  const text = cleanText(await evalFirstText(element, POST_TEXT_SELECTORS));
  const postedAtLabel = parsePostedAtLabel(await evalFirstText(element, TIMESTAMP_SELECTORS));
  const postedAt = postedAtLabel ? (parseLinkedInTimeLabel(postedAtLabel) ?? undefined) : undefined;

  const images = await element
    .evaluate((el, sel) => {
      const out: string[] = [];
      el.querySelectorAll(sel).forEach((img) => {
        const src = img.getAttribute("src") || (img as HTMLImageElement).currentSrc || "";
        if (src) out.push(src);
      });
      return out;
    }, IMAGE_SELECTORS)
    .catch(() => [] as string[]);

  const videoUrl = await element
    .evaluate(
      (el, sel) => el.querySelector<HTMLVideoElement>(sel)?.getAttribute("src") ?? "",
      VIDEO_SELECTORS,
    )
    .catch(() => "");
  const likes = parseCount(await evalFirstText(element, REACTIONS_SELECTOR));
  const comments = parseCount(await evalFirstText(element, COMMENTS_SELECTOR));
  const reposts = parseCount(await evalFirstText(element, REPOSTS_SELECTOR));

  return {
    ...(liPostId ? { liPostId } : {}),
    ...(url ? { url } : {}),
    ...(authorName ? { authorName } : {}),
    ...(profileUrl ? { authorProfileUrl: profileUrl } : {}),
    ...(headline ? { authorHeadline: headline } : {}),
    ...(company ? { company } : {}),
    text: text ?? "",
    images,
    ...(videoUrl ? { videoUrl } : {}),
    ...(postedAtLabel ? { postedAtLabel } : {}),
    ...(postedAt ? { postedAt: postedAt.toISOString() } : {}),
    ...(likes !== undefined ? { likes } : {}),
    ...(comments !== undefined ? { comments } : {}),
    ...(reposts !== undefined ? { reposts } : {}),
    searchQuery,
  };
}

/** True when a parsed post has enough identity to be worth keeping. */
export function isUsablePost(post: RawPost): boolean {
  return Boolean(post.liPostId || post.url) && post.text.length > 0;
}
