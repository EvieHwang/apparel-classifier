# Spec — Go public safely (feature 6)

Makes the demo a safe public link: two abuse guards on the LLM endpoints and a
durable, health-gated Fly.io deploy. Builds on features 2–5 unchanged; adds the
**Rate limiter** Shape and the deploy/runtime infrastructure named in Roadmap #6.

## Ground-truth check
Leans on these CLAUDE.md / constitution sections, all project-authored and current
(no precedent repos listed to read):
- CLAUDE.md → **Deployment target (Fly.io)** — one app per repo, `fly.toml` at root,
  GitHub Actions `flyctl deploy` on push to `main`, health-checked release,
  `ANTHROPIC_API_KEY` via `fly secrets`.
- CLAUDE.md → **Secrets** — 1Password → GitHub Actions secrets → `fly secrets`;
  `.env.example` lists every key with no values; never commit `.env`.
- constitution → **Architectural principles** — deploys run through GitHub Actions on
  push to `main`; prefer first-class `flyctl deploy` over SSH.
- constitution → **Quality gates** — `.env.example` lists every injected key (no
  drift); CI runs the production build when the test runner doesn't type-check.

## Standards-creep note
WCAG 2.1 AA applies to the project, but this feature adds only two machine-readable
error responses (`429`/`503`) plus a one-line human message each. Full accessibility
sign-off of the rendered error states belongs to the dashboard and the narrative pass
(#7); this feature absorbs only the minimum — each refusal carries an intelligible
human sentence alongside its machine fields. Not a deviation, just a scoped boundary.

---

## Behavioral requirements

### Story 1 — A normal visitor is served (under the cap)
**As** anyone opening the public link, **I want** to trigger runs and single
classifications, **so that** I can see the demo work.
- **AC1.** Up to the per-IP limit of LLM-invoking requests per rolling window across
  the two endpoints (`GET /api/run`, `POST /api/classify`) are admitted and behave
  exactly as features 3/5 specify.
- **AC2.** `GET /api/cumulative` and `GET /api/health` are **never** gated by the rate
  limiter — a visitor who has exhausted their LLM budget can still load the page and
  read the cumulative number.

### Story 2 — A hammering client is capped (per-IP)
**As** the operator, **I want** any single client throttled, **so that** one abuser
can't run up the Anthropic bill.
- **AC1.** Once a client has consumed its per-IP budget within the current window, the
  next LLM-invoking request is refused with HTTP **429** and a `Retry-After` header
  whose value is a positive integer number of seconds no greater than the window
  length.
- **AC2.** A refused request makes **zero** model calls and consumes **no** further
  budget (it is already over the limit).
- **AC3.** When the window elapses, the client's budget is restored and requests are
  admitted again.
- **AC4.** The client identity is the **Fly-supplied client IP** (`Fly-Client-IP`),
  not a client-controllable forwarded header (see Story 5).

### Story 3 — Total spend is bounded (global circuit-breaker)
**As** the operator, **I want** an app-wide ceiling, **so that** a swarm of distinct
IPs each under the per-IP cap still can't run up the bill.
- **AC1.** Once the app-wide ceiling of LLM-invoking requests for the current window is
  reached, **every** further such request is refused with HTTP **503** and a
  `Retry-After` header (positive integer seconds ≤ window length) — including for a
  client that has used none of its own per-IP budget.
- **AC2.** When the global window elapses, the ceiling resets.
- **AC3.** The global ceiling is checked **before** the per-IP cap, so a tripped global
  breaker yields `503` even for a fresh IP (the refusal is the app's, not the
  client's).
- **AC4.** A globally-refused request makes zero model calls and consumes no budget
  (neither the global counter nor the per-IP counter advances on a refusal).

### Story 4 — The app deploys durably and health-gated
**As** the operator, **I want** push-to-`main` to deploy to Fly and fail loudly if the
app isn't actually serving, **so that** "deployed" means "serving."
- **AC1.** A GitHub Actions workflow triggers on push to `main`, runs `flyctl deploy`
  authenticated by the `FLY_API_TOKEN` Actions secret.
- **AC2.** The release is health-gated: `fly.toml` declares an HTTP health check
  against the health path, so `flyctl deploy`'s rolling strategy fails (non-zero exit →
  failed job) if the new machine never passes the check. A deploy that issues but
  doesn't serve fails the job. (Per CLAUDE.md: declaring the check is what makes a
  zero exit mean "serving"; an optional post-deploy probe in the workflow is
  belt-and-suspenders, not the primary gate.)
- **AC3.** `GET /api/health` returns `200` **without** calling the LLM and **without**
  requiring `ANTHROPIC_API_KEY` — it measures "is the app up," so a key
  misconfiguration is surfaced by a failing run, not a failing health check.

### Story 5 — The client IP can't be spoofed to mint identities
**As** the operator, **I want** the per-IP key derived from a header the client can't
forge, **so that** the cap can't be trivially bypassed.
- **AC1.** When `Fly-Client-IP` is present, it determines the per-IP key; the value of
  `X-Forwarded-For` does **not** override it.
- **AC2.** When `Fly-Client-IP` is absent (e.g. local dev), requests differing only in
  `X-Forwarded-For` resolve to the **same** key — a forged `X-Forwarded-For` cannot
  expand the budget by minting new identities.
- **AC3.** Distinct `Fly-Client-IP` values resolve to distinct keys (real clients are
  still budgeted independently).

### Story 6 — The cumulative tally survives a redeploy
**As** the operator, **I want** feature 4's number to persist across releases, **so
that** the stabilized accuracy isn't reset on every deploy.
- **AC1.** `fly.toml` declares a mounted, writable volume, and `CUMULATIVE_DB_PATH`
  points at a path **under that volume's mount destination**, honoring the contract
  feature 4 named. The cumulative DB file therefore survives a redeploy.

### Story 7 — No secret leaks
- **AC1.** `ANTHROPIC_API_KEY` is delivered via `fly secrets`, never baked into the
  image (`Dockerfile`/`fly.toml` carry no secret value) and never returned in any
  response.
- **AC2.** `.env.example` lists every key the app/workflow needs
  (`ANTHROPIC_API_KEY`, `CUMULATIVE_DB_PATH`) with no values; no key the deploy injects
  is missing from it (no drift).

### Edge cases & failure modes
- **Refusal precedence.** Global breaker is evaluated before the per-IP cap (Story 3
  AC3). A request that would trip both is reported as `503`/global.
- **No-consume-on-refusal.** Refusals (429 or 503) never advance either counter
  (Story 2 AC2, Story 3 AC4), so an over-budget client retrying doesn't permanently
  poison the global counter.
- **`/api/run` refusal must not open the SSE stream.** A refused run returns a plain
  `429`/`503` response with `Retry-After` *before* any `text/event-stream` is started —
  not an SSE `error` frame inside a 200 stream. (Manual validation: the route consults
  the limiter before constructing the Anthropic client.)
- **Window boundary.** `Retry-After` is always ≥ 1 second and ≤ the window length;
  at a window boundary the next window starts fresh (count 0).
- **Missing Fly header in production** would collapse all traffic to one shared bucket
  (fail-safe: over-restrictive, never over-permissive). Acceptable; Fly always sets the
  header in production.
- **Health under missing key.** `/api/health` returns `200` even with
  `ANTHROPIC_API_KEY` unset (Story 4 AC3).

### Out of scope
Accounts/auth/CAPTCHA/WAF/CDN; multi-machine shared-state limiting (in-process counters
are correct only because the volume pins the app to one machine — acknowledged
boundary); cost-weighted or per-endpoint budgets (a run and a single classify each cost
1); runtime-tunable limits or an admin surface; automating secret provisioning into
1Password/GitHub; the narrative copy pass (#7); any change to a frozen shape, to
corruption/scoring/leak-prevention logic, to feature 3's run-stream event sequence, or
to feature 4's store contract.

---

## Design

### Component 1 — `src/rate-limit.ts` (pure decision seam; SDK-free, test-imported)
A factory `createRateLimiter({ perIpLimit, perIpWindowMs, globalLimit, globalWindowMs,
now })` returning `{ admit(key) }`, where `now: () => number` is an **injected clock**
(production passes `Date.now`; tests pass a mutable fake). Counters are in-process: a
`Map<string, …>` of per-key fixed-window counts plus a single global fixed-window
count. Fixed-window semantics: a window index is `floor(now() / windowMs)`; when the
index advances, the relevant count resets to 0.

`admit(key)` returns a **`RateDecision`**:
- `{ ok: true }` — admitted; **both** the global and the per-key counters are
  incremented.
- `{ ok: false, scope: "global", retryAfterSeconds }` — global ceiling reached;
  nothing incremented.
- `{ ok: false, scope: "ip", retryAfterSeconds }` — per-key cap reached; nothing
  incremented.

Behavioral properties this seam must hold (the contract — the field/factory *names* are
scaffolding, the behavior is frozen):
- Admits at most `perIpLimit` per key per `perIpWindowMs`; the next is refused
  `scope:"ip"`.
- Admits at most `globalLimit` total per `globalWindowMs`; further requests refused
  `scope:"global"` regardless of key.
- **Precedence:** global checked first — a tripped global refuses even a never-seen key.
- **No consume on refusal:** a refused `admit` increments neither counter.
- **Reset:** after a window elapses (per the injected clock) budget is restored.
- `retryAfterSeconds` is an integer, `≥ 1`, `≤ ceil(windowMs / 1000)` for the relevant
  window.

`getRateLimiter()` — a process-wide singleton built from `src/rate-limit-config.ts`,
**Reuses pattern:** the `getCumulativeStore()` lazy-singleton in
`src/cumulative-sqlite.ts` (one shared instance across both routes, so the global
counter is genuinely app-wide). The singleton accessor imports the SDK-free seam only;
it is itself manually validated like the store accessor.

### Component 2 — `src/rate-limit-config.ts` (SDK-free constants; test-importable)
Holds `PER_IP_LIMIT`, `PER_IP_WINDOW_MS`, `GLOBAL_LIMIT`, `GLOBAL_WINDOW_MS`.
Recommended values (tunable — `@scaffolding`): `PER_IP_LIMIT = 10`,
`PER_IP_WINDOW_MS = 3_600_000` (≈10/hour, the declaration's figure);
`GLOBAL_LIMIT = 240`, `GLOBAL_WINDOW_MS = 3_600_000`. Rationale for the global value: a
run is `RUN_SIZE` (=12) model calls, so 240 admitted requests/hour bounds the worst case
near ~2,880 model calls/hour — generous for genuine demo traffic, hard-capped against a
swarm. Invariant the suite pins (not the exact numbers): all four are positive, and
`GLOBAL_LIMIT ≥ PER_IP_LIMIT` (a single client can never need more than the whole app).

### Component 3 — `src/client-ip.ts` (pure; SDK-free, test-imported) — **security-critical**
`clientKey(headers: Headers): string`. Returns the trustworthy per-IP key:
- If `Fly-Client-IP` is present and non-empty, the key derives from it.
- Otherwise a single fixed fallback key (shared bucket) — **never** derived from
  `X-Forwarded-For` or any other client-supplied header.
Security property (frozen): `X-Forwarded-For` never determines or overrides the key.
**Standards:** addresses OWASP "LLM10 unbounded consumption" / DoS by making the rate
key non-forgeable; without this the cap in Component 1 is bypassable.

### Component 4 — `src/rate-limit-response.ts` (pure; SDK-free, test-imported)
`rateLimitResponse(decision): Response` for a refused decision — maps
`scope:"ip"` → **429**, `scope:"global"` → **503**, sets the `Retry-After` header to
`retryAfterSeconds`, and returns a small JSON body carrying the machine `scope` and a
short human-readable message. Contains no secret or key material. (A web-standard
`Response` is built in `src/`; no Next/SDK import, so tests can import it.)

### Component 5 — Route wiring (manual validation; imports the SDK)
`GET /api/run` and `POST /api/classify` gain a gate **before** any model work:
compute `key = clientKey(request.headers)`, call `getRateLimiter().admit(key)`, and on
`!ok` return `rateLimitResponse(decision)` immediately — for `/api/run` this means the
`text/event-stream` is never started (plain 429/503), satisfying the "refusal doesn't
open the stream" edge case. On `ok`, proceed exactly as today.
**Reuses pattern:** features 2/3/5's "thin SDK route over SDK-free tested seams" — the
route stays manually validated (it imports `@anthropic-ai/sdk`), while every decision it
makes lives in a tested seam (Components 1–4). No test imports these routes.

### Component 6 — `app/api/health/route.ts` (new route; test-imported)
`GET` returns `200` with a tiny JSON body. Imports **nothing** from `@anthropic-ai/sdk`,
reads **no** `ANTHROPIC_API_KEY`, touches **no** limiter — so it is cheap, always
serving, and importable by tests. `fly.toml`'s health check targets this path; the
deploy job's gate depends on it.

### Component 7 — Deploy & runtime infra (manual validation; file-content contract tests)
**Reuses pattern:** constitution's fixed Fly deploy pattern (GitHub Actions →
`flyctl deploy`, health-gated). New files at repo root:
- **`Dockerfile`** — builds the Next.js app (standalone output) on a Node 22+ base
  (feature 4's store uses `node:sqlite`, Node 22+). No secret value embedded.
- **`fly.toml`** — app `apparel-classifier`; an `[http_service]` health check on the
  health path; a `[mounts]` volume with a `destination`; `CUMULATIVE_DB_PATH` set (via
  `[env]`, a non-secret path) to a path **under** that destination so feature 4's DB
  lands on the volume.
- **`.github/workflows/deploy.yml`** — `on: push: branches: [main]`; a job that runs
  `flyctl deploy` (or `superfly/flyctl-actions`) with `FLY_API_TOKEN` from Actions
  secrets. The declared health check makes a non-serving release fail the job.
- **`.env.example`** — already lists `ANTHROPIC_API_KEY` and `CUMULATIVE_DB_PATH`;
  keep in sync (no drift) — verified by a test.

The deploy files are validated by **content-contract tests** (the way feature 1's
`rationale.test.ts` asserts properties of a committed doc): they parse the committed
config and assert the contract-bearing facts above, not exact formatting.

---

## Coverage

| Requirement / seam | Test(s) |
|---|---|
| Story 1 AC1 (under-cap admit), Story 2 AC1/AC3 (cap → refuse, reset), AC2 (no-consume) | `rate-limit.test.ts` |
| Story 3 AC1–AC4 (global ceiling, precedence, reset, no-consume) | `rate-limit.test.ts` |
| `retryAfterSeconds` bounds (≥1, ≤ window) | `rate-limit.test.ts` |
| Config invariants (positive, `GLOBAL_LIMIT ≥ PER_IP_LIMIT`) | `rate-limit.test.ts` |
| Story 5 AC1–AC3 (Fly-Client-IP wins, XFF can't mint/override, distinct IPs distinct) | `client-ip.test.ts` |
| Story 2 AC1 / Story 3 AC1 status + `Retry-After` mapping; no secret in body | `rate-limit-response.test.ts` |
| Story 4 AC3 (health 200 without LLM/key); health route imports no SDK, reads no key | `health.test.ts` |
| Story 1 AC2 (cumulative/health ungated) | covered by design (those routes never call the limiter) + `health.test.ts` (health has no limiter import) |
| Story 4 AC1/AC2 (workflow: push-main, flyctl deploy, FLY_API_TOKEN, health-gate) | `deploy-config.test.ts` |
| Story 6 AC1 (volume mount + `CUMULATIVE_DB_PATH` under destination) | `deploy-config.test.ts` |
| Story 7 AC1 (no baked secret) / AC2 (`.env.example` no drift, no values) | `deploy-config.test.ts` |
| Story 1 AC1 unchanged feature-3/5 behavior; `/api/run` refusal doesn't open stream | Manual validation (SDK routes), per the design |

Manual-validation checklist handed to `/build` (the SDK/Fly surfaces kept out of the
headless bar): **(a) [MANDATORY — highest-consequence] a refused `/api/run` returns a
plain 429/503 with `Retry-After` and never starts an SSE stream.** This is the one
load-bearing ordering in an un-tested route: the limiter gate MUST run before the
Anthropic client is constructed and before any `ReadableStream`/`text/event-stream`
response is started (today's route builds the stream unconditionally — that order must
change). A refusal emitted as an SSE `error` frame inside a 200 stream violates the
spec; `/build` must verify this by hand, not treat it as best-effort.
(b) an admitted run/classify still streams/returns exactly
as before; (c) `fly secrets set ANTHROPIC_API_KEY` makes a live run work; (d) the
cumulative number survives an actual redeploy; (e) the deploy job fails when the app
fails its health check.

---

## Adversarial gate

Mode: independent clean-context sub-agent (general-purpose), run once against the
drafted spec and tests. Platform is web, so the Apple HIG lens was skipped. No security
HIGH/MEDIUM finding was raised, so no security re-gate was triggered.

| # | Severity | Lens | Finding | Disposition |
|---|----------|------|---------|-------------|
| 1 | MEDIUM | Coverage (tests) | Global-refusal no-consume (Story 3 AC4) was untested — only the *ip*-scope no-consume was pinned; a `/build` that bumps the global counter before the ceiling check would stay green and could poison the retrying key's per-IP count. | **Fixed** — added "a globally-refused request consumes NO budget" test to `rate-limit.test.ts` (short global window / long per-IP window isolates the observation). |
| 2 | LOW | Spec | "Refused `/api/run` must not open the SSE stream" was assigned to manual validation only — the one load-bearing call-ordering in an un-tested route. | **Fixed** — checklist item (a) marked MANDATORY / highest-consequence with the explicit gate-before-stream ordering `/build` must verify. |
| 3 | LOW | Tests | `deploy-config.test.ts` asserted `/api/health` appears *somewhere* in `fly.toml`, not that it's declared as a check — a commented mention would pass, leaving the health gate (Story 4 AC2) unmet. | **Fixed** — assertion tightened to require `path = "/api/health"` on a non-comment line plus a `check` block. |
| 4 | LOW | Tests | `health.test.ts` calls `GET()` zero-arg, implicitly locking a signature; reviewer found no failure mode (Next route handlers legitimately omit the request arg). | **Proceeded** — no change; Next handlers may omit the request and the test works as written. |

Acknowledged risks: none (no finding was acknowledged; the in-process single-machine
limiter boundary is documented in the declaration/spec as scope, not taken as a gate
risk). constitution.md's `## Acknowledged risks` table is unchanged.
