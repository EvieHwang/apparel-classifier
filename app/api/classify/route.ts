// Server route for one live single-record classification (feature 5).
//
// The second member of feature 3's "reads the key, imports the SDK, manually
// validated, never imported by tests" set. It is a server route (no "use client"),
// so the SDK and the key never reach the browser. By design no test imports it
// (it pulls in the SDK) — see key-isolation.test.ts, which forbids the SDK only in
// *client* components under app/.
//
// It loads the curated subset solely for its closed `vocabulary` (no corruption,
// no sampling here), builds the live `classify`, and hands the user-supplied
// product name to the SDK-free `classifyOne` decision seam. A missing/blank key
// fails closed with a clear non-2xx error (Story 5) — never a silent hang, never a
// key value in the response.
import Anthropic from "@anthropic-ai/sdk";
import { join } from "node:path";
import { createAnthropicClassifier } from "../../../src/classify";
import { createRunStructured } from "../../../src/anthropic";
import { loadSubset } from "../../../src/dataset";
import { classifyOne } from "../../../src/single-classify";
import type { Classify } from "../../../src/types";

export const dynamic = "force-dynamic";

const SUBSET_PATH = join(process.cwd(), "docs", "apparel-subset.csv");

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    // Fail closed: clear, non-2xx, no key value anywhere in the payload.
    return Response.json(
      {
        error:
          "Server is not configured with an ANTHROPIC_API_KEY; cannot classify.",
      },
      { status: 500 },
    );
  }

  // Pull the product name out of the JSON body. A malformed body or a non-string
  // name is a client error, turned away before any model call.
  let productName: unknown;
  try {
    const body = (await request.json()) as { productName?: unknown };
    productName = body?.productName;
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  if (typeof productName !== "string") {
    return Response.json(
      { error: "productName must be a string." },
      { status: 400 },
    );
  }

  // Live classifier — built here and nowhere else.
  const client = new Anthropic({ apiKey });
  const classify: Classify = createAnthropicClassifier(createRunStructured(client));
  const subset = loadSubset(SUBSET_PATH);

  try {
    const result = await classifyOne({
      productName,
      vocabulary: subset.vocabulary,
      classify,
    });
    // Status mapping: invalid → 400 (no model call happened); classified/declined
    // → 200 (a real, gated result).
    const httpStatus = result.status === "invalid" ? 400 : 200;
    return Response.json(result, { status: httpStatus });
  } catch (err) {
    // Fail-fast: a rejecting classify propagates to a clear non-2xx error body, the
    // same posture as feature 2 — never a partial or fabricated result.
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 502 });
  }
}
