// @frozen behavior (Story 4 AC3, Story 1 AC2). The health endpoint must return 200
// WITHOUT calling the LLM and WITHOUT requiring ANTHROPIC_API_KEY, so the deploy's
// health gate measures "is the app serving," not "is the key present." The body
// `status` field is @scaffolding; the 200-without-key behavior is frozen.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { GET } from "../../../app/api/health/route";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const ROUTE_SRC = resolve(repoRoot, "app/api/health/route.ts");

describe("GET /api/health", () => {
  it("returns 200 even when ANTHROPIC_API_KEY is unset", async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const res = await GET();
      expect(res.status).toBe(200);
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });

  it("never reads ANTHROPIC_API_KEY and never imports the Anthropic SDK (no key burn)", () => {
    const src = readFileSync(ROUTE_SRC, "utf8");
    expect(src).not.toContain("@anthropic-ai/sdk");
    expect(src).not.toContain("ANTHROPIC_API_KEY");
  });

  it("does not consult the rate limiter (health is never gated)", () => {
    const src = readFileSync(ROUTE_SRC, "utf8");
    expect(src).not.toMatch(/rate-limit|getRateLimiter|clientKey/);
  });
});
