# Feature declaration — Go public safely (feature 6)

## What
The two guards that let the demo be a public, forwardable link without inviting a
runaway Anthropic bill, plus the deploy pipeline that puts it on the open internet
durably. Two strands, stapled by the Roadmap because they ship together:

**Abuse guards** on the two LLM-invoking endpoints (`GET /api/run`, `POST
/api/classify`):
- **Per-IP cap** — one shared budget of ≈10 requests/hour per client IP across both
  endpoints, each request counted as 1. Over budget → `429` with `Retry-After`.
- **Global circuit-breaker** — an app-wide ceiling on LLM calls per window, so a
  spread of distinct IPs each staying under the per-IP cap still can't run the bill
  up. Tripped → a service-wide refusal (`503` with `Retry-After`), not the
  individual client's fault.

**Deploy** — the app served on Fly.io, deployed through GitHub Actions on push to
`main`:
- A `Dockerfile` building the Next.js app and a `fly.toml` (app `apparel-classifier`)
  declaring the health check.
- A cheap **`/api/health`** endpoint that never touches the LLM (no key burn, returns
  healthy before `ANTHROPIC_API_KEY` is even configured).
- A **mounted Fly volume** pointed at `CUMULATIVE_DB_PATH` so feature 4's cumulative
  tally survives redeploys — honoring the contract feature 4 named for this feature.
- A `deploy.yml` workflow running `flyctl deploy` (authenticated by `FLY_API_TOKEN`)
  that **fails the job unless a post-deploy health check passes** within a bounded
  retry window. `ANTHROPIC_API_KEY` reaches the app via `fly secrets`, never baked
  into the image.

## Why
Every prior feature was built private. The demo's whole point is a link a
non-technical peer can open — but the moment those two endpoints are reachable,
each call spends real Anthropic money, and an unguarded public LLM endpoint is a
standing invitation to abuse. The per-IP cap stops casual hammering; the global
circuit-breaker is the backstop the per-IP cap structurally can't be — it bounds the
*total* spend regardless of how many IPs show up. Together they make "send this to
anyone" a safe sentence. The deploy strand is what turns a localhost demo into that
forwardable link, and it must be durable: a deploy that silently wiped the cumulative
number on every release would undo feature 4, and a deploy reported "successful"
because `flyctl` exited zero — while the app fails to serve — is the failure CLAUDE.md
explicitly calls out. Hence the volume and the health-gated workflow.

## Success
- A client exceeding ≈10 requests/hour across the two LLM endpoints gets `429` +
  `Retry-After`; a client under the cap is served normally. The cap is keyed on the
  trustworthy Fly-supplied client IP, not a spoofable forwarded header.
- When the app-wide call ceiling for the current window is reached, **every** further
  LLM request is refused with `503` + `Retry-After` until the window rolls — even for
  a client that has used none of its own per-IP budget.
- The non-LLM read endpoint (`GET /api/cumulative`) and `GET /api/health` are **not**
  gated by these limits — a rate-limited or circuit-broken visitor can still load the
  page and read the cumulative number.
- Both limiter decisions are pure, clock-injected logic covered by the automated suite
  (SDK-free, network-free, real-time-free), the same discipline features 2–5 used to
  keep infrastructure out of the Vitest bar. The route/SDK/Fly wiring is manually
  validated, like the existing key-reading routes.
- The app deploys to Fly.io via GitHub Actions on push to `main`; the workflow runs
  `flyctl deploy` and **fails the job** if a post-deploy health check doesn't return
  healthy within a bounded retry window.
- `GET /api/health` returns healthy without calling the LLM or requiring
  `ANTHROPIC_API_KEY`, so the health check measures "is the app serving," not "is the
  key present."
- The cumulative SQLite DB lives on a mounted, writable Fly volume at
  `CUMULATIVE_DB_PATH`; the cumulative figure survives a redeploy.
- `ANTHROPIC_API_KEY` is delivered via `fly secrets` and never appears in the image,
  the repo, or any response. `.env.example` and the deploy workflow agree on the
  required keys (no drift).

## Shape touched
- **Rate limiter** (declaration Shape) — newly built: both the per-IP cap and the
  global circuit-breaker, as one pure decision seam plus the route wiring that calls
  it on the two LLM endpoints.
- **Classification service** (declaration Shape) — *guarded, not changed*: the limiter
  wraps `GET /api/run` and `POST /api/classify` ahead of any model call. The frozen
  classification path, corruption, scoring, and leak-prevention logic are untouched.
- **Deploy & runtime infra** (Roadmap #6: "fly.toml, GitHub Actions,
  `ANTHROPIC_API_KEY` secret") — `Dockerfile`, `fly.toml`, `/api/health`, the mounted
  volume for `CUMULATIVE_DB_PATH`, and the `deploy.yml` workflow. Follows the
  constitution's fixed deploy pattern (GitHub Actions → `flyctl deploy`, health-gated).

## Out of scope
- **Accounts, auth, CAPTCHA, WAF, or a CDN** — IP-based limiting + a global ceiling is
  the whole abuse model for v1. No per-user identity beyond the request IP.
- **Multi-machine / shared-state limiting.** The counters are in-process and correct
  only because the mounted volume pins the app to a single machine. Scaling to more
  than one machine would need shared counting; that is named as an acknowledged
  boundary, not solved here.
- **Per-endpoint or cost-weighted budgets.** A batch run and a single classify each
  cost 1 against the shared per-IP pool; the number is tuned knowing a run is the
  heavier call. No separate pools, no RUN_SIZE weighting.
- **Tunable-at-runtime limits / admin surface.** The cap, ceiling, and window are
  fixed configuration, not an in-app control.
- **Secret provisioning beyond the workflow.** Putting `ANTHROPIC_API_KEY` /
  `FLY_API_TOKEN` into 1Password and the GitHub Actions store is the documented manual
  step (CLAUDE.md Secrets); this feature consumes those secrets, it does not automate
  their creation.
- **The narrative / self-explanation copy pass (#7).** Only enough text to render a
  `429`/`503` intelligibly; the framing copy is the next feature.
- **No change** to any frozen shape, to corruption / scoring / leak-prevention logic,
  to feature 3's run-stream event sequence, or to feature 4's cumulative store
  contract.
