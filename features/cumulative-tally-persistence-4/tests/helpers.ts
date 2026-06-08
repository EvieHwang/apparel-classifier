// Shared test helpers for the cumulative-tally feature. Not a *.test.ts file, so
// Vitest does not collect it as a suite. Mirrors features 2 & 3 so these tests build
// the same synthetic subsets and the same SDK-free stub classifier — keeping the bar
// dependency-free (no SQLite driver, no SDK, no network).
import type {
  ApparelRecord,
  ClassificationInput,
  Classify,
  Prediction,
  RunEntry,
  Subset,
  Tag,
} from "../../../src/types";

// Encode the true articleType into productDisplayName so the stub can "recover" it
// when the label is blank — the same trick features 2 & 3 use.
export function encodeName(articleType: string): string {
  return `TYPE=${articleType}`;
}
export function decodeName(productDisplayName: string): string {
  return productDisplayName.startsWith("TYPE=")
    ? productDisplayName.slice(5)
    : productDisplayName;
}

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

// Two subcategories, three types each, two records each = 12 records. Satisfies the
// corpus contract (>= 2 subcategories, each with >= 2 types) with room to sample.
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

// A deterministic, SDK-free stub classify: recovers the true type from the forwarded
// productDisplayName when the label is blank, else echoes the (wrong) corrupted label.
export function makeStub() {
  const seenInputs: ClassificationInput[] = [];
  const classify: Classify = async (input) => {
    seenInputs.push(input);
    const trueType = decodeName(input.productDisplayName);
    const predicted = input.articleType === "" ? trueType : input.articleType;
    const prediction: Prediction = {
      articleType: predicted,
      confidence: "medium",
      rationale: "stub",
    };
    return prediction;
  };
  return { classify, seenInputs };
}

// Build a RunEntry directly, for fold/recorder tests that don't need the engine.
// `correct` is honored if given, else derived from predicted === true.
export function entry(partial: Partial<RunEntry> & Pick<RunEntry, "id">): RunEntry {
  const trueArticleType = partial.trueArticleType ?? "Tshirts";
  const predictedArticleType = partial.predictedArticleType ?? trueArticleType;
  return {
    id: partial.id,
    trueArticleType,
    corruptionTag: partial.corruptionTag ?? "blank",
    corruptedValue: partial.corruptedValue ?? "",
    predictedArticleType,
    confidence: partial.confidence ?? "medium",
    rationale: partial.rationale ?? "stub",
    correct: partial.correct ?? predictedArticleType === trueArticleType,
  };
}

// Flush pending microtasks/timers so a "did this promise settle yet?" assertion is
// reliable (mirrors feature 3's helper).
export function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

// A minimal async iterable over a fixed list of events — a synthetic run stream for
// recorder tests that don't need the real engine.
export async function* asyncFrom<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) yield item;
}

// Independent reference fold of a set of entries into {correct,total} overall and per
// tag — computed HERE, not via the module under test, so the module's arithmetic is
// checked against an independent counter rather than itself.
export function referenceCounts(entries: RunEntry[]): {
  correct: number;
  total: number;
  byTag: Record<Tag, { correct: number; count: number }>;
} {
  const byTag: Record<Tag, { correct: number; count: number }> = {
    "near-swap": { correct: 0, count: 0 },
    "far-swap": { correct: 0, count: 0 },
    blank: { correct: 0, count: 0 },
  };
  let correct = 0;
  for (const e of entries) {
    if (e.correct) correct++;
    byTag[e.corruptionTag].count++;
    if (e.correct) byTag[e.corruptionTag].correct++;
  }
  return { correct, total: entries.length, byTag };
}
