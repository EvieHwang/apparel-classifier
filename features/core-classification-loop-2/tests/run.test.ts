// RunResult shape, determinism, scoring integration, no-leak, vocabulary, and
// fail-fast are @frozen — they are the contract the dashboard (#3) and live panel
// (#5) inherit. The `runClassificationCycle` *name* is @scaffolding.
import { describe, it, expect } from "vitest";
import { runClassificationCycle } from "../../../src/run";
import type { ClassificationInput, Classify, Prediction, Tag } from "../../../src/types";
import { buildSubset, contractSatisfyingSubset, decodeName, rec } from "./helpers";

const subset = contractSatisfyingSubset();
const N = 9;

// A deterministic stub that never sees the true type or subCategory. It recovers
// the true type from the (forwarded) productDisplayName when the label is blank,
// and otherwise echoes the (wrong) corrupted label. Result: blanks correct,
// near/far wrong — a precisely assertable outcome.
function makeStub() {
  const seenInputs: ClassificationInput[] = [];
  const seenVocab: string[][] = [];
  const classify: Classify = async (input, vocabulary) => {
    seenInputs.push(input);
    seenVocab.push(vocabulary);
    const trueType = decodeName(input.productDisplayName);
    const predicted = input.articleType === "" ? trueType : input.articleType;
    const prediction: Prediction = {
      articleType: predicted,
      confidence: "medium",
      rationale: "stub",
    };
    return prediction;
  };
  return { classify, seenInputs, seenVocab };
}

describe("runClassificationCycle", () => {
  it("returns a per-record + run-level RunResult of the agreed shape", async () => {
    const { classify } = makeStub();
    const result = await runClassificationCycle({ subset, n: N, seed: 42, classify });

    expect(result.total).toBe(N);
    expect(result.entries).toHaveLength(N);
    expect(typeof result.accuracy).toBe("number");

    for (const e of result.entries) {
      expect(typeof e.id).toBe("string");
      expect(typeof e.trueArticleType).toBe("string");
      expect(["near-swap", "far-swap", "blank"]).toContain(e.corruptionTag);
      expect(typeof e.corruptedValue).toBe("string");
      expect(typeof e.predictedArticleType).toBe("string");
      expect(["low", "medium", "high"]).toContain(e.confidence);
      expect(typeof e.rationale).toBe("string");
      expect(e.correct).toBe(e.predictedArticleType === e.trueArticleType);
    }

    for (const tag of ["near-swap", "far-swap", "blank"] as Tag[]) {
      expect(result.breakdown[tag]).toBeDefined();
      expect(typeof result.breakdown[tag].count).toBe("number");
    }
  });

  it("is deterministic: same subset, n, seed, and deterministic classify => identical result", async () => {
    const a = await runClassificationCycle({ subset, n: N, seed: 7, classify: makeStub().classify });
    const b = await runClassificationCycle({ subset, n: N, seed: 7, classify: makeStub().classify });
    expect(a).toEqual(b);
  });

  it("scores against ground truth: blanks recovered, near/far misled by the wrong label", async () => {
    const { classify } = makeStub();
    const result = await runClassificationCycle({ subset, n: N, seed: 3, classify });

    expect(result.breakdown["blank"].accuracy).toBe(1);
    expect(result.breakdown["near-swap"].accuracy).toBe(0);
    expect(result.breakdown["far-swap"].accuracy).toBe(0);

    const blankCount = result.breakdown["blank"].count;
    expect(result.accuracy).toBeCloseTo(blankCount / result.total, 10);
  });

  it("never hands the classifier the true articleType or the subCategory", async () => {
    const { classify, seenInputs } = makeStub();
    await runClassificationCycle({ subset, n: N, seed: 11, classify });

    expect(seenInputs).toHaveLength(N);
    for (const input of seenInputs) {
      expect("subCategory" in input).toBe(false);
      expect("trueArticleType" in input).toBe(false);
      // The label shown is never the true type (blank "" or a corrupted value).
      const trueType = decodeName(input.productDisplayName);
      expect(input.articleType).not.toBe(trueType);
    }
  });

  it("never leaks the true label end-to-end, even when a type spans two subcategories (Shorts)", async () => {
    // "Shorts" under both Bottomwear and Loungewear — the cross-subcategory case
    // that a naive far-swap would leak. Run full-N across many seeds and assert
    // no entry was ever handed its own true label as the corrupted value.
    const collision = buildSubset([
      rec({ id: "1", articleType: "Jeans", subCategory: "Bottomwear" }),
      rec({ id: "2", articleType: "Jeans", subCategory: "Bottomwear" }),
      rec({ id: "3", articleType: "Trousers", subCategory: "Bottomwear" }),
      rec({ id: "4", articleType: "Shorts", subCategory: "Bottomwear" }),
      rec({ id: "5", articleType: "Shorts", subCategory: "Bottomwear" }),
      rec({ id: "6", articleType: "Shorts", subCategory: "Loungewear" }),
      rec({ id: "7", articleType: "Pyjamas", subCategory: "Loungewear" }),
      rec({ id: "8", articleType: "Lounge Pants", subCategory: "Loungewear" }),
    ]);
    for (let seed = 0; seed < 30; seed++) {
      const { classify } = makeStub();
      const result = await runClassificationCycle({
        subset: collision,
        n: collision.records.length,
        seed,
        classify,
      });
      for (const e of result.entries) {
        // near/far corrupted values must never equal the true label; blank is "".
        expect(e.corruptedValue).not.toBe(e.trueArticleType);
      }
    }
  });

  it("gives the classifier the run's closed vocabulary", async () => {
    const { classify, seenVocab } = makeStub();
    await runClassificationCycle({ subset, n: N, seed: 5, classify });
    for (const vocab of seenVocab) {
      expect([...vocab].sort()).toEqual([...subset.vocabulary].sort());
    }
  });

  it("fails fast: a rejecting classifier rejects the whole run", async () => {
    const classify: Classify = async () => {
      throw new Error("model unavailable");
    };
    await expect(
      runClassificationCycle({ subset, n: N, seed: 1, classify }),
    ).rejects.toThrow();
  });
});
