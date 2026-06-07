// The dashboard view reducer (Story 1 + Story 2 + Story 4). @frozen behavior; the
// reducer/formatter names and the state field names are the named surface a test
// must read (@scaffolding — /build may rename if the behavior holds). This is the
// streaming/accuracy/error logic factored out of the React component so it is
// testable without a DOM or a live EventSource.
import { describe, it, expect } from "vitest";
import {
  runViewReducer,
  initialRunViewState,
  formatTagAccuracy,
} from "../../../src/view-reducer";
import { runClassificationCycle } from "../../../src/run";
import { contractSatisfyingSubset, makeStub, entry } from "./helpers";

type Action = Parameters<typeof runViewReducer>[1];

function reduce(actions: Action[]) {
  return actions.reduce(runViewReducer, initialRunViewState);
}

describe("runViewReducer", () => {
  it("start: clears rows/error/score and enters the running state", () => {
    const dirty = reduce([
      { type: "start" },
      { type: "entry", entry: entry({ id: "1" }) },
      { type: "error", message: "boom" },
    ]);
    const state = runViewReducer(dirty, { type: "start" });

    expect(state.status).toBe("running");
    expect(state.rows).toHaveLength(0);
    expect(state.score).toBeNull();
    expect(state.error).toBeNull();
  });

  it("entry: appends the row and updates the live correct/seen accuracy", () => {
    const state = reduce([
      { type: "start" },
      { type: "entry", entry: entry({ id: "1", correct: true }) },
      { type: "entry", entry: entry({ id: "2", correct: false }) },
    ]);

    expect(state.rows.map((r) => r.id)).toEqual(["1", "2"]);
    expect(state.liveAccuracy).toBeCloseTo(0.5, 10);
  });

  it("score: marks the run done and stores the authoritative RunScore", () => {
    const score = {
      total: 2,
      accuracy: 0.5,
      breakdown: {
        "near-swap": { count: 1, accuracy: 1 },
        "far-swap": { count: 1, accuracy: 0 },
        blank: { count: 0, accuracy: null },
      },
    };
    const state = reduce([{ type: "start" }, { type: "score", score }]);

    expect(state.status).toBe("done");
    expect(state.score).toEqual(score);
  });

  it("error: enters the error state, keeps already-streamed rows, claims no final score", () => {
    const state = reduce([
      { type: "start" },
      { type: "entry", entry: entry({ id: "1" }) },
      { type: "entry", entry: entry({ id: "2" }) },
      { type: "error", message: "model unavailable" },
    ]);

    expect(state.status).toBe("error");
    expect(state.error).toContain("model unavailable");
    expect(state.rows).toHaveLength(2); // real results stay visible
    expect(state.score).toBeNull(); // nothing false is claimed
  });

  it("live accuracy converges to the engine's authoritative accuracy after the last entry", async () => {
    const subset = contractSatisfyingSubset();
    const n = 6;
    const seed = 21;
    const reference = await runClassificationCycle({ subset, n, seed, classify: makeStub().classify });

    const actions: Action[] = [{ type: "start" }];
    for (const e of reference.entries) actions.push({ type: "entry", entry: e });
    const beforeScore = reduce(actions);
    expect(beforeScore.liveAccuracy).toBeCloseTo(reference.accuracy, 10);

    const withScore = runViewReducer(beforeScore, {
      type: "score",
      score: { total: reference.total, accuracy: reference.accuracy, breakdown: reference.breakdown },
    });
    expect(withScore.score?.accuracy).toBeCloseTo(reference.accuracy, 10);
  });
});

describe("formatTagAccuracy", () => {
  it("renders a null (zero-count) tag as a non-numeric not-applicable marker, never NaN", () => {
    const na = formatTagAccuracy(null);
    expect(na.length).toBeGreaterThan(0);
    expect(/\d/.test(na)).toBe(false);
    expect(na).not.toMatch(/nan/i);
  });

  it("renders a real accuracy as a numeric string", () => {
    const shown = formatTagAccuracy(0.5);
    expect(/\d/.test(shown)).toBe(true);
    expect(shown).not.toMatch(/nan/i);
  });
});
