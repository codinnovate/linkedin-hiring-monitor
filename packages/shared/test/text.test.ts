import { describe, expect, it } from "vitest";
import {
  contentHash,
  normalizeText,
  parseLinkedInTimeLabel,
  sha256,
  truncate,
} from "../src/utils/text.js";

describe("normalizeText", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalizeText("  We  Hire   React\nNative ")).toBe("we hire react native");
  });

  it("strips URLs and mentions", () => {
    expect(normalizeText("Visit https://t.co/x README @jack now")).toBe("visit readme now");
  });

  it("removes punctuation but keeps letters and digits", () => {
    expect(normalizeText("We're hiring! (2 roles)")).toBe("we re hiring 2 roles");
  });
});

describe("hashing", () => {
  it("produces stable sha256 hex hashes", () => {
    const first = sha256("hello world");
    const second = sha256("hello world");
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("contentHash ignores whitespace and casing differences", () => {
    expect(contentHash("We Hire RN Devs")).toBe(contentHash("   we hire   RN devs  "));
  });
});

describe("parseLinkedInTimeLabel", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("parses hours", () => {
    expect(parseLinkedInTimeLabel("3h", now)?.toISOString()).toBe("2025-12-31T21:00:00.000Z");
  });

  it("parses weeks", () => {
    expect(parseLinkedInTimeLabel("1w", now)?.toISOString()).toBe("2025-12-25T00:00:00.000Z");
  });

  it("returns null for unknown labels", () => {
    expect(parseLinkedInTimeLabel("edited", now)).toBeNull();
    expect(parseLinkedInTimeLabel("", now)).toBeNull();
  });
});

describe("truncate", () => {
  it("keeps short strings intact", () => {
    expect(truncate("short", 10)).toBe("short");
  });

  it("cuts long strings on a word boundary", () => {
    const result = truncate("one two three four five six", 12);
    expect(result.length).toBeLessThanOrEqual(13);
    expect(result.endsWith("…")).toBe(true);
  });
});
