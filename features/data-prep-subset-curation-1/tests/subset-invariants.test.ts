// @frozen — invariants of the committed curated subset; these are the contract
// the downstream loop relies on. They assert the deliverable itself, not its
// implementation.
import { describe, it, expect, beforeAll } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { HEADER, parseCsvFile, type Row } from "./csv.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../.."); // tests/ -> feature/ -> features/ -> root
const SUBSET = resolve(repoRoot, "docs/apparel-subset.csv");
const SOURCE = resolve(repoRoot, "docs/styles.csv");

// Parameters from spec.md (the contract of this cut).
const MASTER_CATEGORY = "Apparel";
const MIN_ROWS_PER_TYPE = 50;
const MIN_TYPES_PER_SUBCATEGORY = 2;
const MAX_ROWS_PER_TYPE = 500;

describe("curated subset invariants", () => {
  let subset: Row[];
  let headerLine: string;

  beforeAll(() => {
    expect(existsSync(SUBSET), `${SUBSET} must exist`).toBe(true);
    const parsed = parseCsvFile(SUBSET);
    subset = parsed.rows;
    headerLine = parsed.headerLine;
  });

  it("keeps the source header unchanged and in order", () => {
    expect(headerLine).toBe(HEADER);
  });

  it("is non-trivial in size (>= 1000 rows)", () => {
    expect(subset.length).toBeGreaterThanOrEqual(1000);
  });

  it("contains only Apparel rows", () => {
    const offenders = subset.filter((r) => r.masterCategory !== MASTER_CATEGORY);
    expect(offenders).toHaveLength(0);
  });

  it("spans at least 2 subCategories", () => {
    const subs = new Set(subset.map((r) => r.subCategory));
    expect(subs.size).toBeGreaterThanOrEqual(2);
  });

  it("keeps >= 2 articleTypes in every subCategory (near-swap guarantee)", () => {
    const bySub = new Map<string, Set<string>>();
    for (const r of subset) {
      if (!bySub.has(r.subCategory)) bySub.set(r.subCategory, new Set());
      bySub.get(r.subCategory)!.add(r.articleType);
    }
    for (const [sub, types] of bySub) {
      expect(
        types.size,
        `subCategory "${sub}" has only ${types.size} articleType(s)`,
      ).toBeGreaterThanOrEqual(MIN_TYPES_PER_SUBCATEGORY);
    }
  });

  it("keeps every articleType within [MIN_ROWS_PER_TYPE, MAX_ROWS_PER_TYPE]", () => {
    const counts = new Map<string, number>();
    for (const r of subset) {
      counts.set(r.articleType, (counts.get(r.articleType) ?? 0) + 1);
    }
    for (const [type, n] of counts) {
      expect(n, `articleType "${type}" has ${n} rows (below floor)`).toBeGreaterThanOrEqual(
        MIN_ROWS_PER_TYPE,
      );
      expect(n, `articleType "${type}" has ${n} rows (above cap)`).toBeLessThanOrEqual(
        MAX_ROWS_PER_TYPE,
      );
    }
  });

  it("has all required fields populated on every row", () => {
    for (const r of subset) {
      expect(r.id, "empty id").not.toBe("");
      expect(r.masterCategory, `row ${r.id} empty masterCategory`).not.toBe("");
      expect(r.subCategory, `row ${r.id} empty subCategory`).not.toBe("");
      expect(r.articleType, `row ${r.id} empty articleType`).not.toBe("");
      expect(r.productDisplayName, `row ${r.id} empty productDisplayName`).not.toBe("");
    }
  });

  it("has no duplicate ids", () => {
    const ids = subset.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is a faithful filtering of the source (ids exist, labels unchanged)", () => {
    const source = parseCsvFile(SOURCE).rows;
    const byId = new Map<string, Row>();
    for (const r of source) byId.set(r.id, r);
    for (const r of subset) {
      const src = byId.get(r.id);
      expect(src, `subset id ${r.id} not found in source`).toBeDefined();
      expect(src!.masterCategory).toBe(r.masterCategory);
      expect(src!.subCategory).toBe(r.subCategory);
      expect(src!.articleType).toBe(r.articleType);
      // productDisplayName preserved verbatim, including any embedded commas.
      expect(src!.productDisplayName).toBe(r.productDisplayName);
    }
  });
});
