// SSE wire encoder (feature 3, Story 3 — wire framing).
//
// A tiny pure function mapping a `RunStreamEvent` to one Server-Sent-Events text
// frame: a named `event:` line, the JSON payload on a `data:` line, and the blank
// line that terminates (and thus dispatches) the frame. Kept separate from the
// route so the framing is unit-observable without spinning a server.
//
// `JSON.stringify` escapes newlines inside free text (e.g. a multi-line rationale)
// into the two characters `\n`, so the payload is always a single physical line and
// a stray newline can never split the frame. The event-name strings are an internal
// wire detail (@scaffolding); the data each frame carries is the frozen shape.
import type { RunStreamEvent } from "./run-stream";

/** Map an event to its `data:` payload — the frozen shape it carries. */
function payloadOf(event: RunStreamEvent): unknown {
  switch (event.type) {
    case "entry":
      return event.entry;
    case "score":
      return event.score;
    case "error":
      return { message: event.message };
  }
}

export function encodeSseEvent(event: RunStreamEvent): string {
  const data = JSON.stringify(payloadOf(event));
  return `event: ${event.type}\ndata: ${data}\n\n`;
}
