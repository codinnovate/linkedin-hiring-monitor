import { join } from "node:path";
import type { Logger } from "pino";
import type { Env } from "../config/env.js";
import { BrowserManager } from "./browserManager.js";
import { createProxyRotator, loadProxyList } from "./proxy.js";
import { createUserAgentRotator, loadUserAgentPool } from "./userAgent.js";

/** Default persistent-profile directory relative to the worker cwd. */
export function defaultUserDataDir(workerName: string): string {
  return join(process.cwd(), "storage", "browser-profiles", workerName);
}

/**
 * Assembles a BrowserManager from validated environment configuration,
 * applying proxy rotation and user-agent rotation where configured.
 */
export function createBrowserManager(
  env: Env,
  workerName: string,
  logger?: Logger,
): BrowserManager {
  const proxies = loadProxyList(env.PROXY_LIST);
  const proxyRotator = createProxyRotator(proxies);
  const userAgents = loadUserAgentPool(env.USER_AGENT_POOL || undefined);
  const userAgentRotator = createUserAgentRotator(userAgents);

  const proxyEntry = env.PROXY_ROTATE ? proxyRotator.next() : proxyRotator.pick();

  const cookiesFile =
    env.LINKEDIN_COOKIES_FILE || join(process.cwd(), "storage", "cookies", `${workerName}.json`);

  return new BrowserManager({
    headless: env.PLAYWRIGHT_HEADLESS,
    slowMo: env.PLAYWRIGHT_SLOW_MO,
    userDataDir: defaultUserDataDir(workerName),
    proxyServer: proxyEntry?.server,
    userAgent: userAgentRotator.next(),
    cookiesFile,
    credentials:
      env.LINKEDIN_EMAIL && env.LINKEDIN_PASSWORD
        ? { email: env.LINKEDIN_EMAIL, password: env.LINKEDIN_PASSWORD }
        : undefined,
    logger,
  });
}
