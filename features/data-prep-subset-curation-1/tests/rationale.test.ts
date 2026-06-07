// @frozen — the rationale must exist and document the cut in human-readable terms.
// Asserts substance (parameters, dropped categories) rather than exact prose.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const RATIONALE = resolve(repoRoot, "docs/apparel-subset-rationale.md");

describe("curation rationale doc", () => {
  let text = "";
  beforeAll(() => {
    if (existsSync(RATIONALE)) text = readFileSync(RATIONALE, "utf8");
  });

  it("exists and is non-trivial", () => {
    expect(existsSync(RATIONALE), `${RATIONALE} must exist`).toBe(true);
    expect(text.trim().length).toBeGreaterThan(200);
  });

  it("names the chosen masterCategory", () => {
    expect(text).toMatch(/Apparel/);
  });

  it("states the three numeric parameters in their actual roles", () => {
    expect(text).toMatch(/\b50\b/); // min rows per type
    expect(text).toMatch(/\b500\b/); // per-type cap
    // The min-types-per-subCategory = 2 must be explained, not just any stray "2".
    expect(text).toMatch(/(≥\s*2|>=\s*2|at least 2|two|2)\s+(distinct\s+)?article\s?[Tt]ypes/);
  });

  it("explains all four dropped subCategories and why", () => {
    for (const sub of ["Saree", "Dress", "Apparel Set", "Socks"]) {
      expect(text, `rationale must name dropped subCategory "${sub}"`).toMatch(
        new RegExp(sub, "i"),
      );
    }
    // The reason: no near-swap sibling / too few articleTypes.
    expect(text.toLowerCase()).toMatch(/near[- ]swap|too few|fewer than|sibling|only one/);
  });
});
