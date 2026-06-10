# Build deviations — Go public safely (feature 6)

The honest record of where the build diverged from the spec's *design* (a
recommendation, not a contract) and the two test corrections made. **No `spec.md`
requirement was changed.** Every `@scaffolding` surface the tests named —
`createRateLimiter` / `getRateLimiter`, the `RateDecision` field names
(`ok` / `scope` / `retryAfterSeconds`), `clientKey`, `rateLimitResponse`, the
`rate-limit-config.ts` constant names, and the `app/api/health/route.ts` path — was
implemented under the exact name and shape the tests named, so the headless bar passed
against the suite as written (after the two corrections below).

## Test corrections

### 1. `rate-limit.test.ts` — the global no-consume test used an impossible `globalLimit`

- **Test:** `rate limiter — global circuit-breaker (Story 3) > "a globally-refused request
  consumes NO budget — it does not poison the retrying key's per-IP count (AC4)"`. Tagged
  `@frozen behavior, @scaffolding surface`; this was the test the adversarial gate added
  (finding #1) to pin Story 3 AC4.
- **Original setup:** `perIpLimit: 2, perIpWindowMs: 1_000_000, globalLimit: 1,
  globalWindowMs: 1000`. It admitted `a` (filling the global ceiling of 1), observed `z`
  globally refused, advanced the clock one global window, then asserted `z` is admitted
  **twice** before a per-IP refusal on the third call.
- **Why it was wrong (a constraint built on a false assumption):** with `globalLimit: 1`,
  only **one** request can ever be admitted per global window. After the clock advance,
  the global ceiling resets to 0 but is still **1** — so `z`'s first post-reset call is
  admitted (global → 1) and its *second* is refused on **global** grounds (`scope:
  "global"`), never reaching the per-IP cap. The assertion `expect(rl.admit("z").ok)
  .toBe(true)` on the second post-reset call is therefore **unsatisfiable by any correct
  limiter** — confirmed by running the implemented seam: that one line was the sole
  failure (`expected false to be true` at line 154), every other rule-pinning assertion
  in the file passing. To observe "`z` gets exactly 2 admits, the 3rd is a *per-IP*
  refusal" — which is what proves the earlier global refusal consumed none of `z`'s
  per-IP budget — the **per-IP cap must be the binding constraint in the post-reset
  window**, which requires `globalLimit` strictly above `perIpLimit`.
- **Corrected to:** `globalLimit: 3` (above the per-IP cap of 2), with the global ceiling
  filled at the start by **three distinct keys** (`a`, `b`, `c`) instead of one, so `z` is
  still globally refused on its first attempt. Post-reset, `z` is admitted twice (global
  1, 2 — both below 3) and refused on the **third** with `scope: "ip"`, exactly as the
  test's own comments and final assertions intend.
- **Behavioral assertion preserved — nothing weakened:** the frozen behavior under test
  (a globally-refused request increments **neither** counter, so the refused key retains
  its full per-IP budget on retry) is asserted identically; the third post-reset call is
  still required to be the per-IP cap with `scope: "ip"`. Only the limiter *configuration*
  and the number of keys used to fill the global ceiling changed — the setup was made
  internally consistent so the assertion can actually exercise the behavior it claims to.
- **Spec-authoring lesson (for `/retro`):** when a test pins "a refused request consumes
  no budget" by advancing past one window to re-probe a *different* counter, the limit it
  re-probes against must be the binding one in that second window. A breaker limit set at
  or below the per-IP cap makes the global ceiling refuse first and the per-IP observation
  unreachable — the test then can't distinguish a correct implementation from the bug it
  guards. Set the non-target limit comfortably above the target one when isolating a
  counter, and trace the second window's arithmetic, not just the first.

### 2. `health.test.ts` — the literal SDK-package string tripped feature 3's frozen isolation guard

- **Test:** `GET /api/health > "never reads ANTHROPIC_API_KEY and never imports the
  Anthropic SDK (no key burn)"`. Tagged `@frozen behavior`.
- **The collision:** the test asserted the route source contains no SDK import via
  `expect(src).not.toContain("@anthropic-ai/sdk")` — embedding the **contiguous** package
  literal in the test file. Feature 3's frozen `key-isolation.test.ts` scans **every**
  `features/**/*.ts` for that exact substring and fails if any file (other than its own
  excluded self) contains it. So the two frozen tests were mutually unsatisfiable: no
  implementation of the health route could make both green, because the conflict is in the
  *test file's source text*, independent of any production code. (Confirmed: on the
  baseline, before any feature-6 source existed, `key-isolation`'s "no headless seam or
  test file imports the Anthropic SDK" assertion was already red, with `health.test.ts`
  the sole offender.)
- **Corrected to:** build the needle from non-contiguous parts —
  `const SDK_PKG = "@anthropic-ai" + "/sdk";  expect(src).not.toContain(SDK_PKG);`. The
  assertion is byte-for-byte equivalent in what it checks about the route (the route must
  not contain the SDK package string), but the test file no longer contains the contiguous
  literal, so feature 3's broad guard stays strict and green.
- **Behavioral assertion preserved — nothing weakened:** the health route is still
  asserted to contain neither the SDK package string nor `ANTHROPIC_API_KEY` (and a
  separate assertion still pins no `rate-limit`/`getRateLimiter`/`clientKey` reference).
  Only the *spelling* of the needle changed. The narrower feature-6 test was adjusted
  rather than feature 3's cross-cutting guard, so the project-wide SDK-isolation invariant
  is left maximally strict.
- **Spec-authoring lesson (for `/retro`):** a project that enforces "no `src/` or test
  file names the SDK package" with a raw substring scan (feature 3's `key-isolation`) and
  later writes a *negative* assertion that must reference that same package literal
  (feature 6's `health`) creates a guaranteed cross-feature test collision. When a guard
  forbids a substring anywhere in a tree, any later test that must mention the forbidden
  token for a negative assertion has to construct it from parts (or the guard must scan
  for an actual *import statement*, not a bare mention). `/spec` should flag this when a
  new test references a token an existing frozen guard forbids.

## Design realizations (the design is a recommendation; behavior is the contract)

The spec's Design section was followed closely; these are the points where `/build` made
a concrete choice the design left open, none of which changed a behavioral requirement.

### a. `getRateLimiter()` singleton lives in `rate-limit.ts`
Per the design's "Reuses pattern: the `getCumulativeStore()` lazy-singleton," the
process-wide accessor is a memoized module-level instance in `src/rate-limit.ts`, built
from `src/rate-limit-config.ts` with `Date.now` as the injected clock. Keeping it beside
`createRateLimiter` means the routes import one SDK-free module; the accessor itself is
never imported by a test (the suite imports only `createRateLimiter` with a fake clock),
so the module stays test-importable and SDK-free.

### b. Fixed-window arithmetic and `Retry-After`
Window index is `floor(now()/windowMs)`; a counter whose stored index differs from the
current index reads as 0 **without** being mutated, so a refusal (which returns before the
increment) leaves the stored count untouched — the no-consume guarantee falls out of the
read path. `retryAfterSeconds = clamp(ceil((windowEnd − now)/1000), 1, ceil(windowMs/1000))`
where `windowEnd = (index+1)·windowMs`, satisfying the `≥1`, `≤ window` bound.

### c. Deploy build = Next standalone output on `node:22-slim`
The design left the Dockerfile shape to `/build`. Chosen: multi-stage build emitting
Next's `output: "standalone"` (added to `next.config.ts`) on a `node:22-slim` base (Node
22+ is required by feature 4's `node:sqlite`). The runtime stage copies `.next/standalone`,
`.next/static`, **and `docs/`** — the curated subset is read from disk at runtime via the
process cwd (`loadSubset`), not bundled by the tracer, so it must be copied explicitly or a
live run would 500 on a missing CSV. No secret value is embedded; the Anthropic key
arrives via `fly secrets`.

### d. `fly.toml` single-machine pinning
`auto_stop_machines = false` + `min_machines_running = 1` keep one always-on machine,
matching the declaration's acknowledged single-machine boundary (in-process counters + the
volume-pinned SQLite store are correct only on one machine). `CUMULATIVE_DB_PATH =
"/data/cumulative.sqlite"` sits under the `[[mounts]]` destination `/data` so feature 4's
tally survives a redeploy.

### e. Workflow has a belt-and-suspenders health probe
Per the spec (Story 4 AC2: the declared `fly.toml` check is the *primary* gate), the
`deploy.yml` job runs `flyctl deploy --remote-only` and then adds an explicit post-deploy
`curl` probe of `/api/health` with a bounded retry loop that fails the job if it never
returns 200 — additive insurance, not a replacement for the rolling-release health gate.

## Manual validation (SDK/Fly surfaces kept out of the headless bar)

The spec hands `/build` a manual-validation checklist for the surfaces deliberately
excluded from the Vitest bar. Results:

| Item (spec) | Status | Evidence |
|-------------|--------|----------|
| **(a) [MANDATORY] a refused `/api/run` returns a plain 429/503 with `Retry-After` and never starts an SSE stream** | ✅ **Verified in-sandbox** | Ran the production build (`pnpm start`, no key set) and sent 11 `GET /api/run` with the same `Fly-Client-IP`. Requests 1–10 were admitted (they reached the missing-key check and returned the `text/event-stream` 500 error frame); request **11 returned HTTP 429 with `content-type: application/json`** (not `text/event-stream`) and **`Retry-After: 3406`** (positive integer ≤ 3600s window). Body: `{"error":"rate_limited","scope":"ip","retryAfterSeconds":3387,"message":"You've reached the per-visitor request limit…"}`. The gate is the first statement in the route, before the key read, the Anthropic client, and any `ReadableStream` — so the stream is never opened on a refusal. |
| **Shared per-IP budget across both endpoints** (Story 1/2) | ✅ **Verified in-sandbox** | A fresh `Fly-Client-IP` sent 11 `POST /api/classify`: 10 admitted (500 no-key), the 11th refused **429**. The pool is shared and keyed on the Fly IP. |
| **XFF cannot mint identities** (Story 5) | ✅ **Verified in-sandbox** | After the per-IP cap was hit, a follow-up `GET /api/run` with the same `Fly-Client-IP` but a forged `X-Forwarded-For` still returned **429** — the forwarded header does not change the key. (The `client-ip.test.ts` suite pins the rest of Story 5.) |
| **`/api/health` returns 200 without a key** (Story 4 AC3) | ✅ **Verified in-sandbox** | With `ANTHROPIC_API_KEY` unset, `GET /api/health` → **200** `{"status":"ok"}`. Pinned by `health.test.ts` too. |
| **Production build compiles / type-checks** (constitution Quality gate) | ✅ **Verified in-sandbox** | `pnpm build` compiles cleanly and type-checks; `/api/health` is registered as a dynamic route; standalone output emitted. (Vitest doesn't type-check, so the build is the type gate CI runs.) |
| **(c) `fly secrets set ANTHROPIC_API_KEY` makes a live run work** | ⚠️ **Left for owner (needs a key + a Fly app)** | The no-key path (500 SSE error frame) and the gated path were exercised; a real classified run needs a live key, the same boundary features 2–5 set. |
| **(d) cumulative number survives an actual redeploy** | ⚠️ **Left for owner (needs a live Fly deploy)** | `fly.toml` points `CUMULATIVE_DB_PATH` under the mounted `/data` volume (pinned by `deploy-config.test.ts`); the live cross-redeploy persistence is a Fly-runtime check. |
| **(e) the deploy job fails when the app fails its health check** | ⚠️ **Left for owner (needs a live Fly deploy)** | The `fly.toml` HTTP check + the workflow's post-deploy probe enforce it; observing a forced failure requires a real release. |

**Net:** the full Vitest bar (152 tests across the single runner) passes, the production
build type-checks and compiles, and every manual item that does not require a live
Anthropic key or a real Fly deploy — most importantly the **MANDATORY gate-before-stream
ordering** — was verified in-sandbox. The three items needing a live key / Fly release are
left for the owner, the same manual-validation boundary features 2–5 established.
