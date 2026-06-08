// SQLite-backed cumulative store (feature 4) — the production CumulativeStore.
//
// @scaffolding shell, manually validated, NOT in the test import graph: it imports a
// native SQLite driver, so persistence-isolation.test.ts forbids any test (and any
// "use client" component) from importing it. It satisfies the SAME observable contract
// as the in-memory reference in `cumulative-store.ts`; its durability (a real file on
// disk) and atomicity (a single `UPDATE` statement, not a JS read-then-write) are
// validated by running the app, exactly as `src/anthropic.ts`'s network behavior is.
//
// Driver: Node's built-in `node:sqlite` (Node 22+) — no third-party dependency, no
// build step. The counters live in a single one-row table; `addRun` is one atomic
// `UPDATE` that adds the run's integer counts.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CumulativeTotals, RunTally } from "./cumulative";
import type { CumulativeStore } from "./cumulative-store";

/** Local-dev default; #6 overrides via CUMULATIVE_DB_PATH to a mounted Fly volume. */
function resolveDbPath(): string {
  const configured = process.env.CUMULATIVE_DB_PATH?.trim();
  return configured && configured.length > 0
    ? configured
    : join(process.cwd(), "data", "cumulative.sqlite");
}

interface CumulativeRow {
  runs: number;
  total: number;
  correct: number;
  near_count: number;
  near_correct: number;
  far_count: number;
  far_correct: number;
  blank_count: number;
  blank_correct: number;
}

function rowToTotals(row: CumulativeRow): CumulativeTotals {
  return {
    runs: row.runs,
    total: row.total,
    correct: row.correct,
    byTag: {
      "near-swap": { correct: row.near_correct, count: row.near_count },
      "far-swap": { correct: row.far_correct, count: row.far_count },
      blank: { correct: row.blank_correct, count: row.blank_count },
    },
  };
}

export function createSqliteCumulativeStore(
  dbPath: string = resolveDbPath(),
): CumulativeStore {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);

  // One row (id = 1) holds every counter. Created idempotently so a reopened DB keeps
  // its prior contents (durability across a restart).
  db.exec(`
    CREATE TABLE IF NOT EXISTS cumulative (
      id            INTEGER PRIMARY KEY CHECK (id = 1),
      runs          INTEGER NOT NULL DEFAULT 0,
      total         INTEGER NOT NULL DEFAULT 0,
      correct       INTEGER NOT NULL DEFAULT 0,
      near_count    INTEGER NOT NULL DEFAULT 0,
      near_correct  INTEGER NOT NULL DEFAULT 0,
      far_count     INTEGER NOT NULL DEFAULT 0,
      far_correct   INTEGER NOT NULL DEFAULT 0,
      blank_count   INTEGER NOT NULL DEFAULT 0,
      blank_correct INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO cumulative (id) VALUES (1);
  `);

  const readStmt = db.prepare(`SELECT * FROM cumulative WHERE id = 1`);
  // One atomic statement: the read-modify-write happens inside SQLite, so two
  // concurrent runs both land (neither overwrites the other) — the real atomicity the
  // in-memory reference can only model.
  const updateStmt = db.prepare(`
    UPDATE cumulative SET
      runs          = runs + 1,
      total         = total + :total,
      correct       = correct + :correct,
      near_count    = near_count + :near_count,
      near_correct  = near_correct + :near_correct,
      far_count     = far_count + :far_count,
      far_correct   = far_correct + :far_correct,
      blank_count   = blank_count + :blank_count,
      blank_correct = blank_correct + :blank_correct
    WHERE id = 1
  `);

  const read = (): CumulativeTotals =>
    rowToTotals(readStmt.get() as unknown as CumulativeRow);

  return {
    async read() {
      return read();
    },
    async addRun(tally: RunTally) {
      updateStmt.run({
        total: tally.total,
        correct: tally.correct,
        near_count: tally.byTag["near-swap"].count,
        near_correct: tally.byTag["near-swap"].correct,
        far_count: tally.byTag["far-swap"].count,
        far_correct: tally.byTag["far-swap"].correct,
        blank_count: tally.byTag.blank.count,
        blank_correct: tally.byTag.blank.correct,
      });
      return read();
    },
  };
}

// Process-wide singleton: one DB connection reused across requests (both routes share
// it).
let singleton: CumulativeStore | null = null;

export function getCumulativeStore(): CumulativeStore {
  if (!singleton) singleton = createSqliteCumulativeStore();
  return singleton;
}
