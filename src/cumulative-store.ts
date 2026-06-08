// Cumulative store port + in-memory reference (feature 4, Story 3).
//
// The async store interface every cumulative store satisfies — `read()` returns the
// current totals, `addRun(tally)` folds a run and returns the updated totals — plus an
// in-memory reference implementation. The reference is both the test double and the
// executable definition of the contract: empty on init, read-after-write, sequential
// accumulation, atomic concurrent fold, and persistence across instances on a shared
// backing.
//
// HONESTY NOTE (gate MEDIUM x2): the concurrency and "reopen" properties are checked
// here only at the *reference* level. In single-threaded JS the atomic fold below
// cannot exercise real storage contention, and a shared backing cell is not a real
// serialize/deserialize boundary. Real SQLite atomicity and durability across an
// actual process restart are validated MANUALLY against `cumulative-sqlite.ts` — the
// same posture this project uses for `src/anthropic.ts`'s network behavior. The
// reference's job is to pin the contract the SQLite store must also meet.
//
// Imports no native dependency, so it is the store the headless bar exercises.
import { emptyTotals, foldRun } from "./cumulative";
import type { CumulativeTotals, RunTally } from "./cumulative";

/** The store contract. The SQLite-backed store satisfies this same interface. */
export interface CumulativeStore {
  read(): Promise<CumulativeTotals>;
  addRun(tally: RunTally): Promise<CumulativeTotals>;
}

/**
 * A shared backing cell modelling the storage two store instances both see (a SQLite
 * file two connections both open). Pass the same backing to two stores to model a
 * "reopen"; pass none and each store gets its own.
 */
export interface MemoryBacking {
  totals: CumulativeTotals;
}

export function createMemoryBacking(): MemoryBacking {
  return { totals: emptyTotals() };
}

export function createInMemoryCumulativeStore(
  backing: MemoryBacking = createMemoryBacking(),
): CumulativeStore {
  return {
    async read() {
      return backing.totals;
    },
    async addRun(tally) {
      // Read-modify-write with NO await between the read and the write: in
      // single-threaded JS the whole fold runs to completion before control returns
      // to the event loop, so K concurrent addRun calls all land (none is lost to an
      // interleaved read). This is the reference-level model of the atomic increment a
      // single SQLite `UPDATE` provides for real.
      backing.totals = foldRun(backing.totals, tally);
      return backing.totals;
    },
  };
}
