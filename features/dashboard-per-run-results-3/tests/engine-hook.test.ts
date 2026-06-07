// The additive `onEntry` observation hook on runClassificationCycle (Story 6).
// @frozen behavior: the hook must observe entries in order without changing what a
// run computes or returns, and it must respect fail-fast. The hook is the only
// change this feature makes to feature 2's engine; these tests are the contract
// that it stayed additive.
import { describe, it, expect } from "vitest";
import { runClassificationCycle } from "../../../src/run";
import type { Classify, RunEntry } from "../../../src/types";
import { contractSatisfyingSubset, makeStub } from "./helpers";

const subset = contractSatisfyingSubset();
const N = 6;

describe("runClassificationCycle onEntry hook", () => {
  it("calls onEntry once per record, in run order, and the args equal RunResult.entries", async () => {
    const { classify } = makeStub();
    const seen: RunEntry[] = [];
    const result = await runClassificationCycle({
      subset,
      n: N,
      seed: 42,
      classify,
      onEntry: (e) => seen.push(e),
    });

    expect(seen).toHaveLength(N);
    expect(seen).toEqual(result.entries);
  });

  it("is additive: the RunResult is identical with and without the hook (same seed)", async () => {
    const withHook = await runClassificationCycle({
      subset,
      n: N,
      seed: 7,
      classify: makeStub().classify,
      onEntry: () => {},
    });
    const without = await runClassificationCycle({
      subset,
      n: N,
      seed: 7,
      classify: makeStub().classify,
    });
    expect(withHook).toEqual(without);
  });

  it("respects fail-fast: hook fires only for records classified before the failure; the cycle still rejects", async () => {
    const seen: RunEntry[] = [];
    let calls = 0;
    // Reject on the 3rd record: records 0 and 1 succeed, record 2 throws.
    const classify: Classify = async (input) => {
      calls++;
      if (calls === 3) throw new Error("model unavailable");
      return { articleType: input.articleType || "x", confidence: "low", rationale: "stub" };
    };

    await expect(
      runClassificationCycle({ subset, n: N, seed: 1, classify, onEntry: (e) => seen.push(e) }),
    ).rejects.toThrow();

    // Two successful records were observed before the failure; nothing after.
    expect(seen).toHaveLength(2);
  });
});
