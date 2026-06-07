// Shared test helpers for the core classification loop.
// Not a *.test.ts file, so Vitest does not collect it as a suite.
import type { ApparelRecord, Subset } from "../../../src/types";

// Deterministic 32-bit PRNG (mulberry32). Same seed => same sequence, across
// runtimes — so tests can assert "same seed => same result" without depending on
// Math.random or a runtime-dependent shuffle.
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Encode the true articleType into the productDisplayName so a stub classifier
// can "recover" it the way the real model recovers signal from the name — and so
// the no-leak test can derive the true type from what the model was actually
// shown.
export function encodeName(articleType: string): string {
  return `TYPE=${articleType}`;
}
export function decodeName(productDisplayName: string): string {
  return productDisplayName.startsWith("TYPE=")
    ? productDisplayName.slice(5)
    : productDisplayName;
}

// Build a single record, defaulting the realistic fields. `id`, `articleType`,
// and `subCategory` are required; productDisplayName defaults to the encoded type.
export function rec(
  partial: Partial<ApparelRecord> &
    Pick<ApparelRecord, "id" | "articleType" | "subCategory">,
): ApparelRecord {
  return {
    gender: "Men",
    baseColour: "Blue",
    season: "Summer",
    year: "2012",
    usage: "Casual",
    productDisplayName: encodeName(partial.articleType),
    ...partial,
  };
}

// Derive a Subset (records + sorted vocabulary + subCategory->types map) from a
// list of records, the same shape loadSubset must produce.
export function buildSubset(records: ApparelRecord[]): Subset {
  const vocabulary = [...new Set(records.map((r) => r.articleType))].sort();
  const typesBySubCategory = new Map<string, string[]>();
  for (const r of records) {
    const types = typesBySubCategory.get(r.subCategory) ?? [];
    if (!types.includes(r.articleType)) types.push(r.articleType);
    typesBySubCategory.set(r.subCategory, types);
  }
  return { records, vocabulary, typesBySubCategory };
}

// A two-subcategory, three-types-each fixture that satisfies the corpus contract
// (>= 2 subcategories, each with >= 2 articleTypes) and has enough records to
// sample without replacement.
export function contractSatisfyingSubset(): Subset {
  const records: ApparelRecord[] = [];
  const plan: Record<string, string[]> = {
    Topwear: ["Tshirts", "Shirts", "Tops"],
    Bottomwear: ["Jeans", "Trousers", "Shorts"],
  };
  let n = 0;
  for (const [subCategory, types] of Object.entries(plan)) {
    for (const articleType of types) {
      for (let i = 0; i < 2; i++) {
        records.push(rec({ id: String(++n), articleType, subCategory }));
      }
    }
  }
  return buildSubset(records);
}
