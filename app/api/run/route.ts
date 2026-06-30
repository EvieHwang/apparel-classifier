// Server route for one classification run (feature 3).
//
// This is the ONLY module that reads `ANTHROPIC_API_KEY`, constructs the Anthropic
// SDK client, and builds the live `classify`. It is a server route (no "use client"
// directive), so the SDK and the key never reach the browser. By design no test
// imports it (it pulls in the SDK), exactly as feature 2's `src/anthropic.ts` is
// validated manually — see key-isolation.test.ts, which forbids the SDK only in
// *client* components under app/.
//
// It loads the curated subset, picks the fixed run size and a fresh random seed, and
// pipes the run-event stream out as Server-Sent Events. A missing/blank key fails
// closed with a non-2xx error frame (Story 5) — never a silent hang, never a key in
// the response.
import Anthropic from "@anthropic-ai/sdk";
import { join } from "node:path";
import { createAnthropicClassifier } from "../../../src/classify";
import { createRunStructured } from "../../../src/anthropic";
import { loadSubset } from "../../../src/dataset";
import { RUN_SIZE } from "../../../src/run-config";
import { runEventStream } from "../../../src/run-stream";
import { recordRunStream } from "../../../src/record-run";
import { getCumulativeStore } from "../../../src/cumulative-sqlite";
import { encodeSseEvent } from "../../../src/sse-encoder";
import { getRateLimiter } from "../../../src/rate-limit";
import { clientKey } from "../../../src/client-ip";
import { rateLimitResponse } from "../../../src/rate-limit-response";
import { isSitePaused, SITE_PAUSED_MESSAGE } from "../../../src/site-paused";
import type { Classify } from "../../../src/types";

// SSE needs an unbuffered, dynamic response — never statically cached.
export const dynamic = "force-dynamic";

const SSE_HEADERS: HeadersInit = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
};

const SUBSET_PATH = join(process.cwd(), "docs", "apparel-subset.csv");

export async function GET(request: Request): Promise<Response> {
  // Kill switch: if the demo is paused, fail closed BEFORE the limiter, the key, or any
  // model call — a friendly terminal SSE error frame (503) the client renders as the
  // run's error state, never a started run and never an API cost.
  if (isSitePaused()) {
    return new Response(
      encodeSseEvent({ type: "error", message: SITE_PAUSED_MESSAGE }),
      { status: 503, headers: SSE_HEADERS },
    );
  }

  // Abuse gate (feature 6): consult the limiter BEFORE reading the key, constructing the
  // Anthropic client, or opening any SSE stream. A refusal returns a plain 429/503 with
  // Retry-After — never a text/event-stream that was already started, and never a model
  // call. The global ceiling is checked before the per-IP cap inside admit().
  const decision = getRateLimiter().admit(clientKey(request.headers));
  if (!decision.ok) return rateLimitResponse(decision);

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    // Fail closed: clear, non-2xx, no key value anywhere in the payload.
    return new Response(
      encodeSseEvent({
        type: "error",
        message:
          "Server is not configured with an ANTHROPIC_API_KEY; cannot run a classification.",
      }),
      { status: 500, headers: SSE_HEADERS },
    );
  }

  // Live classifier — built here and nowhere else.
  const client = new Anthropic({ apiKey });
  const classify: Classify = createAnthropicClassifier(createRunStructured(client));

  const subset = loadSubset(SUBSET_PATH);
  const seed = Math.floor(Math.random() * 2_147_483_647); // fresh per run, server-side

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // Wrap the run stream in the recorder pass-through: it forwards every SSE
        // frame UNCHANGED (so the client parses the identical bytes feature 3 emits)
        // while folding a successfully completed run into the cumulative store. Because
        // the recorder awaits the commit before its stream completes, this "iterate
        // then close" loop closes the response only after the write has landed — the
        // Story 4 no-lost-update guarantee, owned by the tested recorder seam.
        const events = recordRunStream(
          runEventStream({ subset, n: RUN_SIZE, seed, classify }),
          getCumulativeStore(),
        );
        for await (const event of events) {
          controller.enqueue(encoder.encode(encodeSseEvent(event)));
        }
      } catch (err) {
        // runEventStream already converts a classify rejection into a terminal
        // error event; this guards anything else (e.g. a subset/load fault) so the
        // client always gets a terminal frame rather than a hung connection.
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(encodeSseEvent({ type: "error", message })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { status: 200, headers: SSE_HEADERS });
}
