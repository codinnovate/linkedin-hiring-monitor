import { describe, expect, it } from "vitest";
import { cronToIntervalMs } from "../src/scheduler.js";

describe("cronToIntervalMs", () => {
  it("parses every-minute as 60s", () => {
    expect(cronToIntervalMs("* * * * *")).toBe(60_000);
  });

  it("parses every-N-minutes", () => {
    expect(cronToIntervalMs("*/5 * * * *")).toBe(5 * 60_000);
    expect(cronToIntervalMs("*/15 * * * *")).toBe(15 * 60_000);
  });

  it("parses every-N-seconds (6-part)", () => {
    expect(cronToIntervalMs("*/30 * * * * *")).toBe(30_000);
    expect(cronToIntervalMs("* * * * * *")).toBe(1_000);
  });

  it("parses every-N-hours", () => {
    expect(cronToIntervalMs("0 */2 * * *")).toBe(2 * 3_600_000);
  });

  it("rejects unsupported expressions", () => {
    expect(cronToIntervalMs("0 9 * * 1")).toBeNull();
    expect(cronToIntervalMs("not a cron")).toBeNull();
    expect(cronToIntervalMs("")).toBeNull();
  });
});
