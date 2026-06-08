// Dashboard view reducer (feature 3, Story 1 + Story 2 + Story 4).
//
// The streaming / live-accuracy / error logic factored out of the React component
// so it is testable without a DOM or a live EventSource. Pure: `(state, action) =>
// state`. Drives the page off the same `RunStreamEvent` kinds plus a `start` action.
//
// @frozen behavior:
//   - start  -> running, rows/score/error cleared, live tally reset
//   - entry  -> append the row, increment correct/seen, live accuracy = correct/seen
//   - score  -> done, store the authoritative RunScore (never a client recomputation)
//   - error  -> error state, KEEP already-streamed rows, claim NO final score
// Invariant: after N entries the live accuracy equals the score event's
// `RunScore.accuracy` (because the engine's accuracy is correct/total).
import type { RunEntry, RunScore } from "./types";
import type { RunStreamEvent } from "./run-stream";

export type RunViewStatus = "idle" | "running" | "done" | "error";

export interface RunViewState {
  status: RunViewStatus;
  /** Entries streamed so far, in run order. */
  rows: RunEntry[];
  /** correct-so-far / seen-so-far during streaming; 0 when nothing seen. */
  liveAccuracy: number;
  /** The engine's authoritative score, set only on a successful `score` event. */
  score: RunScore | null;
  /** A human-readable error message on a failed run, else null. */
  error: string | null;
  /** Live tally backing `liveAccuracy`. */
  seen: number;
  correct: number;
}

/** A `start` action plus the run-stream events the reducer folds in. */
export type RunViewAction = { type: "start" } | RunStreamEvent;

export const initialRunViewState: RunViewState = {
  status: "idle",
  rows: [],
  liveAccuracy: 0,
  score: null,
  error: null,
  seen: 0,
  correct: 0,
};

export function runViewReducer(
  state: RunViewState,
  action: RunViewAction,
): RunViewState {
  switch (action.type) {
    case "start":
      // Fresh run: clear everything a prior run may have left behind.
      return {
        status: "running",
        rows: [],
        liveAccuracy: 0,
        score: null,
        error: null,
        seen: 0,
        correct: 0,
      };

    case "entry": {
      const seen = state.seen + 1;
      const correct = state.correct + (action.entry.correct ? 1 : 0);
      return {
        ...state,
        rows: [...state.rows, action.entry],
        seen,
        correct,
        liveAccuracy: correct / seen,
      };
    }

    case "score":
      // The displayed final figure is the engine's own RunScore, not a recompute.
      return { ...state, status: "done", score: action.score };

    case "error":
      // Keep the real rows already streamed; claim no final score for a run that
      // didn't finish.
      return { ...state, status: "error", error: action.message, score: null };
  }
}

/**
 * Format a per-tag accuracy for display. A zero-count tag arrives as `null` (the
 * engine already yields `null`, never NaN) and renders as a non-numeric
 * not-applicable marker; a real accuracy renders as a percentage string.
 */
export function formatTagAccuracy(accuracy: number | null): string {
  if (accuracy === null) return "—"; // em dash, no digits, never "NaN"
  return `${Math.round(accuracy * 100)}%`;
}
