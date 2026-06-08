# Spec — Cumulative tally + persistence (feature 4)

## Ground-truth check
CLAUDE.md / declaration sections leaned on for this spec, and their currency
(confirmed with the owner this session):
- **Platform & deps** — Next.js (React + Tailwind) on Fly.io; `pnpm`; Vitest via
  `pnpm test`. Current. This feature adds the project's **first durable-state layer**
  (a SQLite database) behind the existing server surface, plus one read endpoint.
- **Persistence mechanism (owner decision, this session)** — **SQLite, single
  machine.** This is a demo unlikely to be scaled to full production, so a single
  SQLite file (no external store, no horizontal scaling) is the accepted trade-off.
  The concrete driver (e.g. `better-sqlite3` vs. the built-in `node:sqlite`) is a
  `/build` choice — the spec fixes the *behavior* (durable, atomic increment), not the
  library.
- **Frozen engine + stream contracts (features 2 & 3)** — `src/types.ts`
  (`RunEntry`, `RunScore`, `Tag`, `TagBreakdown`) and `src/run-stream.ts`
  (`RunStreamEvent` = `entry` | `score` | `error`, in the order `entry*` then exactly
  one of `score`/`error`), read directly this session. This feature **consumes** these
  shapes unchanged and **does not alter** the run-stream event sequence — feature 3's
  `run-stream.test.ts` (which asserts a successful run is exactly `N` entry events then
  one score event, length `N+1`) must stay green. The cumulative figure is delivered
  over a **separate read endpoint**, never as a new run-stream event.
- **SDK/IO-isolation pattern (features 2 & 3)** — the established split: pure,
  deterministic, dependency-free seams are in the automated bar; the thin shells that
  touch a native/IO dependency, the DOM, and the network are validated manually and
  kept **out of the test import graph** (`src/anthropic.ts`, the server route). This
  feature reuses that pattern exactly: the SQLite-backed store is the new member of the
  "manually validated, never imported by tests" set, and the page/route are manual
  shells. `key-isolation.test.ts`'s approach (read file contents, grep for a forbidden
  import — never actually import the offending module) is reused for a new
  persistence-isolation guard so a native SQLite driver never has to load in the bar.
- **Security (constitution → OWASP Top 10, OWASP Top 10 for LLMs)** — the new
  endpoint is read-only and returns aggregate integer counts (no PII, no secrets, no
  per-record data). The write path is server-authoritative (the tally is derived from
  the engine's own `RunEntry`s, never from client input). Abuse via run-spam that
  moves the shared number is **#6's** rate-limiting concern (see Out of scope).
- No external precedent repos listed in CLAUDE.md; none consulted. The in-repo
  precedents are features 2 & 3, read directly.

**Standards-creep check.** This feature adds a small UI panel and one read endpoint.
Per feature 3's owner decision, **core WCAG 2.1 AA** applies (semantic markup, AA
contrast on the dark theme, the cumulative update surfaced to assistive tech via the
existing `aria-live` region) — verified by markup review, not a full automated audit;
a full AA sweep stays deferred to #7. Rate limiting and the Fly deploy/volume surface
are explicitly **#6**, not here.

## Decisions (settled with owner)
| Decision | Value |
|----------|-------|
| Storage | **SQLite, single machine.** One database file; durable across app restart. Driver left to `/build`. |
| Granularity | **Running counters only** — overall correct/total, the same per corruption tag, and a run count. **No** per-run history, time series, or per-visitor data. |
| What counts | **Only a successfully completed run** (the run that reached feature 3's `score` event). A fail-fast run (`error` event, no score) contributes nothing. |
| Authority | The cumulative is folded server-side from the engine's `RunEntry`/`RunScore`; the browser never recomputes or submits a tally. |
| Delivery | A **separate read endpoint** returns the current totals. Feature 3's run-stream is **not** extended with a cumulative event (keeps its frozen sequence and tests intact). |
| Live tick | On the visitor's own run completing, the page **re-reads** the cumulative endpoint and re-renders — no manual reload. |
| Empty state | Before any run is recorded (total = 0), the panel shows a "no runs yet" state; per-tag and overall accuracy reuse feature 3's `null`→"—" treatment, never `NaN`. |
| Concurrency | `addRun` is an **atomic increment** — two runs completing concurrently both land; neither silently overwrites the other. |
| DB path | A configurable filesystem path with a sensible local default; **#6** points it at a mounted Fly volume so it survives redeploys. The DB file is runtime state and is **git-ignored**, never committed. |

---

## Behavioral requirements

### Story 1 — A stabilized number a forwarded link can trust
*As a non-technical peer opening the link, I want one accuracy figure that reflects
every run ever done — not just the run I happened to trigger — so the demo's claim
feels solid rather than lucky.*

Acceptance criteria:
- The page shows a **cumulative** panel, distinct from the per-run figure, with: an
  overall cumulative accuracy, a count of runs (and/or records) it is computed over,
  and a near/far/blank breakdown — mirroring the per-run breakdown's shape.
- The cumulative accuracy equals `cumulative correct ÷ cumulative total` over all
  completed runs recorded so far; each per-tag cumulative accuracy equals that tag's
  cumulative correct ÷ that tag's cumulative count.
- The figure reflects runs recorded by **other** visitors too (it reads shared durable
  state, not session-local memory), and it **survives an app restart**.

### Story 2 — Honest, server-authoritative accumulation
*As the owner staking credibility on the number, I need each run folded into the
counters from the engine's own per-record results, and only when the run actually
finished — never inflated by a half-finished run or a number the browser sent up.*

Acceptance criteria:
- A run's contribution is derived from its `RunEntry`s: cumulative `total` increases by
  the number of records, cumulative `correct` by the number of `correct === true`
  entries, and the same per `corruptionTag`. (`RunScore`'s already-computed
  `total`/`breakdown.count` agree with these counts; the fold uses the exact integer
  counts, not a re-derivation from the float accuracy.)
- A run is recorded **iff** it completed successfully (the run-stream reached the
  `score` event). A run that ended in an `error` event (fail-fast) increments **no**
  counter — not even for the records that were classified before the failure.
- The cumulative figure rendered on the page is the value read back from the store; the
  client performs no cumulative arithmetic of its own beyond formatting.

### Story 3 — Durable, atomic counters
*As the engineer wiring persistence, I need a store whose counters outlive a request and
an app restart, and that two concurrent runs can both update without losing one.*

Acceptance criteria (the store seam, against any conforming implementation):
- A freshly initialized store reads back **empty** totals (all counts zero; accuracy in
  the empty-state representation, not `NaN`).
- After folding a run, `read()` reflects exactly that run's counts; folding a second run
  accumulates (totals are the sum of the two runs).
- Folding is **atomic**: given K runs folded concurrently, the final totals equal the
  sum of all K — no update is lost to a read-modify-write race.
- The totals **persist** across store instances backed by the same storage (a new store
  opened against the same backing reads back what the prior instance wrote) — the
  property that makes the number survive a process restart.

### Story 4 — Live tick on completion, honest on failure
*As a visitor, when my run finishes I want to see the cumulative number move to include
it without reloading; when my run fails, I want the cumulative number to stay put,
because nothing real happened.*

Acceptance criteria:
- When the current run reaches its `score` event, the page updates the cumulative panel
  to a value that **includes** the just-finished run, without a manual reload.
- The run's contribution is committed to the store **before** that run's response stream
  closes, so a client that reads its run to completion and then re-reads the cumulative
  endpoint sees its own run reflected (no lost-update window from the client's point of
  view).
- When the current run ends in an `error`, the cumulative panel is **unchanged** — no
  optimistic increment, no flicker of a number that then has to be retracted.

### Story 5 — Empty state, never NaN
*As the first-ever visitor, I want the panel to say there are no runs yet rather than
show a broken `0/0` figure.*

Acceptance criteria:
- With cumulative `total = 0`, the overall figure renders as a clear "no runs yet" /
  non-numeric marker, never `NaN` and never `0%` masquerading as a real measurement.
- A per-tag cell whose cumulative count is 0 renders as the same not-applicable marker
  feature 3 uses for a zero-count tag ("—"), never `NaN`.

### Story 6 — The persistence layer stays server-side
*As the operator, I need the database driver and the store to live only on the server so
the browser bundle never pulls a native module and the test suite never has to load one.*

Acceptance criteria:
- The SQLite driver and the SQLite-backed store module are imported only from
  server-side code (the routes); **no** `"use client"` component imports them.
- **No** file under any `tests/` directory imports the SQLite driver or the
  SQLite-backed store module; the automated suite runs with no native-SQLite runtime
  dependency (it exercises the store contract through the in-memory implementation).
- The database file is treated as runtime state: it is git-ignored and never committed.

### Edge cases & failure modes
- **First run on an empty store** — Story 5: empty-state render; then Story 1/4: the
  first completed run produces a real figure.
- **Run fails fast mid-way** — Story 2/4: no counter moves; the panel is unchanged.
- **Two runs complete near-simultaneously** — Story 3: both are counted (atomic
  increment); the final total is the sum, not the larger of the two.
- **Store/DB read fault on page load** — the cumulative panel must fail **soft**: the
  per-run demo (feature 3) still works and the page still renders; the cumulative panel
  shows an unavailable/last-known state rather than crashing the page. (A broken
  cumulative panel must not take down the Run button.)
- **Store/DB write fault on run completion** — the run's own result (already streamed to
  the user) is **not** retracted; the commit failure is logged server-side and the
  cumulative simply does not advance for that run. The user still sees their run; the
  number is eventually-consistent at worst, never wrong.
- **Zero-count tag in the cumulative** — Story 5: "—", never `NaN` (reuses feature 3's
  `null` treatment).

### Out of scope
See feature `declaration.md`. Notably: no per-run history / time series / per-visitor
breakdown; no rate limiting or abuse protection (#6 — anyone who can run moves the
shared number); no Fly volume provisioning / deploy / CI (#6, though the durable-path
contract is named here); no reset/admin surface; no narrative copy (#7); and **no
change** to feature 2/3's frozen shapes or to feature 3's run-stream event sequence.

---

## Design

### Components & seams
`@frozen` marks a real contract `/build` must satisfy as written; `@scaffolding` marks
a surface named ahead of `/build` that may be re-sited as long as the asserted behavior
holds (logged in `build-deviations.md`). The split mirrors features 2 & 3: **pure,
dependency-free seams are in the automated bar; the SQLite/DOM/network shells are
validated manually**, exactly as `src/anthropic.ts` and the server route are.

- **Cumulative aggregate + fold** *(`@frozen` behavior; `@scaffolding` names)* — a pure,
  dependency-free module. It defines the cumulative totals value (overall
  `correct`/`total`, a `runs` count, and per-`Tag` `correct`/`count`) and the pure
  operations over it: an **empty** totals constructor; `tallyRun(entries: RunEntry[])`
  producing one run's exact integer counts (overall and per tag) from the frozen
  `RunEntry`s; a **fold** that adds a run's tally into totals immutably (incrementing the
  `runs` count by one); and accuracy accessors that yield `correct/total` when `total > 0`
  and an empty-state value (`null`) when `total = 0` — overall and per tag. No `NaN` ever
  escapes. It imports only `RunEntry`/`Tag` types — nothing from SQLite, `next`, or the
  SDK — so it is fully unit-tested headlessly. (Substance, re-sitable: file/function
  names. Frozen: the arithmetic — sums are exact integer counts, accuracy is
  `correct/total` or empty-state, the `runs` count increments once per folded run.)

- **Cumulative store port + in-memory reference** *(`@frozen` contract behavior,
  `@scaffolding` surface)* — an async store interface: `read()` → current totals, and
  `addRun(tally)` → fold a run's tally and return the updated totals. Plus an in-memory
  reference implementation used by the test bar and as the contract's executable
  definition. The headless bar runs the **store contract** against this reference:
  empty on init; `read` reflects writes; sequential folds accumulate; concurrent folds
  do not lose updates; and a store re-opened against the same backing reads prior writes.
  **Honesty note (gate MEDIUM ×2):** in single-threaded JS these last two are
  *reference-level* checks, not proof of real durability/atomicity. The concurrency case
  catches a gratuitously-`await`-interleaved read-modify-write but cannot exercise true
  storage contention; the "reopen" case shares a backing cell and so does not cross a
  real serialize/deserialize boundary. **Real SQLite atomicity and durability across an
  actual process restart are validated manually** (see Manual validation) — the same
  posture this project already uses for `src/anthropic.ts`'s network behavior. The
  in-memory reference's value is to *pin the contract* the SQLite store must also meet;
  `/build` runs the **same contract suite against the SQLite store** as a manual item.
  Imports no native dependency.

- **SQLite-backed store** *(`@scaffolding` shell; manually validated, NOT in the test
  import graph)* — the production `CumulativeStore` backed by a single SQLite database at
  a configurable path (default for local dev; **#6** sets it to a mounted Fly volume).
  It satisfies the **same** store contract as the in-memory reference, with durability and
  atomicity provided by SQLite (a single increment `UPDATE` / a transaction, not a
  JS-level read-then-write). Because it imports a SQLite driver, **no test imports it** —
  its durability and atomicity are validated by running the app and by the manual
  checklist, exactly as `src/anthropic.ts` is. It is exposed to the routes as a
  process-wide singleton (one DB connection reused across requests).

- **Run recorder** *(`@frozen` behavior, `@scaffolding` name)* — a **pass-through**
  over a run's event stream: given an `AsyncIterable<RunStreamEvent>` and a
  `CumulativeStore`, it yields every event through **unchanged** (so the route forwards
  the identical SSE frames) while observing them, and when the source stream is
  exhausted it commits the run iff a `score` event was seen — folding the tally built
  from the observed `entry` events — or commits nothing on an `error`-terminated stream.
  Critically, it **awaits the commit before its own stream completes** (Story 4): a route
  that iterates this stream to its end and then closes the response therefore cannot
  close before the write has landed, closing the "no lost-update window" the live tick
  depends on. It imports only the store port, the aggregate module, and the
  `RunStreamEvent`/`RunEntry` types — nothing from SQLite, `next`, or the SDK — so all
  three properties (only-successful-runs-count, committed-delta-equals-the-entries, and
  commit-before-stream-done) are tested headlessly against the in-memory store, the
  last via a gated store that blocks the write and proves stream-completion waits for
  it. The server route uses this helper so its persistence behavior **is** the tested
  behavior, not a manual approximation of it.

- **Cumulative read endpoint** *(`@scaffolding` shell; manually validated)* — a Next.js
  route handler (substance: `app/api/cumulative/route.ts`) that returns the current
  totals from the singleton store as JSON. Read-only; no parameters; fails soft (a store
  read fault yields a clear non-2xx the page can degrade on, never a hang). Not imported
  by tests (it pulls in the SQLite store).

- **Run route persistence wiring** *(`@scaffolding` shell; manually validated)* — the
  existing `app/api/run/route.ts` gains one responsibility: it wraps `runEventStream`
  in the **run recorder** pass-through and pipes the recorder's output to the SSE
  response. Because the recorder awaits the commit before its stream completes, the
  route's existing "iterate to done, then `controller.close()`" shape already closes
  *after* the write lands — no new awaiting discipline for the route to get wrong
  (the ordering guarantee lives in the tested recorder seam, not in route glue). This
  adds no new run-stream event and changes none of feature 3's emitted frames — the SSE
  the client already parses is byte-for-byte the same; only a server-side write is added.
  Validated manually (it imports the SDK and the SQLite store).

- **Cumulative panel + live tick** *(`@scaffolding` shell; manually validated)* — the
  React client surface: on mount it reads the cumulative endpoint and renders the panel
  (overall accuracy, run/record count, near/far/blank breakdown, or the empty state); when
  a run reaches `done`, it re-reads the endpoint and re-renders (Story 4 live tick); on a
  run `error` it leaves the panel untouched. It imports only type-only shapes and the pure
  formatter(s) — never the store or the driver (Story 6). The DOM, the fetch wiring, and
  the WCAG markup are validated by running the app and by markup review.

### Manual validation (routes + page + SQLite — outside the headless bar)
The SQLite store, both routes, and the React panel are validated by running the app
(`pnpm dev`), the same way features 2 & 3 validated their SDK/DOM shells. `/build` must
walk this checklist and record the outcome in `build-deviations.md`; each item maps to an
acceptance criterion that has no executable test by design:
- **Durability across restart** (S1/S3) — complete a run, note the cumulative; stop and
  restart the app; the cumulative panel reads back the same totals (the SQLite file
  survived). Run again; the number advances from the persisted base, not from zero.
- **Cross-visitor aggregation** (S1) — a run in one browser session is reflected when the
  cumulative endpoint is read from another session (shared store, not session memory).
- **Live tick** (S4) — completing a run moves the panel to include it with no reload;
  a failed run leaves the panel unchanged.
- **Empty state** (S5) — against a fresh/empty database, the panel shows "no runs yet"
  (no `NaN`, no `0%` posing as a measurement); the first completed run replaces it with a
  real figure.
- **Concurrency** (S3) — trigger two runs that complete close together (e.g. two tabs);
  the final cumulative total equals the sum of both runs, not just one.
- **SQLite store satisfies the contract** (S3) — run the in-bar store-contract suite
  (empty-init, read-after-write, accumulation, concurrent fold) against the **SQLite**
  store, not just the in-memory reference, and confirm it passes — this is where real
  atomicity is exercised, since the bar's reference checks cannot.
- **Soft failure** (edge) — with the DB path made unreadable/unwritable, the page still
  renders and the Run button still works; the cumulative panel shows an unavailable state
  rather than crashing, and a write fault does not retract the user's streamed run.
- **Run-stream unchanged** (regression) — feature 3's `run-stream.test.ts` and the live
  per-run UI behave exactly as before; the only addition is the cumulative panel.
- **Core WCAG** (constitution / feature-3 decision) — the panel is semantic, meets AA
  contrast on the dark theme, and the cumulative update is announced via the existing
  `aria-live` status region (markup review, not an automated audit).

### Seam properties (what must hold, not how)
- **Exact-count fold** — a run's contribution is exact integer counts from its
  `RunEntry`s (overall and per tag), not a lossy re-derivation from a float accuracy; the
  cumulative accuracy is `correct/total` over the accumulated integers.
- **Success-only accounting** — the recorder commits iff the run reached `score`; an
  `error`-terminated run commits nothing, including its pre-failure entries.
- **Atomic accumulation** — concurrent folds never lose an update; K concurrent folds
  yield the sum of K. (Verified at the reference level in the bar; **real SQLite
  contention is manually validated** — see the honesty note above.)
- **Persistence** — a store re-opened against the same backing reads back prior writes.
  Modeled at the reference level in the bar via a shared backing; **real durability
  across a process restart is realized on disk by SQLite and validated manually** — the
  bar does not prove it.
- **No-NaN / empty-state** — `total = 0` (overall) or `count = 0` (per tag) yields the
  empty-state marker, never `NaN`; reuses feature 3's `null`→"—" treatment.
- **Isolation** — the SQLite driver and the SQLite-backed store never enter the test
  import graph and never enter a `"use client"` component (structural guard, asserted by
  scanning file contents for the forbidden imports — never importing them).
- **Stream-invariance** — feature 3's run-stream event sequence and its tests are
  unchanged; the cumulative figure rides a separate read endpoint.

### Pattern reuse
- **Frozen shapes** — reuses `RunEntry` / `RunScore` / `Tag` / `TagBreakdown` from
  `src/types.ts` and `RunStreamEvent` from `src/run-stream.ts` as the recorder's inputs;
  introduces no new run-level data contract.
- **`null`→"—" empty-state formatting** — reuses feature 3's `formatTagAccuracy`
  (view-reducer) convention for zero-count cells; the overall empty state is the same
  idea applied to the headline.
- **SDK/IO-isolation split** — reuses features 2 & 3's "pure seam tested / IO shell
  manually validated, out of `tests/`" pattern: the SQLite store is the new manually
  validated member, the in-memory store + recorder + aggregate are the tested seams.
- **Isolation guard by content-scan** — reuses `key-isolation.test.ts`'s technique
  (read file text, assert no forbidden import string; never import the module) for the new
  persistence-isolation guard, so a native driver never has to load in the bar.
- **Test runner** — reuses the established Vitest/TS wiring (constitution `## Testing`);
  no new runner. New tests resolve any repo file from the test file's own location via
  `fileURLToPath(import.meta.url)`, never an absolute path.

### Standards
- **OWASP Top 10 / Top 10 for LLMs** — the read endpoint exposes only aggregate integer
  counts (no PII/secrets/per-record data). The write path is server-authoritative (tally
  derived from the engine's `RunEntry`s; no client-supplied tally). The shared number is
  movable by anyone who can run — bounded by **#6**'s rate limiting (named, deferred). No
  new untrusted-input parsing surface (the endpoint takes no parameters).
- **WCAG 2.1 AA (core)** — semantic panel markup, AA contrast on the dark theme, the
  cumulative update announced via the existing `aria-live` region. Full audit deferred to
  #7 (owner decision, feature 3).
- **Quality gate (constitution)** — Vitest does not type-check the Next build, so the
  production build (`pnpm build` / `tsc`) must pass as part of the bar. Wiring a CI
  workflow lands with #6; for this feature the build must succeed locally. The DB file is
  git-ignored; `CUMULATIVE_DB_PATH` (optional, defaulted) is documented in `.env.example`
  so there is no key drift when #6 injects the volume path.

---

## Coverage

| Requirement / seam | Test(s) | Tag |
|--------------------|---------|-----|
| S2/S3: `tallyRun` yields exact overall + per-tag integer counts from `RunEntry`s | `cumulative.test.ts` → tallyRun counts | @frozen |
| S2/S1: fold adds a run's tally into totals (overall + per tag), increments `runs` by one | `cumulative.test.ts` → fold accumulates | @frozen |
| S1: cumulative accuracy = correct/total (overall and per tag) over accumulated integers | `cumulative.test.ts` → accuracy arithmetic | @frozen |
| S5: empty totals (total=0) → overall empty-state value (null), never NaN | `cumulative.test.ts` → empty state / no NaN | @frozen |
| S5: zero-count tag → null → "—" via feature-3 formatter | `cumulative.test.ts` → tag empty-state format | @frozen |
| S5/honesty: tag with count>0 & correct=0 → real `0` (not "—"), renders numeric | `cumulative.test.ts` → zero-correct is a real 0% | @frozen |
| S3: fresh store reads empty totals | `cumulative-store.test.ts` → empty on init | @frozen |
| S3: `addRun` reflected by `read`; sequential folds accumulate | `cumulative-store.test.ts` → read-after-write & accumulate | @frozen |
| S3: reference store does not lose updates under concurrent folds (real SQLite contention → manual) | `cumulative-store.test.ts` → atomic concurrent fold | @frozen (reference) |
| S3: reference store reads prior writes on a shared backing (real reopen durability → manual) | `cumulative-store.test.ts` → persists across instances | @frozen (reference) |
| S2/S4: recorder passes events through unchanged | `record-run.test.ts` → pass-through | @frozen |
| S2: recorder commits iff `score` seen; committed delta == the entries (not the score's numbers) | `record-run.test.ts` → success commits run tally | @frozen |
| S2/S4: `error`-terminated stream commits nothing (incl. pre-failure entries) | `record-run.test.ts` → fail-fast commits nothing | @frozen |
| **S4: commit is awaited BEFORE stream-done (no fire-and-forget lost-update window)** | `record-run.test.ts` → commits before stream completes (gated store) | @frozen |
| S2: recorder folds the same counts the engine's `RunResult` implies (real stream) | `record-run.test.ts` → matches engine over runEventStream | @frozen |
| S6: no `tests/` file imports the SQLite driver or the SQLite store module | `persistence-isolation.test.ts` → bar is driver-free | @frozen |
| S6: no `"use client"` component under `app/` imports the driver or the SQLite store | `persistence-isolation.test.ts` → no client-component leak | @frozen |
| S6: the DB file is git-ignored (runtime state, never committed) | `persistence-isolation.test.ts` → gitignore covers the db | @frozen |
| Gate/no-drift: `CUMULATIVE_DB_PATH` documented in `.env.example` | `persistence-isolation.test.ts` → .env.example currency | @frozen |
| S1/S3: durability across restart; cross-visitor aggregation; **SQLite store passes the contract suite** | manual validation (no executable test by design) | — |
| S4: live tick on completion; panel unchanged on failure | manual validation | — |
| S5: empty-state render in the live UI | manual validation | — |
| Edge: soft failure (read/write fault) doesn't crash the page or retract a run | manual validation | — |

`@scaffolding` marks surfaces named ahead of `/build` that may be re-sited as long as the
asserted behavior holds: the aggregate/store/recorder **module and function names**, the
store interface's exact method names, and the totals field names. The **arithmetic**
(exact-count fold, `correct/total` accuracy, empty-state instead of NaN, `runs`
increments once per run), the **store contract** (empty-init, read-after-write,
accumulation, atomic concurrent fold, persistence across instances), the
**success-only accounting**, and the **isolation guards** are `@frozen`. The **SQLite
store, both routes, and the React panel are validated manually** by running the app —
they are the SQLite/DOM/network shells, kept out of the headless bar by design (the same
reason `src/anthropic.ts` is not unit-tested). Tests that read repo files
(`persistence-isolation.test.ts`) resolve them from the test file's own location.

---

## Adversarial gate

**Mode:** independent clean-context sub-agent (general-purpose), one pass. The gate read
both declarations, this spec, every test/helper file, and the inherited feature-2/3
engine, stream, and isolation guard. It confirmed the honest core: the score-event
sentinel genuinely proves counts come from `entry`s not the `score` event, the fail-fast
tests genuinely prove only-successful-runs-count, the isolation guard faithfully reuses
feature 3's content-scan technique with an anti-vacuous-pass anchor, and there is no
scope drift or new untrusted-input surface (the read endpoint is parameterless; the write
path is server-authoritative). It returned one HIGH, two MEDIUM, and two LOW — **no
security finding**, so no re-gate was triggered. The owner chose to **fix all five**;
each fix was verified by running the affected suite.

| # | Severity | Lens | Finding | Disposition |
|---|----------|------|---------|-------------|
| 1 | HIGH | Coverage / Integrity | Story 4's "commit before the response stream closes" (the no-lost-update window behind the live tick) had **no executable test**: the recorder took an already-drained array, so a fire-and-forget `/build` that didn't await the commit would pass the whole suite yet race the client's re-read. A testable seam was within reach. | **Fixed** — the recorder was reshaped into a **pass-through async-generator** (`recordRunStream`) that yields each event through and **awaits the commit before its own stream completes**. `record-run.test.ts` now drives it with a **gated store** that blocks the write and asserts stream-`done` does not resolve (and nothing is written) until the commit lands — which a fire-and-forget impl fails. The route's existing "iterate then close" shape now closes after the write by construction. Verified by the (red-until-build) ordering test. |
| 2 | MEDIUM | Integrity | The atomicity test (`Promise.all` of K `addRun` on the in-memory store) does not truly discriminate a racy implementation in single-threaded JS, and the **real** atomicity that matters (SQLite) is out of the bar — yet the coverage table billed it as a `@frozen` executable atomicity guarantee. | **Fixed** (honesty) — kept the test as a **reference-level** contract check, but the store-port design now carries an explicit honesty note that real SQLite atomicity is **manually validated**, the coverage row is retagged `@frozen (reference)`, and a manual item was added: `/build` runs the **same contract suite against the SQLite store**. No standing risk. |
| 3 | MEDIUM | Integrity | The "persists across instances" test shares a mutable backing cell, so it proves reference-sharing, not a real serialize/deserialize reopen boundary — again billed as the `@frozen` persistence guarantee. | **Fixed** (honesty) — same treatment as #2: retagged `@frozen (reference)`, the design and seam-properties now state real durability across a restart is **manually validated** (on-disk SQLite), and the manual checklist covers it. No standing risk. |
| 4 | LOW | Standards / Coverage | The constitution's no-drift gate requires `.env.example` to list every injected key; the spec promised to document `CUMULATIVE_DB_PATH` there but nothing enforced it (only the `.gitignore` half was tested). | **Fixed** — added `persistence-isolation.test.ts` → ".env.example currency" asserting the key is documented; `/build` must add the line to pass. |
| 5 | LOW | Coverage | No test pinned that a tag with real records but zero correct (`count>0, correct=0`) renders a real `0%` rather than the "—" empty-state marker — a plausible falsy-numerator bug would hide a genuinely-wrong tag, undercutting the demo's honesty. | **Fixed** — added `cumulative.test.ts` → "zero-correct is a real 0%" asserting `cumulativeTagAccuracy` returns `0` (not `null`) and renders numeric. |

No findings were acknowledged, so constitution.md's `## Acknowledged risks` table gains no
row from this feature.
