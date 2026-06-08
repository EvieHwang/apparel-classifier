// The pure cumulative aggregate + fold (Story 1, 2, 5). @frozen behavior: the
// arithmetic (exact integer counts, correct/total accuracy, empty-state instead of
// NaN, runs increments once per folded run). The module/function names are the named
// surface a test must read (@scaffolding — /build may rename if the behavior holds).
//
// This module is pure and dependency-free (it imports only frozen types), so it is
// fully tested headlessly. The SQLite-backed store that uses it is validated manually.
import { describe, it, expect } from "vitest";
import {
  emptyTotals,
  tallyRun,
  foldRun,
  cumulativeAccuracy,
  cumulativeTagAccuracy,
} from "../../../src/cumulative";
import { formatTagAccuracy } from "../../../src/view-reducer";
import { entry, referenceCounts } from "./helpers";
import type { Tag } from "../../../src/types";

const TAGS: Tag[] = ["near-swap", "far-swap", "blank"];

describe("emptyTotals + empty-state accuracy (Story 5)", () => {
  it("starts with zero runs and zero counts everywhere", () => {
    const t = emptyTotals();
    expect(t.runs).toBe(0);
    expect(t.total).toBe(0);
    expect(t.correct).toBe(0);
    for (const tag of TAGS) {
      expect(t.byTag[tag].count).toBe(0);
      expect(t.byTag[tag].correct).toBe(0);
    }
  });

  it("reports overall accuracy as the empty-state value (null), never NaN, when total is 0", () => {
    const acc = cumulativeAccuracy(emptyTotals());
    expect(acc).toBeNull();
    // And the shared feature-3 formatter turns that into a non-numeric marker.
    const shown = formatTagAccuracy(acc);
    expect(/\d/.test(shown)).toBe(false);
    expect(shown).not.toMatch(/nan/i);
  });

  it("reports a zero-count tag's accuracy as null → '—' via the feature-3 formatter (Story 5)", () => {
    const t = emptyTotals();
    for (const tag of TAGS) {
      const tagAcc = cumulativeTagAccuracy(t, tag);
      expect(tagAcc).toBeNull();
      expect(formatTagAccuracy(tagAcc)).not.toMatch(/nan/i);
    }
  });
});

describe("tallyRun — exact integer counts from RunEntrys (Story 2)", () => {
  it("counts overall and per-tag correct/total from the entries, exactly", () => {
    // 4 entries: near correct, near wrong, far wrong, blank correct.
    const entries = [
      entry({ id: "1", corruptionTag: "near-swap", correct: true }),
      entry({ id: "2", corruptionTag: "near-swap", correct: false }),
      entry({ id: "3", corruptionTag: "far-swap", correct: false }),
      entry({ id: "4", corruptionTag: "blank", correct: true }),
    ];
    const tally = tallyRun(entries);

    expect(tally.total).toBe(4);
    expect(tally.correct).toBe(2);
    expect(tally.byTag["near-swap"]).toEqual({ correct: 1, count: 2 });
    expect(tally.byTag["far-swap"]).toEqual({ correct: 0, count: 1 });
    expect(tally.byTag["blank"]).toEqual({ correct: 1, count: 1 });
  });

  it("matches an independent count of the same entries", () => {
    const entries = [
      entry({ id: "1", corruptionTag: "blank", correct: true }),
      entry({ id: "2", corruptionTag: "blank", correct: true }),
      entry({ id: "3", corruptionTag: "far-swap", correct: true }),
      entry({ id: "4", corruptionTag: "near-swap", correct: false }),
      entry({ id: "5", corruptionTag: "near-swap", correct: false }),
    ];
    const tally = tallyRun(entries);
    const ref = referenceCounts(entries);
    expect(tally.correct).toBe(ref.correct);
    expect(tally.total).toBe(ref.total);
    expect(tally.byTag).toEqual(ref.byTag);
  });
});

describe("foldRun — accumulation (Story 1, 2)", () => {
  it("adds a run's tally into totals and increments the run count by one", () => {
    const run1 = tallyRun([
      entry({ id: "1", corruptionTag: "near-swap", correct: true }),
      entry({ id: "2", corruptionTag: "blank", correct: false }),
    ]);
    const after1 = foldRun(emptyTotals(), run1);

    expect(after1.runs).toBe(1);
    expect(after1.total).toBe(2);
    expect(after1.correct).toBe(1);
    expect(after1.byTag["near-swap"]).toEqual({ correct: 1, count: 1 });
    expect(after1.byTag["blank"]).toEqual({ correct: 0, count: 1 });
  });

  it("accumulates a second run on top of the first (sum of both)", () => {
    const run1 = tallyRun([
      entry({ id: "1", corruptionTag: "near-swap", correct: true }),
      entry({ id: "2", corruptionTag: "blank", correct: false }),
    ]);
    const run2 = tallyRun([
      entry({ id: "3", corruptionTag: "near-swap", correct: false }),
      entry({ id: "4", corruptionTag: "far-swap", correct: true }),
      entry({ id: "5", corruptionTag: "blank", correct: true }),
    ]);
    const totals = foldRun(foldRun(emptyTotals(), run1), run2);

    expect(totals.runs).toBe(2);
    expect(totals.total).toBe(5);
    expect(totals.correct).toBe(3); // 1 + 2
    expect(totals.byTag["near-swap"]).toEqual({ correct: 1, count: 2 });
    expect(totals.byTag["far-swap"]).toEqual({ correct: 1, count: 1 });
    expect(totals.byTag["blank"]).toEqual({ correct: 1, count: 2 });
  });

  it("does not mutate the input totals (immutable fold)", () => {
    const base = emptyTotals();
    const snapshot = JSON.parse(JSON.stringify(base));
    foldRun(base, tallyRun([entry({ id: "1", corruptionTag: "blank", correct: true })]));
    expect(base).toEqual(snapshot); // base untouched
  });
});

describe("cumulativeAccuracy — correct/total over accumulated integers (Story 1)", () => {
  it("computes overall and per-tag accuracy from the totals", () => {
    const totals = foldRun(
      emptyTotals(),
      tallyRun([
        entry({ id: "1", corruptionTag: "near-swap", correct: true }),
        entry({ id: "2", corruptionTag: "near-swap", correct: false }),
        entry({ id: "3", corruptionTag: "far-swap", correct: true }),
        entry({ id: "4", corruptionTag: "blank", correct: true }),
      ]),
    );
    expect(cumulativeAccuracy(totals)).toBeCloseTo(3 / 4, 10);
    expect(cumulativeTagAccuracy(totals, "near-swap")).toBeCloseTo(1 / 2, 10);
    expect(cumulativeTagAccuracy(totals, "far-swap")).toBeCloseTo(1, 10);
    expect(cumulativeTagAccuracy(totals, "blank")).toBeCloseTo(1, 10);
  });

  it("a tag with real records but zero correct reports 0, NOT the empty-state marker (honesty)", () => {
    // count > 0 with correct === 0 is a real, measured 0% — it must not be hidden as
    // "—" (which is reserved for count === 0). Hiding a genuinely-wrong tag would
    // undercut the demo's whole honesty premise.
    const totals = foldRun(
      emptyTotals(),
      tallyRun([
        entry({ id: "1", corruptionTag: "far-swap", correct: false }),
        entry({ id: "2", corruptionTag: "far-swap", correct: false }),
      ]),
    );
    const acc = cumulativeTagAccuracy(totals, "far-swap");
    expect(acc).toBe(0); // a real measurement, not null
    expect(formatTagAccuracy(acc)).toMatch(/\d/); // renders a numeric 0%, not "—"
  });
});
