// Pure rate-limiter decision seam (feature 6, Stories 1–3). SDK-free, network-free, and
// real-time-free: the clock is injected and the counters are in-process, so the headless
// suite pins the *rules* (per-IP cap, global ceiling, global-first precedence,
// no-consume-on-refusal, window reset, Retry-After bounds) with a fake clock and small
// limits — never the production constants.
//
// Fixed-window semantics: a window index is floor(now() / windowMs); when the index
// advances, the relevant count resets to 0. The factory shape and the RateDecision field
// names (`ok` / `scope` / `retryAfterSeconds`) are the @scaffolding surface; the behavior
// is frozen.
//
// In-process counters are correct only because the mounted Fly volume pins the app to a
// single machine (acknowledged boundary in the feature declaration); multi-machine
// limiting would need shared counting and is explicitly out of scope.
import {
  PER_IP_LIMIT,
  PER_IP_WINDOW_MS,
  GLOBAL_LIMIT,
  GLOBAL_WINDOW_MS,
} from "./rate-limit-config";

export type RateDecision =
  | { ok: true }
  | { ok: false; scope: "global" | "ip"; retryAfterSeconds: number };

export interface RateLimiterOptions {
  perIpLimit: number;
  perIpWindowMs: number;
  globalLimit: number;
  globalWindowMs: number;
  /** Injected clock: production passes Date.now; tests pass a mutable fake. */
  now: () => number;
}

export interface RateLimiter {
  admit(key: string): RateDecision;
}

interface WindowCount {
  windowIndex: number;
  count: number;
}

export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const { perIpLimit, perIpWindowMs, globalLimit, globalWindowMs, now } = opts;
  const perKey = new Map<string, WindowCount>();
  const global: WindowCount = { windowIndex: -1, count: 0 };

  // The live count for the current window — lazily treating a rolled window as 0 without
  // mutating the slot, so a refusal (which never reaches the increment below) leaves the
  // stored counter untouched.
  function current(slot: WindowCount, windowMs: number): { index: number; count: number } {
    const index = Math.floor(now() / windowMs);
    return { index, count: slot.windowIndex === index ? slot.count : 0 };
  }

  // Whole seconds until the current window ends, clamped to [1, ceil(windowMs / 1000)].
  function retryAfter(windowMs: number): number {
    const windowMaxSeconds = Math.ceil(windowMs / 1000);
    const t = now();
    const windowEnd = (Math.floor(t / windowMs) + 1) * windowMs;
    const remainingSeconds = Math.ceil((windowEnd - t) / 1000);
    return Math.max(1, Math.min(windowMaxSeconds, remainingSeconds));
  }

  return {
    admit(key: string): RateDecision {
      // Global ceiling is evaluated BEFORE the per-IP cap (Story 3 AC3), so a tripped
      // breaker refuses even a never-seen key as scope:"global" — the refusal is the
      // app's, not the client's.
      const g = current(global, globalWindowMs);
      if (g.count >= globalLimit) {
        return { ok: false, scope: "global", retryAfterSeconds: retryAfter(globalWindowMs) };
      }

      const slot = perKey.get(key) ?? { windowIndex: -1, count: 0 };
      const p = current(slot, perIpWindowMs);
      if (p.count >= perIpLimit) {
        return { ok: false, scope: "ip", retryAfterSeconds: retryAfter(perIpWindowMs) };
      }

      // Admit: increment BOTH counters. Neither refusal path above mutates anything, so
      // a refused admit consumes no budget (Story 2 AC2 / Story 3 AC4).
      global.windowIndex = g.index;
      global.count = g.count + 1;
      slot.windowIndex = p.index;
      slot.count = p.count + 1;
      perKey.set(key, slot);
      return { ok: true };
    },
  };
}

// Process-wide singleton built from the fixed config — mirrors getCumulativeStore() in
// cumulative-sqlite.ts so one shared instance serves both LLM routes and the global
// counter is genuinely app-wide. Imports only the SDK-free seam and config; manually
// validated like the store accessor, never imported by tests.
let singleton: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (!singleton) {
    singleton = createRateLimiter({
      perIpLimit: PER_IP_LIMIT,
      perIpWindowMs: PER_IP_WINDOW_MS,
      globalLimit: GLOBAL_LIMIT,
      globalWindowMs: GLOBAL_WINDOW_MS,
      now: Date.now,
    });
  }
  return singleton;
}
