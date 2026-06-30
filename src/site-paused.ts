// Manual kill switch for the live demo (temporary cost-control toggle).
//
// SDK-free and pure so the suite can import it directly without dragging in a route
// or the Anthropic SDK. The two cost-incurring routes (GET /api/run and
// POST /api/classify) consult this BEFORE the rate limiter, before reading the key,
// and before constructing the Anthropic client — so a paused site makes zero model
// calls and incurs zero API cost.
//
// Flipping it is a secret-only change, no code redeploy:
//   pause:   flyctl secrets set SITE_PAUSED=1
//   resume:  flyctl secrets unset SITE_PAUSED
//
// The liveness endpoint (GET /api/health) deliberately does NOT consult this, so the
// deploy health gate still measures "is the app serving" while runs are paused.

/** The env var that pauses the demo. Any truthy value pauses; unset/blank/falsy runs. */
export const SITE_PAUSED_ENV = "SITE_PAUSED";

/** Human-readable message surfaced to a visitor while the demo is paused. */
export const SITE_PAUSED_MESSAGE =
  "This demo is temporarily paused. Please check back later.";

const TRUTHY = new Set(["1", "true", "yes", "on"]);

/**
 * Whether the demo is paused. True only when SITE_PAUSED holds a recognized truthy
 * value (case-insensitive, trimmed): "1", "true", "yes", or "on". Unset, blank, "0",
 * and "false" all mean the demo runs normally.
 */
export function isSitePaused(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env[SITE_PAUSED_ENV]?.trim().toLowerCase();
  return raw !== undefined && TRUTHY.has(raw);
}
