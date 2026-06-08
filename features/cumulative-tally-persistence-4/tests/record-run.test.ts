// The run recorder (Story 2, Story 4). @frozen behavior: a pass-through over a run's
// event stream that (a) yields every event through unchanged so the route can forward
// the SSE frames, (b) commits the run to the store iff the stream reached a `score`
// event, folding the exact tally of the observed `entry` events, and (c) **awaits the
// commit before the stream completes** — so a route that simply iterates this stream
// to its end and then closes the response cannot close before the write lands (the
// Story 4 "no lost-update window" guarantee). An `error`-terminated stream commits
// nothing. The recorder is pure (store port + aggregate + frozen stream/entry types),
// so the route's persistence behavior is tested here, headlessly. (`recordRunStream`
// name = @scaffolding; the behavior = @frozen.)
import { describe, it, expect } from "vitest";
import { recordRunStream } from "../../../src/record-run";
import { createInMemoryCumulativeStore } from "../../../src/cumulative-store";
import { runEventStream } from "../../../src/run-stream";
import type { RunStreamEvent } from "../../../src/run-stream";
import { runClassificationCycle } from "../../../src/run";
import type { Classify, RunEntry, RunScore } from "../../../src/types";
import type { CumulativeStore } from "../../../src/cumulative-store";
import {
  contractSatisfyingSubset,
  makeStub,
  entry,
  referenceCounts,
  asyncFrom,
  flush,
} from "./helpers";

// A throwaway score event — the recorder must count from the entries, never from
// these numbers, so the values here are deliberately not the real counts.
const SCORE_EVENT: RunStreamEvent = {
  type: "score",
  score: {
    total: 999,
    accuracy: 0.123,
    breakdown: {
      "near-swap": { count: 0, accuracy: null },
      "far-swap": { count: 0, accuracy: null },
      blank: { count: 0, accuracy: null },
    },
  } as RunScore,
};

const entryEvent = (e: RunEntry): RunStreamEvent => ({ type: "entry", entry: e });

async function drain(stream: AsyncIterable<RunStreamEvent>): Promise<RunStreamEvent[]> {
  const events: RunStreamEvent[] = [];
  for await (const ev of stream) events.push(ev);
  return events;
}

describe("recordRunStream — passes events through unchanged", () => {
  it("yields exactly the source events, in order (the route still gets every SSE frame)", async () => {
    const store = createInMemoryCumulativeStore();
    const source: RunStreamEvent[] = [
      entryEvent(entry({ id: "1", corruptionTag: "near-swap", correct: true })),
      entryEvent(entry({ id: "2", corruptionTag: "blank", correct: false })),
      SCORE_EVENT,
    ];
    const out = await drain(recordRunStream(asyncFrom(source), store));
    expect(out).toEqual(source); // pass-through is lossless and order-preserving
  });
});

describe("recordRunStream — success commits the run's own tally (Story 2)", () => {
  it("commits the exact counts of the observed entries, ignoring the score event's numbers", async () => {
    const store = createInMemoryCumulativeStore();
    const entries = [
      entry({ id: "1", corruptionTag: "near-swap", correct: true }),
      entry({ id: "2", corruptionTag: "near-swap", correct: false }),
      entry({ id: "3", corruptionTag: "blank", correct: true }),
    ];
    const source: RunStreamEvent[] = [...entries.map(entryEvent), SCORE_EVENT];

    await drain(recordRunStream(asyncFrom(source), store));
    const stored = await store.read();
    const ref = referenceCounts(entries);

    expect(stored.runs).toBe(1);
    expect(stored.total).toBe(ref.total); // 3, NOT the score event's 999
    expect(stored.correct).toBe(ref.correct); // 2
    expect(stored.byTag).toEqual(ref.byTag);
  });
});

describe("recordRunStream — a failed run commits nothing (Story 2, Story 4)", () => {
  it("an error-terminated stream leaves the store untouched, including pre-failure entries", async () => {
    const store = createInMemoryCumulativeStore();
    const source: RunStreamEvent[] = [
      entryEvent(entry({ id: "1", corruptionTag: "near-swap", correct: true })),
      entryEvent(entry({ id: "2", corruptionTag: "blank", correct: true })),
      { type: "error", message: "model unavailable" },
    ];

    await drain(recordRunStream(asyncFrom(source), store));
    const stored = await store.read();

    expect(stored.runs).toBe(0);
    expect(stored.total).toBe(0); // the two pre-failure entries do NOT count
    expect(stored.correct).toBe(0);
  });
});

describe("recordRunStream — commits BEFORE the stream completes (Story 4 ordering)", () => {
  it("does not signal stream-done until the store write has landed (no fire-and-forget)", async () => {
    // A store whose write blocks on a gate, so we can observe whether stream-completion
    // waits for the commit. A fire-and-forget recorder would report `done` while the
    // write is still pending — and a route iterating it would close the response (and
    // the client would re-read the cumulative) before the write lands: the lost-update
    // window Story 4 forbids.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const inner = createInMemoryCumulativeStore();
    const gatedStore: CumulativeStore = {
      read: () => inner.read(),
      addRun: async (tally) => {
        await gate;
        return inner.addRun(tally);
      },
    };

    const source: RunStreamEvent[] = [
      entryEvent(entry({ id: "1", corruptionTag: "near-swap", correct: true })),
      SCORE_EVENT,
    ];
    const iterator = recordRunStream(asyncFrom(source), gatedStore)[Symbol.asyncIterator]();

    const first = await iterator.next();
    expect(first.value).toEqual(source[0]); // entry passes through immediately
    const second = await iterator.next();
    expect(second.value).toEqual(source[1]); // score passes through immediately

    // The pull that exhausts the source must trigger — and AWAIT — the commit.
    let doneSettled = false;
    const donePromise = iterator.next().then((v) => ((doneSettled = true), v));
    await flush();
    expect(doneSettled).toBe(false); // stream is NOT done: it is awaiting the commit
    expect((await inner.read()).total).toBe(0); // nothing written yet

    release();
    const done = await donePromise;
    expect(doneSettled).toBe(true);
    expect(done.done).toBe(true);
    expect((await inner.read()).total).toBe(1); // the write landed before stream-done
  });
});

describe("recordRunStream — over a real run-event stream (Story 2)", () => {
  it("commits the same counts the engine's own RunResult implies", async () => {
    const subset = contractSatisfyingSubset();
    const n = 6;
    const seed = 13;

    const store = createInMemoryCumulativeStore();
    await drain(
      recordRunStream(runEventStream({ subset, n, seed, classify: makeStub().classify }), store),
    );

    const reference = await runClassificationCycle({
      subset,
      n,
      seed,
      classify: makeStub().classify,
    });
    const expected = referenceCounts(reference.entries);
    const stored = await store.read();

    expect(stored.total).toBe(expected.total);
    expect(stored.correct).toBe(expected.correct);
    expect(stored.byTag).toEqual(expected.byTag);
    expect(stored.runs).toBe(1);
  });

  it("commits nothing when the real stream fails fast (rejecting classify)", async () => {
    const subset = contractSatisfyingSubset();
    let calls = 0;
    const classify: Classify = async (input) => {
      calls++;
      if (calls === 2) throw new Error("model unavailable");
      return { articleType: input.articleType || "x", confidence: "low", rationale: "r" };
    };

    const store = createInMemoryCumulativeStore();
    await drain(recordRunStream(runEventStream({ subset, n: 6, seed: 2, classify }), store));

    expect((await store.read()).total).toBe(0);
  });
});
