# Declaration

## What
A live web demo that takes real, labeled apparel records, deliberately corrupts the `articleType` field, then uses an LLM to recover the correct value and reports accuracy against the original labels as ground truth. A single-record panel lets any visitor classify their own product name in real time.

## Why
Vendor product data arrives with classification errors that compound downstream — wrong `articleType` labels corrupt planning curves, distort assortment reporting, and drive bad inventory decisions. The standard fix is a slow, expensive master-data platform. This shows that an LLM already encodes apparel taxonomy well enough for the team that needs clean data to build the instrument that produces it — and, just as important, it models how to *measure and design for* accuracy, transparency, and trust when the output is probabilistic and the determination is automated, not merely suggested.

## For whom
Primarily a credibility artifact: a non-technical product peer or hiring manager who receives a forwarded link should understand what they're looking at, and why it matters, within a minute. Secondarily, it models the pattern for a retail/merchandising data team that lives with dirty vendor classification.

## Out of scope
Not a master-data platform or a production pipeline. Uses metadata only, not the product images. No human-in-the-loop review queue — it makes the determination. v1 does **not** solve vocabulary/format normalization (named explicitly as a *separate* problem, not solved here), does not run across the full 44k corpus (a curated subset only), and does not yet separate "wrong" from "defensibly different" labels (noted as a future refinement).

## Platform
Web — Next.js on Fly.io.

## Shape (revisable)
- **Dataset & sampling** — the curated apparel-records subset committed under `docs/` (narrowed from the 44k), plus the logic that draws N random records per run.
- **Corruption engine** — given a record's true `articleType`, produces a corrupted value tagged `near-swap` / `far-swap` / `blank`, using the `subCategory` grouping to decide near vs. far.
- **Classification service** — the server-side Anthropic call: given a record's attributes (including `productDisplayName`, with `articleType` corrupted or blank), returns predicted `articleType` + confidence + rationale.
- **Scoring & tally** — compares prediction to ground truth; computes per-run accuracy and the by-corruption-type breakdown, and maintains the cumulative cross-run tally (needs lightweight persistence so the cumulative number survives across visitors).
- **Rate limiter** — per-IP cap (≈10/hour) guarding the LLM endpoints against cost abuse.
- **Dashboard UI** — the per-run results table (original → corrupted → predicted → ✓/✗ → confidence → rationale), the headline accuracy + cumulative tally + by-corruption-type breakdown, and the narrative copy that makes a forwarded link self-explaining.
- **Single-record panel** — the live "type a product name" input that runs the same classification path and shows the result inline.

## Roadmap (revisable)
1. **Data prep & subset curation** — narrow the 44k to a coherent subset (likely one masterCategory or a chosen band of `articleType`s), commit it under `docs/` with a written rationale for the cut. Touches: Dataset & sampling.
2. **Core classification loop** — the headless, testable engine: sample → corrupt (tagged near/far/blank) → classify via Anthropic → score against ground truth, returning one run's results. Built and proven before any UI. Touches: Dataset & sampling, Corruption engine, Classification service, Scoring & tally.
3. **Dashboard — per-run results** — UI to trigger a run and render the results table (original → corrupted → predicted → ✓/✗ → confidence → rationale) with headline accuracy and the by-corruption-type breakdown. Touches: Dashboard UI, Scoring & tally.
4. **Cumulative tally + persistence** — store results across runs/visitors so the cumulative accuracy number stabilizes alongside the jumpy per-run figure. Touches: Scoring & tally, Dashboard UI.
5. **Single-record live panel** — the "type your own product name" input reusing the classification path, result shown inline. Touches: Single-record panel, Classification service.
6. **Go public safely** — per-IP rate limiting on the LLM endpoints plus Fly.io deploy (fly.toml, GitHub Actions, `ANTHROPIC_API_KEY` secret). Touches: Rate limiter, Classification service.
7. **Narrative & self-explanation pass** — the framing copy that makes a forwarded link legible to a non-technical peer, including the normalization-vs-classification teaching point and the honesty note that the product name carries the signal. Touches: Dashboard UI.
