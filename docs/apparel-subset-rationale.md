# Apparel subset — curation rationale

`docs/apparel-subset.csv` is a curated cut of the raw Kaggle *Fashion Product
Images* dataset (`docs/styles.csv`, 44,446 rows). It is produced by a committed,
reproducible step (`pnpm curate`, in `scripts/curate-subset.ts` over the pure
transform in `src/curate.ts`) — never hand-edited — so it can be regenerated
byte-for-byte from the source. This document explains the cut so it is legible
without reading the code.

## What this cut is for

Every later feature samples from this subset. The downstream corruption engine
decides a **near-swap** vs a **far-swap** by grouping `articleType`s *within*
their `subCategory`: a near-swap replaces a record's true `articleType` with a
sibling type from the same `subCategory`. That only works if every retained
`subCategory` contains at least two distinct `articleType`s — otherwise a record
would have no plausible near-swap target. So the cut is shaped deliberately to
keep multiple subCategories, each with multiple sibling types, and to flatten the
long head so the accuracy numbers aren't an artifact of a few dominant types.

## The parameters

The cut is defined entirely by one masterCategory and three numbers (held in one
place, in `scripts/curate-subset.ts`):

| Parameter | Value | Meaning |
|-----------|-------|---------|
| masterCategory | `Apparel` | Only rows whose `masterCategory` is **Apparel** are kept. |
| min rows per type | `50` | An `articleType` is retained only if at least **50** of its rows survive the filtering — enough signal to be a real category, not noise. |
| min types per subCategory | `2` | A `subCategory` is kept only if it still holds at least **two distinct article types** (≥ 2) that cleared the floor — this is what guarantees every record has a near-swap sibling. |
| per-type cap | `500` | No single `articleType` may contribute more than **500** rows; the head (Tshirts, Shirts, Jeans, …) is truncated to the first 500 in source order so nothing dominates. |

After the cut, every `articleType` in the subset has between **50** and **500**
rows. The floor and the subCategory rule are applied together until stable: when
a subCategory is dropped, the rows it removes can pull an article type below the
50-row floor, so the step re-checks until nothing more falls out.

## What was kept

~7,485 rows across **25** article types in **4** subCategories:

- **Topwear** — Tshirts, Shirts, Tops, Kurtas, Kurtis, Tunics, Sweatshirts,
  Sweaters, Jackets, Dupatta
- **Bottomwear** — Jeans, Trousers, Shorts, Track Pants, Capris, Leggings, Skirts
- **Innerwear** — Bra, Briefs, Innerwear Vests, Trunk, Boxers
- **Loungewear and Nightwear** — Nightdress, Night suits, Lounge Pants, Shorts

## What was dropped, and why

Four Apparel subCategories were dropped because **fewer than two** of their
article types cleared the 50-row floor — leaving no near-swap sibling for any
record in them:

- **Dress** — only one qualifying type (Dresses); with no sibling it has no
  near-swap target, so the whole subCategory is dropped. (The handful of
  `Dresses` rows mislabeled under Topwear fall below the 50-row floor once Dress
  is gone, and are dropped too.)
- **Saree** — only one qualifying type (Sarees); no sibling, dropped.
- **Apparel Set** — only one qualifying type (Kurta Sets); no sibling, dropped.
- **Socks** — no article type reached the 50-row floor at all; dropped.

Rows that are not `masterCategory == Apparel`, and any source row missing a
required field (`id`, `masterCategory`, `subCategory`, `articleType`,
`productDisplayName`), are also excluded.

## Provenance

The curation only **filters and caps** — it never relabels, reorders, or mutates
a value. Every subset row's `id`, `articleType`, `subCategory`, and
`masterCategory` match the source exactly, and `productDisplayName` is preserved
verbatim (including the unquoted commas and bare inch-mark `"` that appear in
some names). The source labels remain ground truth.
