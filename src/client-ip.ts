// Trustworthy per-IP key derivation (feature 6, Story 5) — SECURITY-CRITICAL. The
// rate-limit key MUST come from the Fly-supplied client IP, never from a
// client-controllable forwarded header: forging X-Forwarded-For must not mint new
// identities, or the per-IP cap in rate-limit.ts is trivially bypassable. SDK-free, pure,
// test-imported. Addresses OWASP "LLM10 unbounded consumption" / DoS by making the rate
// key non-forgeable.
const FLY_CLIENT_IP = "fly-client-ip";

// The single shared bucket used when no trustworthy Fly IP is present (local dev / no
// proxy). Fail-safe: over-restrictive — every header-only request collapses into one
// budget — never over-permissive. Fly always sets Fly-Client-IP in production.
const FALLBACK_KEY = "ip:__shared__";

export function clientKey(headers: Headers): string {
  // Headers normalizes names, so this is case-insensitive (Fly-Client-IP == fly-client-ip).
  const flyIp = headers.get(FLY_CLIENT_IP)?.trim();
  if (flyIp) return `ip:${flyIp}`;
  // No Fly IP: a single fixed key. X-Forwarded-For (or any other client-supplied header)
  // is NEVER consulted, so a forged header cannot expand the budget by minting identities.
  return FALLBACK_KEY;
}
