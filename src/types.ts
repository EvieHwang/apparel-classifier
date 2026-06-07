// Shared types for the core classification loop.
//
// These are the de-facto contract the dashboard (#3) and the live single-record
// panel (#5) inherit: the classifier seam (`Classify`), the `Prediction` shape,
// and the `RunResult` shape are @frozen. Keep them stable.

/** The three corruption tags. Each sampled record gets exactly one. */
export type Tag = "near-swap" | "far-swap" | "blank";

/** The three-level confidence enum the model must return. */
export type Confidence = "low" | "medium" | "high";

/**
 * One apparel record as loaded from the curated subset. `articleType` here is the
 * *true* label (ground truth); `subCategory` is the grouping the corruption engine
 * uses. Neither is ever shown to the classifier — see `ClassificationInput`.
 */
export interface ApparelRecord {
  id: string;
  gender: string;
  subCategory: string;
  articleType: string;
  baseColour: string;
  season: string;
  year: string;
  usage: string;
  productDisplayName: string;
}

/**
 * The in-memory subset: the rows, the sorted distinct vocabulary, and the
 * `subCategory -> articleType[]` grouping the corruption engine depends on.
 */
export interface Subset {
  records: ApparelRecord[];
  vocabulary: string[];
  typesBySubCategory: Map<string, string[]>;
}

/**
 * Exactly what the classifier is shown: the realistic vendor fields plus the
 * corrupted-or-blank `articleType` label. Deliberately omits `id`, `subCategory`,
 * and the true `articleType` so the model can never see the answer (Story 2).
 */
export interface ClassificationInput {
  gender: string;
  baseColour: string;
  season: string;
  year: string;
  usage: string;
  productDisplayName: string;
  /** The corrupted label, or "" for a blanked record. Never the true type. */
  articleType: string;
}

/** A typed prediction returned by the classifier. */
export interface Prediction {
  articleType: string;
  confidence: Confidence;
  rationale: string;
}

/**
 * The injected classifier seam. Tests inject a deterministic stub; the live demo
 * injects the Anthropic-backed adapter. It receives only the allowed input and the
 * run's closed vocabulary, and resolves to a `Prediction` (or rejects — fail-fast).
 */
export type Classify = (
  input: ClassificationInput,
  vocabulary: string[],
) => Promise<Prediction>;

/** One scored record in a run's results. */
export interface RunEntry {
  id: string;
  trueArticleType: string;
  corruptionTag: Tag;
  /** The label the model was shown: a corrupted type, or "" for blank. */
  corruptedValue: string;
  predictedArticleType: string;
  confidence: Confidence;
  rationale: string;
  /** Strict exact match: predicted === true. */
  correct: boolean;
}

/** Per-tag count and accuracy. `accuracy` is `null` when `count` is 0 (not NaN). */
export interface TagBreakdown {
  count: number;
  accuracy: number | null;
}

/** Run-level scoring: overall accuracy plus the per-corruption-type breakdown. */
export interface RunScore {
  total: number;
  accuracy: number;
  breakdown: Record<Tag, TagBreakdown>;
}

/** One run's full structured result: per-record entries plus run-level scoring. */
export interface RunResult extends RunScore {
  entries: RunEntry[];
}
