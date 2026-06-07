# Build deviations — Data prep & subset curation (feature 1)

## 1. Floor + subCategory drop is a fixpoint, not a single pass (design deviation)

**Design contradicted:** `spec.md` → Design → Components → Curation module
describes the transform as a single ordered pass: "counts rows per articleType
and drops types below `MIN_ROWS_PER_TYPE`; drops subCategories left with fewer
than `MIN_TYPES_PER_SUBCATEGORY` qualifying types; caps each remaining type…".

**What was done instead:** the floor and the subCategory rule are applied
repeatedly to a fixpoint (loop until no rows are removed) *before* capping.
`src/curate.ts` implements this; behavior is otherwise exactly as designed
(filter → floor → subCategory rule → cap, source order preserved, values
untouched).

**Why:** the design's single pass implicitly assumes each `articleType` belongs
to exactly one `subCategory`. The real `docs/styles.csv` violates this: the
`articleType` **"Dresses"** appears under both `subCategory == "Dress"` (462
rows) and `subCategory == "Topwear"` (2 rows). In a single pass, "Dresses"
clears the 50-row floor on its global count, so the `Dress` subCategory is then
dropped (it has only that one qualifying type) — but the 2 stranded "Dresses"
rows under "Topwear" survive, leaving `articleType == "Dresses"` with **2 rows**
in the output. That violates the **frozen** invariant
`subset-invariants.test.ts → "keeps every articleType within [50, 500]"`. The
fixpoint re-checks the floor after each subCategory drop, so once `Dress` is
removed "Dresses" falls below the floor and is dropped entirely. (`Shorts`
similarly spans Bottomwear/Loungewear but survives correctly under either rule
because its dominant subCategory is retained — so the bug is silent unless you
hit the `Dresses` shape.)

The fixpoint reproduces the spec's own illustrative expected outcome exactly
(7,485 rows · 25 articleTypes · 4 subCategories); the naive single pass produced
7,487 rows / 26 types, with the extra type being the invalid 2-row "Dresses".

**No test was changed.** All frozen invariants and scaffolding tests pass as
written. The named seams (`curate(sourceCsv, params)`, `CurationParams`,
`src/curate.ts`, `pnpm curate [outpath]`) were used unchanged.

**Spec-authoring lesson (for `/retro`):** a curation/grouping spec must not
assume a label hierarchy is strictly nested. When a child label (`articleType`)
can appear under more than one parent (`subCategory`), per-label counts and
parent-drop rules interact, and a single-pass ordering can leave orphaned rows
that violate the very count invariant the rule exists to enforce. State such
filters as "apply to a fixpoint" (or pin the per-(parent,child) counting model)
rather than as an ordered single pass — and the spec's illustrative row/type
totals can serve as the check that catches the orphan (7,485/25 vs 7,487/26).
