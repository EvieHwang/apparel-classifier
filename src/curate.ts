// Pure, deterministic curation transform for the apparel subset.
//
// Given the raw source CSV text and the four curation parameters, `curate`
// returns the subset CSV text: the source header followed by the retained data
// rows, unchanged and in source order. It only filters and caps — it never
// relabels, reorders, or mutates a value — so the source labels remain ground
// truth downstream.
//
// Parsing note: the dataset's final column (productDisplayName) contains
// unquoted commas and bare inch-mark double-quotes. We split each line on the
// first 9 commas only and treat the remainder as column 10, with no quote
// processing. A strict RFC-4180 reader would mangle the bare-`"` rows
// (ids 7491/7497); this rule preserves them verbatim.

export interface CurationParams {
  /** Only rows in this masterCategory are kept. */
  masterCategory: string;
  /** An articleType is retained only if it has >= this many qualifying rows. */
  minRowsPerType: number;
  /** A subCategory is retained only if >= this many of its types cleared the floor. */
  minTypesPerSubcategory: number;
  /** Per-articleType cap; the first this-many rows in source order are kept. */
  maxRowsPerType: number;
}

const COLUMN_COUNT = 10;

// Split a CSV line into exactly 10 fields, last = remainder after 9 commas.
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

interface Record {
  line: string;
  subCategory: string;
  articleType: string;
}

export function curate(sourceCsv: string, params: CurationParams): string {
  const lines = sourceCsv.split(/\r?\n/).filter((l) => l.length > 0);
  const header = lines[0];
  const dataLines = lines.slice(1);

  // 1. Filter to the chosen masterCategory and drop rows missing any required
  //    field. Required: id, masterCategory, subCategory, articleType, name.
  let alive: Record[] = [];
  for (const line of dataLines) {
    const f = splitRow(line);
    const id = f[0];
    const masterCategory = f[2];
    const subCategory = f[3];
    const articleType = f[4];
    const productDisplayName = f[9] ?? "";
    if (masterCategory !== params.masterCategory) continue;
    if (!id || !masterCategory || !subCategory || !articleType || !productDisplayName) {
      continue;
    }
    alive.push({ line, subCategory, articleType });
  }

  // 2. Apply the floor and the subCategory rule to a fixpoint. The two rules
  //    interact: dropping a subCategory removes rows, which can pull an
  //    articleType below the floor (e.g. "Dresses" lives mostly under the
  //    "Dress" subCategory; once "Dress" is dropped for having only one
  //    qualifying type, the few remaining "Dresses" rows under "Topwear" fall
  //    below MIN_ROWS_PER_TYPE and must go too). A single pass would strand
  //    them and break the [floor, cap] invariant, so iterate until stable.
  for (;;) {
    const before = alive.length;

    // Floor: drop rows whose articleType has fewer than minRowsPerType rows
    // among the currently-alive set.
    const typeCounts = new Map<string, number>();
    for (const r of alive) {
      typeCounts.set(r.articleType, (typeCounts.get(r.articleType) ?? 0) + 1);
    }
    alive = alive.filter(
      (r) => (typeCounts.get(r.articleType) ?? 0) >= params.minRowsPerType,
    );

    // SubCategory rule: drop subCategories left with fewer than
    // minTypesPerSubcategory distinct (surviving) articleTypes.
    const typesBySub = new Map<string, Set<string>>();
    for (const r of alive) {
      if (!typesBySub.has(r.subCategory)) typesBySub.set(r.subCategory, new Set());
      typesBySub.get(r.subCategory)!.add(r.articleType);
    }
    alive = alive.filter(
      (r) =>
        (typesBySub.get(r.subCategory)?.size ?? 0) >= params.minTypesPerSubcategory,
    );

    if (alive.length === before) break;
  }

  // 3. Emit header + retained rows in source order, capping each articleType at
  //    maxRowsPerType (keeping the first rows encountered). The cap only lowers
  //    a count toward the cap, never below the floor, so the invariant holds.
  const emittedPerType = new Map<string, number>();
  const out: string[] = [header];
  for (const r of alive) {
    const seen = emittedPerType.get(r.articleType) ?? 0;
    if (seen >= params.maxRowsPerType) continue;
    emittedPerType.set(r.articleType, seen + 1);
    out.push(r.line);
  }
  return out.join("\n") + "\n";
}
