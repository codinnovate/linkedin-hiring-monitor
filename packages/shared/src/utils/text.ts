import { createHash } from "node:crypto";

/** Strips a string to its meaningful tokens: lower case, no URLs/mentions/punctuation. */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/\r\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/www\.\S+/g, " ")
    .replace(/@[\w-]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Stable content hash used for exact duplicate detection. */
export function contentHash(text: string): string {
  return sha256(normalizeText(text));
}

/** Converts a LinkedIn relative/relative-time label like "3h" into an approximate Date. */
export function parseLinkedInTimeLabel(label: string, now = new Date()): Date | null {
  const trimmed = label.trim().toLowerCase();
  const match = trimmed.match(/^(\d+)\s*(s|m|h|d|w|mo|y)$/);
  if (!match) return null;
  const value = Number.parseInt(match[1] ?? "0", 10);
  const unit = match[2];
  const ms =
    unit === "s"
      ? value * 1000
      : unit === "m"
        ? value * 60_000
        : unit === "h"
          ? value * 3_600_000
          : unit === "d"
            ? value * 86_400_000
            : unit === "w"
              ? value * 604_800_000
              : unit === "mo"
                ? value * 2_592_000_000
                : value * 31_536_000_000;
  return new Date(now.getTime() - ms);
}

/** Truncates text for snippets without cutting words in half. */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}
