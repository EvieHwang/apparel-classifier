// The run-event stream seam (Story 3 + Story 4). @frozen semantics: the *sequence*
// of events and the frozen shapes they carry. The event field names (`type`,
// `entry`, `score`, `message`) are the named surface a test must read; /build may
// rename them (@scaffolding) as long as the asserted sequence and payloads hold.
import { describe, it, expect } from "vitest";
import { runEventStream } from "../../../src/run-stream";
import type { RunStreamEvent } from "../../../src/run-stream";
import { runClassificationCycle } from "../../../src/run";
import type { Classify } from "../../../src/types";
import { contractSatisfyingSubset, makeStub, flush } from "./helpers";

const subset = contractSatisfyingSubset();

async function drain(stream: AsyncIterable<RunStreamEvent>): Promise<RunStreamEvent[]> {
  const events: RunStreamEvent[] = [];
  for await (const ev of stream) events.push(ev);
  return events;
}

describe("runEventStream — success", () => {
  it("yields N entry events in run order, then exactly one score event, and no error", async () => {
    const n = 6;
    const events = await drain(runEventStream({ subset, n, seed: 5, classify: makeStub().classify }));

    const kinds = events.map((e) => e.type);
    expect(kinds.slice(0, n)).toEqual(Array(n).fill("entry"));
    expect(kinds[n]).toBe("score");
    expect(events).toHaveLength(n + 1);
    expect(kinds).not.toContain("error");
  });

  it("carries the frozen RunEntry / RunScore shapes — equal to the engine's own output", async () => {
    const n = 6;
    const seed = 13;
    const events = await drain(runEventStream({ subset, n, seed, classify: makeStub().classify }));
    // Same seed + an equivalent deterministic stub => the engine produces the
    // canonical result the stream must mirror.
    const reference = await runClassificationCycle({ subset, n, seed, classify: makeStub().classify });

    const entries = events.filter((e) => e.type === "entry").map((e) => (e as { entry: unknown }).entry);
    expect(entries).toEqual(reference.entries);

    const scoreEvent = events.find((e) => e.type === "score") as { score: unknown };
    expect(scoreEvent.score).toEqual({
      total: reference.total,
      accuracy: reference.accuracy,
      breakdown: reference.breakdown,
    });
  });

  it("delivers entries progressively — an entry is observable while a later record is still pending", async () => {
    // Gate the 2nd classify call: record 0 resolves immediately, record 1 blocks.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let calls = 0;
    const classify: Classify = async (input) => {
      calls++;
      if (calls === 2) await gate;
      return { articleType: input.articleType || "x", confidence: "low", rationale: "r" };
    };

    const it = runEventStream({ subset, n: 3, seed: 1, classify })[Symbol.asyncIterator]();
    const first = await it.next();
    expect(first.done).toBe(false);
    expect(first.value.type).toBe("entry"); // got record 0 without the run finishing

    // The next event must NOT be available yet — the run is blocked on record 1.
    // If the stream had buffered the whole run before emitting, this would resolve.
    let secondSettled = false;
    const secondP = it.next().then((v) => ((secondSettled = true), v));
    await flush();
    expect(secondSettled).toBe(false);

    release();
    await secondP;
    expect(secondSettled).toBe(true);
  });
});

describe("runEventStream — fail-fast", () => {
  it("on a rejecting classify, yields the m completed entries then one error event and no score event", async () => {
    let calls = 0;
    // Reject on the 2nd record: record 0 succeeds (m = 1), record 1 throws.
    const classify: Classify = async (input) => {
      calls++;
      if (calls === 2) throw new Error("model unavailable");
      return { articleType: input.articleType || "x", confidence: "low", rationale: "r" };
    };

    const events = await drain(runEventStream({ subset, n: 6, seed: 2, classify }));

    const kinds = events.map((e) => e.type);
    expect(kinds).toEqual(["entry", "error"]); // one completed entry, then error
    expect(kinds).not.toContain("score");

    const errorEvent = events.find((e) => e.type === "error") as { message: string };
    expect(typeof errorEvent.message).toBe("string");
    expect(errorEvent.message.length).toBeGreaterThan(0);
  });
});
