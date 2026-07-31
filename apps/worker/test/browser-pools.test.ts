import { describe, expect, it } from "vitest";
import { createProxyRotator, loadProxyList } from "../src/browser/proxy.js";
import { createUserAgentRotator, loadUserAgentPool } from "../src/browser/userAgent.js";

describe("loadProxyList", () => {
  it("parses an inline comma-separated list", () => {
    const proxies = loadProxyList("127.0.0.1:8080,127.0.0.1:8081");
    expect(proxies).toHaveLength(2);
    expect(proxies[0]?.server).toBe("http://127.0.0.1:8080");
  });

  it("keeps explicit schemes", () => {
    const proxies = loadProxyList("socks5://user:pass@proxy.example:1080");
    expect(proxies[0]?.server).toBe("socks5://user:pass@proxy.example:1080");
  });

  it("handles credentials in the host:port form", () => {
    const proxies = loadProxyList("user:pass@proxy.example:8080");
    expect(proxies[0]?.server).toBe("http://user:pass@proxy.example:8080");
  });

  it("ignores comments and empty lines", () => {
    const proxies = loadProxyList("# comment\n\n127.0.0.1:9000\n# another\n");
    expect(proxies).toHaveLength(1);
  });

  it("returns an empty list for empty input", () => {
    expect(loadProxyList("")).toEqual([]);
    expect(loadProxyList(undefined)).toEqual([]);
  });
});

describe("createProxyRotator", () => {
  it("round-robins across proxies", () => {
    const rotator = createProxyRotator([
      { server: "http://a:1" },
      { server: "http://b:2" },
      { server: "http://c:3" },
    ]);
    expect(rotator.next()?.server).toBe("http://a:1");
    expect(rotator.next()?.server).toBe("http://b:2");
    expect(rotator.next()?.server).toBe("http://c:3");
    expect(rotator.next()?.server).toBe("http://a:1");
  });

  it("returns undefined for an empty pool", () => {
    const rotator = createProxyRotator([]);
    expect(rotator.next()).toBeUndefined();
    expect(rotator.pick()).toBeUndefined();
  });
});

describe("user agent pool", () => {
  it("falls back to a non-empty built-in pool", () => {
    const pool = loadUserAgentPool(undefined);
    expect(pool.length).toBeGreaterThan(0);
    expect(pool[0]).toContain("Chrome/");
  });

  it("rotates round-robin", () => {
    const rotator = createUserAgentRotator(["ua-1", "ua-2"]);
    expect(rotator.next()).toBe("ua-1");
    expect(rotator.next()).toBe("ua-2");
    expect(rotator.next()).toBe("ua-1");
  });
});
