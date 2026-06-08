# Build deviations — Cumulative tally + persistence (feature 4)

The honest record of where the build diverged from the spec's *design* (a
recommendation, not a contract), the one test correction made, and the outcome of the
manual-validation checklist the spec hands to `/build`. **No `spec.md` requirement was
changed.** Every `@scaffolding` surface (`emptyTotals` / `tallyRun` / `foldRun` /
`cumulativeAccuracy` / `cumulativeTagAccuracy`, the store's `read`/`addRun` +
`createInMemoryCumulativeStore` / `createMemoryBacking`, `recordRunStream`, the
`CumulativeTotals` / `RunTally` field names, and the `cumulative-sqlite` module path)
was implemented under the exact name and shape the tests named, so the headless bar
passed against the suite as written (after the one correction below).

## Test correction

### `cumulative-store.test.ts` — `oneCorrectNear` wrapped its partial in an extra array
- **Original (line 23–24):**
  ```ts
  const oneCorrectNear = (): RunTally =>
    runOf([{ id: "x", corruptionTag: "near-swap", correct: true }]);
  ```
- **Corrected to:**
  ```ts
  const oneCorrectNear = (): RunTally =>
    runOf({ id: "x", corruptionTag: "near-swap", correct: true });
  ```
- **Why it was wrong:** the file's local helper is
  `const runOf = (...args) => tallyRun(args.map((a) => entry(a)))` — it takes **bare**
  partial objects as varargs and maps each through `entry(a)`. Every other call in the
  file uses that bare form (e.g. line 37: `runOf({ id: "1", ... }, { id: "2", ... })`).
  `oneCorrectNear` alone wrapped its partial in an array, so `entry()` received
  `[{...}]` as its `partial`. `partial.corruptionTag` was therefore `undefined` and
  fell through to the helper's `?? "blank"` default — producing a **blank** entry, not a
  **near-swap** one (and `id`/`correct` likewise read off the array, landing on the
  defaults). The run's counts went into `byTag.blank` instead of `byTag["near-swap"]`,
  so `expect(t.byTag["near-swap"]).toEqual({ correct: 3, count: 3 })` failed with the
  near-swap cell still `{0,0}` — while `total`/`correct` (3/3) were correct, proving the
  store arithmetic was right and only the test's input construction was wrong.
- **Behavioral assertion preserved:** the corrected helper makes `oneCorrectNear`
  actually build the one-correct-**near-swap** run its name promises, so the
  accumulation, atomicity, and persistence assertions it feeds (`byTag["near-swap"]`
  sums to `{3,3}` / `{K,K}`) hold exactly as written. No assertion was weakened; an
  input typo was fixed so the assertion tests what it claims to.
- **Spec-authoring lesson (for `/retro`):** when a test helper defines a vararg
  constructor (`runOf(...args)`) and then a *second* convenience wrapper over it
  (`oneCorrectNear`), an arity/shape mismatch between the two passes the type-unchecked
  Vitest run silently and only surfaces as a wrong-bucket count. Prefer one calling
  convention, or have the wrapper assert the shape it builds.

## Design realizations (the design is a recommendation; behavior is the contract)

### 1. SQLite driver = Node's built-in `node:sqlite` (the spec left the driver to `/build`)
- **Spec said:** "The concrete driver (e.g. `better-sqlite3` vs. the built-in
  `node:sqlite`) is a `/build` choice — the spec fixes the *behavior* (durable, atomic
  increment), not the library."
- **What was done:** used **`node:sqlite`** (`DatabaseSync`), available in the sandbox's
  Node 22. No third-party dependency, no native build step, no lockfile churn. The
  counters live in a single one-row table; `addRun` is one atomic `UPDATE … SET col =
  col + :delta` statement, so the read-modify-write happens inside SQLite (real
  atomicity, not a JS-level read-then-write). `persistence-isolation.test.ts` already
  lists `node:sqlite` among the forbidden drivers, so the isolation guard covers this
  choice unchanged.

### 2. Soft write-failure handling lives in the recorder (`recordRunStream`)
- **Spec said (edge case):** "Store/DB write fault on run completion — the run's own
  result … is **not** retracted; the commit failure is logged server-side and the
  cumulative simply does not advance." No executable test covers this path (it is a
  manual item).
- **What was done:** the recorder wraps `await store.addRun(...)` in a `try/catch` that
  `console.error`s and swallows. The user's run has already streamed in full by the time
  the commit runs; swallowing means a commit fault cannot turn a successful run into a
  spurious trailing `error` frame. The **tested** behaviors are unaffected: success
  commits the entries' tally, an `error`-terminated stream commits nothing, and the
  commit is still **awaited before stream-done** (the gated-store ordering test resolves
  its gate successfully, so the `try` path is what it exercises).

### 3. Process-wide store singleton lives in `cumulative-sqlite.ts`
- The design calls for the SQLite store "exposed to the routes as a process-wide
  singleton (one DB connection reused across requests)." Implemented as
  `getCumulativeStore()` in `cumulative-sqlite.ts` (memoized module-level instance), so
  both `/api/run` and `/api/cumulative` share one connection. Keeping the singleton in
  the driver-importing module means no other `src/` file imports the driver — the
  isolation guard's "only the SQLite store may import the driver" rule stays satisfied.

### 4. Default DB path + `.gitignore`/`.env.example`
- Local default `./data/cumulative.sqlite` (dir created with `mkdirSync(..., {
  recursive: true })`); overridable via `CUMULATIVE_DB_PATH` (documented in
  `.env.example`, valueless, for #6's Fly-volume mount). `.gitignore` ignores `data/`
  and `*.sqlite*` so the runtime DB is never committed (verified with `git check-ignore`
  and `git status`).

## Manual validation (SQLite store + routes + page — outside the headless bar)

Walked per the spec's **Manual validation** checklist. Items needing a live
`ANTHROPIC_API_KEY` (a real classified run end-to-end) are left for the owner, the same
boundary features 2 & 3 set for the SDK shell; everything else was verified in-sandbox.

| Item (spec) | Status | Evidence |
|-------------|--------|----------|
| **SQLite store satisfies the contract** (S3 — the manual item where *real* atomicity/durability is exercised) | ✅ **Verified in-sandbox** | Ran the store contract directly against `createSqliteCumulativeStore` on a real temp-file DB: empty-on-init, read-after-write, sequential accumulation, **50 concurrent `addRun` all land** (atomic), and **durability across a reopen** — a brand-new store/connection opened on the same on-disk file read back the prior writes. 9/9 checks passed. This is the real serialize/deserialize + contention boundary the in-memory reference can only model. |
| **Durability across restart** (S1/S3) | ✅ **Verified in-sandbox** (reopen ≡ restart at the connection level) | The reopen check above opens a fresh `DatabaseSync` on the same file — exactly what a process restart does — and reads back the persisted counters. The on-disk `data/cumulative.sqlite` file is created and survives the first connection closing. |
| **Empty state** (S5) | ✅ **Verified in-sandbox** | Against a fresh (no `data/`) DB, `pnpm build && pnpm start`; `GET /api/cumulative` → `200` with `{"runs":0,"total":0,"correct":0,"byTag":{…all zero…}}`; `GET /` renders "No runs yet — the cumulative accuracy appears here once the first run completes." under the "Cumulative across all runs" heading — no `NaN`, no `0%` posing as a measurement. |
| **Soft failure** (edge) | ✅ **Verified by construction + read path** | `/api/cumulative` wraps the read in `try/catch` and returns a `503` JSON error (never a 500/hang); the page's `loadCumulative` catches any non-ok/throw, flags "unavailable", and **keeps the last-known panel** — the Run button and per-run demo are on independent state and unaffected. The recorder swallows a write fault (deviation 2) so a streamed run is never retracted. |
| **Run-stream unchanged** (regression) | ✅ **Verified in-sandbox** | Feature 3's `run-stream.test.ts` and the whole suite (102 tests) pass; the recorder is a lossless pass-through (its own test asserts `out` deep-equals the source events), so the SSE frames the client parses are byte-for-byte unchanged. `pnpm build` type-checks and compiles clean. |
| **Live tick** (S4) | ⚠️ **Code-verified; not seen live (needs a key)** | On a `score` event the page sets a local `sawScore` flag and, after the stream drains, calls `loadCumulative()` to re-read and re-render — no reload. On an `error` (no score) it skips the re-read, leaving the panel untouched (and the recorder committed nothing). The commit-before-stream-done ordering is covered by the gated-store unit test, so the re-read cannot beat the write. **Owner to confirm** against a dev key: completing a run ticks the panel; a failed run leaves it put. |
| **Cross-visitor aggregation** (S1) | ⚠️ **Code-verified; needs two live sessions** | The store is a process-wide singleton over a shared on-disk file (not session memory); the contract test proves two store handles on the same backing share state. **Owner to confirm** a run in one browser is reflected when another session reads `/api/cumulative`. |
| **Concurrency, end-to-end** (S3) | ✅ **Store-level verified**; ⚠️ **two-tab live run needs a key** | The 50-way concurrent `addRun` check (above) proves the atomic increment at the store. **Owner to confirm** two near-simultaneous real runs (two tabs) leave the cumulative total equal to the sum of both. |
| **Core WCAG** (constitution / feature-3 decision) | ✅ **Verified by markup review** | The panel is a semantic `<section aria-labelledby="cumulative-heading">` with an `<h2>`; the cumulative tick is announced through the **existing** `role="status" aria-live="polite"` region (the done-message now includes "Cumulative accuracy across N runs: X%"). Dark-theme colours reuse feature 3's AA-contrast slate palette; the empty state and "—" markers carry digits-free text, never colour-only signal. |

**Net:** the headless bar (102 tests) passes; the production build type-checks and
compiles; and the manual items that do **not** need a live LLM key — most importantly
**the SQLite store satisfied the full contract including real atomicity and durability**
— were verified in-sandbox. The three items requiring a real Anthropic call (live tick
seen on screen, cross-visitor and two-tab end-to-end) are left for the owner against a
dev key, the same manual-validation boundary features 2 & 3 established.
