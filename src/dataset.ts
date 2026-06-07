// Subset loader & sampler.
//
// `loadSubset` reads the curated subset CSV (feature 1's output) into an in-memory
// `Subset`; `sampleRecords` draws N records without replacement using an injected
// seeded PRNG. Both are pure given their inputs (the loader given the file, the
// sampler given the rng), so runs are reproducible.
import { readFileSync } from "node:fs";
import type { ApparelRecord, Subset } from "./types";

// Header column order of the curated subset, inherited from feature 1.
//   id,gender,masterCategory,subCategory,articleType,baseColour,season,year,usage,productDisplayName
const COLUMN_COUNT = 10;

// Split a CSV line into exactly 10 fields, last = remainder after the first 9
// commas — the parse rule established in feature 1. productDisplayName may carry
// unquoted commas and a bare `"`, so we do no quote processing.
function splitRow(line: string): string[] {
  const out: string[] = [];
  let rest = line;
  for (let i = 0; i < COLUMN_COUNT - 1; i++) {
    const idx = rest.indexOf(",");
    if (idx === -1) {
      out.push(rest);
      rest = "";
    } else {
      out.push(rest.slice(0, idx));
      rest = rest.slice(idx + 1);
    }
  }
  out.push(rest);
  return out;
}

export function loadSubset(csvPath: string): Subset {
  const text = readFileSync(csvPath, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const dataLines = lines.slice(1); // drop the header

  const records: ApparelRecord[] = dataLines.map((line) => {
    const f = splitRow(line);
    return {
      id: f[0],
      gender: f[1],
      // f[2] = masterCategory — not carried; every row is "Apparel".
      subCategory: f[3],
      articleType: f[4],
      baseColour: f[5],
      season: f[6],
      year: f[7],
      usage: f[8],
      productDisplayName: f[9] ?? "",
    };
  });

  // Vocabulary: sorted distinct true article types.
  const vocabulary = [...new Set(records.map((r) => r.articleType))].sort();

  // subCategory -> distinct articleType[] (in first-seen order).
  const typesBySubCategory = new Map<string, string[]>();
  for (const r of records) {
    const types = typesBySubCategory.get(r.subCategory) ?? [];
    if (!types.includes(r.articleType)) types.push(r.articleType);
    typesBySubCategory.set(r.subCategory, types);
  }

  return { records, vocabulary, typesBySubCategory };
}

/**
 * Draw `n` records without replacement using a partial Fisher-Yates shuffle driven
 * by the injected rng. Deterministic given the rng's seed. Throws if `n` is out of
 * range (`n < 1` or `n >` subset size) so a run never repeats a record.
 */
export function sampleRecords(
  subset: Subset,
  n: number,
  rng: () => number,
): ApparelRecord[] {
  const total = subset.records.length;
  if (n < 1 || n > total) {
    throw new RangeError(
      `sampleRecords: n=${n} out of range [1, ${total}] (without replacement)`,
    );
  }
  const pool = [...subset.records];
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (total - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}
