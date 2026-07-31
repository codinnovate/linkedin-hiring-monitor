import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { BrowserContext } from "playwright";

/** Persists all cookies from a context to a JSON file. */
export async function saveCookies(context: BrowserContext, filePath: string): Promise<void> {
  const cookies = await context.cookies();
  if (cookies.length === 0) return;
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(cookies, null, 2), "utf8");
}

/** Restores cookies from a JSON file into a context. Returns how many were added. */
export async function loadCookies(context: BrowserContext, filePath: string): Promise<number> {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return 0;
  }

  let cookies: unknown;
  try {
    cookies = JSON.parse(raw);
  } catch {
    return 0;
  }
  if (!Array.isArray(cookies)) return 0;

  const restored = cookies
    .filter((cookie): cookie is Record<string, unknown> => cookie && typeof cookie === "object")
    .map((cookie) => {
      const {
        sameSite,
        priority: _priority,
        partitionKey: _partitionKey,
        ...rest
      } = cookie as Record<string, unknown>;
      // Playwright persists "expires" as a float; pass it through untouched.
      if (typeof cookie.expires === "number" && !Number.isFinite(cookie.expires)) {
        rest.expires = -1;
      }
      const mapped: Record<string, unknown> = { ...rest };
      if (typeof sameSite === "string" && ["Strict", "Lax", "None"].includes(sameSite)) {
        mapped.sameSite = sameSite as "Strict" | "Lax" | "None";
      }
      return mapped;
    })
    .filter((cookie) => typeof cookie.name === "string" && typeof cookie.value === "string");

  if (restored.length === 0) return 0;
  await context.addCookies(restored as unknown as Parameters<BrowserContext["addCookies"]>[0]);
  return restored.length;
}
