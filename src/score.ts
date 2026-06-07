// Scorer.
//
// Strict exact-match accuracy, overall and per-corruption-type. An empty or
// out-of-vocabulary prediction simply never equals the true label, so it scores as
// incorrect with no special-casing. A tag with zero records reports `null`
// accuracy, never NaN (spec Story 4 + the empty-tag edge case).
import type { RunScore, Tag, TagBreakdown } from "./types";

interface Scorable {
  trueArticleType: string;
  predictedArticleType: string;
  corruptionTag: Tag;
}

const TAGS: Tag[] = ["near-swap", "far-swap", "blank"];

export function score(entries: Scorable[]): RunScore {
  const total = entries.length;
  let correct = 0;

  // Per-tag tallies.
  const counts: Record<Tag, number> = { "near-swap": 0, "far-swap": 0, blank: 0 };
  const hits: Record<Tag, number> = { "near-swap": 0, "far-swap": 0, blank: 0 };

  for (const e of entries) {
    const isCorrect = e.predictedArticleType === e.trueArticleType;
    if (isCorrect) correct++;
    counts[e.corruptionTag]++;
    if (isCorrect) hits[e.corruptionTag]++;
  }

  const breakdown = {} as Record<Tag, TagBreakdown>;
  for (const tag of TAGS) {
    breakdown[tag] = {
      count: counts[tag],
      accuracy: counts[tag] === 0 ? null : hits[tag] / counts[tag],
    };
  }

  return {
    total,
    accuracy: total === 0 ? 0 : correct / total,
    breakdown,
  };
}
