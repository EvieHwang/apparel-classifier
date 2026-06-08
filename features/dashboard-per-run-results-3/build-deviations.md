# Build deviations — Dashboard: per-run results (feature 3)

The honest record of where the build diverged from the spec's *design* (a
recommendation, not a contract) and the outcome of the manual-validation checklist
the spec hands to `/build`. **No `spec.md` requirement was changed and no test was
modified** — every `@scaffolding` surface (`runEventStream`, `runViewReducer`,
`encodeSseEvent`, `RUN_SIZE`, the `RunStreamEvent` field names) was implemented under
the exact name and shape the tests named, so the headless bar passed against the
suite as written.

## Design deviations

### 1. shadcn/ui was not added; Tailwind + semantic HTML directly
- **Design said:** the spec's Ground-truth check lists the feature as adding "`next`,
  `react`, `react-dom`, Tailwind, **and shadcn/ui**".
- **What was done:** added `next` / `react` / `react-dom` / Tailwind (v4) but **not**
  shadcn/ui. The whole UI is a single Run button, a results table, a breakdown grid,
  and an error panel — none of which needs a Radix-backed primitive. The Run control
  is a native `<button>` (keyboard-operable with a visible focus ring), and the
  results are a native semantic `<table>` (Story 7). shadcn/ui would have pulled in
  Radix + a `components/ui` scaffold disproportionate to a one-page demo.
- **Why it's safe:** every behavioral and accessibility requirement (semantic table,
  keyboard + visible focus, non-colour-only correctness signal, `aria-live`) is met
  with native elements; nothing in the spec's behavioral requirements or tests
  references shadcn.
- **Spec-authoring lesson (for `/retro`):** don't enumerate a component-library
  dependency (shadcn/ui) as a mandatory stack addition for a surface that has no
  interactive primitives needing one — name the *capability* (accessible button +
  semantic table) and let `/build` pick the lightest thing that satisfies it.

### 2. Transport: `fetch` + `ReadableStream` over GET (the verb the spec delegated)
- **Design said:** "The transport verb (EventSource `GET` vs. a `fetch`+
  `ReadableStream` `POST`) is left to `/build`; only the streaming behavior is fixed."
- **What was done:** a **GET** `/api/run` returning a `text/event-stream`
  `ReadableStream`, consumed on the client with `fetch(...).body.getReader()` and a
  small SSE-frame parser. GET (not POST) because the run takes no request body and the
  trigger is idempotent; `fetch`+reader (not `EventSource`) because `EventSource`
  cannot read a non-2xx response body — and the missing-key path **must** deliver its
  terminal `error` frame on a 500 (Story 5, fail-closed). The on-wire framing is the
  tested `encodeSseEvent` output, so the wire contract stays the unit-tested one.
- **Why it's safe:** this is a choice the spec explicitly delegated, not a deviation
  from a requirement. Progressive delivery, the authoritative terminal score, and
  fail-fast all ride the tested `runEventStream` + `encodeSseEvent` seams unchanged.

### 3. `tsconfig.json` extended for the Next surface (expected by the spec)
- The shared `tsconfig.json` gained `DOM`/`DOM.Iterable` libs, `jsx: preserve`,
  `allowJs`, `incremental`, the `next` plugin, and `app/**` includes; `next build`
  then auto-added `exclude: ["node_modules"]`. The engine config was **extended, not
  forked** — the same `tsconfig` type-checks the engine (Vitest) and the app. This is
  the "introduces the Next.js surface" work the spec's Ground-truth check anticipated,
  not a divergence. Engine `tsc` and `next build`'s type-check both pass clean.

## Manual validation (route + page — outside the headless bar)

Walked per the spec's **Manual validation** checklist. Each item maps to an
acceptance criterion with no executable test by design (the SDK/DOM/network shells,
kept out of the headless bar exactly as feature 2 kept `src/anthropic.ts`).

| Item (spec) | Status | Evidence |
|-------------|--------|----------|
| **Missing/blank `ANTHROPIC_API_KEY` fails closed** (S5, edge) | ✅ **Verified in-sandbox** | Ran `pnpm build` then `pnpm start` with **no** `ANTHROPIC_API_KEY`. `GET /api/run` returned **HTTP 500** with `content-type: text/event-stream` and body `event: error\ndata: {"message":"Server is not configured with an ANTHROPIC_API_KEY; cannot run a classification."}` — a terminal error frame, **no key value**, no hang. `GET /` returned 200. |
| **Core WCAG markup** (S7) | ✅ **Verified by markup review** | Rendered page source contains a semantic `<table>` with `<th scope="col">` headers and a `<caption>`, a native `<button>Run</button>` (visible `:focus-visible` ring in `globals.css`), a `role="status" aria-live="polite"` region, and an `<h1>`. The correct/incorrect signal is `✓ correct` / `✗ wrong` (glyph + word, not colour alone). Dark-theme colours chosen for AA contrast (slate-100 on slate-950 ≈ 17:1; status colours at the 400 level). |
| **Production build / type-check** (constitution quality gate) | ✅ **Verified in-sandbox** | `pnpm build` compiled, type-checked, and linted clean; `/api/run` is a dynamic server route, `/` is static. The client page compiling for the browser also structurally confirms it pulls in **no** `node:fs`/SDK (Story 5). |
| **Happy path — real streamed run** (S1/S2) | ⚠️ **Not executed in-sandbox** | Requires a live `ANTHROPIC_API_KEY` and real network calls to Anthropic. Same constraint under which feature 2 left `src/anthropic.ts` manually validated. The route wires `loadSubset` → `createAnthropicClassifier(createRunStructured(client))` → `runEventStream` → `encodeSseEvent`; the streaming/score/render path it feeds is the one the headless suite covers (`run-stream`, `view-reducer`, `sse-encoder`). **Owner to run once against a dev key:** rows stream in one at a time, live accuracy ticks, and on completion the headline + near/far/blank breakdown equal the terminal score; Run returns to idle and re-runs. |
| **Mid-run failure** (S4) | ⚠️ **Not executed in-sandbox** | Needs a live run that fails on a record (or an injected fault on the real client) — not reachable without a key. The behavior is exercised headlessly: `run-stream` (m entries → one error event, no score) and `view-reducer` (error keeps rows, claims no score). **Owner to confirm** the page shows the error panel + Retry and no final accuracy when a real classification errors. |
| **Blank-record display** (edge) | ⚠️ **Confirmed in code; not seen live** | The table renders `(blank)` (italic) when `corruptionTag === "blank"` or `corruptedValue === ""`, never an empty cell. Only appears once a real run produces a blank-tagged row. **Owner to eyeball** on the first live run. |

**Net:** everything verifiable without a live LLM key was verified in-sandbox
(fail-closed, build/type-check, WCAG markup). The three items needing a real Anthropic
call are left for the owner to confirm against a dev key — the same manual-validation
boundary feature 2 established for the SDK shell.
