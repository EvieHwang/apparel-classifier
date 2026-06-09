// The single-record decision seam (feature 5, Stories 1–4, 6).
//
// Pure and SDK-free by construction: given an injected `classify`, it validates a
// user-supplied product name, builds the name-only `ClassificationInput`, forwards
// the closed vocabulary unchanged, and applies the confidence gate over the
// returned `Prediction`. The server route is the only thing that constructs the
// live `classify`; this module never imports the SDK, the key, or the network — so
// the automated suite runs SDK-free, network-free, and key-free, exactly like
// feature 2's `classify.ts`.
import type { Classify, ClassificationInput, Prediction } from "./types";

/**
 * Maximum length of a (trimmed) product name accepted for classification. Long
 * enough for any real product name, short enough to bound a prompt-injection
 * payload and the token cost (Story 3/6). The exact value is @scaffolding — the
 * frozen property is that it is a positive integer the validation enforces.
 */
export const MAX_PRODUCT_NAME_LENGTH = 200;

/**
 * The result the route serializes to JSON and the panel renders. @frozen union:
 * the discriminant and each payload are the contract the route + panel inherit.
 * `reason` wording is copy (#7) — only its presence/non-emptiness is frozen.
 */
export type SingleClassifyResult =
  | { status: "classified"; prediction: Prediction }
  | { status: "declined"; reason: string }
  | { status: "invalid"; reason: string };

export interface ClassifyOneArgs {
  productName: string;
  vocabulary: string[];
  classify: Classify;
}

/**
 * Validate a user-supplied product name, classify it name-only against the closed
 * vocabulary, and gate the result on confidence. Trims surrounding whitespace
 * FIRST, so it never counts toward emptiness or the length bound, and every
 * subsequent check (and the value handed to `classify`) operates on the trimmed
 * text. Junk input short-circuits before any model call. A rejecting `classify`
 * propagates (fail-fast) — no fabricated result.
 */
export async function classifyOne({
  productName,
  vocabulary,
  classify,
}: ClassifyOneArgs): Promise<SingleClassifyResult> {
  // Trim FIRST: surrounding whitespace bounds neither emptiness nor the length cap.
  const name = productName.trim();
  if (name.length === 0) {
    return { status: "invalid", reason: "Enter a product name to classify." };
  }
  if (name.length > MAX_PRODUCT_NAME_LENGTH) {
    return {
      status: "invalid",
      reason: `Product name is too long — keep it under ${MAX_PRODUCT_NAME_LENGTH} characters.`,
    };
  }

  // Name-only input: the visitor's text as `productDisplayName`, the empty string
  // for every other field including the vendor `articleType` label. The model is
  // given only the name, with no attribute and no label to anchor on (Story 2).
  const input: ClassificationInput = {
    productDisplayName: name,
    gender: "",
    baseColour: "",
    season: "",
    year: "",
    usage: "",
    articleType: "",
  };

  // Fail-fast: a rejecting `classify` propagates; we never swallow it or fabricate.
  const prediction = await classify(input, vocabulary);

  // Confidence gate (Story 4): a `low`-confidence prediction is surfaced as a
  // decline rather than a forced article type. `medium`/`high` classify.
  if (prediction.confidence === "low") {
    return {
      status: "declined",
      reason:
        "That doesn't look like something we can confidently classify as apparel.",
    };
  }
  return { status: "classified", prediction };
}
