// Loader corpus-contract checks are @frozen (they guard the inherited feature-1
// contract the corruption engine depends on). The sampler surface is @scaffolding.
import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadSubset, sampleRecords } from "../../../src/dataset";
import { makeRng } from "./helpers";

// Resolve the committed subset from this test file's own location.
const subsetPath = fileURLToPath(
  new URL("../../../docs/apparel-subset.csv", import.meta.url),
);
const subset = loadSubset(subsetPath);

describe("loadSubset (real curated subset)", () => {
  it("exposes a non-trivial, distinct, sorted vocabulary equal to the records' article types", () => {
    expect(subset.records.length).toBeGreaterThan(0);
    expect(subset.vocabulary.length).toBeGreaterThanOrEqual(2);

    // Distinct.
    expect(new Set(subset.vocabulary).size).toBe(subset.vocabulary.length);
    // Sorted.
    expect([...subset.vocabulary].sort()).toEqual(subset.vocabulary);
    // Equals the set of article types across records.
    const fromRecords = [...new Set(subset.records.map((r) => r.articleType))].sort();
    expect([...subset.vocabulary].sort()).toEqual(fromRecords);
  });

  it("satisfies the corpus contract the corruption engine relies on", () => {
    // >= 2 subcategories (far-swap always has a target)...
    expect(subset.typesBySubCategory.size).toBeGreaterThanOrEqual(2);
    // ...each with >= 2 distinct article types (near-swap always has a sibling).
    for (const [, types] of subset.typesBySubCategory) {
      expect(new Set(types).size).toBeGreaterThanOrEqual(2);
    }
  });

  it("populates the fields the model is shown plus the withheld ground-truth fields", () => {
    for (const r of subset.records.slice(0, 50)) {
      expect(r.id).toBeTruthy();
      expect(r.articleType).toBeTruthy();
      expect(r.subCategory).toBeTruthy();
      expect(r.productDisplayName).toBeTruthy();
    }
  });
});

describe("sampleRecords", () => {
  it("draws N records without replacement, deterministically per seed", () => {
    const a = sampleRecords(subset, 5, makeRng(7));
    const b = sampleRecords(subset, 5, makeRng(7));
    expect(a).toHaveLength(5);
    expect(a.map((r) => r.id)).toEqual(b.map((r) => r.id));
    // No duplicate records within a draw.
    expect(new Set(a.map((r) => r.id)).size).toBe(5);
  });

  it("rejects out-of-range N", () => {
    expect(() => sampleRecords(subset, 0, makeRng(1))).toThrow();
    expect(() => sampleRecords(subset, subset.records.length + 1, makeRng(1))).toThrow();
  });
});
