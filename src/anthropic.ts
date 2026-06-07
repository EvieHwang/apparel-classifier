// Real Anthropic-backed `runStructured` — the thin, manually-validated adapter
// that turns a record's allowed fields into a structured-output call and returns a
// typed Prediction (or null on a failed/empty parse).
//
// Validated manually, NOT in the unit bar: nothing under `tests/` imports this
// module, so the automated suite runs with no Anthropic SDK runtime dependency and
// no network. The SDK *client type* is imported with `import type` only; the `zod`
// enum and the SDK's `zodOutputFormat` helper are runtime imports, which is why
// this lives here and not in `classify.ts` (which the tests do import).
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type Anthropic from "@anthropic-ai/sdk";
import type { RunStructured } from "./classify";
import type { ClassificationInput, Prediction } from "./types";

const MODEL = "claude-opus-4-8";

// Build the system + user prompt from exactly the allowed fields. The corrupted/
// blank label is shown as the vendor-supplied `articleType`; the true type and
// subCategory are never present in `ClassificationInput`, so they cannot leak here.
function buildPrompt(input: ClassificationInput): string {
  const lines = [
    `productDisplayName: ${input.productDisplayName}`,
    `gender: ${input.gender}`,
    `baseColour: ${input.baseColour}`,
    `season: ${input.season}`,
    `year: ${input.year}`,
    `usage: ${input.usage}`,
    `vendor-supplied articleType: ${input.articleType === "" ? "(blank)" : input.articleType}`,
  ];
  return lines.join("\n");
}

/**
 * Create a `RunStructured` backed by an injected Anthropic client. The closed
 * vocabulary becomes a `zod` enum so the model's `articleType` is constrained to
 * the known set; `confidence` is the three-level enum; `rationale` is free text.
 * Returns `null` when the response carries no parsed structured output so the
 * adapter in `classify.ts` fails fast instead of fabricating a prediction.
 */
export function createRunStructured(client: Anthropic): RunStructured {
  return async (
    input: ClassificationInput,
    vocabulary: string[],
  ): Promise<Prediction | null> => {
    // z.enum needs a non-empty tuple; the closed vocabulary always has ≥ 2 types.
    const schema = z.object({
      articleType: z.enum(vocabulary as [string, ...string[]]),
      confidence: z.enum(["low", "medium", "high"]),
      rationale: z.string(),
    });

    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 1024,
      thinking: { type: "adaptive" },
      system:
        "You correct dirty apparel vendor data. Given a product's attributes " +
        "and a possibly-wrong or blank articleType label, return the single " +
        "correct articleType from the allowed list, a confidence level, and a " +
        "short rationale. Choose only from the allowed articleType values.",
      messages: [{ role: "user", content: buildPrompt(input) }],
      output_config: { format: zodOutputFormat(schema) },
    });

    const parsed = response.parsed_output;
    if (!parsed) return null;
    return {
      articleType: parsed.articleType,
      confidence: parsed.confidence,
      rationale: parsed.rationale,
    };
  };
}
