# Feature Declaration — Dashboard: per-run results (feature 3)

## What
The first UI and server surface for the apparel classifier. A single web page with
one **Run** button triggers a fresh classification run (a fixed run size N, a random
seed under the hood) and renders it live: a per-record results table (original →
corrupted → predicted → ✓/✗ → confidence → rationale), a headline accuracy figure,
and a near/far/blank breakdown. A server route holds the Anthropic key, instantiates
the real classifier, drives feature 2's existing `runClassificationCycle`, and
streams each record's result to the page as it resolves. Entries appear one at a
time; when the run completes a final authoritative score lands; if any record's
classification errors, the run fails fast with an error state and a retry.

## Why
Feature 2 proved the engine headless behind a stub. This is where it becomes a thing
a non-technical peer can open from a forwarded link and understand in a minute — and
where the real Anthropic call runs for the first time. Progressive streaming isn't
decoration: watching dirty labels get corrected one row at a time, with the accuracy
climbing, *is* the demonstration. The feature consumes feature 2's frozen `RunResult`
shape unchanged and adds only an additive observation hook to the engine so the run
can be streamed without duplicating the leak-prevention loop.

## Success
- A page at the app root with a single **Run** button starts a run; there are no
  other run controls (N and seed are fixed / random under the hood).
- Each record's result appears as it resolves (progressive), with a live headline
  accuracy that, on completion, equals the server's authoritative accuracy.
- On completion the by-corruption-type (near/far/blank) breakdown is rendered from
  the run's authoritative score.
- A record-level classification failure ends the run with a visible error state and
  a retry; **no** final accuracy is claimed for a failed run (fail-fast — feature 2's
  contract, no partial `RunResult`).
- The Anthropic key is read server-side only and never enters the browser or the
  automated test import graph.
- Consumes feature 2's `RunResult` / `RunEntry` / `RunScore` shapes unchanged; the
  only engine change is an **additive** per-entry observation hook that alters no
  existing behavior and none of the frozen shapes.
- Core WCAG 2.1 AA: a semantic results table, a keyboard-operable Run control with a
  visible focus state, AA contrast on the dark theme, and streaming updates announced
  via an `aria-live` status region.

## Shape touched
Dashboard UI (the page, the results table, the headline + breakdown), Scoring & tally
(rendered, not changed), Classification service (the real Anthropic adapter goes live
behind the server route). Additive touch to the core loop (the streaming observation
hook on `RunOptions`).

## Out of scope
- No persistence / cumulative cross-run tally (#4) — results are per-run and
  ephemeral; a refresh loses them.
- No single-record "type your own product name" panel (#5).
- No per-IP rate limiting and no Fly deploy / CI deploy workflow (#6) — runs locally
  against a dev key.
- No narrative / self-explanation copy pass (#7) — only enough framing to read the
  table.
- No vocabulary/format normalization and no "defensibly different" leniency — scoring
  stays strict exact-match (project-level deferral).
- No change to feature 2's frozen `RunResult` / `Classify` / `Prediction` shapes or
  its corruption / scoring / leak-prevention logic.
