// Run recorder (feature 4, Stories 2 & 4).
//
// A pass-through over a run's event stream: it yields every `RunStreamEvent` through
// UNCHANGED (so the route forwards byte-for-byte the same SSE frames feature 3 emits)
// while observing them, and when the source stream is exhausted it commits the run to
// the store IFF a `score` event was seen — folding the exact tally of the observed
// `entry` events. An `error`-terminated stream commits nothing, not even its
// pre-failure entries.
//
// Critically (Story 4), it AWAITS the commit before its own stream completes: a route
// that iterates this to its end and then closes the response therefore cannot close
// before the write lands, closing the "no lost-update window" the live tick depends
// on. The commit counts come from the entries, never from the `score` event's numbers.
//
// Imports only the store port, the aggregate, and the frozen stream/entry types —
// nothing from SQLite, `next`, or the SDK — so all of its behavior is tested
// headlessly against the in-memory store. (`recordRunStream` name = @scaffolding;
// the behavior = @frozen.)
import { tallyRun } from "./cumulative";
import type { CumulativeStore } from "./cumulative-store";
import type { RunStreamEvent } from "./run-stream";
import type { RunEntry } from "./types";

export async function* recordRunStream(
  source: AsyncIterable<RunStreamEvent>,
  store: CumulativeStore,
): AsyncIterable<RunStreamEvent> {
  const entries: RunEntry[] = [];
  let sawScore = false;

  for await (const event of source) {
    if (event.type === "entry") entries.push(event.entry);
    else if (event.type === "score") sawScore = true;
    yield event; // lossless, order-preserving pass-through
  }

  // Success-only accounting: commit iff the run reached its `score` event. The await
  // here runs BEFORE the generator completes, so an iterating route closes its
  // response only after the write has landed (Story 4 no-lost-update window).
  if (sawScore) {
    try {
      await store.addRun(tallyRun(entries));
    } catch (err) {
      // Soft failure (edge case): the user's run already streamed in full; a commit
      // fault must not retract it. Log server-side; the cumulative simply does not
      // advance for this run (eventually-consistent at worst, never wrong).
      console.error("Failed to commit run to cumulative store:", err);
    }
  }
}
