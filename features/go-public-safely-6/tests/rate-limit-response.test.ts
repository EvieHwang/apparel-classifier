// @frozen — the refusal-to-HTTP mapping (Story 2 AC1, Story 3 AC1). A per-IP
// refusal is 429, a global refusal is 503, both carry a Retry-After header in
// seconds and an intelligible body with no secret material. The helper NAME
// `rateLimitResponse` is @scaffolding; the HTTP contract is frozen.
import { describe, it, expect } from "vitest";
import { rateLimitResponse } from "../../../src/rate-limit-response";

describe("rateLimitResponse — refusal HTTP mapping", () => {
  it("maps a per-IP refusal to 429 with Retry-After", async () => {
    const res = rateLimitResponse({ ok: false, scope: "ip", retryAfterSeconds: 42 });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("42");
    const body = await res.json();
    expect(typeof body).toBe("object");
    // An intelligible, human-readable message accompanies the machine response.
    expect(JSON.stringify(body).length).toBeGreaterThan(2);
  });

  it("maps a global refusal to 503 with Retry-After", async () => {
    const res = rateLimitResponse({ ok: false, scope: "global", retryAfterSeconds: 120 });
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("120");
  });

  it("Retry-After is an integer number of seconds", () => {
    const res = rateLimitResponse({ ok: false, scope: "ip", retryAfterSeconds: 7 });
    const header = res.headers.get("retry-after")!;
    expect(header).toMatch(/^\d+$/);
  });

  it("carries no secret/key material in the body", async () => {
    const res = rateLimitResponse({ ok: false, scope: "global", retryAfterSeconds: 5 });
    const text = JSON.stringify(await res.json()).toLowerCase();
    expect(text).not.toContain("anthropic_api_key");
    expect(text).not.toContain("sk-"); // no API key prefix
    expect(text).not.toContain("fly_api_token");
  });
});
