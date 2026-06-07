# Spec — Dashboard: per-run results (feature 3)

## Ground-truth check
CLAUDE.md / declaration sections leaned on for this spec, and their currency
(confirmed with the owner this session):
- **Run/test/deps & Platform** — Next.js (React + Tailwind) on Fly.io; `pnpm`;
  Vitest via `pnpm test`. Current. This feature **introduces** the Next.js surface
  (the app has been headless through feature 2): it adds `next`, `react`,
  `react-dom`, Tailwind, and shadcn/ui, plus the `app/` directory.
- **Frozen engine contract (feature 2)** — `src/types.ts` (`RunResult`, `RunEntry`,
  `RunScore`, `Classify`, `Prediction`) and `src/run.ts`
  (`runClassificationCycle`), read directly this session. The dashboard **consumes**
  these shapes unchanged. The only engine change is an **additive** optional
  observation hook on `RunOptions` (see Decisions) — it adds an observation point,
  changes no existing behavior, and does not touch the frozen `RunResult` /
  `Classify` / `Prediction` shapes.
- **Real classifier wiring (feature 2)** — `src/anthropic.ts`
  (`createRunStructured`) and `src/classify.ts` (`createAnthropicClassifier`) exist
  but have never been wired to a live client/key. This feature does that wiring,
  **strictly inside the server route module**. Feature 2's build-deviations record
  is explicit: `src/anthropic.ts` must stay out of the test import graph.
- **Curated subset (feature 1)** — in-repo ground truth `docs/apparel-subset.csv`,
  read by the server route via `loadSubset`. Its corpus contract (≥ 2 subcategories,
  ≥ 2 types/subcategory) is what makes a run with all three corruption tags
  meaningful; this feature only chooses a run size that fits it.
- **AI integration / Security (constitution → OWASP Top 10, OWASP Top 10 for LLMs;
  user globals)** — `ANTHROPIC_API_KEY` read server-side only, never shipped to the
  browser, never required by the automated suite. Current.
- No external precedent repos listed in CLAUDE.md; none consulted.

**Standards-creep check.** This feature first engages WCAG (a UI) and the HTTP-surface
OWASP items (a route). The owner decided (this session) to apply **core WCAG 2.1 AA**
now — semantic results table, keyboard-operable Run control with a visible focus
state, AA contrast on the dark theme, and an `aria-live` status region for the
streaming updates — verified by markup review, **not** a full automated audit; a full
AA sweep is deferred to the narrative pass (#7). HIG does not apply (web, not an Apple
platform). Rate limiting and the deploy/CI surface are explicitly **#6**, not here.

## Decisions (settled with owner)
| Decision | Value |
|----------|-------|
| Run controls | A single **Run** button. No user-facing N or seed inputs. |
| Run size N | A fixed constant in `[3, subset size]` (≥ 3 so every corruption tag appears; chosen modest, ~12–15, to bound latency and cost). |
| Seed | A fresh random integer per run, chosen server-side — runs are not reproducible across clicks by design, but each individual run is internally seeded so the engine stays deterministic within the request. |
| Latency UX | **Progressive streaming.** Each record's result is pushed to the page as its `classify` resolves; a live headline accuracy updates as entries arrive; a terminal event carries the authoritative run-level score. SSE is the chosen transport; **spinner-until-done is the documented fallback** if SSE fights Next route handlers or Fly buffering — the fallback keeps the same data and the same authoritative final score, only the incremental delivery is lost. |
| Streaming mechanism | An **additive** optional `onEntry?: (entry: RunEntry) => void` hook on `RunOptions`, invoked once per record in run order, immediately after that record's entry is built, before the cycle's promise resolves. The route passes a callback that emits a stream event per entry. The orchestration loop (and its leak prevention) is **not** duplicated. |
| Failure policy | **Fail-fast**, inherited from feature 2: a record-level classification error rejects the whole run. The stream emits a terminal **error** event and ends; entries already streamed remain visible, but **no** run-level score is emitted or claimed. The page shows an error state + retry. |
| Authoritative score | The final score the page displays (headline accuracy + near/far/blank breakdown) is the engine's `RunScore` from the terminal event — not a client re-computation. The client's *live* accuracy is an incremental tally shown during streaming; on completion it must equal the authoritative figure. |
| Key handling | `ANTHROPIC_API_KEY` is read inside the server route only; the SDK client and `src/anthropic.ts` are imported only there. Never in a client component, never in the test import graph. |

---

## Behavioral requirements

### Story 1 — Trigger a run and watch it resolve
*As a non-technical peer opening a forwarded link, I want to press one button and
watch the classifier correct dirty labels in real time, so I understand what the
demo does within a minute.*

Acceptance criteria:
- The page presents a single **Run** control. Activating it starts exactly one run
  against the server route; while a run is in flight the control is busy/disabled so
  a second concurrent run cannot be started from the same view.
- As the run proceeds, per-record results appear **incrementally** (one row per
  record, in run order) rather than all at once at the end.
- Each row shows: the record's original (true) `articleType`, the corrupted value it
  was shown (or a clear "blank" indicator for a blanked record), the predicted
  `articleType`, a correct/incorrect mark (predicted exactly equals true), the
  confidence level, and the rationale.
- A headline accuracy figure is visible and updates as rows arrive (live tally).
- When the run completes, the headline accuracy and a near/far/blank breakdown are
  shown from the run's authoritative `RunScore`, and the **Run** control returns to
  an idle, re-runnable state.

### Story 2 — Honest, server-authoritative scoring
*As the owner staking credibility on the accuracy number, I need the headline figure
and the breakdown to be the engine's own score, not a number the browser made up.*

Acceptance criteria:
- The final headline accuracy and the near/far/blank breakdown rendered on
  completion come from the engine's `RunScore` (`total`, `accuracy`, `breakdown`),
  delivered in the run's terminal event.
- The live accuracy shown during streaming is an incremental count of
  correct-so-far / seen-so-far; after the last record it **equals** the
  authoritative `RunScore.accuracy` for that run.
- A per-tag breakdown cell with zero records in that tag renders as
  not-applicable (e.g. "—"), never `NaN` (the engine already yields `null`).

### Story 3 — Streaming protocol over one run
*As the engineer wiring the page to the engine, I need a well-defined stream of
events for one run so the page can render incrementally and know when the run is
done or has failed.*

Acceptance criteria (the run-stream seam, given an injected deterministic
`classify`, a loaded subset, an N, and a seed):
- It produces, in order: one **entry** event per successfully-classified record
  (carrying that record's `RunEntry`), followed by exactly one **score** event
  (carrying the run's `RunScore`) on success.
- The entry events arrive in run order and there is exactly one per record up to N
  on a fully-successful run (N entry events, then one score event).
- The data each entry event carries is the frozen `RunEntry` (the dashboard does not
  invent a new per-record shape); the score event carries the frozen `RunScore`.
- The stream is consumed without buffering the whole run first: entry events are
  observable before the score event exists (this is what makes the UI progressive).

### Story 4 — Fail-fast surfaces visibly, claims nothing false
*As the owner, when a classification fails mid-run I need the UI to say so plainly and
to never report an accuracy for a run that didn't finish.*

Acceptance criteria:
- If `classify` rejects on the m-th record (m records, 0 ≤ m < N, were classified
  successfully before it), the run-stream seam emits exactly those **m** entry events,
  then exactly one terminal **error** event, and **no** score event.
- The page, on the error event, shows a visible error state and a retry affordance;
  it does **not** display a final accuracy or breakdown for the failed run.
- Any entry rows already streamed remain visible (they are real results); the error
  state makes clear the run did not complete.

### Story 5 — The key stays on the server
*As the operator, I need the LLM credential to live only on the server so a public
link can never leak it and the test suite never needs it.*

Acceptance criteria:
- `ANTHROPIC_API_KEY` is read only inside the server route; the Anthropic SDK client
  and `src/anthropic.ts` are imported only from server-side code.
- No client component, and no file under any `tests/` directory, imports
  `src/anthropic.ts` or constructs the SDK client; the automated suite runs with no
  SDK runtime dependency, no network, and no API key.
- A request that arrives with no configured key fails closed with a clear server
  error (a terminal error event / non-2xx), never a silent hang and never a
  client-visible key.

### Story 6 — The streaming engine hook is additive
*As the maintainer of the frozen engine, I need the dashboard's streaming to ride on
top of feature 2 without changing what a run computes or returns.*

Acceptance criteria:
- `runClassificationCycle` accepts an optional per-entry observation hook. When
  provided, it is called once per record, in run order, each time with that record's
  `RunEntry`, before the returned `RunResult` resolves.
- For the same subset, N, seed, and deterministic `classify`, the `RunResult`
  returned is **identical** whether or not the hook is supplied, and the sequence of
  `RunEntry`s passed to the hook equals `RunResult.entries` in order.
- The hook does not alter fail-fast: if `classify` rejects, the cycle still rejects,
  the hook has been called only for the records that were successfully classified
  before the failure, and no `RunResult` is produced.

### Story 7 — Core accessibility for the dashboard
*As a peer using a keyboard or a screen reader, I need the demo to be operable and
legible.*

Acceptance criteria (verified by markup review, not an automated audit):
- The results are a semantic table (header cells associated with their columns).
- The **Run** control is keyboard-operable with a visible focus indicator.
- Text and the correct/incorrect marks meet WCAG 2.1 AA contrast on the dark theme;
  the correct/incorrect signal is not conveyed by color alone (a glyph/text too).
- Streaming progress and completion/failure are announced via an `aria-live` status
  region so a screen-reader user learns the run advanced without polling the table.

### Edge cases & failure modes
- **Fixed N within corpus bounds** — the chosen run size N must satisfy
  `3 ≤ N ≤ subset size` against the real `docs/apparel-subset.csv`, so a run never
  throws `RangeError` from the sampler and never produces an empty corruption-tag
  bucket. (Guarded by a config test on the real file.)
- **Zero-count tag in a small run** — although N ≥ 3 makes all three tags reachable,
  the breakdown rendering must still treat a `null` per-tag accuracy as "—".
- **Classifier rejects mid-run** — Story 4: m entries then one error event, no score.
- **Missing/blank `ANTHROPIC_API_KEY`** — Story 5: fail closed with a clear error.
- **Client disconnect / double-click Run** — a second run cannot be started while one
  is in flight from the same view (Story 1); a navigated-away client simply abandons
  the stream (no persistence, nothing to clean up — #4 territory).
- **Blanked record display** — a `blank`-tagged record's corrupted value is the empty
  string; the row must render a clear "blank" indicator, not an empty cell that looks
  like a rendering bug.

### Out of scope
See feature `declaration.md`. Notably: no persistence / cumulative tally (#4), no
single-record panel (#5), no rate limiting / Fly deploy / CI workflow (#6), no
narrative copy (#7), no normalization or "defensibly different" leniency, and **no
change** to feature 2's frozen shapes or its corruption / scoring / leak-prevention
logic.

---

## Design

### Components & seams
Seams are named at the level a test must observe behavior. `@frozen` marks a real
contract `/build` must satisfy as written; `@scaffolding` marks a surface named ahead
of `/build` that may be re-sited as long as the asserted behavior holds (logged in
`build-deviations.md`). The split below deliberately mirrors feature 2's proven
pattern: **pure, deterministic, SDK-free seams are in the automated bar; the thin
shells that touch the SDK, the key, the DOM, and the network are validated
manually** — exactly as `src/anthropic.ts` was.

- **Additive engine hook** *(`@frozen` behavior; the `onEntry` name is the named
  surface)* — `runClassificationCycle` gains an optional `onEntry?: (entry:
  RunEntry) => void` on its options. Behavioral properties per Story 6: called once
  per record in order before resolve; result identical with/without it; called only
  for successfully-classified records on a fail-fast run. This is the **only** change
  to feature 2 code, and it is additive — no existing behavior or frozen shape
  changes. The leak-prevention loop in `run.ts` is reused, not duplicated.

- **Run-event stream** *(`@scaffolding` surface, `@frozen` event semantics)* — a pure
  module that, given `{ subset, n, seed, classify }`, yields a sequence of typed
  run-stream events: a `RunStreamEvent` of kind `entry` (carrying a `RunEntry`) per
  record, then one of kind `score` (carrying the `RunScore`) on success, or one of
  kind `error` (carrying a message) if `classify` rejects — with **no** `score` event
  in the error case. Substance (re-sitable): `runEventStream({ subset, n, seed,
  classify }): AsyncIterable<RunStreamEvent>`. It is built **on top of**
  `runClassificationCycle` using the `onEntry` hook to surface entries as they
  resolve and a `try/catch` to convert a rejection into a terminal `error` event; it
  imports **nothing** from the SDK or `next`, so it is fully testable headlessly with
  a stub `classify`. The events carry the frozen `RunEntry` / `RunScore` shapes — the
  dashboard invents no new per-record or per-run data shape.

- **SSE encoder** *(`@scaffolding`)* — a tiny pure function mapping a
  `RunStreamEvent` to the on-wire SSE text frame (event name + JSON `data` line). Kept
  separate from the route so the wire framing is unit-observable without spinning a
  server. Behavioral property: each event round-trips — encoding an `entry`/`score`/
  `error` event and parsing the `data` payload back yields the original `RunEntry` /
  `RunScore` / message. The exact event-name strings are an internal wire detail
  (`@scaffolding`); the *data carried* is the frozen shape.

- **Server route** *(`@scaffolding` shell; manually validated, NOT in the test import
  graph)* — the Next.js route handler (substance: `app/api/run/route.ts`). It is the
  **only** module that: reads `ANTHROPIC_API_KEY`, constructs the Anthropic SDK
  client, builds the live `classify` via `createAnthropicClassifier(createRunStructured(client))`,
  loads the subset via `loadSubset(docs/apparel-subset.csv)`, picks the fixed N and a
  random seed, drives `runEventStream`, and pipes SSE frames to the response with
  `text/event-stream` headers. On a missing key it fails closed (Story 5). Because it
  imports `src/anthropic.ts` and the SDK, **no test imports it** — its behavior is
  validated by running the app (`pnpm dev`), exactly as feature 2 validated
  `anthropic.ts` manually. The transport verb (EventSource `GET` vs. a `fetch`+
  `ReadableStream` `POST`) is left to `/build`; only the streaming behavior is fixed.

- **Run config** *(`@frozen` value, `@scaffolding` name)* — the fixed run size N
  lives in a small SDK-free module so the config test can import it without dragging
  in the route. Behavioral property: `3 ≤ N ≤ subset size` on the real subset.

- **Dashboard view reducer** *(`@scaffolding` surface, `@frozen` behavior)* — a pure
  reducer holding the page's run state, factored out of the React component so the
  streaming/accuracy/error logic is testable without a DOM or a live `EventSource`.
  Substance (re-sitable): `runViewReducer(state, event)` over the same
  `RunStreamEvent` kinds plus a `start` action. Behavioral properties: `start` →
  running, rows cleared, error cleared; `entry` → appends the row and increments the
  live correct/seen tally; `score` → marks done and stores the authoritative
  `RunScore`; `error` → sets the error state, keeps already-streamed rows, leaves no
  final score. Invariant tested: after N `entry`s the reducer's live accuracy equals
  the `score` event's `RunScore.accuracy`.

- **Dashboard page & table** *(`@scaffolding` shell; manually validated)* — the React
  client component(s): the **Run** button, the results table, the headline + live
  accuracy, the breakdown, the `aria-live` status region, and the error/retry state.
  It opens the stream, dispatches events into `runViewReducer`, and renders. The DOM,
  the `EventSource`/stream wiring, and the WCAG markup are validated by running the
  app and by markup review (Story 7) — not in the headless bar, which would otherwise
  require a jsdom + testing-library stack disproportionate to a one-page demo.

### Manual validation (route + page — outside the headless bar)
The server route and the React page/DOM are validated by running the app (`pnpm dev`),
the same way feature 2 validated `src/anthropic.ts`. `/build` must walk this checklist
and record the outcome in `build-deviations.md`; each item maps to an acceptance
criterion that has no executable test by design:
- **Happy path** (S1/S2) — a real run streams rows in one at a time, the live headline
  accuracy ticks, and on completion the headline + near/far/blank breakdown match the
  terminal score; the Run control returns to idle and re-runs.
- **Missing/blank `ANTHROPIC_API_KEY`** (S5, edge case) — with no key configured, the
  request **fails closed**: a terminal error event / non-2xx and a visible error
  state, never a silent hang, never a key value reaching the browser (verify via
  devtools network + page source).
- **Mid-run failure** (S4) — when a classification errors, already-streamed rows stay,
  an error state + retry appears, and **no** final accuracy/breakdown is shown.
- **Blank-record display** (edge case) — a `blank`-tagged row shows a clear "blank"
  indicator, not an empty cell.
- **Core WCAG** (S7) — keyboard-only operation of Run with a visible focus ring; the
  correct/incorrect signal carries a glyph/text (not color alone); an `aria-live`
  region announces run progress and completion/failure; AA contrast on the dark theme.

### Seam properties (what must hold, not how)
- **Progressive delivery** — entries are observable before the run-level score
  exists. The run-event stream yields each `entry` as its `classify` resolves; it does
  not collect all entries and emit them at the end. (Asserted by consuming the stream
  and seeing entry events before any score event.)
- **Authoritative score** — the displayed final accuracy/breakdown is the engine's
  `RunScore`; the client live tally is incremental and must converge to it (reducer
  invariant). The client never *replaces* the engine's number with its own.
- **Fail-fast honesty** — a rejecting `classify` yields m entries + one error event +
  no score; the reducer never exposes a final accuracy for that run.
- **Leak prevention is inherited, not re-implemented** — the dashboard runs through
  `runClassificationCycle`, so the `ClassificationInput` construction (no true type,
  no `subCategory`) is feature 2's and is not duplicated in this feature.
- **Key isolation** — the SDK/key surface is confined to the route module and never
  enters the test import graph (a structural guarantee, asserted by an import-graph
  test over `tests/` plus the headless seams).

### Pattern reuse
- **Engine** — reuses feature 2's `runClassificationCycle`, `loadSubset`, and the
  `createAnthropicClassifier` / `createRunStructured` adapter pair wholesale. The only
  new engine code is the additive `onEntry` hook.
- **SDK-free test seam pattern** — reuses feature 2's split (`classify.ts` testable /
  `anthropic.ts` manually validated, out of `tests/`). The route here is the new
  member of the "manually validated, never imported by tests" set.
- **Test runner** — reuses the established Vitest/TS wiring (constitution
  `## Testing`); new tests resolve `docs/apparel-subset.csv` from the test file's own
  location via `fileURLToPath(import.meta.url)`, never an absolute path. No new runner.
- **Frozen shapes** — reuses `RunEntry` / `RunScore` / `RunResult` from `src/types.ts`
  as the stream and reducer payloads; no new data contract is introduced.

### Standards
- **OWASP Top 10 / Top 10 for LLMs** — key server-side only and out of tests (Story
  5); the run rides the engine's leak prevention (no ground truth in the prompt);
  output is constrained to the closed vocabulary by the existing adapter and scored
  strictly. No new untrusted-input surface beyond the Run trigger (no user free-text
  in this feature — that is #5).
- **WCAG 2.1 AA (core)** — Story 7: semantic table, keyboard + visible focus, AA
  contrast, non-color-only correctness signal, `aria-live` for streaming. Full audit
  deferred to #7 (owner decision).
- **Quality gate (constitution)** — Vitest does not type-check the Next build, so the
  production build (`pnpm build` / `tsc`) must pass as part of the bar. Wiring this
  build step into a CI workflow lands with the deploy work (#6); for this feature the
  build must succeed locally and `.env.example` must list `ANTHROPIC_API_KEY` (already
  present from feature 2).

---

## Coverage

| Requirement / seam | Test(s) | Tag |
|--------------------|---------|-----|
| S6: `onEntry` called once per record, in order, before resolve | `engine-hook.test.ts` → ordering | @frozen |
| S6: `RunResult` identical with/without hook; hook args == `entries` | `engine-hook.test.ts` → additive-no-change | @frozen |
| S6: fail-fast — hook called only for pre-failure records; cycle still rejects; no `RunResult` | `engine-hook.test.ts` → fail-fast hook | @frozen |
| S3: success → N entry events (in order) then one score event | `run-stream.test.ts` → success sequence | @frozen |
| S3: entry events carry the frozen `RunEntry`; score event carries `RunScore` | `run-stream.test.ts` → payload shapes | @frozen |
| S3: entries observable before the score event (progressive, not buffered) | `run-stream.test.ts` → progressive | @frozen |
| S4: classify rejects on m-th → m entry events, one error event, no score event | `run-stream.test.ts` → fail-fast stream | @frozen |
| S3/wire: each event round-trips through SSE encode → parse `data` | `sse-encoder.test.ts` → round-trip | @scaffolding |
| S1/S2: reducer `start`→running/cleared; `entry`→append + live tally; `score`→done + authoritative score; `error`→error + rows kept, no final score | `view-reducer.test.ts` → transitions | @frozen |
| S2: after N entries, reducer live accuracy == score event `RunScore.accuracy` | `view-reducer.test.ts` → live==authoritative | @frozen |
| S2/edge: zero-count tag accuracy renders as "—" (reducer/formatter maps `null`) | `view-reducer.test.ts` → null tag formatting | @frozen |
| S4: reducer never exposes a final accuracy after an error event | `view-reducer.test.ts` → error hides score | @frozen |
| Edge: fixed N within `[3, subset size]` on the real subset | `run-config.test.ts` → N bounds | @frozen |
| S5: no file under `tests/` imports `src/anthropic.ts` or the SDK; headless seams import neither | `key-isolation.test.ts` → import-graph guard | @frozen |
| S5: no client component under `app/` imports the SDK or the real adapter (the browser-leak surface) | `key-isolation.test.ts` → client-component guard | @frozen |
| S5: missing/blank key fails closed (route) | manual validation (no executable test by design) | — |

`@scaffolding` marks surfaces named ahead of `/build` that may be re-sited as long as
the asserted behavior holds: the `runEventStream` / `runViewReducer` / SSE-encoder
*names and call shapes*, and the SSE event-name strings. The **event semantics**
(what events in what order carry which frozen shape), the **`onEntry` additive
behavior**, the **reducer state behavior**, and the **N-bounds / key-isolation**
guarantees are `@frozen`. The **server route, the React page/table, the EventSource
wiring, and the WCAG markup are validated manually** by running the app — they are
the SDK/DOM/network shells, kept out of the headless bar by design (the same reason
`src/anthropic.ts` is not unit-tested). Only `run-config.test.ts` and
`key-isolation.test.ts` read repo files (the real subset; the `tests/`+`src` trees),
each resolved from the test file's own location.

---

## Adversarial gate

**Mode:** independent clean-context sub-agent (general-purpose), one pass. The gate
read both declarations, this spec, every test/helper file, and the inherited feature-2
engine. It confirmed the headless seams are honestly tested — the progressive-delivery
test genuinely discriminates streaming from end-buffering (it gates record 1 and proves
record 0's event surfaces while the run is still blocked), the fail-fast stream test and
the live-accuracy-converges-to-authoritative invariant hold, the `@frozen`/`@scaffolding`
tags are honestly applied, and there is no scope drift. It returned one MEDIUM and one
LOW; the owner chose to **fix both**. No HIGH and no security-*lens* finding, so no
re-gate was triggered; both fixes were verified by running the affected guard.

| # | Severity | Lens | Finding | Disposition |
|---|----------|------|---------|-------------|
| 1 | MEDIUM | Coverage / Integrity | The `key-isolation` guard scanned only `src/` and `features/`, never `app/` — the one place the SDK is *expected* (the server route) alongside the client components that are the real browser-leak hazard. A client component under `app/` importing the SDK/adapter (shipping the SDK and key path to the browser) would leave the guard green, despite Story 5's "no client component imports the SDK." | **Fixed** — `key-isolation.test.ts` now also scans `app/` (`.ts`/`.tsx`) and asserts no `"use client"` component imports `@anthropic-ai/sdk` or the real adapter; the server route may. Forward-looking (engages once `/build` creates `app/`); the existing `src/`+`features/` guard and the non-vacuous-scan check remain. Verified green. |
| 2 | LOW | Coverage | The "missing API key fails closed" criterion (S5) had no executable coverage — it lives only in the manually-validated route, with nothing ensuring a human tests the empty-key path. | **Fixed** — added a **Manual validation (route + page)** checklist to the Design, with the empty-key fail-closed path (plus the happy path, mid-run failure, blank-record display, and core-WCAG checks) as explicit items `/build` must walk and record in `build-deviations.md`. |

No findings were acknowledged, so constitution.md's `## Acknowledged risks` table gains
no row from this feature.
