# Spec — Single-record live panel (feature 5)

## Ground-truth check
CLAUDE.md / declaration sections leaned on for this spec, and their currency
(confirmed with the owner in the preceding scoping conversation):
- **Run/test/deps & Platform** — Next.js (React + Tailwind) on Fly.io; `pnpm`;
  Vitest via `pnpm test`. Current. This feature adds one more `app/` route and one
  client panel; it introduces **no** new runtime dependency (it reuses feature 2's
  `@anthropic-ai/sdk` + `zod`, already installed).
- **Frozen classifier contract (feature 2)** — `src/types.ts` (`ClassificationInput`,
  `Prediction`, `Classify`) and `src/classify.ts` (`createAnthropicClassifier`),
  `src/anthropic.ts` (`createRunStructured`), `src/dataset.ts` (`loadSubset` →
  `Subset.vocabulary`), read directly this session. This feature **consumes** these
  unchanged; it adds no field and changes no shape.
- **Server-route / key-isolation pattern (feature 3)** — `app/api/run/route.ts` and
  `features/dashboard-per-run-results-3/tests/key-isolation.test.ts`, read this
  session. The new route is the second member of the "reads the key, imports the SDK,
  manually validated, never imported by tests" set; the key-isolation guard already
  scans **all** of `app/` for client-component SDK imports, so it covers the new panel
  automatically. This feature extends that guard with one new attack surface
  (rationale-as-HTML / `dangerouslySetInnerHTML`).
- **Curated subset (feature 1)** — `docs/apparel-subset.csv`, loaded by the route via
  `loadSubset` solely to obtain the **closed vocabulary** (the same article-type set
  the scored demo constrains to). Its corpus contract is irrelevant here (no
  corruption, no sampling); only `Subset.vocabulary` is used.
- **AI integration / Security (constitution → OWASP Top 10, OWASP Top 10 for LLMs;
  user globals)** — `ANTHROPIC_API_KEY` read server-side only, never shipped to the
  browser, never required by the automated suite. Current.
- No external precedent repos listed in CLAUDE.md; none consulted.

**Standards-creep check.** This feature engages WCAG (a new form control) and the
HTTP-surface OWASP items (a new route that accepts **user free-text** — the first such
surface in the project; the scored demo had only a Run trigger). The owner decided (in
the scoping conversation) to apply **core WCAG 2.1 AA** — a labeled input, a
keyboard-operable submit with a visible focus state, AA contrast on the dark theme, and
an `aria-live` region announcing the async result/decline/error — verified by markup
review, **not** a full automated audit (the full sweep stays deferred to #7). HIG does
not apply (web). Rate limiting stays **#6**, not here (named as an accepted, unmitigated
gap below).

## Decisions (settled with owner)
| Decision | Value |
|----------|-------|
| Input | **Name only.** The visitor supplies one free-text product name; it becomes `productDisplayName`. Every other `ClassificationInput` field is the empty string, and the shown `articleType` is `""` (there is no vendor label to correct — the model classifies from the name). |
| Prediction space | **Closed vocabulary, unchanged.** The prediction is constrained to the subset's article types via the existing structured-output enum — provably the same classifier as the scored demo. No schema change. |
| Transport | **Plain `POST` → JSON.** One classification has nothing to stream incrementally; no SSE. The route returns a single JSON result. |
| Input validation | **Trim surrounding whitespace first, then validate the trimmed text** — reject **before any model call** if it is empty or longer than a fixed reasonable bound. Surrounding whitespace never counts toward the bound (the length cap bounds the *actual payload sent*, per Story 6); a rejected input never reaches the LLM (cost + injection-surface protection). |
| Off-distribution handling | **Confidence gate.** A `low`-confidence prediction is surfaced as a **decline** ("doesn't look like something we can classify"), not as a forced article type. `medium` / `high` are shown as a classification. The gate lives entirely in the new app-layer seam — the closed-vocabulary classifier contract is untouched. |
| Accepted limitation | The confidence gate conflates *off-distribution* and *genuinely-apparel-but-ambiguous*: a real apparel item the model is merely unsure about also declines, and a non-apparel item the model maps **confidently** is **not** caught. Accepted for a demo — declining beats confidently mislabeling — and named here so it is not a surprise. |
| Key handling | `ANTHROPIC_API_KEY` read inside the new server route only; SDK client and `src/anthropic.ts` imported only there. Never in a client component, never in the test import graph. |
| Rationale rendering | The model's free-text `rationale` is rendered as **text, not markup** — no `dangerouslySetInnerHTML` — so injected content in a product name cannot become executable HTML. |

---

## Behavioral requirements

### Story 1 — Classify my own product name
*As a non-technical peer handed a forwarded link, I want to type a product name and
see the classifier place it, so I can test the method on an example I care about.*

Acceptance criteria:
- The page presents a labeled single-line text input and a submit control. Submitting
  a non-empty name starts exactly one classification against the server route; while
  it is in flight the submit control is busy/disabled so a second concurrent request
  cannot be started from the same view.
- On success, the panel shows: the predicted `articleType`, the confidence level, and
  the rationale — and the product name that was classified, so the result is legible
  on its own.
- The prediction is produced by the same Anthropic-backed `classify` the scored demo
  uses, constrained to the **same closed vocabulary** (the subset's article types).
- After a result (success, decline, or error) the submit control returns to an idle,
  re-submittable state.

### Story 2 — Name-only, server-authoritative, no invented scoring
*As the owner staking credibility on honesty, I need the panel to classify from the
product name alone and to claim nothing it cannot back.*

Acceptance criteria:
- The `ClassificationInput` handed to `classify` carries the visitor's text as
  `productDisplayName` and the **empty string** for every other field including
  `articleType` — the model is given only the name, no other attributes and no label
  to anchor on.
- The panel shows **no** correct/incorrect mark and **no** accuracy figure (there is no
  ground truth for a user-supplied name).
- The predicted `articleType`, confidence, and rationale shown are exactly the
  classifier's returned `Prediction` — the client invents none of them.

### Story 3 — Bad input is rejected before any model call
*As the operator paying per LLM call, I need junk input turned away cheaply, so an empty
box or a pasted essay never bills a classification.*

Acceptance criteria (the single-classify seam, given an injected `classify`):
- The name is **trimmed of surrounding whitespace first**; every subsequent check (and
  the value handed to `classify`) operates on the trimmed text.
- An empty or whitespace-only product name (i.e. empty after trim) is rejected as
  **invalid**; `classify` is **not** called.
- A product name whose **trimmed** length exceeds a fixed reasonable bound is rejected as
  **invalid**; `classify` is **not** called. Surrounding whitespace does not count toward
  the bound — a within-bound name padded with spaces is accepted and classified on its
  trimmed value.
- A rejection carries a clear, non-empty reason and is distinguishable from a
  successful classification and from an off-distribution decline.

### Story 4 — Off-distribution input is declined, not mislabeled
*As the owner, when someone types something that isn't apparel, I want the panel to say
so rather than confidently assign a shirt type.*

Acceptance criteria (the single-classify seam):
- When the classifier returns a `low`-confidence prediction, the seam yields a
  **declined** result carrying a clear, non-empty reason — **not** a classification,
  and **not** the predicted article type as if it were trusted.
- When the classifier returns `medium` or `high` confidence, the seam yields a
  **classified** result carrying the full `Prediction`.
- The decline is produced without any change to the closed-vocabulary classifier: it is
  a decision over the returned `Prediction`, downstream of `classify`.

### Story 5 — The key stays on the server
*As the operator, the LLM credential must live only on the server so a public link can
never leak it and the test suite never needs it.*

Acceptance criteria:
- `ANTHROPIC_API_KEY` is read only inside the new server route; the Anthropic SDK client
  and `src/anthropic.ts` are imported only from server-side code.
- No client component under `app/`, and no file under any `tests/` directory, imports
  `src/anthropic.ts` or constructs the SDK client; the automated suite runs with no SDK
  runtime dependency, no network, and no API key.
- A request that arrives with no configured key fails closed with a clear, non-2xx error
  (never a silent hang, never a key value reaching the browser).

### Story 6 — Injected free-text cannot execute or escape the vocabulary
*As the owner exposing the first user-text-into-LLM surface, I need a hostile product
name to stay inert.*

Acceptance criteria:
- The predicted `articleType` is constrained to the closed vocabulary by the existing
  structured-output enum, so no product-name content can make the model emit a label
  outside the known set. (Inherited from feature 2's adapter; this feature does not
  weaken it.)
- The model's `rationale` is rendered to the page as **text, not HTML/markup** — no
  `dangerouslySetInnerHTML` is used for any model-derived string — so a product name
  containing markup cannot become executable DOM.
- The length bound (Story 3) caps the size of any injected payload reaching the prompt.

### Story 7 — Core accessibility for the panel
*As a peer using a keyboard or a screen reader, I need the panel operable and legible.*

Acceptance criteria (verified by markup review, not an automated audit):
- The text input has an associated visible label; the submit control is keyboard-
  operable with a visible focus indicator.
- Text and the result meet WCAG 2.1 AA contrast on the dark theme.
- The async outcome (classified / declined / error / in-flight) is announced via an
  `aria-live` status region so a screen-reader user learns the result without polling.

### Edge cases & failure modes
- **Empty / whitespace-only input** — Story 3: rejected as invalid, no model call.
- **Over-length input** — Story 3: rejected as invalid, no model call.
- **Classifier rejects / errors** — the seam propagates the rejection (fail-fast, the
  same posture as feature 2); the route maps it to a clear non-2xx error and the panel
  shows a visible error + retry. No partial or fabricated result is shown.
- **Low-confidence (off-distribution) result** — Story 4: declined with a reason, never
  a forced label.
- **Confidently-wrong off-distribution result** — accepted limitation (Decisions): a
  non-apparel item the model maps with `medium`/`high` confidence is shown as a
  classification; the confidence gate does not catch it. Named, not mitigated.
- **Missing/blank `ANTHROPIC_API_KEY`** — Story 5: fail closed with a clear error.
- **Double-submit** — a second request cannot be started while one is in flight from the
  same view (Story 1).
- **No rate limiting** — out of scope by roadmap sequencing: #6 ("Go public safely")
  pairs per-IP rate limiting **with** the Fly deploy, so this endpoint is never
  publicly exposed before its limiter exists. Until #6 the app runs only locally;
  this feature must not preclude the limiter (it adds a plain route #6 can wrap). Not
  an acknowledged-risk row — the mitigation is the next roadmap item, not a deferral.

### Out of scope
See feature `declaration.md`. Notably: no rate limiting / deploy (#6), no narrative copy
(#7), no scoring / ground-truth / accuracy, no streaming, no persistence, and **no
change** to feature 2's frozen shapes or its corruption / scoring / leak-prevention
logic.

---

## Design

### Components & seams
Seams are named at the level a test must observe behavior. `@frozen` marks a real
contract `/build` must satisfy as written (an externally-observable behavior or the
JSON/result shape the route and panel exchange); `@scaffolding` marks a surface named
ahead of `/build` that may be re-sited as long as the asserted behavior holds (logged in
`build-deviations.md`). The split mirrors features 2–3: **the pure, SDK-free decision
logic is in the headless bar; the thin shells that touch the SDK, the key, the DOM, and
the network are validated manually.**

- **Single-classify seam** *(`@scaffolding` surface, `@frozen` behavior + result shape)*
  — a pure, SDK-free function that, given `{ productName, vocabulary, classify }`,
  validates the name, builds the name-only `ClassificationInput`, calls the injected
  `classify` with the closed vocabulary, applies the confidence gate, and returns a
  **`SingleClassifyResult`**. Substance (re-sitable name): `classifyOne({ productName,
  vocabulary, classify }): Promise<SingleClassifyResult>`. Behavioral properties:
  - **Validation short-circuits the model.** Empty / whitespace-only / over-length input
    returns an `invalid` result *without* calling `classify` (asserted via a spy that
    records call count) — Story 3.
  - **Name-only, leak-free input.** The `ClassificationInput` passed to `classify` has
    `productDisplayName` = the trimmed name and `""` for every other field including
    `articleType` — Story 2. (There is no true type or `subCategory` to leak: those
    fields are absent from `ClassificationInput` by type.)
  - **Closed vocabulary forwarded.** The `vocabulary` argument is passed through to
    `classify` unchanged, so the enum constraint is never dropped — Story 1/6.
  - **Confidence gate.** `low` → `declined` (with a reason); `medium`/`high` →
    `classified` (carrying the `Prediction`) — Story 4.
  - **Fail-fast.** A rejecting `classify` causes `classifyOne` to reject; it does not
    swallow the error or fabricate a result — edge case.
  - **Result shape** *(`@frozen`)* — `SingleClassifyResult` is a discriminated union the
    route serializes to JSON and the panel renders, so its discriminant + payloads are a
    real contract:
    - `{ status: "classified"; prediction: Prediction }`
    - `{ status: "declined"; reason: string }`
    - `{ status: "invalid"; reason: string }`
    The `reason` strings are user-facing but their **wording** is copy (not asserted
    verbatim — that is #7); only their presence/non-emptiness and the discriminant are
    frozen.

- **Input bound** *(`@frozen` property, `@scaffolding` exact value)* — a fixed maximum
  product-name length lives in the same SDK-free module as the seam so a test can read it
  without importing the route. Behavioral property: the value is a positive integer, an
  input at/under it is accepted by validation and one above it is rejected. The exact
  number (order of a couple hundred characters — long enough for any real product name,
  short enough to bound prompt-injection payload and token cost) is `@scaffolding`.

- **Server route** *(`@scaffolding` shell; manually validated, NOT in the test import
  graph)* — the Next.js route handler (substance: `app/api/classify/route.ts`),
  `POST` with a JSON body carrying the product name. It is the **only** new module that
  reads `ANTHROPIC_API_KEY`, constructs the Anthropic SDK client, builds the live
  `classify` via `createAnthropicClassifier(createRunStructured(client))`, loads the
  subset via `loadSubset(docs/apparel-subset.csv)` to obtain `vocabulary`, calls
  `classifyOne`, and returns the `SingleClassifyResult` as JSON. Status mapping (a route
  concern, validated by running the app): `invalid` → 400, `classified`/`declined` →
  200, a `classify` rejection or missing key → a clear non-2xx error body. Because it
  imports `src/anthropic.ts` and the SDK, **no test imports it** — validated by running
  the app, exactly as features 2–3 validated their SDK shells.

- **Single-record panel** *(`@scaffolding` shell; manually validated)* — the React client
  component: the labeled input, the submit control, the busy/disabled state, the result
  display (classified → type + confidence + rationale + the classified name; declined →
  the decline reason; error → a visible error + retry), and the `aria-live` status
  region. It `POST`s the name, parses the `SingleClassifyResult`, and renders it. It
  renders every model-derived string (the rationale especially) as **text** — no
  `dangerouslySetInnerHTML`. The DOM, the fetch wiring, and the WCAG markup are validated
  by running the app and by markup review (Story 7), not in the headless bar (which would
  need a jsdom + testing-library stack disproportionate to one input + one result).

### Manual validation (route + panel — outside the headless bar)
The server route and the React panel are validated by running the app (`pnpm dev`), the
same way features 2–3 validated their SDK/DOM shells. `/build` must walk this checklist
and record the outcome in `build-deviations.md`; each item maps to an acceptance
criterion with no executable test by design:
- **Happy path** (S1/S2) — typing a real product name (e.g. "Nike running shorts")
  returns a predicted type + confidence + rationale, constrained to the subset
  vocabulary; the classified name is shown; no ✓/✗ or accuracy appears; the control
  returns to idle.
- **Decline** (S4) — an off-distribution input that yields `low` confidence shows the
  decline message, not a forced article type.
- **Invalid input** (S3) — empty submit is prevented client-side and, if forced, the
  route returns 400 with no model call; a pasted over-length string is rejected.
- **Missing/blank `ANTHROPIC_API_KEY`** (S5) — with no key configured, the request fails
  closed with a clear non-2xx error and a visible error state, never a silent hang and
  never a key value reaching the browser (verify via devtools network + page source).
- **Mid-request failure** (edge) — when `classify` errors, a visible error + retry
  appears and no fabricated result is shown.
- **Injection inertness** (S6) — a product name containing HTML/markup (e.g.
  `<img src=x onerror=alert(1)>`) renders as inert text in the result/rationale, never
  executes, and the predicted type is still a vocabulary value.
- **Core WCAG** (S7) — keyboard-only operation with a visible focus ring; a labeled
  input; an `aria-live` region announcing classified/declined/error; AA contrast on the
  dark theme.

### Seam properties (what must hold, not how)
- **Cheap rejection** — validation precedes the model: junk input never reaches
  `classify` (asserted by a spy call count of 0).
- **Same classifier, name only** — `classifyOne` forwards the closed vocabulary unchanged
  and builds a name-only `ClassificationInput`; it reuses feature 2's `Classify` seam and
  invents no parallel classification path.
- **Decline ≠ classification** — the confidence gate yields a distinct `declined` result;
  a declined result never carries a trusted article type as if it were the answer.
- **Fail-fast honesty** — a rejecting `classify` propagates; no partial/fabricated result.
- **Key isolation** — the SDK/key surface is confined to the new route and never enters
  the test import graph (a structural guarantee, asserted by the existing import-graph
  guard, which already scans all of `app/`).
- **Inert free-text** — model-derived strings are rendered as text; the closed-vocabulary
  enum bounds the predicted label regardless of input (structural guard + manual check).

### Pattern reuse
- **Classifier** — *Reuses pattern:* feature 2's `createAnthropicClassifier` /
  `createRunStructured` adapter pair and the frozen `ClassificationInput` / `Prediction`
  shapes, wholesale. The only new logic is validation + the confidence gate; the LLM call
  itself is unchanged.
- **Vocabulary source** — *Reuses pattern:* `loadSubset(docs/apparel-subset.csv)` →
  `Subset.vocabulary` (feature 1/2), the same closed set the scored demo constrains to.
- **Server-route / key-isolation** — *Reuses pattern:* feature 3's "route reads the key,
  imports the SDK, manually validated, never imported by tests" structure; the
  `key-isolation` guard already scans all of `app/`, so the new route + panel are covered
  with **no** change to its scan. This feature only **adds** the rationale-as-HTML guard.
- **Test runner** — reuses the established Vitest/TS wiring (constitution `## Testing`);
  any test reading a repo file resolves it from the test file's own location via
  `fileURLToPath(import.meta.url)`, never an absolute path. No new runner, no new wiring.
- **SDK-free test seam pattern** — reuses features 2–3's split: the decision seam
  (`classifyOne`) is SDK-free and unit-tested; the route is the new member of the
  "manually validated, never imported by tests" set.

### Standards
- **OWASP Top 10 / Top 10 for LLMs** — key server-side only and out of tests (Story 5);
  the first user-free-text-into-LLM surface is bounded by the closed-vocabulary enum
  (output can't escape the known set), a length cap (payload size), and text-only
  rendering of model output (no HTML execution) — Story 6. Input validation rejects junk
  before the model. No injection-driven label escape and no stored/reflected XSS path.
- **WCAG 2.1 AA (core)** — Story 7: labeled input, keyboard + visible focus, AA contrast,
  `aria-live` for the async result. Full audit deferred to #7 (owner decision).
- **Quality gate (constitution)** — Vitest does not type-check the Next build, so the
  production build (`pnpm build` / `tsc`) must pass as part of the bar (CI wiring lands
  with #6). `.env.example` already lists `ANTHROPIC_API_KEY` (feature 2) — no new secret.

---

## Coverage

| Requirement / seam | Test(s) | Tag |
|--------------------|---------|-----|
| S3: empty / whitespace-only → `invalid`, `classify` NOT called | `single-classify.test.ts` → empty rejected, no model call | @frozen |
| S3: over-length (raw) → `invalid`, `classify` NOT called | `single-classify.test.ts` → over-length rejected, no model call | @frozen |
| S3: valid name is trimmed before classify | `single-classify.test.ts` → trimming | @frozen |
| S3: trim FIRST — whitespace-padded within-bound name is accepted on its trimmed value | `single-classify.test.ts` → trims first, length on trimmed text | @frozen |
| S3: a name whose TRIMMED length exceeds the bound → `invalid`, no model call | `single-classify.test.ts` → trimmed-length over bound rejected | @frozen |
| S3: `invalid` carries a non-empty reason, distinct from classified/declined | `single-classify.test.ts` → result discriminant | @frozen |
| S2: input to `classify` is name-only (productDisplayName = name; all other fields "", articleType "") | `single-classify.test.ts` → name-only input | @frozen |
| S1/S6: closed `vocabulary` forwarded to `classify` unchanged | `single-classify.test.ts` → vocabulary forwarded | @frozen |
| S4: `low` confidence → `declined` (reason, not a classification) | `single-classify.test.ts` → low declines | @frozen |
| S4: `medium`/`high` → `classified` carrying the `Prediction` | `single-classify.test.ts` → confident classifies | @frozen |
| S2: `classified` carries exactly the returned `Prediction` (type/confidence/rationale) | `single-classify.test.ts` → prediction passthrough | @frozen |
| Edge: a rejecting `classify` propagates (fail-fast), no fabricated result | `single-classify.test.ts` → fail-fast | @frozen |
| Input bound: positive integer; at/under accepted, above rejected | `single-classify.test.ts` → bound property | @scaffolding |
| S5: no `tests/` file and no headless seam imports the SDK or real adapter; no client component under `app/` does | `key-isolation.test.ts` (feature 3, scans all `app/` + `src` + `features`) | @frozen |
| S6: no `dangerouslySetInnerHTML` anywhere under `app/` (rationale renders as text) | `no-raw-html.test.ts` → app/ scan | @frozen |
| S5: missing/blank key fails closed (route) | manual validation (no executable test by design) | — |
| S1/S2/S4/S6/S7: route status mapping, panel rendering, injection inertness, WCAG | manual validation checklist | — |

`@scaffolding` marks surfaces named ahead of `/build` that may be re-sited as long as the
asserted behavior holds: the `classifyOne` *name and call shape* and the exact length
bound. The **`SingleClassifyResult` discriminated union** (statuses + payloads), the
**validation / confidence-gate / fail-fast behavior**, the **name-only input**, the
**vocabulary forwarding**, and the **key-isolation / no-raw-HTML** guards are `@frozen` —
they are the contract the route and panel inherit. The **route, the React panel, the
fetch wiring, and the WCAG markup are validated manually** by running the app — the
SDK/DOM/network shells, kept out of the headless bar by design (same reason
`src/anthropic.ts` is not unit-tested). Tests that read repo files
(`key-isolation.test.ts`, `no-raw-html.test.ts`) resolve them from the test file's own
location.

---

## Adversarial gate

**Mode:** independent clean-context sub-agent (`general-purpose`), one pass. The gate read
both declarations, this spec, both test files, and the inherited feature-2/3 contracts it
reuses. It explicitly **cleared** the security-critical surfaces: the confidence-gate
limitation is honestly characterized (a confidently-wrong non-apparel item escapes the
gate — named, not hidden); injection inertness (closed-vocab enum + length cap + text-only
rationale rendering) is sufficient for the named XSS/label-escape vectors and the
`no-raw-html` guard is real coverage, not theater; the name-only input is leak-free by
type; the tests assert behavior (result discriminant, spy call-count, forwarded vocabulary,
prediction passthrough), not implementation shape, with `@frozen`/`@scaffolding` tags
honestly applied; the manual route/panel deferral matches the features 2–3 precedent; and
the WCAG-core-now / full-audit-#7 split is honest. It returned **one MEDIUM and two LOWs**
— no HIGH and no security-lens finding, so no re-gate was triggered.

| # | Severity | Lens | Finding | Disposition |
|---|----------|------|---------|-------------|
| 1 | MEDIUM | Coverage | Story 3 required both "trim before classify" and "reject over-length" but never pinned the **order**, and the single over-length test used a no-whitespace string, so it passed identically whether length was measured on the raw or trimmed text. Failure mode: a within-bound product name pasted with surrounding spaces could be wrongly rejected (or a whitespace-padded payload could slip a post-trim check), with no test to catch the choice. | **Fixed** (owner chose *trim first, then check*). Decisions → Input validation and Story 3 now specify: trim first; emptiness and the length bound are checked on the **trimmed** text; surrounding whitespace never counts toward the bound (aligning the cap with Story 6's "bound the actual payload" intent). Two `@frozen` tests added to `single-classify.test.ts`: a whitespace-padded within-bound name is accepted and classified on its trimmed value; a name whose *trimmed* length exceeds the bound is rejected with no model call. |
| 2 | LOW | Tests | `no-raw-html.test.ts` anti-vacuous anchor (`appFiles.length > 2`, a `page.tsx` exists) is satisfied by the pre-existing feature 3–4 `app/` tree, so it can't signal that feature 5's panel actually shipped. | **Proceeded.** The `dangerouslySetInnerHTML` scan itself reads every `app/` file and still catches a real offender; the "did the panel ship" signal is owned by the manual-validation checklist by design. No behavioral gap. |
| 3 | LOW | Integrity | A comment in the inherited `key-isolation.test.ts` ("the page owns EventSource state") describes feature 3's SSE page, not feature 5's plain-POST panel. | **Proceeded.** The file is already merged on `main`; its guard *logic* is correct and sufficient for this feature (a client component must not import the SDK/adapter; the panel only `fetch`es the route). Editing a merged test for a documentation-only drift is out of scope here. No behavioral gap. |

No findings were acknowledged, so constitution.md's `## Acknowledged risks` table gains no
row from the gate. (See the standing **no rate limiting until #6** gap in Edge cases —
that is an inherited roadmap sequencing decision, not a gate finding, and is not added as
an acknowledged-risk row here.)
