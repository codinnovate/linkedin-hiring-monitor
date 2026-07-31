import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import type { BrowserContext, Page } from "playwright";
import type { Logger } from "pino";
import { loadCookies, saveCookies } from "./cookies.js";
import { ErrorCode, LinkedInBrowserError } from "./errors.js";
import { ensureAuthenticated } from "./login.js";
import type { LoginCredentials } from "./login.js";
import { STEALTH_INIT_SCRIPT } from "./stealth.js";

export interface BrowserManagerOptions {
  headless: boolean;
  slowMo: number;
  /** Directory for the persistent browser profile. */
  userDataDir: string;
  proxyServer?: string;
  userAgent?: string;
  /** Where session cookies are persisted/restored. */
  cookiesFile?: string;
  credentials?: LoginCredentials;
  logger?: Logger;
}

/**
 * Owns a persistent Chromium context: session restore, automatic login,
 * cookie persistence, stealth init scripts, and graceful shutdown.
 */
export class BrowserManager {
  private context: BrowserContext | null = null;

  constructor(private readonly options: BrowserManagerOptions) {}

  async launch(): Promise<BrowserContext> {
    if (this.context) return this.context;
    const { options } = this;

    try {
      this.context = await chromium.launchPersistentContext(options.userDataDir, {
        headless: options.headless,
        slowMo: options.slowMo,
        proxy: options.proxyServer ? { server: options.proxyServer } : undefined,
        ...(options.userAgent ? { userAgent: options.userAgent } : {}),
        viewport: { width: 1440, height: 900 },
        locale: "en-US",
        timezoneId: "America/New_York",
        args: [
          "--disable-blink-features=AutomationControlled",
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--disable-background-networking",
        ],
      });
    } catch (error) {
      throw new LinkedInBrowserError(
        `failed to launch chromium: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCode.BROWSER,
        true,
      );
    }

    await this.context.addInitScript(STEALTH_INIT_SCRIPT);

    if (options.cookiesFile) {
      const restored = await loadCookies(this.context, options.cookiesFile);
      options.logger?.info({ restored }, "restored persisted cookies");
    }

    return this.context;
  }

  /** Returns an authenticated page, logging in or restoring cookies as needed. */
  async getAuthenticatedPage(): Promise<Page> {
    const context = await this.launch();
    const { credentials, logger } = this.options;
    return ensureAuthenticated({
      context,
      credentials,
      onSessionRestored: (via) => logger?.info({ via }, "session restored"),
    });
  }

  async persistCookies(): Promise<void> {
    if (!this.context || !this.options.cookiesFile) return;
    const { cookiesFile, logger } = this.options;
    mkdirSync(join(cookiesFile, ".."), { recursive: true });
    await saveCookies(this.context, cookiesFile);
    logger?.info("persisted session cookies");
  }

  async close(): Promise<void> {
    if (!this.context) return;
    await this.persistCookies().catch(() => {});
    await this.context.close().catch(() => {});
    this.context = null;
  }

  /** True when a live context exists. */
  get isOpen(): boolean {
    return this.context !== null;
  }
}
