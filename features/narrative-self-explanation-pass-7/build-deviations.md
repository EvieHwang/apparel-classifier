# Build deviations — Narrative & self-explanation pass (feature 7)

## 1. `ResultsTable` seam relocated from `app/page.tsx` to `app/results-table.tsx`

- **Test changed:** `tests/corruption-tag-label.test.ts` (tagged `@scaffolding`).
- **Original surface:** `import { ResultsTable } from "../../../app/page.tsx"` — the spec's
  Design ("Behavioral properties → Tag-label property") named `ResultsTable` as a **named
  export from `app/page.tsx`**, a test seam to make the per-row tag label unit-renderable.
- **Why it was wrong:** Next.js (App Router) forbids non-reserved named exports from a route's
  `page.tsx`. `next build` fails type-checking with `"ResultsTable" is not a valid Page export
  field`. The behaviour under test (a row's corruption tag rendered in human terms) is real and
  unchanged; only the *location* of the export was unsatisfiable as specified.
- **What was done:** Extracted `ResultsTable` and the shared `TAG_LABELS` map into a sibling
  module `app/results-table.tsx`. `app/page.tsx` imports both from there. The test's import was
  updated to `app/results-table.tsx`. The `@scaffolding` tag explicitly licenses refining the
  seam's surface (rename/restructure/relocate) as long as the asserted behaviour holds and the
  change is logged here — which it does and is.
- **Guards still hold:** the new file lives under `app/`, imports only React + type-only shapes
  (no SDK, no key) and renders every model-derived string as text, so `key-isolation.test.ts`
  and `no-raw-html.test.ts` stay green.

### Spec-authoring lesson (for `/retro`)
Naming a **named export from a framework route file** (`app/page.tsx` in Next.js App Router) as a
test seam bakes in a framework constraint the seam can't satisfy: Next.js only allows `default`
plus a fixed set of reserved exports from a `page` file. When a behaviour needs to be unit-rendered
in isolation, point the `@scaffolding` seam at a **plain sibling module** the route re-uses, not at
the route file itself.
