// Cumulative aggregate + fold (feature 4, Stories 1, 2, 5).
//
// Pure, dependency-free arithmetic over the cross-run counters: an empty-totals
// constructor, a per-run tally derived from the frozen `RunEntry`s, an immutable
// fold of a run into the running totals, and accuracy accessors that yield
// `correct/total` when there is data and the empty-state value (`null`) — never
// `NaN` — when a count is zero. It imports ONLY the frozen `RunEntry` / `Tag`
// types (nothing from SQLite, `next`, or the SDK), so it is fully unit-tested
// headlessly and is safe to import from a client component for read-only formatting.
//
// @frozen behavior: the arithmetic — exact integer counts, accuracy = correct/total
// or empty-state, `runs` increments once per folded run. Module/function names are
// the named surface (@scaffolding).
import type { RunEntry, Tag } from "./types";

const TAGS: Tag[] = ["near-swap", "far-swap", "blank"];

/** Correct/count for one corruption tag. */
export interface TagCounts {
  correct: number;
  count: number;
}

/** One completed run's exact integer counts (no `runs` — a tally is a single run). */
export interface RunTally {
  total: number;
  correct: number;
  byTag: Record<Tag, TagCounts>;
}

/** The cumulative counters across every folded run, plus how many runs folded in. */
export interface CumulativeTotals extends RunTally {
  runs: number;
}

function emptyByTag(): Record<Tag, TagCounts> {
  return {
    "near-swap": { correct: 0, count: 0 },
    "far-swap": { correct: 0, count: 0 },
    blank: { correct: 0, count: 0 },
  };
}

/** A fresh, all-zero set of totals (zero runs, zero counts everywhere). */
export function emptyTotals(): CumulativeTotals {
  return { runs: 0, total: 0, correct: 0, byTag: emptyByTag() };
}

/**
 * One run's exact contribution, counted straight from its `RunEntry`s — overall and
 * per corruption tag. This is the integer-count source of truth; the fold never
 * re-derives counts from a float accuracy.
 */
export function tallyRun(entries: RunEntry[]): RunTally {
  const byTag = emptyByTag();
  let correct = 0;
  for (const e of entries) {
    if (e.correct) correct++;
    byTag[e.corruptionTag].count++;
    if (e.correct) byTag[e.corruptionTag].correct++;
  }
  return { total: entries.length, correct, byTag };
}

/**
 * Add a run's tally into the totals, immutably, incrementing the run count by one.
 * Returns fresh objects; the input `totals` is never mutated.
 */
export function foldRun(totals: CumulativeTotals, tally: RunTally): CumulativeTotals {
  const byTag = emptyByTag();
  for (const tag of TAGS) {
    byTag[tag] = {
      correct: totals.byTag[tag].correct + tally.byTag[tag].correct,
      count: totals.byTag[tag].count + tally.byTag[tag].count,
    };
  }
  return {
    runs: totals.runs + 1,
    total: totals.total + tally.total,
    correct: totals.correct + tally.correct,
    byTag,
  };
}

/** correct/total, or `null` (empty state) when total is 0 — never `NaN`. */
function ratio(correct: number, total: number): number | null {
  return total === 0 ? null : correct / total;
}

/** Overall cumulative accuracy, or `null` when no records have been counted. */
export function cumulativeAccuracy(totals: CumulativeTotals): number | null {
  return ratio(totals.correct, totals.total);
}

/**
 * One tag's cumulative accuracy. `null` (empty state) only when that tag has zero
 * records; a tag with records but zero correct reports a real `0` — a measured 0%,
 * not the not-applicable marker.
 */
export function cumulativeTagAccuracy(
  totals: CumulativeTotals,
  tag: Tag,
): number | null {
  return ratio(totals.byTag[tag].correct, totals.byTag[tag].count);
}
