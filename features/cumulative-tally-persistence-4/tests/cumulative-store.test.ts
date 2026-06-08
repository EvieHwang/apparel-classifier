// The cumulative store contract (Story 3). @frozen behavior: empty-on-init,
// read-after-write, sequential accumulation, atomic concurrent fold, and persistence
// across store instances on the same backing. The interface method names
// (`read`/`addRun`) and the factory names are the named surface (@scaffolding).
//
// Run against the in-memory reference implementation, which is both the test double
// and the executable definition of the contract. The SQLite-backed store must satisfy
// the SAME observable contract; it is validated manually (it imports a native driver,
// so it stays out of the test import graph — see persistence-isolation.test.ts).
import { describe, it, expect } from "vitest";
import {
  createInMemoryCumulativeStore,
  createMemoryBacking,
} from "../../../src/cumulative-store";
import { tallyRun } from "../../../src/cumulative";
import { entry } from "./helpers";
import type { RunTally } from "../../../src/cumulative";

const runOf = (...args: Parameters<typeof entry>[]): RunTally =>
  tallyRun(args.map((a) => entry(a)));

// A single-record run worth 1 correct near-swap: each fold adds total+1, correct+1.
const oneCorrectNear = (): RunTally =>
  runOf({ id: "x", corruptionTag: "near-swap", correct: true });

describe("cumulative store — contract (Story 3)", () => {
  it("a fresh store reads back empty totals", async () => {
    const store = createInMemoryCumulativeStore();
    const t = await store.read();
    expect(t.runs).toBe(0);
    expect(t.total).toBe(0);
    expect(t.correct).toBe(0);
  });

  it("addRun is reflected by a subsequent read", async () => {
    const store = createInMemoryCumulativeStore();
    const run = runOf(
      { id: "1", corruptionTag: "near-swap", correct: true },
      { id: "2", corruptionTag: "blank", correct: false },
    );
    const returned = await store.addRun(run);
    const read = await store.read();

    expect(read.runs).toBe(1);
    expect(read.total).toBe(2);
    expect(read.correct).toBe(1);
    // addRun returns the same updated totals it persisted.
    expect(returned).toEqual(read);
  });

  it("sequential folds accumulate", async () => {
    const store = createInMemoryCumulativeStore();
    await store.addRun(oneCorrectNear());
    await store.addRun(oneCorrectNear());
    await store.addRun(oneCorrectNear());
    const t = await store.read();
    expect(t.runs).toBe(3);
    expect(t.total).toBe(3);
    expect(t.correct).toBe(3);
    expect(t.byTag["near-swap"]).toEqual({ correct: 3, count: 3 });
  });

  it("concurrent folds are atomic — K concurrent addRun give the sum of K, no lost update", async () => {
    const store = createInMemoryCumulativeStore();
    const K = 50;
    // Fire all K without awaiting in between — a naive read-modify-write with an
    // await between read and write would lose updates and leave total < K.
    await Promise.all(Array.from({ length: K }, () => store.addRun(oneCorrectNear())));
    const t = await store.read();
    expect(t.runs).toBe(K);
    expect(t.total).toBe(K);
    expect(t.correct).toBe(K);
    expect(t.byTag["near-swap"]).toEqual({ correct: K, count: K });
  });

  it("persists across store instances backed by the same storage (survives a 'reopen')", async () => {
    // The shared backing models a SQLite file two connections both see. A store
    // re-opened on it must read back what the prior instance wrote — the property
    // that makes the cumulative survive a process restart.
    const backing = createMemoryBacking();
    const first = createInMemoryCumulativeStore(backing);
    await first.addRun(oneCorrectNear());
    await first.addRun(oneCorrectNear());

    const reopened = createInMemoryCumulativeStore(backing);
    const t = await reopened.read();
    expect(t.runs).toBe(2);
    expect(t.total).toBe(2);
    expect(t.correct).toBe(2);
  });

  it("two stores on DIFFERENT backings do not share state (isolation sanity)", async () => {
    const a = createInMemoryCumulativeStore(createMemoryBacking());
    const b = createInMemoryCumulativeStore(createMemoryBacking());
    await a.addRun(oneCorrectNear());
    expect((await b.read()).total).toBe(0); // b untouched by a's write
  });
});
