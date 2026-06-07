// The SSE wire encoder (Story 3, wire framing). @scaffolding: the encoder name and
// the event-name strings may change. What must hold: every event round-trips (the
// `data` payload parses back to the frozen shape it carried), free text containing
// newlines does NOT break the frame, and each frame is terminated so a client can
// actually dispatch it.
import { describe, it, expect } from "vitest";
import { encodeSseEvent } from "../../../src/sse-encoder";
import type { RunStreamEvent } from "../../../src/run-stream";
import type { RunScore } from "../../../src/types";
import { entry } from "./helpers";

// Pull the JSON payload back out of an encoded SSE frame the way a client would:
// concatenate the `data:` lines and parse.
function parseData(frame: string): unknown {
  const dataLines = frame
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).replace(/^ /, ""));
  expect(dataLines.length).toBeGreaterThan(0);
  return JSON.parse(dataLines.join("\n"));
}

describe("encodeSseEvent", () => {
  it("round-trips an entry event's RunEntry, including a rationale that contains a newline", () => {
    const e = entry({
      id: "1",
      trueArticleType: "Tshirts",
      predictedArticleType: "Tshirts",
      rationale: "line one\nline two — the name says tee",
    });
    const frame = encodeSseEvent({ type: "entry", entry: e } as RunStreamEvent);

    expect(frame.endsWith("\n\n")).toBe(true); // terminated → dispatchable
    expect(parseData(frame)).toEqual(e); // newline survived, payload intact
  });

  it("round-trips a score event's RunScore", () => {
    const score: RunScore = {
      total: 6,
      accuracy: 0.5,
      breakdown: {
        "near-swap": { count: 2, accuracy: 0 },
        "far-swap": { count: 2, accuracy: 0.5 },
        blank: { count: 2, accuracy: 1 },
      },
    };
    const frame = encodeSseEvent({ type: "score", score } as RunStreamEvent);

    expect(frame.endsWith("\n\n")).toBe(true);
    expect(parseData(frame)).toEqual(score);
  });

  it("encodes an error event as a well-formed, terminated frame carrying the message", () => {
    const frame = encodeSseEvent({ type: "error", message: "model unavailable" } as RunStreamEvent);
    expect(frame.endsWith("\n\n")).toBe(true);
    expect(JSON.stringify(parseData(frame))).toContain("model unavailable");
  });
});
