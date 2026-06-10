// Fixed rate-limit configuration (feature 6). SDK-free, dependency-light constants so
// the config-invariant test can import them without dragging in a route or the Anthropic
// SDK. These are deliberately NOT runtime-tunable (no admin surface, no env override) —
// the cap, ceiling, and window are fixed product decisions.
//
// @scaffolding values, frozen invariants: the suite pins only that all four are positive
// and GLOBAL_LIMIT >= PER_IP_LIMIT (a single client never needs more than the whole
// app) — never the exact numbers, which /build may tune.

/** Per-IP cap: ≈10 LLM-invoking requests per rolling hour, the declaration's figure. */
export const PER_IP_LIMIT = 10;
export const PER_IP_WINDOW_MS = 3_600_000; // 1 hour

/**
 * App-wide ceiling per window: the backstop the per-IP cap structurally can't be. A run
 * is RUN_SIZE (=12) model calls, so 240 admitted requests/hour bounds the worst case
 * near ~2,880 model calls/hour — generous for genuine demo traffic, hard-capped against
 * a swarm of distinct IPs each under the per-IP cap.
 */
export const GLOBAL_LIMIT = 240;
export const GLOBAL_WINDOW_MS = 3_600_000; // 1 hour
