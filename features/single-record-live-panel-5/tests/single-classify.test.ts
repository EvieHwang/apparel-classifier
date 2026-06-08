// The single-record decision seam (Stories 1–4, 6). @frozen behavior + result shape:
// validation short-circuits the model, the input is name-only, the closed vocabulary is
// forwarded, the confidence gate declines `low`, and a classify rejection propagates.
// The `classifyOne` *name* and the exact `MAX_PRODUCT_NAME_LENGTH` value are @scaffolding
// (/build may re-site the name / tune the bound as long as the asserted behavior holds).
//
// SDK-free by construction: this seam takes an injected `classify`, so the suite runs
// with no Anthropic SDK, no network, and no key — the same split features 2–3 use.
import { describe, it, expect } from "vitest";
import { classifyOne, MAX_PRODUCT_NAME_LENGTH } from "../../../src/single-classify";
import type {
  Classify,
  ClassificationInput,
  Confidence,
  Prediction,
} from "../../../src/types";

const VOCAB = ["Jeans", "Shirts", "Shorts", "Tshirts"];

function pred(confidence: Confidence): Prediction {
  return { articleType: "Shorts", confidence, rationale: "looks like shorts" };
}

// A deterministic spy `classify` that records every input + vocabulary it was handed and
// returns a fixed Prediction, so a test can assert both *that* and *what* it was called
// with (or that it was never called).
function spyClassify(prediction: Prediction) {
  const inputs: ClassificationInput[] = [];
  const vocabularies: string[][] = [];
  const classify: Classify = async (input, vocabulary) => {
    inputs.push(input);
    vocabularies.push(vocabulary);
    return prediction;
  };
  return {
    classify,
    inputs,
    vocabularies,
    get calls() {
      return inputs.length;
    },
  };
}

describe("classifyOne — validation (Story 3)", () => {
  it.each(["", "   ", "\t\n  "])(
    "rejects empty/whitespace input %j as invalid, without calling the model",
    async (raw) => {
      const spy = spyClassify(pred("high"));
      const result = await classifyOne({
        productName: raw,
        vocabulary: VOCAB,
        classify: spy.classify,
      });
      expect(result.status).toBe("invalid");
      if (result.status === "invalid") expect(result.reason.length).toBeGreaterThan(0);
      expect(spy.calls).toBe(0); // no billed classification for junk input
    },
  );

  it("rejects an over-length name as invalid, without calling the model", async () => {
    const spy = spyClassify(pred("high"));
    const overBound = "x".repeat(MAX_PRODUCT_NAME_LENGTH + 1);
    const result = await classifyOne({
      productName: overBound,
      vocabulary: VOCAB,
      classify: spy.classify,
    });
    expect(result.status).toBe("invalid");
    expect(spy.calls).toBe(0);
  });

  it("trims surrounding whitespace before classifying", async () => {
    const spy = spyClassify(pred("high"));
    await classifyOne({
      productName: "  Blue Jeans  ",
      vocabulary: VOCAB,
      classify: spy.classify,
    });
    expect(spy.inputs[0].productDisplayName).toBe("Blue Jeans");
  });

  it("trims FIRST, then checks length on the trimmed text: surrounding whitespace does not count toward the bound", async () => {
    const spy = spyClassify(pred("medium"));
    // Raw length far exceeds the bound, but the trimmed content is well within it.
    const padded =
      " ".repeat(MAX_PRODUCT_NAME_LENGTH) + "Blue Jeans" + " ".repeat(MAX_PRODUCT_NAME_LENGTH);
    const result = await classifyOne({
      productName: padded,
      vocabulary: VOCAB,
      classify: spy.classify,
    });
    expect(result.status).not.toBe("invalid"); // trimmed content is within bound → valid
    expect(spy.inputs[0].productDisplayName).toBe("Blue Jeans"); // and the model sees the trimmed name
  });

  it("rejects a name whose TRIMMED length still exceeds the bound, without calling the model", async () => {
    const spy = spyClassify(pred("medium"));
    const overTrimmed = "  " + "x".repeat(MAX_PRODUCT_NAME_LENGTH + 1) + "  ";
    const result = await classifyOne({
      productName: overTrimmed,
      vocabulary: VOCAB,
      classify: spy.classify,
    });
    expect(result.status).toBe("invalid");
    expect(spy.calls).toBe(0);
  });

  it("the length bound is a positive integer; input at the bound is accepted (@scaffolding value)", async () => {
    expect(Number.isInteger(MAX_PRODUCT_NAME_LENGTH)).toBe(true);
    expect(MAX_PRODUCT_NAME_LENGTH).toBeGreaterThan(0);
    const spy = spyClassify(pred("medium"));
    const atBound = "x".repeat(MAX_PRODUCT_NAME_LENGTH);
    const result = await classifyOne({
      productName: atBound,
      vocabulary: VOCAB,
      classify: spy.classify,
    });
    expect(result.status).not.toBe("invalid"); // at the bound is still valid
    expect(spy.calls).toBe(1);
  });
});

describe("classifyOne — name-only, same classifier (Stories 1, 2, 6)", () => {
  it("hands classify a name-only ClassificationInput: the name as productDisplayName, every other field empty", async () => {
    const spy = spyClassify(pred("high"));
    await classifyOne({
      productName: "Nike Running Shorts",
      vocabulary: VOCAB,
      classify: spy.classify,
    });
    const input = spy.inputs[0];
    expect(input.productDisplayName).toBe("Nike Running Shorts");
    // No vendor label and no other attribute to anchor on — the name carries the signal.
    expect(input.articleType).toBe("");
    expect(input.gender).toBe("");
    expect(input.baseColour).toBe("");
    expect(input.season).toBe("");
    expect(input.year).toBe("");
    expect(input.usage).toBe("");
  });

  it("forwards the closed vocabulary to classify unchanged (the enum constraint is never dropped)", async () => {
    const spy = spyClassify(pred("high"));
    await classifyOne({ productName: "Blue Jeans", vocabulary: VOCAB, classify: spy.classify });
    expect(spy.vocabularies[0]).toEqual(VOCAB);
  });
});

describe("classifyOne — confidence gate (Story 4)", () => {
  it("declines a low-confidence prediction instead of returning it as a classification", async () => {
    const spy = spyClassify(pred("low"));
    const result = await classifyOne({
      productName: "MacBook Pro",
      vocabulary: VOCAB,
      classify: spy.classify,
    });
    expect(result.status).toBe("declined");
    if (result.status === "declined") expect(result.reason.length).toBeGreaterThan(0);
    expect(spy.calls).toBe(1); // the gate is a decision *downstream* of the model
  });

  it.each(["medium", "high"] as const)(
    "returns a classification for %s confidence, carrying the exact Prediction",
    async (confidence) => {
      const p = pred(confidence);
      const spy = spyClassify(p);
      const result = await classifyOne({
        productName: "Blue Jeans",
        vocabulary: VOCAB,
        classify: spy.classify,
      });
      expect(result.status).toBe("classified");
      if (result.status === "classified") expect(result.prediction).toEqual(p);
    },
  );
});

describe("classifyOne — fail-fast (edge)", () => {
  it("propagates a classify rejection rather than fabricating a result", async () => {
    const rejecting: Classify = async () => {
      throw new Error("model down");
    };
    await expect(
      classifyOne({ productName: "Blue Jeans", vocabulary: VOCAB, classify: rejecting }),
    ).rejects.toThrow(/model down/);
  });
});
