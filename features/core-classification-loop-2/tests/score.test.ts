// @frozen — the scorer is a real contract the dashboard (#3) inherits. Strict
// exact-match accuracy, overall and per-corruption-type.
import { describe, it, expect } from "vitest";
import { score } from "../../../src/score";
import type { Tag } from "../../../src/types";

interface E {
  trueArticleType: string;
  predictedArticleType: string;
  corruptionTag: Tag;
}

describe("score", () => {
  it("computes overall and per-tag accuracy by strict exact match", () => {
    const entries: E[] = [
      { trueArticleType: "Tshirts", predictedArticleType: "Tshirts", corruptionTag: "near-swap" }, // ✓
      { trueArticleType: "Shirts", predictedArticleType: "Jeans", corruptionTag: "near-swap" }, // ✗
      { trueArticleType: "Jeans", predictedArticleType: "Jeans", corruptionTag: "far-swap" }, // ✓
      { trueArticleType: "Tops", predictedArticleType: "", corruptionTag: "far-swap" }, // ✗ empty
      { trueArticleType: "Shorts", predictedArticleType: "Shorts", corruptionTag: "blank" }, // ✓
      { trueArticleType: "Trousers", predictedArticleType: "Zzz", corruptionTag: "blank" }, // ✗ out-of-vocab
    ];
    const result = score(entries);

    expect(result.total).toBe(6);
    expect(result.accuracy).toBeCloseTo(0.5, 10);

    expect(result.breakdown["near-swap"].count).toBe(2);
    expect(result.breakdown["near-swap"].accuracy).toBeCloseTo(0.5, 10);
    expect(result.breakdown["far-swap"].count).toBe(2);
    expect(result.breakdown["far-swap"].accuracy).toBeCloseTo(0.5, 10);
    expect(result.breakdown["blank"].count).toBe(2);
    expect(result.breakdown["blank"].accuracy).toBeCloseTo(0.5, 10);

    // Per-tag counts sum to the total.
    const summed =
      result.breakdown["near-swap"].count +
      result.breakdown["far-swap"].count +
      result.breakdown["blank"].count;
    expect(summed).toBe(result.total);
  });

  it("treats empty and out-of-vocabulary predictions as incorrect", () => {
    const result = score([
      { trueArticleType: "Tshirts", predictedArticleType: "", corruptionTag: "blank" },
      { trueArticleType: "Shirts", predictedArticleType: "NotAType", corruptionTag: "blank" },
    ]);
    expect(result.accuracy).toBe(0);
  });

  it("reports a tag with zero records as null accuracy, not NaN", () => {
    const result = score([
      { trueArticleType: "Tshirts", predictedArticleType: "Tshirts", corruptionTag: "near-swap" },
    ]);
    expect(result.breakdown["blank"].count).toBe(0);
    expect(result.breakdown["blank"].accuracy).toBeNull();
    expect(result.breakdown["far-swap"].count).toBe(0);
    expect(result.breakdown["far-swap"].accuracy).toBeNull();
  });

  it("all-correct scores 1, all-wrong scores 0", () => {
    const allRight = score([
      { trueArticleType: "Tshirts", predictedArticleType: "Tshirts", corruptionTag: "near-swap" },
      { trueArticleType: "Jeans", predictedArticleType: "Jeans", corruptionTag: "far-swap" },
    ]);
    expect(allRight.accuracy).toBe(1);

    const allWrong = score([
      { trueArticleType: "Tshirts", predictedArticleType: "Jeans", corruptionTag: "near-swap" },
      { trueArticleType: "Jeans", predictedArticleType: "Tshirts", corruptionTag: "far-swap" },
    ]);
    expect(allWrong.accuracy).toBe(0);
  });
});
