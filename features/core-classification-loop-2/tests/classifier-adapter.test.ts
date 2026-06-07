// @scaffolding — the Anthropic adapter factory is named ahead of /build. We
// assert behavior at the injected call boundary (forwarding, mapping, fail-fast),
// not the SDK request shape (that is SDK-internal; the scorer is the closed-
// vocabulary safety net).
import { describe, it, expect } from "vitest";
import { createAnthropicClassifier } from "../../../src/classify";
import type { ClassificationInput, Prediction } from "../../../src/types";

const input: ClassificationInput = {
  gender: "Men",
  baseColour: "Blue",
  season: "Summer",
  year: "2012",
  usage: "Casual",
  productDisplayName: "Peter England Men Party Blue Jeans",
  articleType: "", // blank label
};

describe("createAnthropicClassifier", () => {
  it("forwards input + vocabulary to the structured call and maps a non-null result to a Prediction", async () => {
    const calls: Array<{ input: ClassificationInput; vocabulary: string[] }> = [];
    const result: Prediction = { articleType: "Jeans", confidence: "high", rationale: "denim cut" };
    const runStructured = async (i: ClassificationInput, vocabulary: string[]) => {
      calls.push({ input: i, vocabulary });
      return result;
    };

    const classify = createAnthropicClassifier(runStructured);
    const vocab = ["Jeans", "Shirts", "Tshirts"];
    const prediction = await classify(input, vocab);

    expect(prediction).toEqual(result);
    expect(calls).toHaveLength(1);
    expect(calls[0].input).toBe(input); // input forwarded unchanged
    expect(calls[0].vocabulary).toEqual(vocab); // closed vocabulary not dropped
  });

  it("throws on a failed/empty parse instead of fabricating a Prediction", async () => {
    const classify = createAnthropicClassifier(async () => null);
    await expect(classify(input, ["Jeans"])).rejects.toThrow();
  });
});
