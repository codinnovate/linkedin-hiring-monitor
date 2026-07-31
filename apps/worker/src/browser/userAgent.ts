import { readFileSync } from "node:fs";

/** Fallback pool of current Chrome desktop user agents (macOS + Windows). */
const FALLBACK_USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
] as const;

/**
 * Loads a user-agent pool from a file (one per line) or falls back to a
 * built-in list. Returns an empty pool if the file is unreadable.
 */
export function loadUserAgentPool(filePath?: string): string[] {
  if (filePath) {
    try {
      const content = readFileSync(filePath, "utf8");
      const parsed = content
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"));
      if (parsed.length > 0) return parsed;
    } catch {
      return [...FALLBACK_USER_AGENTS];
    }
  }
  return [...FALLBACK_USER_AGENTS];
}

/** Round-robin user-agent rotator. Thread-safe across async boundaries. */
export function createUserAgentRotator(pool: string[]) {
  let index = 0;
  const snapshot = pool.length > 0 ? [...pool] : [...FALLBACK_USER_AGENTS];

  function next(): string {
    const ua = snapshot[index % snapshot.length];
    if (!ua) throw new Error("user agent pool is empty");
    index += 1;
    return ua;
  }

  return { next, size: () => snapshot.length };
}
