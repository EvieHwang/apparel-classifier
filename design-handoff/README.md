# Handoff: Narrative & Self-Explanation Pass (Roadmap Feature 7)

## Overview
This package implements **roadmap feature 7** from `declaration.md`:

> **Narrative & self-explanation pass** — the framing copy that makes a forwarded link
> legible to a non-technical peer, including the normalization-vs-classification teaching
> point and the honesty note that the product name carries the signal. **Touches: Dashboard UI.**

It is a **copy + light-layout pass on the existing dashboard** (`app/page.tsx`). No new API
routes, no engine changes, no new data. Everything here adds framing around the panels that
already exist (run control, cumulative, single-record, breakdown, results table).

**Design goal (the acceptance bar):** a product peer or hiring manager who opens a forwarded
link with zero context understands *what they're looking at and why it matters within a
minute* — and comes away with two specific, honest takeaways baked into the copy.

## About the design files
The files in `prototype/` are **design references built in HTML/React (Babel + Tailwind CDN)**.
They are a faithful mock of the intended look and behavior — **not production code to paste in**.
The task is to **recreate this narrative layer inside the real Next.js app** (`app/page.tsx`,
React + TypeScript + Tailwind v4), using the codebase's existing conventions and the same
slate/sky vocabulary already in `app/globals.css`.

The prototype replaces the live SSE run with a fixed local replay and a tiny keyword classifier
so it runs offline — **ignore all of that**. The real app already has the run loop, the
cumulative panel, the single-record panel, and the table. You are only adding the *narrative*
components and wiring them into the existing page.

## Fidelity
**High-fidelity.** Final copy, layout, type scale, spacing, and color are all decided. Recreate
the new components pixel-accurately using the app's existing Tailwind classes. The prototype's
Tweaks panel exists only to compare narrative treatments — it is **not** part of the deliverable.
Ship the **recommended configuration** below; the alternatives are documented in case the owner
wants to switch one.

## How this maps onto `app/page.tsx`
The current page renders, in order:
1. `<header>` — `h1` "Apparel Classifier" + one explanatory `<p>`
2. Run button + headline accuracy row
3. `<CumulativePanel>`
4. `<SingleRecordPanel>`
5. error state (conditional)
6. by-corruption-type `Breakdown` (conditional, on `done`)
7. `<ResultsTable>`

**This feature changes #1 and #7, and inserts three new blocks between the header and the run
control.** Nothing below the run control changes except the table header (#7). The new render
order at the top of `<main>` becomes:

```
<Hero />                        ← replaces the current <header>
<HowItWorks />                  ← new
<TeachingPoint />               ← new  (normalization-vs-classification)
<HonestyNote />                 ← new  (the name carries the signal)
… existing run control, cumulative, single-record, breakdown …
<ResultsTable plainHeaders />   ← existing table + new plain-language header row
```

---

## New components (recreate these)

### 1. `Hero` — replaces the current `<header>`
Plain-language framing that answers "what is this / why care" before any UI.

- **Eyebrow** (above the h1): a small uppercase, letter-spaced line, accent-colored, with a
  6px filled dot before it. Text: **`Live demo · classify your own product below`**
  - `text-xs font-medium uppercase tracking-wider`, color `sky-300` (`#7dd3fc`); dot is
    `h-1.5 w-1.5 rounded-full` filled `sky-500` (`#0ea5e9`).
- **H1**: **`Apparel Classifier`** — `text-3xl sm:text-4xl font-semibold tracking-tight text-slate-50`, `mt-3`.
- **Lead paragraph** (`mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-300`), verbatim:
  > Vendor product data arrives mislabeled — a pair of shorts filed as a bra, a category left
  > blank. Those errors quietly compound downstream, distorting planning and inventory. This
  > demo takes real, correctly-labeled apparel records, deliberately breaks the category field,
  > and asks an LLM to put it back — then scores every guess against the original label.
- The current header's terse paragraph ("Real apparel records have their `articleType`…") is
  **replaced** by the lead above. (The "guided" density adds a second stakes paragraph — see
  Alternatives; **not** in the recommended ship config.)

### 2. `HowItWorks` — new, three-beat mental model
A 3-column grid (`grid-cols-1 sm:grid-cols-3 gap-3`) of cards. Each card:
`rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3.5`.
Header row: a numbered circle (`h-6 w-6 rounded-full`, bg `sky-500`, `text-slate-950 text-xs
font-semibold`) + bold title (`text-sm font-semibold text-slate-100`). On cards 1 & 2, a
right-arrow `→` floated to the row's end (`text-slate-600`, hidden below `sm`). Body:
`mt-2 text-[13px] leading-relaxed text-slate-400`.

| # | Title | Body (verbatim) |
|---|-------|-----------------|
| 1 | **Corrupt** | Take a record with a known, correct type and damage it — swap it for a close sibling, a far-off type, or wipe it blank. |
| 2 | **Classify** | The model sees the product's other fields — mainly its name — and predicts the original type, with a confidence and a one-line reason. |
| 3 | **Score** | Each prediction is checked against the real label. Nothing is graded on a curve; a miss is a miss. |

Use a semantic `<ol>`/`<li>`.

### 3. `TeachingPoint` — new — **normalization vs. classification** (REQUIRED payload)
Recommended presentation: a quiet **aside / footnote-weight line** below the steps
(`mb-6 text-[13px] leading-relaxed text-slate-500`), lead phrase in `font-medium text-slate-400`.
Verbatim copy (bold the emphasized spans with `font-medium text-slate-200`):

> **What this is — and isn't.** This recovers **which category** a product belongs to — Tshirts,
> Jeans, Briefs. It does **not** normalize vocabulary or formatting: "Tshirt" vs "T-Shirt" vs
> "tee" is a separate problem, deliberately left out of v1. Classification first; cleanup is its
> own job.

This is the literal teaching point named in the roadmap. The wording must preserve: (a) it
recovers the *category*, and (b) it does **not** do vocabulary/format normalization, which is
*explicitly out of scope for v1* (consistent with `declaration.md` → Out of scope).

### 4. `HonestyNote` — new — **the name carries the signal** (REQUIRED payload)
Recommended presentation: a `card` placed **directly below the hero block** (after the teaching
point): `rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3`. Label row:
`text-xs font-semibold uppercase tracking-wider text-sky-300` reading **`One honest caveat`**.
Body `mt-1.5 text-[13px] leading-relaxed text-slate-400` (bold emphasized spans
`font-medium text-slate-200`), verbatim:

> The model leans on the product **name**, and real apparel names usually contain the answer —
> "Nike Men Navy Running Shorts" all but says **Shorts**. So this measures how reliably the
> model recovers a category the name already hints at, even when the category field is wrong or
> missing — not classification from scratch. The **Blank** rows below are the closest thing to a
> cold read, and you can watch their accuracy lag the rest.

This is the literal honesty note named in the roadmap. The last sentence is load-bearing: it
ties the claim to the **Blank** corruption tag, whose accuracy genuinely trails near/far-swap
(the model gets no corrupted hint, only the name). Keep that link — it's what makes the note
verifiable rather than a disclaimer.

### 5. `ResultsTable` — existing table, **add a plain-language header row**
Above the existing technical `<th>` row (`Original / Corrupted / Predicted / Result / Confidence
/ Rationale`), add a quieter sub-label row so a cold reader can parse the columns:
`text-slate-500 text-[11px] font-normal`, cells aligned to the same columns:

| Original | Corrupted | Predicted | Result | Confidence | Rationale |
|----------|-----------|-----------|--------|------------|-----------|
| the real label | what we broke it to | the model's guess | vs. the real label | *(empty)* | why |

Also (optional, low-risk polish shown in the prototype): under each `Original` cell, show the
product's `productDisplayName` in `text-[11px] text-slate-600`; under each `Corrupted` cell,
show the tag label (`Near swap` / `Far swap` / `Blank`) in the same small style, and add a
`title=` gloss on the corrupted value. These help a cold reader; confirm with the owner before
including, since they touch the existing table markup more than the header row alone.

---

## Recommended ship configuration
Implement exactly one treatment per element (these are the prototype's defaults the owner
selected):

| Element | Ship as |
|---|---|
| Intro density | **standard** (hero lead + how-it-works steps; no second stakes paragraph) |
| How-it-works steps | **shown** |
| Teaching point | **aside** (footnote-weight line under the steps) |
| Honesty note | **card, directly below the hero** |
| Plain-language table headers | **on** |
| Accent | **sky** (`#0ea5e9` / `#7dd3fc`) — the app's existing accent |

### Documented alternatives (only if the owner asks)
The prototype's Tweaks panel demos these; they are *not* required:
- **Intro density** `minimal` (hero lead only, hide steps) / `guided` (adds a second paragraph
  about modeling honest measurement).
- **Teaching point** `inline` (left-border accent callout) / `collapsed` (disclosure) / `hidden`.
- **Honesty note** `by-table` (render the card just above the results table instead) /
  `collapsed` / `hidden`.
- **Accent** `cyan` (`#06b6d4`) / `indigo` (`#6366f1`) — both stay in the cool family. Prefer
  `sky` unless told otherwise.

---

## Design tokens (all already in the app's Tailwind/slate-sky vocabulary)
- **Surface:** page bg `#020617` (slate-950); panel bg `slate-900/40`, nested `slate-900/60`;
  borders `slate-800`; inputs `slate-950` bg / `slate-700` border.
- **Text:** primary `slate-100` (`#f1f5f9`) / `slate-50` headings; secondary `slate-300`;
  muted `slate-400`; footnote `slate-500`; faint `slate-600`.
- **Accent (sky):** solid `#0ea5e9` (sky-500), light text `#7dd3fc` (sky-300), focus ring
  `#38bdf8` (sky-400, already in `globals.css`).
- **Status:** correct `green-400`, wrong `red-400`, declined `amber-*` (unchanged from app).
- **Type scale used by new components:** h1 `text-3xl`/`sm:text-4xl` 600; eyebrow/labels
  `text-xs` 600 uppercase `tracking-wider`; lead `text-[15px]` `leading-relaxed`; body/footnote
  `text-[13px]` `leading-relaxed`; table sub-labels `text-[11px]`. Base remains **14px**
  (`html { font-size: 14px }`).
- **Radius:** cards/asides `rounded-lg`; panels/buttons `rounded-md` (match existing).
- **Spacing rhythm:** new top-of-page blocks use `mb-6`/`mb-8`; the hero is `mb-8`.

## Interactions & behavior
- The narrative layer is **static copy** — no new state, no data fetching, no effects. The only
  interactive variant is the `collapsed` disclosure (a local `useState(false)` show/hide with
  `aria-expanded`), which is an *alternative*, not the ship config.
- Everything else (Run, streaming rows, cumulative tick, single-record classify, error/retry)
  is **existing behavior** — do not reimplement it.
- Accessibility (constitution: WCAG 2.1 AA): keep the `<ol>` semantics for the steps; the
  teaching/honesty asides should be `<aside>`; all chosen slate/sky pairs already clear AA on
  `#020617`. The existing sky focus ring covers the disclosure button.

## Files in this bundle
- `prototype/Apparel Classifier.html` — entry point; load order + the `globals.css`-equivalent
  inline `<style>` (14px base, sky focus ring).
- `prototype/narrative.jsx` — **the feature**: `Hero`, `HowItWorks`, `TeachingPoint`,
  `HonestyNote`, `Disclosure`. Copy strings live here verbatim.
- `prototype/dashboard.jsx` — recreated existing panels incl. the `ResultsTable` plain-header
  row; reference only (the real app already has these).
- `prototype/app.jsx` — composition + Tweaks wiring (shows how the blocks slot together and the
  recommended defaults in `TWEAK_DEFAULTS`).
- `prototype/mock-data.jsx` — sample rows/cumulative; **prototype-only**, do not port.
- `prototype/tweaks-panel.jsx` — prototype tooling; **not** part of the deliverable.

## Fitting the repo's workflow
This repo builds features via `features/<feature-name>-<number>/` populated by `/spec` and
`/build`. Suggested slug: **`narrative-self-explanation-pass-7`**. A `/spec` run can take this
README as the design input; the acceptance suite is light (this is a copy/markup pass) but
should assert the two required payloads are present and legible — e.g. the rendered page
contains the normalization "is — and isn't" teaching point and the "name carries the signal"
honesty note, and the results table exposes plain-language column labels. Keep `README.md` /
`CLAUDE.md` current per the constitution's quality gates.
