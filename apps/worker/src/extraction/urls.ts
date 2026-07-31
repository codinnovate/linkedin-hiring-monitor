/**
 * Builds the LinkedIn content-search URL. LinkedIn reads the whole search
 * expression from the single `keywords` query param, so keywords and an
 * optional location are folded into one string.
 */
export interface BuildSearchUrlOptions {
  query: string;
  keywords?: string[];
  location?: string;
}

export function buildSearchUrl({ query, keywords = [], location }: BuildSearchUrlOptions): string {
  const parts = [query.trim(), ...keywords.map((keyword) => keyword.trim()).filter(Boolean)];
  if (location?.trim()) parts.push(location.trim());

  const params = new URLSearchParams({
    keywords: parts.filter(Boolean).join(" "),
    origin: "GLOBAL_SEARCH_HEADER",
  });
  return `https://www.linkedin.com/search/results/content/?${params.toString()}`;
}
