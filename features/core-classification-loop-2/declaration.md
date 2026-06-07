# Feature Declaration — Core classification loop (feature 2)

## What
The headless, fully testable engine that runs one classification cycle over the
curated subset: **sample** N records → **corrupt** each record's `articleType`
(tagged `near-swap` / `far-swap` / `blank`) → **classify** via an LLM that is
shown the record as a vendor would send it (with the corrupted-or-blank label,
minus `subCategory`) and must recover the correct `articleType` from the known
list → **score** the prediction against the original label as ground truth.
Returns one run's structured results. No UI, no persistence, no HTTP surface.

## Why
This is the keystone of the project: everything downstream (the dashboard, the
cumulative tally, the live single-record panel) is a caller of this engine, so
its **return shape is the de-facto contract** for those features. Proving the
loop headless and deterministic — with the LLM behind a mockable seam — lets the
accuracy claim be tested before any UI exists, and models the project's core
thesis: that an LLM already encodes apparel taxonomy well enough to *correct*
dirty vendor labels, and that the correction can be **measured** honestly
(per-corruption-type, exact-match against ground truth).

## Success
- A seeded, headless entry point (substance `runClassificationCycle`) takes the
  curated subset, a run size N, a seed, and an injected classifier, and returns
  one run's results: per-record `(id, true articleType, corruption tag,
  corrupted value, predicted articleType, confidence, rationale, correct?)` plus
  run-level overall accuracy and a near/far/blank breakdown.
- Sampling and corruption are deterministic given the seed (self-contained PRNG,
  not `Math.random`), so runs are reproducible in tests.
- The classifier is an injected seam; the whole automated suite is green in CI
  with **no API calls and no SDK runtime dependency**. The real Anthropic-backed
  classifier is a thin adapter validated manually, not in the unit bar.
- The classifier is **never handed** the true `articleType` or the `subCategory`
  (leak prevention) — only the corrupted/blank label and the realistic fields.
- Predictions are constrained to the known `articleType` vocabulary (closed set);
  scoring is strict exact-match against the original label.

## Shape touched
Dataset & sampling (the per-run draw), Corruption engine, Classification service,
Scoring & tally. (Dashboard UI, persistence, rate limiter, single-record panel
are **not** touched — later roadmap items.)

## Out of scope
- No UI / dashboard (#3), no persistence or cumulative tally (#4), no live
  single-record panel (#5), no rate limiting or Fly deploy (#6), no narrative
  copy (#7).
- No vocabulary/format **normalization** (a separate problem the project defers)
  and no "defensibly different" leniency — scoring is strict exact-match, and
  that limitation is acknowledged, not solved.
- No per-record partial-failure recovery: if a record's classification
  ultimately errors, the run fails fast (v1 simplicity).
- The curated-subset cut itself is owned by feature 1; this feature only samples
  from it.
