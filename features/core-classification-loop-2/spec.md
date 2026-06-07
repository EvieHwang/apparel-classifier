# Spec — Core classification loop (feature 2)

## Ground-truth check
CLAUDE.md / declaration sections leaned on for this spec, and their currency:
- **Run/test/deps** — Next.js + TypeScript, `pnpm`, Vitest via `pnpm test`.
  Current. This feature is still headless (no Next.js surface yet); it adds two
  runtime deps (`@anthropic-ai/sdk`, `zod`) for the real classifier adapter only.
- **AI integration (constitution → OWASP Top 10 for LLMs; user globals)** — the
  LLM call is a server-side Anthropic call, key from `ANTHROPIC_API_KEY`. Model
  and SDK pinned against the in-repo `claude-api` reference (consulted this
  session): model `claude-opus-4-8`, SDK `@anthropic-ai/sdk`, structured output
  via `output_config.format` (`messages.parse` + a `zod` enum), adaptive
  thinking, **no** sampling params. Current.
- **Curated corpus (feature 1)** — in-repo ground truth `docs/apparel-subset.csv`
  and its rationale, read directly. The cut **guarantees** every retained
  `subCategory` holds ≥ 2 `articleType`s and the subset spans ≥ 2 subCategories —
  this feature's corruption engine depends on exactly that contract.
- No external precedent repos are listed in CLAUDE.md; none consulted.

**Standards-creep check.** No HTTP surface, no UI, no PII, no auth in this
feature → WCAG / HIG / most of OWASP Top 10 are not yet engaged (they land with
#3/#6). The engaged discipline is **OWASP Top 10 for LLMs**: the relevant item
is preventing ground-truth leakage into the prompt (LLM01-adjacent — we must not
hand the model the answer) and not trusting model output blindly (closed
vocabulary + strict scoring). No creep tension to surface to the owner.

## Decisions (settled with owner)
| Decision | Value |
|----------|-------|
| What the model sees | `productDisplayName`, `gender`, `baseColour`, `season`, `year`, `usage`, and the **corrupted-or-blank** `articleType` label. **Never** `subCategory`, **never** the true `articleType`. |
| Prediction space | **Closed vocabulary** — the model must return one of the subset's known `articleType`s. |
| Confidence | Three-level enum: `"low" | "medium" | "high"`. |
| Scoring | Strict exact-match of predicted vs original `articleType`. |
| Corruption mix | Each sampled record gets exactly **one** tag; tags balanced across `near-swap`/`far-swap`/`blank` (counts differ by ≤ 1). |
| Record error policy | **Fail fast** — if a record's classification ultimately errors, the run rejects. |
| Determinism | A small self-contained PRNG seeded by an integer (e.g. mulberry32) — **not** `Math.random`, not a runtime-dependent shuffle. |
| Model / SDK | `claude-opus-4-8`, `@anthropic-ai/sdk`, `zod` structured output, adaptive thinking, no sampling params. |

---

## Behavioral requirements

### Story 1 — One run, end to end
*As the build engineer for the dashboard, I need a single headless call that runs
sample → corrupt → classify → score and returns one run's structured results, so
the UI is a thin renderer over a proven engine.*

Acceptance criteria:
- A headless entry point (substance `runClassificationCycle`) accepts: the loaded
  subset, a run size `N`, an integer `seed`, and an injected `classify` function.
  It returns a **RunResult**.
- The **RunResult** contains, for each of the `N` records, an entry with at least:
  `id`, `trueArticleType`, `corruptionTag` (`"near-swap"|"far-swap"|"blank"`),
  `corruptedValue` (string; `""` for blank), `predictedArticleType`, `confidence`
  (`"low"|"medium"|"high"`), `rationale` (string), and `correct` (boolean =
  predicted exactly equals true).
- The **RunResult** contains run-level totals: total records, overall accuracy
  (correct / total), and a per-corruption-type breakdown giving, for each of
  `near-swap`/`far-swap`/`blank`, its count and its accuracy.
- Given the same subset, `N`, `seed`, and a **deterministic** injected `classify`,
  two runs return identical RunResults (same records, same order, same tags,
  same corrupted values, same scores).

### Story 2 — The model is never handed the answer
*As the project owner staking credibility on an honest accuracy number, I need
proof the classifier can't see the ground truth, so the reported accuracy is real
recovery, not a leak.*

Acceptance criteria:
- The input object the engine passes to `classify` for a record **does not
  contain** the record's true `articleType` nor its `subCategory`, under any
  corruption tag.
- For `near-swap` and `far-swap`, the `articleType` label given to the model
  (the corrupted value) is **not equal** to the true `articleType`.
- For `blank`, the `articleType` label given to the model is the empty string.
- The classifier is given the run's **closed vocabulary** (the subset's distinct
  `articleType`s) so its prediction can be constrained to it.

### Story 3 — Corruption is meaningful and well-typed
*As the experiment designer, I need each corruption tag to mean exactly one thing
so the near/far/blank breakdown is interpretable.*

Acceptance criteria (the corruption seam, given a record + tag + the subset's
`subCategory → articleType[]` grouping + seeded PRNG):
- `near-swap` → a valid `articleType` that is **different** from the true one and
  belongs to the **same** `subCategory` as the true type.
- `far-swap` → a valid `articleType` drawn from the vocabulary types that do
  **not** appear in the true record's `subCategory` (i.e. a type whose home is a
  different `subCategory`). Defining far-swap as this **set difference**
  guarantees the value both belongs to a different `subCategory` **and** is ≠ the
  true `articleType`, even when a label is shared across subcategories — `Shorts`
  appears under both `Bottomwear` and `Loungewear and Nightwear` in the curated
  subset, so a far-swap for a `Bottomwear/Shorts` record must never yield
  `Shorts` (a naive "pick from another subCategory's type list" would, leaking
  the true label). This is the leak-prevention guarantee of Story 2 made concrete
  for the one type that spans two subcategories.
- `blank` → the empty string.
- Corruption is deterministic given the seed.
- Corruption only *selects an existing label or blanks*; it never invents a string
  outside the vocabulary (except the blank).

### Story 4 — Scoring and the breakdown
*As the dashboard, I need overall and per-corruption-type accuracy computed
correctly so the headline number and the breakdown are trustworthy.*

Acceptance criteria (the scoring seam, given per-record `(true, predicted, tag)`):
- Overall accuracy = (count where predicted exactly equals true) / total.
- For each tag, accuracy = correct-within-tag / count-within-tag; the per-tag
  counts sum to the total.
- An empty or out-of-vocabulary prediction scores as **incorrect** (no
  special-casing, no crash) — strict exact match handles it.
- All-correct → overall accuracy `1`; all-wrong → `0`.

### Story 5 — The real classifier adapter
*As the engineer wiring the live demo, I need a thin adapter that turns a record's
allowed fields into an Anthropic structured-output call and returns a typed
prediction, without leaking the answer or fabricating on failure.*

Acceptance criteria:
- An adapter produces a `classify` seam backed by Anthropic: model
  `claude-opus-4-8`, structured output constraining `articleType` to the supplied
  closed vocabulary, `confidence` to the three-level enum, plus a free-text
  `rationale`.
- The adapter maps a successful structured response to a Prediction
  (`{ articleType, confidence, rationale }`).
- On a failed/empty parse (no structured output), the adapter **throws** rather
  than returning a fabricated or empty Prediction. (Fail-fast feeds Story 1's
  run-level fail-fast.)
- The adapter depends on the Anthropic client by **injection** and imports the
  SDK only as `import type`, so the automated test suite runs with no SDK runtime
  dependency and no network.

### Story 6 — Config surface
*As the operator who will deploy this later, I need the secret contract recorded
now so nothing drifts.*

Acceptance criteria:
- `ANTHROPIC_API_KEY` is read from the environment, server-side only; it is never
  hard-coded and never required by the automated test suite.
- A committed `.env.example` lists `ANTHROPIC_API_KEY` with no value.

### Edge cases & failure modes
- **N out of range** — `N < 1` or `N >` subset size throws (sampling is without
  replacement; a run never contains the same record twice).
- **Balanced tags with small N** — for `N` not divisible by 3 the tag counts
  differ by at most 1; for `N < 3` some tag(s) have count 0 and their breakdown
  accuracy is reported as not-applicable (e.g. `null`), never `NaN` or a divide
  -by-zero.
- **Corpus-contract violation** — if a record's `subCategory` has no sibling
  `articleType` (so no near-swap target exists), or no vocabulary type exists
  outside the true record's `subCategory` (no far-swap target — e.g. a
  single-subCategory subset), the corruption seam **throws** a clear error rather
  than silently emitting the true value or an invalid label. (The curated subset
  satisfies the contract; this guards a future bad cut.)
- **Classifier rejects** — a `classify` that rejects (after the SDK's built-in
  429/5xx retries in the real adapter) propagates: `runClassificationCycle`
  rejects; it does not swallow the error or emit a partial RunResult.
- **Out-of-vocabulary / empty prediction** — scored as incorrect (Story 4), never
  crashes the run.

### Out of scope
See feature `declaration.md`. Notably: no UI, no persistence/cumulative tally, no
single-record HTTP path, no rate limiting/deploy, no normalization, no
partial-run error recovery.

---

## Design

### Components & seams
All seams below are named at the level a test must observe behavior. Function
*substance* is given; `/build` may rename or re-site a `@scaffolding` seam as long
as the asserted behavior holds (logging any change in `build-deviations.md`).

- **Subset loader & sampler** *(`@scaffolding`)* — loads `docs/apparel-subset.csv`
  into an in-memory **Subset**: the rows (id + the allowed fields + true
  `articleType` + `subCategory`), the **vocabulary** (sorted distinct
  `articleType`s), and the **`subCategory → articleType[]` grouping**. A sampler
  draws `N` records without replacement using the seeded PRNG.
  - Substance: `loadSubset(csvPath): Subset`; `sampleRecords(subset, n, rng):
    Record[]`. The loader reuses the **first-9-commas, no-quote-processing** parse
    rule established in feature 1 (productDisplayName may carry commas / a bare
    `"`).
  - Behavioral properties: deterministic sample given the seed; without
    replacement; vocabulary = distinct true types; every `subCategory` in the
    grouping has ≥ 2 types and there are ≥ 2 subcategories (inherited corpus
    contract, asserted on the real file).

- **Corruption engine** *(`@scaffolding`)* — pure given `(record, tag, grouping,
  rng)`; returns the corrupted label per Story 3. Substance: `corrupt(record,
  tag, grouping, rng): string`. A tag-assigner produces a balanced, deterministic
  tag sequence for `N` records (substance `assignTags(n, rng): Tag[]`).

- **Classifier seam** *(`@frozen` interface)* — the boundary the engine calls and
  tests inject. Substance:
  `classify(input: ClassificationInput, vocabulary: string[]): Promise<Prediction>`
  where `ClassificationInput` carries only the allowed fields + the
  corrupted/blank `articleType` label (**no** `subCategory`, **no** true type),
  `Prediction = { articleType: string; confidence: "low"|"medium"|"high";
  rationale: string }`. This is the contract #3/#5 and the real adapter both
  implement; its shape is the seam, named deliberately.

- **Anthropic adapter** *(`@scaffolding`)* — builds a `classify` from an injected
  minimal call function `runStructured(input, vocabulary): Promise<Prediction |
  null>` (the real one wraps `client.messages.parse` with the `zod` enum over the
  vocabulary); the adapter module imports the SDK only as `import type`.
  Substance: `createAnthropicClassifier(runStructured): classify`. Behavioral
  properties per Story 5: forwards `input` + `vocabulary` to `runStructured`
  (so the closed-vocabulary constraint is not dropped), maps a non-null result to
  a Prediction, and **throws** on a `null` (failed/empty) parse. Asserting the
  exact `messages.parse` request shape is out of bounds (SDK-internal); the
  scorer is the closed-vocabulary safety net.

- **Scorer** *(`@frozen`)* — pure; computes overall + per-tag accuracy per Story
  4. Substance: `score(entries): RunScore`.

- **Orchestrator** *(`@scaffolding` name, `@frozen` result shape)* —
  `runClassificationCycle({ subset, n, seed, classify }): Promise<RunResult>`
  wires sampler → tag-assigner → corruption → classifier → scorer with one seeded
  PRNG. Behavioral properties: deterministic given a deterministic `classify`;
  builds each `ClassificationInput` excluding the leak fields; fail-fast on a
  rejecting `classify`; RunResult carries the Story-1 per-record + run-level shape.

### Seam properties (what must hold, not how)
- **Determinism** lives in one explicit PRNG threaded through sampling, tag
  assignment, and corruption. Same seed ⇒ same draw, tags, and corrupted values
  across runtimes — so do not use `Math.random` or a runtime-dependent shuffle.
- **Leak prevention** is enforced in the orchestrator where it constructs
  `ClassificationInput`; the adapter only serializes what it is given. The test
  bar observes the input objects handed to a spy `classify`.
- **Closed vocabulary** is enforced at the adapter via the structured-output enum;
  the scorer is the safety net (any out-of-vocab/empty prediction scores wrong).

### Pattern reuse
- **CSV parse rule** — reuses the first-9-commas / no-quote-processing rule from
  feature 1 (`src/curate.ts`, `tests/csv.ts`). Genuine reuse of the parse seam,
  not the curation logic.
- **Test runner** — reuses the established Vitest/TS wiring (constitution
  `## Testing`); tests resolve `docs/apparel-subset.csv` from the test file's own
  location via `fileURLToPath(import.meta.url)`, never an absolute path. No new
  runner, no new wiring.

### Standards
- **OWASP Top 10 for LLMs** — addressed by leak prevention (Story 2) and
  not-trusting-output (closed vocabulary + strict scoring). The `ANTHROPIC_API_KEY`
  stays server-side and out of tests (Story 6).
- WCAG / HIG / HTTP-surface OWASP items are not engaged until #3/#6.

---

## Coverage

| Requirement / seam | Test(s) | Tag |
|--------------------|---------|-----|
| S1: run end-to-end returns per-record + run-level shape | `run.test.ts` → result shape | @frozen |
| S1: deterministic given seed + deterministic classify | `run.test.ts` → determinism | @frozen |
| S1: overall accuracy matches injected stub outcomes | `run.test.ts` → scoring integration | @frozen |
| S2: ClassificationInput excludes true type & subCategory | `run.test.ts` → no-leak | @frozen |
| S2: corrupted label ≠ true (near/far); blank → "" | `corrupt.test.ts` → label vs truth | @scaffolding |
| S2: classifier receives the closed vocabulary | `run.test.ts` → vocabulary passed | @frozen |
| S3: near-swap = sibling type, same subCategory, ≠ true | `corrupt.test.ts` → near | @scaffolding |
| S3: far-swap = type whose home is a different subCategory, never the true type | `corrupt.test.ts` → far | @scaffolding |
| S2/S3: orchestrator never leaks the true label even when a type spans two subcategories (Shorts) | `run.test.ts` → cross-subcategory no-leak | @frozen |
| S3: blank = empty string | `corrupt.test.ts` → blank | @scaffolding |
| S3: corruption deterministic given seed | `corrupt.test.ts` → determinism | @scaffolding |
| S3 edge: subCategory with no sibling → throws | `corrupt.test.ts` → contract violation | @scaffolding |
| S1 edge: balanced tags (≤1 apart), deterministic | `corrupt.test.ts` → tag balance | @scaffolding |
| S4: overall exact-match accuracy | `score.test.ts` → overall | @frozen |
| S4: per-tag counts + accuracies; counts sum to total | `score.test.ts` → breakdown | @frozen |
| S4: empty / out-of-vocab prediction scores incorrect | `score.test.ts` → bad prediction | @frozen |
| S4 edge: tag with count 0 → null, not NaN | `score.test.ts` → empty tag | @frozen |
| S4: all-correct → 1, all-wrong → 0 | `score.test.ts` → bounds | @frozen |
| Loader: real subset → vocab, ≥2 types/subcat, ≥2 subcats | `dataset.test.ts` → corpus contract | @frozen |
| Sampler: deterministic, without replacement, N bounds | `dataset.test.ts` → sampling | @scaffolding |
| S1 edge: classifier rejection propagates (fail-fast) | `run.test.ts` → fail-fast | @frozen |
| S5: adapter maps structured response → Prediction | `classifier-adapter.test.ts` → mapping | @scaffolding |
| S5: adapter throws on failed/empty parse | `classifier-adapter.test.ts` → no-fabricate | @scaffolding |

`@scaffolding` marks surfaces named ahead of `/build`: the pure seams
(`loadSubset`/`sampleRecords`, `corrupt`/`assignTags`, the Anthropic adapter
factory) and the `runClassificationCycle` *name*. `/build` may rename or re-site
them as long as the asserted behavior holds. The **classifier seam interface**
(`classify(input, vocabulary) → Prediction`), the **RunResult shape**, and the
**scorer** are `@frozen` — they are the contract #3/#5 inherit. Tests assert
behavior on synthetic in-memory subsets where precise subCategory groupings are
needed (corruption, scoring, orchestration); only `dataset.test.ts` reads the real
`docs/apparel-subset.csv`, to confirm the inherited corpus contract.

---

## Adversarial gate

**Mode:** independent clean-context sub-agent (general-purpose), one pass, plus a
scoped clean-context re-gate of the security fix. The gate read the spec, tests,
and the inherited corpus. It returned one HIGH (security) and one LOW; the owner
chose to **fix both**.

| # | Severity | Lens | Finding | Disposition |
|---|----------|------|---------|-------------|
| 1 | HIGH | Security / Coverage | The `Shorts` articleType spans **two** subCategories (`Bottomwear` and `Loungewear and Nightwear`) in the curated subset, so the original far-swap rule ("a type from a different subCategory") could hand a `Bottomwear/Shorts` record the Loungewear `Shorts` — i.e. its own true label: a ground-truth **leak** plus a polluted far-swap bucket. The disjoint-subcategory test fixtures hid it. | **Fixed** — far-swap redefined as the set difference `vocabulary \ types(trueSubCategory)`, which excludes the true type unconditionally (the true type is always in its own subCategory's list), for any label spanning any number of subcategories. Added a seam-level test (`corrupt.test.ts` → cross-subcategory, 50 seeds on the exact `Bottomwear/Shorts` record) and a `@frozen` end-to-end test (`run.test.ts` → cross-subcategory no-leak, collision subset, full-N × 30 seeds). |
| 2 | LOW | Coverage / tests | `assignTags` balance was never tested for `N < 3`, the regime the spec's edge case calls out. | **Fixed** — `corrupt.test.ts` → tag balance now also exercises `N ∈ {1, 2}`. |

**Re-gate (HIGH security fix):** a second clean-context sub-agent, scoped only to
finding #1's fix, verified that the set-difference definition **closes** the leak
(true type always excluded; generalizes to a type spanning 3+ subcategories; no
interaction with near-swap), that the two new tests genuinely discriminate
(fail against the old "pick from another subCategory's list" implementation, pass
against the set-difference one), and that the fix introduces no new gap — the
throw-on-no-target edge is now the precise "empty set difference" condition, and
the safe direction (throw rather than risk emitting a possibly-true label) is the
one the spec prefers. Verdict: **closes the failure mode.**
