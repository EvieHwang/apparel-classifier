# Spec — Data prep & subset curation (feature 1)

## Ground-truth check
CLAUDE.md sections leaned on for this spec:
- **Run/test/deps** — Next.js + TypeScript, `pnpm`, tests via `pnpm test`. This
  feature establishes the project's test runner (Vitest) since none existed yet.
- **Dataset & sampling shape** (declaration) — this feature owns the *curated
  corpus*, not the per-run draw.
- No precedent repos are listed in CLAUDE.md; none consulted.
- In-repo ground truth: `docs/styles.csv` (the raw 44,446-row source), read
  directly.

## Curation parameters (decided with owner)
| Name | Value | Meaning |
|------|-------|---------|
| `MASTER_CATEGORY` | `"Apparel"` | Only rows in this masterCategory are kept. |
| `MIN_ROWS_PER_TYPE` | `50` | An articleType is retained only if it has ≥ this many qualifying source rows. |
| `MIN_TYPES_PER_SUBCATEGORY` | `2` | A subCategory is retained only if ≥ this many of its articleTypes cleared the floor (guarantees a near-swap target). |
| `MAX_ROWS_PER_TYPE` | `500` | Per-articleType cap, flattening the head (Tshirts/Shirts) so no type dominates. |

These four numbers are the contract of *this* cut. They live in one place in the
implementation so the rationale and the curation step cannot drift apart.

**Expected result of applying them to the current `docs/styles.csv`** (illustrative,
not a frozen assertion — the reproducibility test pins the exact bytes instead):
~7,485 rows · 25 articleTypes · 4 subCategories (Topwear, Bottomwear, Innerwear,
Loungewear and Nightwear). Dropped subCategories: Dress, Saree, Apparel Set,
Socks — each has fewer than 2 articleTypes clearing the 50-row floor, so no
record in them could be given a near-swap.

---

## Behavioral requirements

### Story 1 — A coherent curated subset exists
*As the build engineer for the downstream loop, I need a single curated apparel
CSV so every later feature samples from a known, balanced corpus.*

Acceptance criteria:
- A file `docs/apparel-subset.csv` exists.
- Its first line is the source header, unchanged and in source order:
  `id,gender,masterCategory,subCategory,articleType,baseColour,season,year,usage,productDisplayName`.
- Every data row has `masterCategory == "Apparel"`.
- The subset spans **≥ 2** distinct subCategories.
- Every subCategory present holds **≥ 2** distinct articleTypes.
- For every articleType present, its row count is within
  `[MIN_ROWS_PER_TYPE, MAX_ROWS_PER_TYPE]` = `[50, 500]`.
- The subset is non-trivial in size (a sanity floor, guarding against an empty
  or near-empty file): **≥ 1,000** rows.

### Story 2 — The subset is a faithful filtering of the source
*As a reviewer, I need confidence the curation only filtered and capped — it did
not fabricate, relabel, or duplicate records — so the labels remain ground truth.*

Acceptance criteria:
- Every `id` in the subset exists in `docs/styles.csv`.
- For every subset row, its `articleType`, `subCategory`, and `masterCategory`
  exactly match that `id`'s values in the source (no relabeling).
- No `id` appears more than once in the subset (no duplication).
- Every subset row has non-empty `id`, `masterCategory`, `subCategory`,
  `articleType`, and `productDisplayName` (the fields downstream depends on).

### Story 3 — The cut is reproducible and in sync
*As a future maintainer, I need to regenerate the exact subset from source so the
cut is auditable and not a one-off hand edit.*

Acceptance criteria:
- A committed curation step regenerates the subset from `docs/styles.csv`.
- Running it twice produces **byte-identical** output, and the output is
  **environment-independent**: it depends only on the source file contents, not
  on RNG, wall clock, locale/collation, or non-stable key enumeration. The
  selection rule is fixed and simple — **retained rows keep their source-file
  order, and each type's cap keeps the first `MAX_ROWS_PER_TYPE` rows encountered
  in that order.** (No seeded shuffle: a PRNG is reproducible only as far as its
  implementation is stable across runtimes, which source order is not subject to.)
- The output the step produces is **byte-identical to the committed
  `docs/apparel-subset.csv`** (the artifact is in sync with the step that makes it).

### Story 4 — The cut is documented
*As a non-technical peer or hiring manager skimming the repo, I need a short
written rationale so the cut is legible without reading code.*

Acceptance criteria:
- A file `docs/apparel-subset-rationale.md` exists and is non-trivial.
- It states the masterCategory chosen, the three numeric parameters
  (`50`, `2`, `500`), and which subCategories were dropped and why (no near-swap
  sibling).

### Edge cases & failure modes
- **Last column contains commas, and the data is not RFC-4180.** 22 source rows
  have unquoted commas in `productDisplayName`; 3 of them are Apparel (all
  `Tshirts`). Parsing MUST treat `productDisplayName` as the **remainder of the
  line after the first 9 commas**, never as a naive 10-way split that would
  truncate the name or shift columns. Such rows are valid and may appear in the
  subset, with the name preserved verbatim including the embedded commas.
  - **Do not use a strict RFC-4180 CSV reader.** Two rows (ids 7491, 7497)
    contain a bare inch-mark `"` inside the value with no surrounding quotes
    (e.g. `Nike Women's EM Tempo 3.5" Pink Short`). A quote-aware reader would
    treat that `"` as an opening quote and mangle or reject the row. The
    first-9-commas rule (or a reader explicitly configured to disable quote
    processing) handles these rows correctly; a strict reader does not.
- **Sparse types / sparse subCategories.** Types below the floor are dropped;
  subCategories left with < 2 qualifying types are dropped entirely (this is the
  mechanism, not an error).
- **Malformed source row.** A source row missing any required field (`id`,
  `masterCategory`, `subCategory`, `articleType`, `productDisplayName`) is
  excluded; it must never appear in the subset. (The current source has none,
  but the step must not emit one if the source changes.)
- **A type with exactly `MIN_ROWS_PER_TYPE` rows** is kept; a type with one
  fewer is dropped (inclusive floor).
- **A type with more than `MAX_ROWS_PER_TYPE` rows** is truncated to exactly the
  cap; a type at or below the cap keeps all its rows.

### Out of scope
See feature `declaration.md`. Notably: no per-run sampling, no normalization, no
relabeling, nothing downstream of the corpus.

---

## Design

### Components
- **Curation module** — a pure, deterministic transform from the source CSV text
  to the subset CSV text. Given the source content and the four parameters, it:
  filters to `MASTER_CATEGORY`; drops rows missing required fields; counts rows
  per articleType and drops types below `MIN_ROWS_PER_TYPE`; drops subCategories
  left with fewer than `MIN_TYPES_PER_SUBCATEGORY` qualifying types; caps each
  remaining type at `MAX_ROWS_PER_TYPE` **keeping the first rows in source order**;
  emits the original header plus the retained rows unchanged, in source order.
  - **Named seam (`@scaffolding`):** a pure function — substance
    `curate(sourceCsv: string, params: CurationParams): string` — so the
    transform can be unit-tested on synthetic input independently of the file
    I/O. `/build` may site/rename this module as long as the unit test's import
    target and behavior hold (log any change in `build-deviations.md`).
  - **Behavioral properties it must hold:** output is a row-subset of input with
    columns and values untouched (filter/cap only, no mutation); identical input
    → identical output and source-order preserved (determinism); the per-type cap
    and per-type floor (inclusive at `MIN_ROWS_PER_TYPE`) both hold on the output;
    every emitted subCategory has ≥ 2 articleTypes; `productDisplayName` values
    containing commas or bare `"` are preserved verbatim.
- **Curation CLI** — a committed script, runnable as `pnpm curate`, that reads
  `docs/styles.csv`, applies the curation module, and writes
  `docs/apparel-subset.csv`. It accepts an optional output path argument so the
  artifact can be regenerated to a scratch location for verification without
  clobbering the committed file. This script produces the committed deliverable.
  - **Behavioral property:** writing to the default path and to a scratch path
    yield identical bytes; both equal the committed `docs/apparel-subset.csv`.

### Seams
- **Source → curation module:** the module consumes the raw CSV text and must
  parse it tolerant of commas in the final column (see edge cases).
- **Curation module → committed artifact:** the CLI is the only writer of
  `docs/apparel-subset.csv`; the file is never hand-edited. The reproducibility
  test guards this seam by regenerating and byte-comparing.
- **Curated corpus → downstream (roadmap #2):** consumers read
  `docs/apparel-subset.csv` and rely on the subCategory→articleType structure
  (≥ 2 types per subCategory) for near/far-swap selection. This feature's
  invariants are exactly that contract.

### Pattern reuse
None. This is the first feature; it establishes the TypeScript + Vitest
toolchain (recorded in constitution.md `## Testing`). No existing patterns are
reused.

### Standards
- No HTTP surface, no auth, no UI, no PII — OWASP/WCAG/HIG largely inapplicable
  to a static data-curation step. The relevant discipline is **reproducibility
  and provenance**, covered by Story 3. No standards-creep tension to surface.

---

## Coverage

| Requirement / seam | Test(s) | Tag |
|--------------------|---------|-----|
| S1: subset exists, header unchanged & in order | `subset-invariants.test.ts` → header | @frozen |
| S1: every row Apparel | `subset-invariants.test.ts` → masterCategory | @frozen |
| S1: ≥ 2 subCategories | `subset-invariants.test.ts` → subcategory spread | @frozen |
| S1: ≥ 2 articleTypes per subCategory | `subset-invariants.test.ts` → near-swap guarantee | @frozen |
| S1: per-type count in [50, 500] | `subset-invariants.test.ts` → floor & cap | @frozen |
| S1: ≥ 1,000 rows sanity floor | `subset-invariants.test.ts` → size floor | @frozen |
| S2: every id exists in source, fields match | `subset-invariants.test.ts` → faithful subset | @frozen |
| S2: no duplicate ids | `subset-invariants.test.ts` → no duplicates | @frozen |
| S2: required fields non-empty | `subset-invariants.test.ts` → required fields | @frozen |
| Edge: commas + bare-`"` in productDisplayName preserved verbatim | `curate-unit.test.ts` → comma fixture, bare-quote fixture | @scaffolding |
| Edge: inclusive floor boundary (49 dropped / 50 kept) | `curate-unit.test.ts` → floor boundary | @scaffolding |
| Edge: cap truncates to exactly MAX, source order | `curate-unit.test.ts` → cap + order | @scaffolding |
| Edge: subCategory with < 2 qualifying types dropped | `curate-unit.test.ts` → subcategory drop | @scaffolding |
| Design seam: pure transform deterministic & source-order | `curate-unit.test.ts` → determinism | @scaffolding |
| S3: regeneration deterministic (run twice = identical) | `curation-reproducible.test.ts` → determinism | @scaffolding |
| S3: committed artifact == step output | `curation-reproducible.test.ts` → in-sync | @scaffolding |
| S4: rationale exists & documents the cut (all 4 drops named) | `rationale.test.ts` | @frozen |

`@scaffolding` marks the two surfaces named ahead of `/build`: the `pnpm curate`
CLI (+ optional output-path argument) in `curation-reproducible.test.ts`, and the
pure `curate(sourceCsv, params)` function in `curate-unit.test.ts`. `/build` may
rename or re-site either as long as the asserted *behavior* holds (logging the
change in `build-deviations.md`). The `curate-unit` test asserts behavior on a
synthetic fixture — the edge cases (comma/bare-quote preservation, the
inclusive floor boundary, the cap, source-order determinism, subCategory drop)
that the real-data invariant tests cannot reach because no comma row survives the
cap and no real articleType sits on the 49/50 boundary. The invariant and
rationale tests assert the deliverable itself and are frozen.

---

## Adversarial gate

**Mode:** independent clean-context sub-agent (general-purpose), one pass. It
verified all four parameters and the expected 7,485-row / 25-type / 4-subCategory
outcome against the real `docs/styles.csv`, confirmed the drop list and every
invariant test as sound, and found no scope drift or security issues. Five
findings surfaced; the owner chose to **fix all five**. No security findings, so
no re-gate was required.

| # | Severity | Lens | Finding | Disposition |
|---|----------|------|---------|-------------|
| 1 | HIGH | Coverage / tests | Comma-in-name edge case is the spec's headline failure mode but no comma row survives the cap into the committed subset, and the faithful-subset test re-parses both sides with the same helper — so a curate-side parser bug goes uncaught. | **Fixed** — added `curate-unit.test.ts` asserting comma + bare-`"` preservation on a synthetic fixture fed directly to the pure transform. |
| 2 | MEDIUM | Integrity / spec | "Or use a real CSV reader" is a trap: ids 7491/7497 carry a bare inch-mark `"`, which a strict RFC-4180 reader mangles. | **Fixed** — edge-case text now mandates the first-9-commas rule and forbids a quote-aware reader; the bare-`"` case is unit-tested. |
| 3 | MEDIUM | Coverage / tests | Determinism test (run twice in one env) can't catch environment-dependent ordering, defeating byte-reproducibility. | **Fixed** — spec now pins env-independent source-order retention as the rule; `curate-unit.test.ts` asserts exact source-order output. |
| 4 | LOW | Coverage / tests | Inclusive floor boundary (49 dropped / 50 kept) unexercisable on real data and untested. | **Fixed** — `curate-unit.test.ts` covers the 49/50 boundary with synthetic types. |
| 5 | LOW | Integrity / tests | `rationale.test.ts` named only Saree/Dress and `/\b2\b/` matched any stray "2". | **Fixed** — rationale test now requires all four dropped subCategories and the parameter `2` in its articleType-count role. |
