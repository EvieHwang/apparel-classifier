# Feature declaration — Narrative & self-explanation pass (feature 7)

## What
A copy-and-light-layout pass on the existing dashboard (`app/page.tsx`) that makes
a forwarded link self-explaining to someone who opens it with zero context. It adds
four framing blocks above the existing run control — a `Hero`, a three-beat
`HowItWorks` (Corrupt → Classify → Score), a `TeachingPoint` (classification, **not**
vocabulary normalization), and a `HonestyNote` (the product name carries the signal) —
and adds a plain-language sub-header row plus a corruption-tag label to the existing
results table. No new API routes, no engine changes, no new data: every existing
behaviour (Run, streaming rows, cumulative tick, single-record classify, error/retry)
is untouched.

## Why
Roadmap item 7. The demo is a credibility artifact: the primary audience is a
non-technical product peer or hiring manager who receives a forwarded link and must
understand *what they're looking at and why it matters within a minute*. Today the
page opens straight into a terse header and a Run button — legible to the builder,
opaque to a cold reader. This pass supplies the missing mental model and bakes in the
two intellectually-honest takeaways the declaration names: that the project recovers
*category* and deliberately does **not** normalize vocabulary (a separate v1-excluded
problem), and that the model leans on the product name, so the demo measures recovery
of a hinted category — verifiable against the lagging Blank rows — not classification
from scratch.

## Success
- A cold reader sees, before any interactive control, a hero that states what the demo
  does and why it matters, and a three-step Corrupt → Classify → Score model.
- The rendered page contains the normalization-vs-classification teaching point: it
  recovers *which category* a product is, and it does **not** normalize vocabulary or
  formatting (explicitly out of scope for v1).
- The rendered page contains the honesty note: the model leans on the product name,
  which usually contains the answer, and the Blank rows are the closest thing to a cold
  read — tying the caveat to observable data, not a generic disclaimer.
- The results table carries a plain-language sub-header row ("the real label", "what we
  broke it to", "the model's guess", "vs. the real label", "why") above the existing
  technical header, and each Corrupted cell shows its corruption-tag label (Near swap /
  Far swap / Blank).
- All existing behaviour and the existing automated suite stay green: no SDK import,
  no key, no engine/data/route change. The narrative layer is static copy — no new
  state, no fetching, no effects.

## Shape touched
- **Dashboard UI** (declaration Shape) — the only surface this feature touches. New
  presentational components and the table sub-header/tag-label, composed into the
  existing `app/page.tsx` render order between the header and the run control, and
  inside `ResultsTable`.

## Out of scope
- Any change to API routes, the classification service, corruption, scoring, the
  cumulative store, or the run stream. This is presentation only.
- Changing the `@frozen` `RunEntry` shape or the SSE run stream — so the optional
  `productDisplayName`-under-Original polish from the handoff is **excluded** (the data
  the table renders has no display-name field; surfacing it would be an engine change).
  The corruption-tag label is included because `RunEntry.corruptionTag` already exists.
- The prototype's Tweaks panel and its alternative treatments (minimal/guided density,
  inline/collapsed teaching point, by-table/collapsed honesty note, cyan/indigo accent).
  Exactly one treatment per element ships — the handoff's recommended configuration.
- New interactivity. The `Disclosure` component in the prototype is only used by the
  non-shipped collapsed alternatives, so it is not built.
