# Build deviations — Single-record live panel (feature 5)

This file is the feedback channel back to `/spec` (mined by `/retro`). It records
where the build diverged from the design or corrected a test, and — per the spec's
"Manual validation" section — the outcome of the manual checklist for the route and
panel (the SDK/DOM/network shells kept out of the headless bar by design).

## Design deviations
**None.** Every substance surface the design named was implemented as named, with no
re-siting of any `@scaffolding` surface:
- `classifyOne({ productName, vocabulary, classify }): Promise<SingleClassifyResult>`
  — name and call shape kept as specified (`src/single-classify.ts`).
- `MAX_PRODUCT_NAME_LENGTH` — set to **200** (the `@scaffolding` value; a positive
  integer, ample for any real product name, tight enough to bound prompt-injection
  payload + token cost). Tests assert the *property* (positive integer, at/under
  accepted, above rejected), which holds.
- `SingleClassifyResult` — the `@frozen` discriminated union
  (`classified` / `declined` / `invalid`) implemented verbatim; lives in
  `src/single-classify.ts` (SDK-free) and is type-only-imported by the panel.
- Route at `app/api/classify/route.ts`; panel added to `app/page.tsx`.

## Tests corrected
**None.** All test files were satisfied as written; no `@frozen` or `@scaffolding`
assertion was changed.

## Note for a future spec author
The `no-raw-html` guard is a **literal substring scan** for `dangerouslySetInnerHTML`
over every file under `app/`. A perfectly benign code *comment* that names the token
(e.g. "we never use dangerouslySetInnerHTML here") trips it — the scan cannot tell a
comment from a call. This is acceptable (the guard is deliberately blunt and
zero-false-negative), but the panel's comment had to be reworded to "renders as plain
TEXT (never raw HTML)" to avoid a false positive. Worth a one-line note in the test so
the next author doesn't lose time to it.

## Manual validation checklist (route + panel — outside the headless bar)
Per spec §"Manual validation". Items needing a live model call require a configured
`ANTHROPIC_API_KEY`, which the build sandbox does not carry by default (the same
constraint under which features 2–3 validated their SDK shells).

| Item (acceptance criterion) | Status | Evidence |
|---|---|---|
| **Missing/blank `ANTHROPIC_API_KEY` fails closed** (S5) | ✅ Verified | `POST /api/classify` with no key → HTTP **500**, body `{"error":"Server is not configured with an ANTHROPIC_API_KEY; cannot classify."}`. No key *value* in the response (the string is the env-var *name* in a human-readable error, identical posture to the run route). No silent hang. |
| **Page + panel render** (S1/S7) | ✅ Verified | `GET /` serves 200; markup contains the panel heading "Try it on your own product name" and the associated label `for="single-name"`. |
| **Labeled input, keyboard submit, visible focus, `aria-live`** (S7) | ✅ Verified by markup review | `<label htmlFor="single-name">`; a real `<form>`/`<button type="submit">` (keyboard-operable); `focus:ring-2 focus:ring-sky-*` on input and button; `role="status" aria-live="polite"` region announcing classified/declined/invalid/error. AA contrast uses the same slate/sky/amber/red dark palette as the established dashboard. |
| **Rationale renders as text, no raw HTML** (S6) | ✅ Verified | `no-raw-html.test.ts` passes (no `dangerouslySetInnerHTML` anywhere under `app/`); the panel interpolates every model string as JSX text. |
| **Key isolation** (S5) | ✅ Verified | `key-isolation.test.ts` passes; the panel imports `SingleClassifyResult` **type-only** from the SDK-free `src/single-classify.ts`; the SDK/key live only in the server route. |
| **Invalid input → 400, no model call** (S3) | ⏳ Deferred (needs a key present to pass the route's fail-closed config gate before reaching the seam) | Seam behavior is exhaustively unit-tested (`single-classify.test.ts`: empty/whitespace/over-length → `invalid`, spy call-count 0). Route maps `invalid → 400` in plain code. Will confirm live once a key is configured. |
| **Happy path** (S1/S2) — real type + confidence + rationale, classified name shown, no ✓/✗ | ⏳ Deferred — requires live key | — |
| **Decline** (S4) — off-distribution `low` shown as decline | ⏳ Deferred — requires live key | — |
| **Injection inertness end-to-end** (S6) — hostile markup renders inert, label still a vocab value | ⏳ Deferred — requires live key | Static guarantee already in place (closed-vocab enum + text-only rendering + length cap); end-to-end visual check pending key. |
| **Mid-request failure** (edge) — visible error + retry, no fabricated result | ⏳ Deferred — requires live key (or a fault injection) | Route maps a `classify` rejection → non-2xx error body; panel renders `role="alert"` error + "Try again." |

The deferred items are the live-model behaviors the spec assigns to manual validation
by design; they do not gate the headless bar (all 118 tests green) or the production
build. They will be ticked off and this table updated once `ANTHROPIC_API_KEY` is
available in the session.
