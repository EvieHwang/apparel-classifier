// @frozen behavior, @scaffolding surface.
//
// The rate-limiter decision seam (Stories 1–3). Frozen behavior: per-IP cap,
// global ceiling, global-first precedence, no-consume-on-refusal, window reset,
// and Retry-After bounds. The factory shape and the `RateDecision` field names
// (`ok` / `scope` / `retryAfterSeconds`) are the named surface (@scaffolding) —
// /build may rename them as long as these behaviors hold.
//
// Tests inject a mutable fake clock and small limits, so they assert the *rules*,
// not the production constants in src/rate-limit-config.ts.
import { describe, it, expect } from "vitest";
import { createRateLimiter } from "../../../src/rate-limit";
import {
  PER_IP_LIMIT,
  PER_IP_WINDOW_MS,
  GLOBAL_LIMIT,
  GLOBAL_WINDOW_MS,
} from "../../../src/rate-limit-config";

// A controllable clock: `t.now` is the injected `now()`; tests advance `t.ms`.
function fakeClock(start = 0) {
  const t = { ms: start };
  return { now: () => t.ms, advance: (by: number) => (t.ms += by), t };
}

// A limiter with a huge global ceiling, so per-IP behavior is isolated.
function perIpLimiter(perIpLimit: number, perIpWindowMs: number, now: () => number) {
  return createRateLimiter({
    perIpLimit,
    perIpWindowMs,
    globalLimit: 1_000_000,
    globalWindowMs: perIpWindowMs,
    now,
  });
}

describe("rate limiter — per-IP cap (Stories 1, 2)", () => {
  it("admits up to the per-IP limit, then refuses with scope 'ip'", () => {
    const clock = fakeClock();
    const rl = perIpLimiter(3, 1000, clock.now);
    expect(rl.admit("a").ok).toBe(true);
    expect(rl.admit("a").ok).toBe(true);
    expect(rl.admit("a").ok).toBe(true);
    const refused = rl.admit("a");
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.scope).toBe("ip");
  });

  it("budgets are independent per key", () => {
    const clock = fakeClock();
    const rl = perIpLimiter(1, 1000, clock.now);
    expect(rl.admit("a").ok).toBe(true);
    expect(rl.admit("a").ok).toBe(false); // a exhausted
    expect(rl.admit("b").ok).toBe(true); // b untouched
  });

  it("restores the budget after the window elapses (reset)", () => {
    const clock = fakeClock();
    const rl = perIpLimiter(2, 1000, clock.now);
    expect(rl.admit("a").ok).toBe(true);
    expect(rl.admit("a").ok).toBe(true);
    expect(rl.admit("a").ok).toBe(false);
    clock.advance(1000); // next window
    expect(rl.admit("a").ok).toBe(true);
  });

  it("a refused per-IP request consumes no budget (no-consume-on-refusal)", () => {
    const clock = fakeClock();
    // Small global ceiling so we can observe whether refusals leak into the global
    // counter: perIp=1 means a's 2nd/3rd calls are refused; global=2.
    const rl = createRateLimiter({
      perIpLimit: 1,
      perIpWindowMs: 1000,
      globalLimit: 2,
      globalWindowMs: 1000,
      now: clock.now,
    });
    expect(rl.admit("a").ok).toBe(true); // global=1, a=1
    expect(rl.admit("a").ok).toBe(false); // ip-refused; if it consumed global, global=2
    expect(rl.admit("a").ok).toBe(false); // ip-refused again
    // If refusals consumed global budget, b would now be global-refused. It isn't:
    expect(rl.admit("b").ok).toBe(true); // global=2 — only the two admits counted
  });
});

describe("rate limiter — global circuit-breaker (Story 3)", () => {
  it("refuses every client once the global ceiling is reached, regardless of key", () => {
    const clock = fakeClock();
    const rl = createRateLimiter({
      perIpLimit: 100,
      perIpWindowMs: 1000,
      globalLimit: 2,
      globalWindowMs: 1000,
      now: clock.now,
    });
    expect(rl.admit("a").ok).toBe(true);
    expect(rl.admit("b").ok).toBe(true); // global now full
    const refused = rl.admit("c"); // fresh key, none of its own budget used
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.scope).toBe("global");
  });

  it("global is checked BEFORE per-IP — a tripped global refuses a fresh key as 'global'", () => {
    const clock = fakeClock();
    const rl = createRateLimiter({
      perIpLimit: 5,
      perIpWindowMs: 1000,
      globalLimit: 1,
      globalWindowMs: 1000,
      now: clock.now,
    });
    expect(rl.admit("a").ok).toBe(true); // global full after one
    const refused = rl.admit("z"); // never seen, has per-IP budget left
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.scope).toBe("global");
  });

  it("resets the ceiling after the global window elapses", () => {
    const clock = fakeClock();
    const rl = createRateLimiter({
      perIpLimit: 100,
      perIpWindowMs: 1000,
      globalLimit: 1,
      globalWindowMs: 1000,
      now: clock.now,
    });
    expect(rl.admit("a").ok).toBe(true);
    expect(rl.admit("b").ok).toBe(false);
    clock.advance(1000);
    expect(rl.admit("b").ok).toBe(true);
  });

  it("a globally-refused request consumes NO budget — it does not poison the retrying key's per-IP count (AC4)", () => {
    // Short global window, long per-IP window: advancing the clock past the global
    // window resets the ceiling WITHOUT resetting per-IP counts, so we can observe
    // whether the earlier global refusal silently consumed the refused key's per-IP
    // budget (the "permanently poison the counter on retry" failure mode).
    //
    // The global ceiling (3) sits ABOVE the per-IP cap (2) so that, in the post-reset
    // window, the per-IP cap — not the global ceiling — is what binds z's third call.
    // That is the only configuration in which observing "z gets exactly 2 admits" can
    // prove its per-IP budget is intact: a global ceiling at or below the per-IP cap
    // would refuse z on global grounds first and tell us nothing about its per-IP count.
    const clock = fakeClock();
    const rl = createRateLimiter({
      perIpLimit: 2,
      perIpWindowMs: 1_000_000, // effectively does not reset during this test
      globalLimit: 3,
      globalWindowMs: 1000,
      now: clock.now,
    });
    // Fill the global ceiling with three distinct keys, each within its own per-IP budget.
    expect(rl.admit("a").ok).toBe(true);
    expect(rl.admit("b").ok).toBe(true);
    expect(rl.admit("c").ok).toBe(true); // global now full (limit 3)
    const refused = rl.admit("z"); // fresh key, globally refused
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.scope).toBe("global");

    clock.advance(1000); // global ceiling resets; per-IP window does NOT
    // z still has its full per-IP budget of 2 — the global refusal consumed nothing.
    expect(rl.admit("z").ok).toBe(true);
    expect(rl.admit("z").ok).toBe(true);
    const zThird = rl.admit("z");
    expect(zThird.ok).toBe(false); // 3rd is the per-IP cap, proving budget was 2 not 1
    if (!zThird.ok) expect(zThird.scope).toBe("ip");
  });
});

describe("rate limiter — Retry-After bounds", () => {
  it("a per-IP refusal carries a positive integer Retry-After no greater than the window (seconds)", () => {
    const clock = fakeClock();
    const rl = perIpLimiter(1, 60_000, clock.now); // 60s window
    rl.admit("a");
    const refused = rl.admit("a");
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(Number.isInteger(refused.retryAfterSeconds)).toBe(true);
      expect(refused.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(refused.retryAfterSeconds).toBeLessThanOrEqual(60);
    }
  });

  it("a global refusal carries a positive integer Retry-After no greater than the window", () => {
    const clock = fakeClock();
    const rl = createRateLimiter({
      perIpLimit: 100,
      perIpWindowMs: 1000,
      globalLimit: 1,
      globalWindowMs: 30_000, // 30s
      now: clock.now,
    });
    rl.admit("a");
    const refused = rl.admit("b");
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(Number.isInteger(refused.retryAfterSeconds)).toBe(true);
      expect(refused.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(refused.retryAfterSeconds).toBeLessThanOrEqual(30);
    }
  });
});

describe("rate-limit config invariants (@scaffolding values, frozen invariants)", () => {
  it("all limits and windows are positive", () => {
    for (const v of [PER_IP_LIMIT, PER_IP_WINDOW_MS, GLOBAL_LIMIT, GLOBAL_WINDOW_MS]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });

  it("the global ceiling is at least the per-IP cap (one client never needs more than the whole app)", () => {
    expect(GLOBAL_LIMIT).toBeGreaterThanOrEqual(PER_IP_LIMIT);
  });
});
