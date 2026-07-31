import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BrowserManager } from "../src/browser/browserManager.js";

const TEST_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

describe("BrowserManager (integration)", () => {
  it("launches headless chromium, loads linkedin.com, and applies stealth", async () => {
    const profileDir = mkdtempSync(join(tmpdir(), "lhm-profile-"));
    const browser = new BrowserManager({
      headless: true,
      slowMo: 0,
      userDataDir: profileDir,
      userAgent: TEST_UA,
    });

    try {
      const context = await browser.launch();
      expect(browser.isOpen).toBe(true);

      const page = await context.newPage();
      await page.goto("https://www.linkedin.com", {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });

      const title = await page.title();
      expect(title.toLowerCase()).toContain("linkedin");

      const webdriverFlag = await page.evaluate(() => navigator.webdriver);
      expect(webdriverFlag).toBeUndefined();

      const effectiveUa = await page.evaluate(() => navigator.userAgent);
      expect(effectiveUa).toContain("Chrome/131");
    } finally {
      await browser.close();
      rmSync(profileDir, { recursive: true, force: true });
    }
  }, 90_000);

  it("persists and restores cookies across launches", async () => {
    const profileDir = mkdtempSync(join(tmpdir(), "lhm-profile-"));
    const cookiesFile = join(profileDir, "cookies.json");
    const browser = new BrowserManager({
      headless: true,
      slowMo: 0,
      userDataDir: profileDir,
      cookiesFile,
    });

    try {
      const context = await browser.launch();
      await context.addCookies([
        {
          name: "test_cookie",
          value: "hello",
          domain: ".linkedin.com",
          path: "/",
          httpOnly: true,
          secure: true,
        },
      ]);
      await browser.persistCookies();
      await browser.close();

      const restored = new BrowserManager({
        headless: true,
        slowMo: 0,
        userDataDir: profileDir,
        cookiesFile,
      });
      const restoredContext = await restored.launch();
      const cookies = await restoredContext.cookies("https://www.linkedin.com");
      const found = cookies.find((cookie) => cookie.name === "test_cookie");
      expect(found?.value).toBe("hello");
      await restored.close();
    } finally {
      rmSync(profileDir, { recursive: true, force: true });
    }
  }, 90_000);
});
