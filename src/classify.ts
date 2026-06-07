// Classifier adapter seam.
//
// `createAnthropicClassifier` turns a minimal structured-call function into the
// `Classify` seam the orchestrator injects. This module is deliberately free of
// any SDK or `zod` import (not even `import type`) so the automated test suite
// runs with no Anthropic SDK runtime dependency and no network. The real,
// SDK-backed `runStructured` lives in `./anthropic` and is validated manually.
import type { Classify, ClassificationInput, Prediction } from "./types";

/**
 * The minimal call the adapter is built on: given the allowed input and the run's
 * closed vocabulary, return a typed `Prediction`, or `null` on a failed/empty
 * structured parse. The real implementation wraps Anthropic structured output.
 */
export type RunStructured = (
  input: ClassificationInput,
  vocabulary: string[],
) => Promise<Prediction | null>;

/**
 * Build a `Classify` from a `runStructured` call. Forwards the input and the
 * closed vocabulary unchanged (so the vocabulary constraint is never dropped),
 * maps a non-null result straight to the `Prediction`, and **throws** on a `null`
 * (failed/empty) parse rather than fabricating a prediction — fail-fast that feeds
 * the run-level fail-fast in `runClassificationCycle`.
 */
export function createAnthropicClassifier(runStructured: RunStructured): Classify {
  return async (input, vocabulary) => {
    const prediction = await runStructured(input, vocabulary);
    if (prediction === null) {
      throw new Error(
        "Anthropic classifier returned no structured output (empty/failed parse)",
      );
    }
    return prediction;
  };
}
