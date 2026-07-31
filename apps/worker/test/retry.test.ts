import { describe, expect, it, vi } from "vitest";
import { classifyError, ErrorCode, LinkedInBrowserError } from "../src/browser/errors.js";
import { sleep, withRetry } from "../src/browser/retry.js";

describe("classifyError", () => {
  it("recognizes rate limiting", () => {
    const result = classifyError(new Error("Too many requests, please slow down"));
    expect(result.code).toBe(ErrorCode.RATE_LIMITED);
    expect(result.retryable).toBe(true);
    expect(result.suggestedDelayMs).toBeGreaterThan(0);
  });

  it("recognizes expired sessions", () => {
    const result = classifyError(new Error("Session expired, please sign in again"));
    expect(result.code).toBe(ErrorCode.LOGIN_EXPIRED);
    expect(result.retryable).toBe(true);
  });

  it("recognizes navigation timeouts", () => {
    const result = classifyError(new Error("Navigation timeout of 30000 ms exceeded"));
    expect(result.code).toBe(ErrorCode.NAVIGATION_TIMEOUT);
    expect(result.retryable).toBe(true);
  });

  it("recognizes proxy failures", () => {
    const result = classifyError(new Error("net::ERR_PROXY_CONNECTION_FAILED"));
    expect(result.code).toBe(ErrorCode.PROXY);
    expect(result.retryable).toBe(true);
  });

  it("recognizes network failures", () => {
    const result = classifyError(new Error("net::ERR_CONNECTION_RESET"));
    expect(result.code).toBe(ErrorCode.NETWORK);
  });

  it("honors explicit LinkedInBrowserError metadata", () => {
    const error = new LinkedInBrowserError("blocked", ErrorCode.RATE_LIMITED, true, 600_000);
    const result = classifyError(error);
    expect(result.suggestedDelayMs).toBe(600_000);
  });

  it("defaults unknown errors to non-retryable", () => {
    const result = classifyError(new Error("something else entirely"));
    expect(result.code).toBe(ErrorCode.UNKNOWN);
    expect(result.retryable).toBe(false);
  });
});

describe("withRetry", () => {
  it("succeeds on the first attempt", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { attempts: 3 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries until success", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("net::ERR_TIMED_OUT"))
      .mockResolvedValue("ok");
    const result = await withRetry(fn, { attempts: 3, baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting attempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("net::ERR_TIMED_OUT"));
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1 })).rejects.toThrow(
      "net::ERR_TIMED_OUT",
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-retryable errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("plain bug"));
    await expect(withRetry(fn, { attempts: 5 })).rejects.toThrow("plain bug");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("invokes onRetry with the error and attempt", async () => {
    const onRetry = vi.fn();
    const fn = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(1);
    await withRetry(fn, {
      attempts: 3,
      baseDelayMs: 1,
      retryable: () => true,
      onRetry,
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, expect.any(Number));
  });
});

describe("sleep", () => {
  it("resolves after the given time", async () => {
    const start = Date.now();
    await sleep(30);
    expect(Date.now() - start).toBeGreaterThanOrEqual(25);
  });
});
