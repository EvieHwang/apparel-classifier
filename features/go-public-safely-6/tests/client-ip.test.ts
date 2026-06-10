// @frozen — security-critical (Story 5). The per-IP key must come from the
// Fly-supplied client IP, never from a client-controllable forwarded header, or
// the cap in rate-limit.ts is trivially bypassable (forge X-Forwarded-For → mint
// unlimited identities). The function NAME `clientKey` is @scaffolding; the
// non-forgeability property is frozen.
import { describe, it, expect } from "vitest";
import { clientKey } from "../../../src/client-ip";

describe("clientKey — trustworthy per-IP identity (Story 5)", () => {
  it("derives the key from Fly-Client-IP when present", () => {
    const k1 = clientKey(new Headers({ "fly-client-ip": "1.2.3.4" }));
    const k2 = clientKey(new Headers({ "fly-client-ip": "5.6.7.8" }));
    expect(k1).toBeTruthy();
    expect(k1).not.toBe(k2); // distinct real clients → distinct keys (AC3)
  });

  it("ignores X-Forwarded-For when Fly-Client-IP is present (AC1)", () => {
    const honest = clientKey(new Headers({ "fly-client-ip": "1.2.3.4" }));
    const spoofed = clientKey(
      new Headers({ "fly-client-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9, 8.8.8.8" }),
    );
    // A forged X-Forwarded-For cannot change the key away from the real Fly IP.
    expect(spoofed).toBe(honest);
  });

  it("does NOT let X-Forwarded-For mint new identities when Fly-Client-IP is absent (AC2)", () => {
    // Local dev / no Fly proxy: every request shares one bucket regardless of XFF.
    const a = clientKey(new Headers({ "x-forwarded-for": "9.9.9.9" }));
    const b = clientKey(new Headers({ "x-forwarded-for": "10.10.10.10" }));
    const none = clientKey(new Headers({}));
    expect(a).toBe(b); // forging XFF does not expand the budget
    expect(a).toBe(none); // and matches the no-header fallback
    expect(a).toBeTruthy(); // a usable, non-empty bucket key
  });

  it("treats the Fly header case-insensitively (Headers normalizes)", () => {
    const lower = clientKey(new Headers({ "fly-client-ip": "1.2.3.4" }));
    const mixed = clientKey(new Headers({ "Fly-Client-IP": "1.2.3.4" }));
    expect(mixed).toBe(lower);
  });
});
