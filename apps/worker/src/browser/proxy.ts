import { readFileSync } from "node:fs";

export interface ProxyEntry {
  /** A server URL consumable by Playwright, e.g. "http://user:pass@host:port". */
  server: string;
}

/**
 * Parses a proxy source into a list. Accepts:
 *  - a comma/whitespace separated inline list ("host:port,host:port")
 *  - a file path (one proxy per line, "#" comments allowed)
 *  - optional scheme/credentials prefixes ("socks5://host:port", "user:pass@host:port")
 */
export function loadProxyList(source?: string): ProxyEntry[] {
  if (!source) return [];
  const trimmed = source.trim();

  const raw = trimmed.includes("\n") ? trimmed : undefined;
  const content = raw ?? (looksLikePath(trimmed) ? readFile(trimmed) : trimmed);

  return content
    .split(/[\n,]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map(normalizeProxyEntry)
    .filter((entry): entry is ProxyEntry => entry !== null);
}

function looksLikePath(value: string): boolean {
  return (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("~") ||
    value.endsWith(".txt")
  );
}

function readFile(path: string): string {
  try {
    return readFileSync(path.replace(/^~/, process.env.HOME ?? ""), "utf8");
  } catch {
    return "";
  }
}

/** Adds a default "http://" scheme when a raw "host:port" is given. */
function normalizeProxyEntry(value: string): ProxyEntry | null {
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) {
    return { server: value };
  }
  if (/^[^:@/]+(:[^@/]+)?@[^@/]+:\d+$/.test(value)) {
    return { server: `http://${value}` };
  }
  if (/^[^:/]+:\d+$/.test(value)) {
    return { server: `http://${value}` };
  }
  return null;
}

/** Round-robin proxy rotator. */
export function createProxyRotator(proxies: ProxyEntry[]) {
  let index = 0;
  const snapshot = [...proxies];

  function next(): ProxyEntry | undefined {
    if (snapshot.length === 0) return undefined;
    const entry = snapshot[index % snapshot.length];
    index += 1;
    return entry;
  }

  function pick(): ProxyEntry | undefined {
    if (snapshot.length === 0) return undefined;
    return snapshot[Math.floor(Math.random() * snapshot.length)];
  }

  return { next, pick, size: () => snapshot.length };
}
