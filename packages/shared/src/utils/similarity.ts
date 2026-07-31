import { normalizeText } from "./text.js";

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "of",
  "to",
  "for",
  "in",
  "on",
  "at",
  "by",
  "with",
  "we",
  "our",
  "us",
  "you",
  "your",
  "i",
  "me",
  "my",
  "is",
  "are",
  "be",
  "been",
  "being",
  "was",
  "were",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "can",
  "could",
  "should",
  "may",
  "might",
  "must",
  "not",
  "no",
  "yes",
  "so",
  "if",
  "then",
  "than",
  "as",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "they",
  "them",
  "their",
  "he",
  "she",
  "his",
  "her",
  "about",
  "into",
  "from",
  "up",
  "down",
  "out",
  "over",
  "under",
  "again",
  "further",
]);

export function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

/** Dice coefficient over token bigrams. 0 = unrelated, 1 = identical. */
export function diceSimilarity(a: string, b: string): number {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  if (aTokens.length === 0 || bTokens.length === 0) return 0;

  const aBigrams = toBigrams(aTokens);
  const bBigrams = toBigrams(bTokens);
  const setA = new Set(aBigrams);
  const setB = new Set(bBigrams);

  let overlap = 0;
  for (const bigram of setA) {
    if (setB.has(bigram)) overlap += 1;
  }
  return (2 * overlap) / (setA.size + setB.size || 1);
}

/** Jaccard similarity over token sets. 0 = unrelated, 1 = identical. */
export function jaccardSimilarity(a: string, b: string): number {
  const aTokens = new Set(tokenize(a));
  const bTokens = new Set(tokenize(b));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection += 1;
  }
  const union = aTokens.size + bTokens.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Combined similarity score (weighted toward Dice, which handles word
 * order better for near-duplicate posts).
 */
export function similarity(a: string, b: string): number {
  return Math.max(diceSimilarity(a, b), jaccardSimilarity(a, b));
}

/** True when two posts look like the same content reposted. */
export function isNearDuplicate(a: string, b: string, threshold = 0.85): boolean {
  return similarity(a, b) >= threshold;
}

function toBigrams(tokens: string[]): string[] {
  const bigrams: string[] = [];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    bigrams.push(`${tokens[i]}\u0000${tokens[i + 1]}`);
  }
  if (tokens.length === 1) bigrams.push(tokens[0] ?? "");
  return bigrams;
}
