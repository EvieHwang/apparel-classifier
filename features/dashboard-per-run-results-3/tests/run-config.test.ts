// The fixed dashboard run size must fit the real corpus (edge case: N within
// bounds). @frozen: 3 <= RUN_SIZE <= subset size, so a run never throws RangeError
// from the sampler and every corruption tag (near/far/blank) is reachable. Lives in
// an SDK-free config module so this test imports it without touching the route.
import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { RUN_SIZE } from "../../../src/run-config";
import { loadSubset } from "../../../src/dataset";

const subsetPath = fileURLToPath(
  new URL("../../../docs/apparel-subset.csv", import.meta.url),
);
const subset = loadSubset(subsetPath);

describe("RUN_SIZE", () => {
  it("is an integer within [3, subset size] on the real curated subset", () => {
    expect(Number.isInteger(RUN_SIZE)).toBe(true);
    expect(RUN_SIZE).toBeGreaterThanOrEqual(3); // all three corruption tags reachable
    expect(RUN_SIZE).toBeLessThanOrEqual(subset.records.length); // sampler never throws
  });
});
