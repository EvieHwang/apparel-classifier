// @scaffolding — names the corruption seam (`corrupt`, `assignTags`) ahead of
// /build. The asserted behavior (Story 3 + tag balance) is the real contract;
// /build may rename/re-site as long as it holds.
import { describe, it, expect } from "vitest";
import { corrupt, assignTags } from "../../../src/corrupt";
import type { Tag } from "../../../src/types";
import { makeRng, rec, buildSubset, contractSatisfyingSubset } from "./helpers";

const subset = contractSatisfyingSubset();
// A known record: true type "Tshirts" in subCategory "Topwear".
const tshirt = subset.records.find((r) => r.articleType === "Tshirts")!;

describe("corrupt", () => {
  it("near-swap yields a sibling type: same subCategory, different from the true type", () => {
    const siblings = ["Shirts", "Tops"]; // Topwear minus Tshirts
    for (let seed = 0; seed < 20; seed++) {
      const value = corrupt(tshirt, "near-swap", subset, makeRng(seed));
      expect(value).not.toBe(tshirt.articleType);
      expect(siblings).toContain(value);
    }
  });

  it("far-swap yields a type from a different subCategory", () => {
    const otherSub = ["Jeans", "Trousers", "Shorts"]; // Bottomwear
    for (let seed = 0; seed < 20; seed++) {
      const value = corrupt(tshirt, "far-swap", subset, makeRng(seed));
      expect(value).not.toBe(tshirt.articleType);
      expect(otherSub).toContain(value);
    }
  });

  it("far-swap never yields the true label when that label spans two subcategories (Shorts)", () => {
    // "Shorts" lives under both Bottomwear and Loungewear in the real subset.
    // A naive "pick from a different subCategory's type list" would hand a
    // Bottomwear/Shorts record the Loungewear "Shorts" — leaking the true label.
    const collision = buildSubset([
      rec({ id: "1", articleType: "Jeans", subCategory: "Bottomwear" }),
      rec({ id: "2", articleType: "Trousers", subCategory: "Bottomwear" }),
      rec({ id: "3", articleType: "Shorts", subCategory: "Bottomwear" }),
      rec({ id: "4", articleType: "Shorts", subCategory: "Loungewear" }),
      rec({ id: "5", articleType: "Pyjamas", subCategory: "Loungewear" }),
      rec({ id: "6", articleType: "Lounge Pants", subCategory: "Loungewear" }),
    ]);
    const bottomShorts = collision.records.find(
      (r) => r.articleType === "Shorts" && r.subCategory === "Bottomwear",
    )!;
    for (let seed = 0; seed < 50; seed++) {
      const value = corrupt(bottomShorts, "far-swap", collision, makeRng(seed));
      expect(value).not.toBe("Shorts"); // never the true label
      // And its home is genuinely a different subCategory (not Bottomwear).
      expect(collision.typesBySubCategory.get("Bottomwear")).not.toContain(value);
    }
  });

  it("blank yields the empty string", () => {
    expect(corrupt(tshirt, "blank", subset, makeRng(3))).toBe("");
  });

  it("only ever selects an existing vocabulary label or blank — never invents a string", () => {
    const allowed = new Set([...subset.vocabulary, ""]);
    for (const tag of ["near-swap", "far-swap", "blank"] as Tag[]) {
      for (let seed = 0; seed < 20; seed++) {
        expect(allowed.has(corrupt(tshirt, tag, subset, makeRng(seed)))).toBe(true);
      }
    }
  });

  it("is deterministic given the same seed", () => {
    for (const tag of ["near-swap", "far-swap"] as Tag[]) {
      const a = corrupt(tshirt, tag, subset, makeRng(99));
      const b = corrupt(tshirt, tag, subset, makeRng(99));
      expect(a).toBe(b);
    }
  });

  it("throws when no near-swap sibling exists (corpus-contract violation)", () => {
    // A subCategory with a single type has no sibling to swap to.
    const bad = buildSubset([
      rec({ id: "1", articleType: "Pyjamas", subCategory: "Loungewear" }),
      rec({ id: "2", articleType: "Tshirts", subCategory: "Topwear" }),
      rec({ id: "3", articleType: "Shirts", subCategory: "Topwear" }),
    ]);
    const lonely = bad.records[0];
    expect(() => corrupt(lonely, "near-swap", bad, makeRng(1))).toThrow();
  });

  it("throws when no far-swap target exists (single-subCategory subset)", () => {
    const oneSub = buildSubset([
      rec({ id: "1", articleType: "Tshirts", subCategory: "Topwear" }),
      rec({ id: "2", articleType: "Shirts", subCategory: "Topwear" }),
    ]);
    expect(() => corrupt(oneSub.records[0], "far-swap", oneSub, makeRng(1))).toThrow();
  });
});

describe("assignTags", () => {
  it("assigns exactly one tag per record, balanced within 1 across the three tags", () => {
    for (const n of [1, 2, 3, 9, 10, 11, 30]) {
      const tags = assignTags(n, makeRng(n));
      expect(tags).toHaveLength(n);
      const counts = { "near-swap": 0, "far-swap": 0, blank: 0 } as Record<Tag, number>;
      for (const t of tags) counts[t]++;
      const values = Object.values(counts);
      expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic given the same seed", () => {
    expect(assignTags(12, makeRng(7))).toEqual(assignTags(12, makeRng(7)));
  });
});
