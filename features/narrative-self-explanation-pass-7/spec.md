# Spec — Narrative & self-explanation pass (feature 7)

Design input: the high-fidelity handoff package in `/design-handoff` (owner-directed,
current). This is a **copy + light-layout pass** on the existing dashboard
(`app/page.tsx`). No new API routes, no engine changes, no new data. Every existing
behaviour (Run, streaming rows, cumulative tick, single-record classify, error/retry)
is untouched. The shipped treatment is the handoff's **recommended configuration**, plus
the one owner-approved table polish (corruption-tag label under each Corrupted cell);
the `productDisplayName`-under-Original polish is **excluded** as out of scope (it would
require changing the `@frozen` `RunEntry` shape and the SSE run stream).

## Behavioral requirements

### Story 1 — A cold reader understands what the demo is, before any control
**As** a non-technical product peer or hiring manager who opened a forwarded link with
zero context, **I want** plain-language framing at the top of the page **so that** I
understand what I'm looking at and why it matters within a minute.

Acceptance:
- Above the existing run control, the page renders a **Hero** (eyebrow + `h1`
  "Apparel Classifier" + a lead paragraph) that states, in plain terms, that vendor
  product data arrives mislabeled, that those errors compound downstream, and that the
  demo breaks the category field and asks an LLM to recover it, scoring against the
  original label.
- Immediately below, a **three-beat mental model** — Corrupt → Classify → Score —
  renders as a semantic ordered list of three steps, each with a short body describing
  that beat (corrupt: damage a known type by swapping for a close sibling / far type /
  blank; classify: the model predicts from the other fields, mainly the name, with a
  confidence and a one-line reason; score: checked strictly against the real label).

### Story 2 — The normalization-vs-classification teaching point is present (REQUIRED payload)
**As** a reader forming a judgement about the project's rigour, **I want** the demo to
state plainly what it does and does not claim **so that** I don't mistake category
recovery for vocabulary cleanup.

Acceptance — the rendered page contains a teaching point that conveys **both**:
- (a) it recovers **which category** a product belongs to (e.g. Tshirts, Jeans, Briefs);
- (b) it does **not** normalize **vocabulary** or formatting — "Tshirt" vs "T-Shirt" vs
  "tee" is a **separate problem, deliberately left out of v1**.

This is consistent with `declaration.md` → Out of scope ("v1 does **not** solve
vocabulary/format normalization"). The recommended treatment is a footnote-weight line
below the steps; its element is not pinned (a paragraph is acceptable).

### Story 3 — The honesty note is present and verifiable (REQUIRED payload)
**As** a reader assessing credibility, **I want** the demo to disclose its own central
caveat **so that** the accuracy numbers read as honest rather than hype.

Acceptance — the rendered page contains an honesty note that conveys:
- the model leans on the product **name**, which usually already contains the answer
  (the "...Running Shorts" example);
- so the demo measures recovery of a category the name **hints at**, not classification
  from scratch;
- and it ties this claim to observable data: the **Blank** rows are the closest thing to
  a **cold read** and their accuracy lags the rest.
- The honesty note renders as a semantic `<aside>` (a quiet callout), per the handoff's
  recommended card treatment placed directly below the hero block.

### Story 4 — The results table is legible to a cold reader
**As** a cold reader reaching the results table, **I want** plain-language column labels
and a human-readable corruption category **so that** I can parse the table without the
internal vocabulary.

Acceptance:
- The table renders a plain-language sub-header row above the existing technical header
  (`Original / Corrupted / Predicted / Result / Confidence / Rationale`), with the
  sub-labels **"the real label"**, **"what we broke it to"**, the model's **guess**,
  **"vs. the real label"**, (confidence: empty), and **"why"**.
- For each data row, the Corrupted cell shows the row's **corruption-tag label** in human
  terms — **"Near swap" / "Far swap" / "Blank"** — derived from the existing
  `RunEntry.corruptionTag`. The existing technical header row and the existing per-row
  values (true type, corrupted value or "(blank)", prediction, ✓/✗, confidence,
  rationale) are preserved.

### Story 5 — Nothing else changes
**As** the maintainer, **I want** the narrative pass to be presentation-only **so that**
no server behaviour, data shape, or security property regresses.

Acceptance:
- No new API route, no change to `src/` engine modules, the SSE run stream, the
  classification service, scoring, corruption, or the cumulative store.
- The narrative layer introduces no new client state, data fetching, or effects — it is
  static copy. The existing Run / streaming / cumulative / single-record / error-retry
  behaviour is unchanged.
- The page still imports only SDK-free, key-free modules (the existing key-isolation and
  no-raw-HTML guards continue to pass).

## Edge cases & failure modes
- **Empty results table (idle / pre-run):** the new plain-language sub-header row and the
  narrative blocks render regardless of run state; the table's existing empty-state row
  ("No results yet…") is preserved. Per-row tag labels simply have no rows to attach to.
- **Run in error / mid-stream:** the narrative blocks are static and unaffected; the
  existing error state and partial rows render as before.
- **Long model rationale / hostile product name:** unchanged from feature 5 — all
  model-derived strings still render as text (no `dangerouslySetInnerHTML`).

## Out of scope
- Any change to API routes, engine modules, the run stream, or data shapes.
- The `productDisplayName`-under-Original table polish (would change the `@frozen`
  `RunEntry` shape / SSE stream — engine change).
- The prototype's Tweaks panel and all non-shipped alternative treatments
  (minimal/guided density, inline/collapsed teaching point, by-table/collapsed honesty
  note, cyan/indigo accent), and the `Disclosure` component those alternatives use.

## Design

### Components (all presentational, in `app/page.tsx`)
- **`Hero`** — replaces the current `<header>`: eyebrow line, `h1`, lead paragraph. Sky
  accent (`#0ea5e9` / `#7dd3fc`), the app's existing accent. Static.
- **`HowItWorks`** — a semantic `<ol>` of three `<li>` step cards (Corrupt / Classify /
  Score), each a numbered badge + title + body. Static.
- **`TeachingPoint`** — a footnote-weight line below the steps carrying the
  normalization-vs-classification payload (Story 2). Static.
- **`HonestyNote`** — an `<aside>` card directly below the hero block carrying the
  name-carries-the-signal payload (Story 3). Static.
- **`ResultsTable`** (existing component, extended) — adds the plain-language sub-header
  row (Story 4) and renders the human corruption-tag label per row from
  `RunEntry.corruptionTag`, reusing the existing `TAG_LABELS` map already in the file.

### Composition
New render order at the top of `<main>`: `Hero` → `HowItWorks` → `TeachingPoint` →
`HonestyNote` → (existing run control, cumulative panel, single-record panel, breakdown)
→ `ResultsTable` (with the new sub-header row + tag labels). Nothing below the run
control changes except `ResultsTable`.

### Behavioral properties (the seams)
- **Always-present property (behavioral):** the four narrative payloads — hero framing,
  the three-beat model, the teaching point, and the honesty note — are present and legible
  in the page's initial idle render, with no interaction and no network. This is what a
  cold reader who opens a forwarded link sees, and it is verified by the static-markup
  render test, which runs **no** `useEffect` and issues **no** `fetch`: a payload gated
  behind a collapsed `useState` disclosure or an effect/fetch would be absent from that
  render and turn the test red. (Implementation note for `/build`, not a separately tested
  constraint: keep these components stateless static copy — the recommended treatment has
  no interactivity, and the `Disclosure` collapsed alternative is out of scope. Residual
  the suite does not catch: an added effect/fetch that still renders the payload statically
  would pass — acceptable because it does not change what the reader sees, and the
  no-server-change guarantee below is the property that actually matters.)
- **No-server-change property:** the feature touches only `app/page.tsx`. No `src/` engine
  module, API route, the SSE run stream, scoring, corruption, or the cumulative store is
  modified; the existing `key-isolation` and `no-raw-html` guards (which scan all of
  `app/`) stay green, so no SDK/key leak or raw-HTML rendering is introduced.
- **Accessibility property (constitution WCAG 2.1 AA):** the three steps are a single
  semantic ordered list (`<ol>` with three `<li>`); the honesty note is an `<aside>`. The
  shipped slate/sky text pairs clear AA on the `#020617` page background (handoff design
  tokens). Existing focus-ring behaviour is unchanged.
- **Tag-label property:** `ResultsTable`, given rows, renders the human label for each
  row's `corruptionTag` ("Near swap" / "Far swap" / "Blank"). `ResultsTable` is exposed
  as a **named export** from `app/page.tsx` so this per-row behaviour is unit-renderable;
  this export is a test seam, not a public API (see Coverage — `@scaffolding`).

### Pattern reuse
- **Reuses pattern:** the existing slate/sky Tailwind vocabulary in `app/globals.css`
  and `app/page.tsx`; the existing `TAG_LABELS` map (`near-swap`→"Near swap", etc.)
  already defined in `app/page.tsx`; the existing static-source guards
  (`no-raw-html.test.ts`, `key-isolation.test.ts`) continue to apply unchanged.
- **Test wiring (new, recorded in constitution `## Testing`):** Vitest is configured with
  esbuild's **automatic JSX runtime** so component files that use JSX without importing
  React (`app/page.tsx`) render under the node environment via `react-dom/server`'s
  `renderToStaticMarkup`. No DOM/jsdom dependency is added. Component test files remain
  `*.test.ts` and render with `React.createElement` (no JSX in the test files), so the
  existing `features/**/tests/**/*.test.ts` include glob is unchanged.

## Coverage

| Requirement / seam | Test(s) | Strength |
|---|---|---|
| Story 1 — Hero framing present (mislabeled / what-it-does) | `narrative-payloads.test.ts` › hero | @frozen |
| Story 1 — Corrupt→Classify→Score as a semantic ordered list of 3 | `narrative-payloads.test.ts` › how-it-works + a11y | @frozen |
| Story 2 — teaching point: recovers category AND does not normalize vocabulary (separate v1 problem) | `narrative-payloads.test.ts` › teaching point | @frozen |
| Story 3 — honesty note: name carries signal, tied to Blank/cold-read; rendered as `<aside>` | `narrative-payloads.test.ts` › honesty note + a11y | @frozen |
| Story 4 — plain-language table sub-header labels | `narrative-payloads.test.ts` › plain headers | @frozen |
| Story 4 — per-row human corruption-tag label | `corruption-tag-label.test.ts` | @scaffolding |
| Story 5 — presentation only: no SDK/key leak, no raw HTML | existing `key-isolation.test.ts`, `no-raw-html.test.ts` (unchanged, still green) | @frozen |
| Vacuous-pass guard (render actually produced the page) | `narrative-payloads.test.ts` › renders | @frozen |

Note on copy assertions: tests assert distinctive, load-bearing **phrases** that encode
each required payload (e.g. "normalize" + "vocabulary" + "which category" + "v1";
"Running Shorts" + "cold read" + "Blank"), not entire verbatim paragraphs — so faithful
copy-editing stays possible while the required teaching points remain provably present.

## Adversarial gate
Mode: independent clean-context sub-agent review of `spec.md` + `tests/`. The reviewer
confirmed scope is tightly drawn (the excluded `productDisplayName` polish is correctly
fenced as a `@frozen RunEntry` change), both required payloads are pinned by
non-vacuous assertions, the `@scaffolding` tag on the tag-label test is correctly
applied, and no implementation shape (class names, private state) is locked in. Three
findings, all non-security; owner disposition: **fix all three**.

| # | Severity | Lens | Finding | Disposition |
|---|----------|------|---------|-------------|
| 1 | MEDIUM | Coverage/Integrity | Story 5's "static-copy / no new state" was framed as an implementation constraint not truly testable under renderToStaticMarkup (effects don't run), so a non-payload-hiding effect could regress silently. | Fixed — reframed in Design as the behavioral always-present property the render test actually verifies (a collapsed-disclosure payload turns the test red) plus an explicit no-server-change property; the untestable residual is named, not papered over. |
| 2 | LOW | Integrity (brittle test) | toContain("T-Shirt") pinned one example's exact hyphenation. | Fixed — loosened to /t-?shirt/i; the payload stays carried by "normalize" + "vocabulary" + "v1". |
| 3 | LOW | Coverage | The Rationale plain-language sub-label "why" was specified but unasserted. | Fixed — added toContain(">why<"), anchored as cell text so incidental prose "why" can't pass it. |

No security findings, so no re-gate was required. No findings were acknowledged (all
fixed); the `## Acknowledged risks` table in constitution.md gains no rows.
