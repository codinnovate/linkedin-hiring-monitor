import { describe, expect, it } from "vitest";
import {
  diceSimilarity,
  isNearDuplicate,
  jaccardSimilarity,
  similarity,
  tokenize,
} from "../src/utils/similarity.js";

describe("tokenize", () => {
  it("drops stop words and short tokens", () => {
    expect(tokenize("We are hiring a React Native engineer today")).toContain("react");
    expect(tokenize("We are hiring a React Native engineer today")).not.toContain("a");
    expect(tokenize("We are hiring a React Native engineer today")).not.toContain("we");
  });
});

describe("diceSimilarity", () => {
  it("returns 1 for identical text", () => {
    expect(
      diceSimilarity(
        "We are hiring React Native engineers",
        "We are hiring React Native engineers",
      ),
    ).toBe(1);
  });

  it("returns 0 for completely different text", () => {
    expect(diceSimilarity("pizza recipes", "quantum physics papers")).toBe(0);
  });
});

describe("jaccardSimilarity", () => {
  it("is order independent", () => {
    const a = "hiring react native engineers";
    const b = "native react engineers hiring";
    expect(jaccardSimilarity(a, b)).toBe(1);
  });
});

describe("isNearDuplicate", () => {
  it("detects near-duplicate posts", () => {
    const original = "We're hiring a Senior React Native Engineer to join our mobile team. DM me.";
    const rephrased = "We are hiring a Senior React Native Engineer, join our mobile team, DM me.";
    expect(similarity(original, rephrased)).toBeGreaterThan(0.8);
    expect(isNearDuplicate(original, rephrased)).toBe(true);
  });

  it("does not flag unrelated posts", () => {
    const a = "We're hiring a React Native Engineer, DM me.";
    const b = "Just posted a tutorial on React Native animations.";
    expect(isNearDuplicate(a, b)).toBe(false);
  });
});
