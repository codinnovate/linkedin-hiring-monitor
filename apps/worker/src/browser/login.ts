import type { BrowserContext, Page } from "playwright";
import { ErrorCode, LinkedInBrowserError } from "./errors.js";
import { withRetry } from "./retry.js";

export interface LoginCredentials {
  email: string;
  password: string;
}

const LOGIN_URL = "https://www.linkedin.com/login";
const FEED_URL = "https://www.linkedin.com/feed/";

/**
 * Best-effort check that a page is viewing LinkedIn as an authenticated
 * user. Uses structural markers rather than a single selector so minor
 * DOM changes don't break it.
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  const url = page.url();
  if (/\/authwall|\/login|\/signup|\/uas\//i.test(url)) return false;

  try {
    return await page.evaluate(() => {
      const hasNavigation =
        Boolean(document.querySelector(".global-nav, #global-nav, .global-nav__me")) ||
        Boolean(document.querySelector('[data-tracking-control-name="nav"]'));
      const hasLoginPrompt = Boolean(
        document.querySelector('a[href*="/login"], a[href*="/signup"], input#session_key'),
      );
      return hasNavigation && !hasLoginPrompt;
    });
  } catch {
    return false;
  }
}

/** Performs an email/password login. Throws if login fails or a checkpoint appears. */
export async function loginWithCredentials(
  page: Page,
  credentials: LoginCredentials,
): Promise<void> {
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });

  await page
    .locator('input[name="session_key"], #username')
    .first()
    .fill(credentials.email, { timeout: 30_000 });

  const passwordField = page.locator('input[name="session_password"], #password').first();
  await passwordField.fill(credentials.password);

  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {}),
    page.locator('button[type="submit"]').first().click(),
  ]);

  const url = page.url();
  if (/checkpoint|challenge/i.test(url)) {
    throw new LinkedInBrowserError(
      "LinkedIn checkpoint (2FA/verification) required",
      ErrorCode.CHECKPOINT,
      false,
    );
  }
  if (!(await isLoggedIn(page))) {
    throw new LinkedInBrowserError(
      "LinkedIn login failed: credentials rejected",
      ErrorCode.LOGIN_EXPIRED,
      true,
    );
  }
}

export interface EnsureAuthenticatedOptions {
  context: BrowserContext;
  credentials?: LoginCredentials;
  onSessionRestored?: (via: "cookies" | "credentials") => void;
}

/**
 * Opens the feed and guarantees an authenticated session: restores
 * persisted cookies first, falls back to credential login, and retries
 * transient failures up to three times.
 */
export async function ensureAuthenticated(options: EnsureAuthenticatedOptions): Promise<Page> {
  const { context, credentials, onSessionRestored } = options;
  const page = context.pages()[0] ?? (await context.newPage());

  return withRetry(
    async () => {
      await page.goto(FEED_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
      if (await isLoggedIn(page)) {
        onSessionRestored?.("cookies");
        return page;
      }
      if (!credentials?.email || !credentials.password) {
        throw new LinkedInBrowserError(
          "LinkedIn session expired and no credentials configured",
          ErrorCode.LOGIN_EXPIRED,
          true,
        );
      }
      await loginWithCredentials(page, credentials);
      onSessionRestored?.("credentials");
      return page;
    },
    { attempts: 3, baseDelayMs: 2_000 },
  );
}
