// Run-event stream seam (feature 3, Story 3 + Story 4).
//
// Turns one classification run into an ordered async sequence of typed events so a
// page can render incrementally and know when the run is done or has failed:
//   - one `entry` event per successfully-classified record, in run order
//   - then exactly one `score` event on success, OR
//   - exactly one `error` event if `classify` rejects (and NO score event).
//
// Built on top of `runClassificationCycle` via its additive `onEntry` hook — the
// orchestration loop and its leak prevention are reused, not duplicated. Imports
// nothing from the Anthropic SDK or `next`, so it is fully testable headlessly with
// a stub `classify`. The events carry feature 2's frozen `RunEntry` / `RunScore`
// shapes; the dashboard invents no new per-record or per-run data shape.
import { runClassificationCycle } from "./run";
import type { Classify, RunEntry, RunResult, RunScore, Subset } from "./types";

/** One on-the-wire run-stream event. The frozen part is the kind sequence and the
 *  payload shapes (`RunEntry` / `RunScore`); the field names are the named surface. */
export type RunStreamEvent =
  | { type: "entry"; entry: RunEntry }
  | { type: "score"; score: RunScore }
  | { type: "error"; message: string };

export interface RunStreamOptions {
  subset: Subset;
  n: number;
  seed: number;
  classify: Classify;
}

/**
 * Drive one run and yield its events progressively. Entries are surfaced as each
 * `classify` resolves (not collected and emitted at the end), so a consumer observes
 * entry events before the score event exists — the property that makes the UI
 * progressive.
 */
export async function* runEventStream({
  subset,
  n,
  seed,
  classify,
}: RunStreamOptions): AsyncIterable<RunStreamEvent> {
  // A tiny single-consumer queue with a wake signal: the synchronous `onEntry` hook
  // pushes entries; this generator awaits them and yields. JS is single-threaded, so
  // the "check queue → check settled → register notify" sequence runs without
  // interleaving, and any wake fired while no one is waiting is harmless (the next
  // loop re-checks the queue).
  const queue: RunEntry[] = [];
  let notify: (() => void) | null = null;
  const wake = () => {
    const n = notify;
    notify = null;
    n?.();
  };

  let settled = false;
  let result: RunResult | null = null;
  let failure: unknown = null;

  const cycle = runClassificationCycle({
    subset,
    n,
    seed,
    classify,
    onEntry: (entry) => {
      queue.push(entry);
      wake();
    },
  });
  cycle.then(
    (r) => {
      result = r;
      settled = true;
      wake();
    },
    (e) => {
      failure = e;
      settled = true;
      wake();
    },
  );

  // Emit entries as they arrive; sleep only when the queue is drained and the run
  // hasn't settled yet.
  while (true) {
    while (queue.length > 0) {
      yield { type: "entry", entry: queue.shift()! };
    }
    if (settled) break;
    await new Promise<void>((resolve) => {
      notify = resolve;
    });
  }

  // Any entries that landed between the last drain and settling.
  while (queue.length > 0) {
    yield { type: "entry", entry: queue.shift()! };
  }

  if (failure !== null) {
    yield {
      type: "error",
      message: failure instanceof Error ? failure.message : String(failure),
    };
    return; // fail-fast: no score event for a run that didn't finish.
  }

  // Success: the authoritative run-level score, from the engine's own RunResult.
  // `result` is set by the cycle's resolve callback (which TS can't flow-track), and
  // we only reach here when the run settled without a failure.
  const r = result!;
  yield {
    type: "score",
    score: { total: r.total, accuracy: r.accuracy, breakdown: r.breakdown },
  };
}
