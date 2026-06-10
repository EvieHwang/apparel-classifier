// Maps a refused RateDecision to its HTTP response (feature 6, Story 2 AC1 / Story 3
// AC1). SDK-free and pure: a web-standard Response is built in src/ with no Next/SDK
// import, so the suite can import it directly. scope:"ip" → 429, scope:"global" → 503;
// both carry a Retry-After header (integer seconds) and a short, intelligible
// human-readable message alongside the machine fields. The body carries NO secret or key
// material. The helper NAME is @scaffolding; the HTTP contract is frozen.
import type { RateDecision } from "./rate-limit";

type RefusedDecision = Extract<RateDecision, { ok: false }>;

export function rateLimitResponse(decision: RefusedDecision): Response {
  const isGlobal = decision.scope === "global";
  const status = isGlobal ? 503 : 429;
  const message = isGlobal
    ? "The demo is briefly at its overall request ceiling. Please try again shortly."
    : "You've reached the per-visitor request limit. Please try again in a little while.";
  return Response.json(
    {
      error: "rate_limited",
      scope: decision.scope,
      retryAfterSeconds: decision.retryAfterSeconds,
      message,
    },
    { status, headers: { "retry-after": String(decision.retryAfterSeconds) } },
  );
}
