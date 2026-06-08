"use client";

// The dashboard page (feature 3). A client component because it owns the streaming
// run state. It imports ONLY the SDK-free reducer and type-only shapes — never the
// Anthropic SDK, the real adapter, or anything that pulls in `node:fs` — so nothing
// server-side leaks into the browser bundle (key-isolation.test.ts enforces this).
//
// It opens the SSE stream from /api/run, parses frames, folds them into
// runViewReducer, and renders progressively: a results table that grows one row at a
// time, a live headline accuracy, the authoritative near/far/blank breakdown on
// completion, and a fail-fast error state with retry.
import { useReducer, useRef } from "react";
import {
  runViewReducer,
  initialRunViewState,
  formatTagAccuracy,
} from "../src/view-reducer";
import type { RunStreamEvent } from "../src/run-stream";
import type { RunEntry, Tag } from "../src/types";

const TAG_LABELS: Record<Tag, string> = {
  "near-swap": "Near swap",
  "far-swap": "Far swap",
  blank: "Blank",
};

// Parse the SSE text buffer into whole events, returning the parsed events and the
// unparsed remainder (a frame split across chunks).
function parseFrames(buffer: string): { events: RunStreamEvent[]; rest: string } {
  const events: RunStreamEvent[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? ""; // last piece may be an incomplete frame
  for (const frame of parts) {
    if (!frame.trim()) continue;
    let type: string | null = null;
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) type = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
    }
    if (!type || dataLines.length === 0) continue;
    const data = JSON.parse(dataLines.join("\n"));
    if (type === "entry") events.push({ type: "entry", entry: data as RunEntry });
    else if (type === "score") events.push({ type: "score", score: data });
    else if (type === "error") events.push({ type: "error", message: data.message });
  }
  return { events, rest };
}

export default function Page() {
  const [state, dispatch] = useReducer(runViewReducer, initialRunViewState);
  const runningRef = useRef(false);

  async function startRun() {
    if (runningRef.current) return; // no concurrent run from this view
    runningRef.current = true;
    dispatch({ type: "start" });
    try {
      const res = await fetch("/api/run", { headers: { accept: "text/event-stream" } });
      if (!res.body) throw new Error("No response stream from the server.");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = parseFrames(buffer);
        buffer = rest;
        for (const ev of events) dispatch(ev);
      }
    } catch (err) {
      dispatch({
        type: "error",
        message: err instanceof Error ? err.message : "The run failed unexpectedly.",
      });
    } finally {
      runningRef.current = false;
    }
  }

  const isRunning = state.status === "running";
  const accuracyPct = (n: number) => `${Math.round(n * 100)}%`;
  const headlineAccuracy =
    state.status === "done" && state.score
      ? accuracyPct(state.score.accuracy)
      : accuracyPct(state.liveAccuracy);

  // Screen-reader announcement for the aria-live region (Story 7).
  const liveMessage =
    state.status === "running"
      ? `Run in progress: ${state.rows.length} record${state.rows.length === 1 ? "" : "s"} classified so far, live accuracy ${accuracyPct(state.liveAccuracy)}.`
      : state.status === "done"
        ? `Run complete: ${state.score?.total ?? 0} records, ${headlineAccuracy} accuracy.`
        : state.status === "error"
          ? `Run failed: ${state.error ?? "unknown error"}. No accuracy is reported for a failed run.`
          : "Idle. Press Run to start a classification run.";

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Apparel Classifier</h1>
        <p className="mt-1 max-w-2xl text-slate-300">
          Real apparel records have their <code>articleType</code> deliberately
          corrupted, then an LLM recovers it. Each row shows the true label, the
          corrupted value the model saw, and what it predicted — scored strictly
          against ground truth.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={startRun}
          disabled={isRunning}
          aria-busy={isRunning}
          className="rounded-md bg-sky-500 px-4 py-2 font-medium text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRunning ? "Running…" : state.status === "idle" ? "Run" : "Run again"}
        </button>

        <p className="text-slate-200">
          <span className="text-slate-400">Accuracy:</span>{" "}
          <span className="font-semibold tabular-nums">
            {state.status === "idle" ? "—" : headlineAccuracy}
          </span>
          {state.status === "running" && (
            <span className="text-slate-400"> (live, {state.rows.length} so far)</span>
          )}
          {state.status === "done" && state.score && (
            <span className="text-slate-400"> ({state.score.total} records)</span>
          )}
        </p>
      </div>

      {/* Streaming progress / completion / failure announced for screen readers. */}
      <div role="status" aria-live="polite" className="sr-only">
        {liveMessage}
      </div>

      {state.status === "error" && (
        <div
          role="alert"
          className="mb-6 rounded-md border border-red-400/50 bg-red-950/40 px-4 py-3 text-red-200"
        >
          <p className="font-medium">The run did not complete.</p>
          <p className="mt-1 text-red-300">{state.error}</p>
          <p className="mt-1 text-red-300">
            No accuracy is reported for a failed run. The rows below are the records
            that were classified before the failure.
          </p>
          <button
            type="button"
            onClick={startRun}
            className="mt-3 rounded-md border border-red-400/60 px-3 py-1.5 font-medium text-red-100 hover:bg-red-900/40"
          >
            Retry
          </button>
        </div>
      )}

      {state.status === "done" && state.score && (
        <section aria-labelledby="breakdown-heading" className="mb-6">
          <h2 id="breakdown-heading" className="mb-2 text-sm font-semibold text-slate-300">
            Accuracy by corruption type
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(Object.keys(TAG_LABELS) as Tag[]).map((tag) => {
              const cell = state.score!.breakdown[tag];
              return (
                <div key={tag} className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
                  <div className="text-slate-400">{TAG_LABELS[tag]}</div>
                  <div className="text-lg font-semibold tabular-nums">
                    {formatTagAccuracy(cell.accuracy)}
                  </div>
                  <div className="text-slate-500">
                    {cell.count} record{cell.count === 1 ? "" : "s"}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <ResultsTable rows={state.rows} />
    </main>
  );
}

function ResultsTable({ rows }: { rows: RunEntry[] }) {
  return (
    <table className="w-full border-collapse text-left">
      <caption className="sr-only">
        Per-record classification results: true article type, the corrupted value the
        model was shown, the prediction, whether it was correct, the model&apos;s
        confidence, and its rationale.
      </caption>
      <thead>
        <tr className="border-b border-slate-700 text-slate-400">
          <th scope="col" className="py-2 pr-3 font-medium">Original</th>
          <th scope="col" className="py-2 pr-3 font-medium">Corrupted</th>
          <th scope="col" className="py-2 pr-3 font-medium">Predicted</th>
          <th scope="col" className="py-2 pr-3 font-medium">Result</th>
          <th scope="col" className="py-2 pr-3 font-medium">Confidence</th>
          <th scope="col" className="py-2 font-medium">Rationale</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={6} className="py-6 text-slate-500">
              No results yet. Press Run to classify a fresh batch of records.
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={row.id} className="border-b border-slate-800 align-top">
              <td className="py-2 pr-3">{row.trueArticleType}</td>
              <td className="py-2 pr-3">
                {row.corruptionTag === "blank" || row.corruptedValue === "" ? (
                  <span className="italic text-slate-500">(blank)</span>
                ) : (
                  row.corruptedValue
                )}
              </td>
              <td className="py-2 pr-3">{row.predictedArticleType}</td>
              <td className="py-2 pr-3">
                {/* Not colour alone: a glyph + word back the colour (Story 7). */}
                {row.correct ? (
                  <span className="text-green-400">✓ correct</span>
                ) : (
                  <span className="text-red-400">✗ wrong</span>
                )}
              </td>
              <td className="py-2 pr-3 capitalize">{row.confidence}</td>
              <td className="py-2 text-slate-300">{row.rationale}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
