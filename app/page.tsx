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
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  runViewReducer,
  initialRunViewState,
  formatTagAccuracy,
} from "../src/view-reducer";
import {
  cumulativeAccuracy,
  cumulativeTagAccuracy,
} from "../src/cumulative";
import type { CumulativeTotals } from "../src/cumulative";
import type { RunStreamEvent } from "../src/run-stream";
import type { RunEntry, Tag } from "../src/types";
// Type-only import: single-classify.ts is SDK-free, so this never pulls the SDK or
// the key into the browser bundle (key-isolation.test.ts allows this).
import type { SingleClassifyResult } from "../src/single-classify";

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

  // The cumulative panel reads shared, server-authoritative totals. It fails SOFT:
  // a fetch fault keeps the last-known totals (or the loading state) and never takes
  // down the Run button.
  const [cumulative, setCumulative] = useState<CumulativeTotals | null>(null);
  const [cumulativeUnavailable, setCumulativeUnavailable] = useState(false);

  const loadCumulative = useCallback(async () => {
    try {
      const res = await fetch("/api/cumulative", { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error("cumulative unavailable");
      setCumulative((await res.json()) as CumulativeTotals);
      setCumulativeUnavailable(false);
    } catch {
      // Keep whatever we last had; just flag unavailability for the label.
      setCumulativeUnavailable(true);
    }
  }, []);

  // Initial read on mount (Story 1: the figure reflects every prior run, including
  // other visitors', before this visitor runs anything).
  useEffect(() => {
    loadCumulative();
  }, [loadCumulative]);

  async function startRun() {
    if (runningRef.current) return; // no concurrent run from this view
    runningRef.current = true;
    dispatch({ type: "start" });
    let sawScore = false;
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
        for (const ev of events) {
          if (ev.type === "score") sawScore = true;
          dispatch(ev);
        }
      }
    } catch (err) {
      dispatch({
        type: "error",
        message: err instanceof Error ? err.message : "The run failed unexpectedly.",
      });
    } finally {
      runningRef.current = false;
    }
    // Live tick (Story 4): a completed run re-reads the cumulative so the panel ticks
    // to include it — no reload. A failed run (no score) leaves the panel untouched;
    // the recorder committed nothing, so there is nothing new to read.
    if (sawScore) loadCumulative();
  }

  const isRunning = state.status === "running";
  const accuracyPct = (n: number) => `${Math.round(n * 100)}%`;
  const headlineAccuracy =
    state.status === "done" && state.score
      ? accuracyPct(state.score.accuracy)
      : accuracyPct(state.liveAccuracy);

  // Cumulative headline accuracy: null (empty state) when no run has been recorded
  // yet — rendered as a non-numeric marker, never NaN or a fake 0%.
  const cumulativeOverall =
    cumulative && cumulative.total > 0 ? cumulativeAccuracy(cumulative) : null;
  const cumulativeIsEmpty = !cumulative || cumulative.total === 0;

  // Screen-reader announcement for the aria-live region (Story 7 + Story 4: the
  // cumulative tick is announced here too).
  const cumulativeSpoken =
    cumulative && cumulative.total > 0
      ? ` Cumulative accuracy across ${cumulative.runs} run${cumulative.runs === 1 ? "" : "s"}: ${formatTagAccuracy(cumulativeOverall)}.`
      : "";
  const liveMessage =
    state.status === "running"
      ? `Run in progress: ${state.rows.length} record${state.rows.length === 1 ? "" : "s"} classified so far, live accuracy ${accuracyPct(state.liveAccuracy)}.`
      : state.status === "done"
        ? `Run complete: ${state.score?.total ?? 0} records, ${headlineAccuracy} accuracy.${cumulativeSpoken}`
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

      <CumulativePanel
        totals={cumulative}
        isEmpty={cumulativeIsEmpty}
        overall={cumulativeOverall}
        unavailable={cumulativeUnavailable}
      />

      <SingleRecordPanel />

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

// The cumulative-across-all-runs panel (Story 1, 4, 5). Distinct from the per-run
// figure: it shows a stabilized overall accuracy, the run/record count it is computed
// over, and the near/far/blank breakdown — all read from the server's authoritative
// totals, never recomputed in the browser beyond formatting. Before any run is
// recorded it shows a clear "no runs yet" empty state, never NaN.
function CumulativePanel({
  totals,
  isEmpty,
  overall,
  unavailable,
}: {
  totals: CumulativeTotals | null;
  isEmpty: boolean;
  overall: number | null;
  unavailable: boolean;
}) {
  return (
    <section
      aria-labelledby="cumulative-heading"
      className="mb-6 rounded-md border border-slate-800 bg-slate-900/40 px-4 py-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="cumulative-heading" className="text-sm font-semibold text-slate-300">
          Cumulative across all runs
        </h2>
        {totals && totals.total > 0 && (
          <span className="text-slate-500">
            {totals.runs} run{totals.runs === 1 ? "" : "s"} · {totals.total} record
            {totals.total === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {isEmpty ? (
        <p className="mt-2 text-slate-400">
          {unavailable
            ? "The cumulative tally is temporarily unavailable."
            : "No runs yet — the cumulative accuracy appears here once the first run completes."}
        </p>
      ) : (
        <>
          <p className="mt-2 text-slate-200">
            <span className="text-slate-400">Overall:</span>{" "}
            <span className="text-2xl font-semibold tabular-nums">
              {formatTagAccuracy(overall)}
            </span>
            {unavailable && (
              <span className="ml-2 text-slate-500">(last known — update unavailable)</span>
            )}
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(Object.keys(TAG_LABELS) as Tag[]).map((tag) => {
              const cell = totals!.byTag[tag];
              return (
                <div
                  key={tag}
                  className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2"
                >
                  <div className="text-slate-400">{TAG_LABELS[tag]}</div>
                  <div className="text-lg font-semibold tabular-nums">
                    {formatTagAccuracy(cumulativeTagAccuracy(totals!, tag))}
                  </div>
                  <div className="text-slate-500">
                    {cell.count} record{cell.count === 1 ? "" : "s"}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

// The live single-record panel (feature 5). A visitor types one product name, the
// panel POSTs it to /api/classify, and renders the same classifier's gated result
// inline: a classification (type + confidence + rationale + the classified name), a
// decline (off-distribution), or a visible error with retry. There is no ✓/✗ and no
// accuracy — a user-supplied name has no ground truth (Story 2). It renders every
// model-derived string as plain TEXT (never raw HTML), so a hostile product name
// stays inert (Story 6). Client-only: it never imports the SDK or the key.
type PanelState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "result"; classifiedName: string; result: SingleClassifyResult }
  | { status: "error"; message: string };

function SingleRecordPanel() {
  const [name, setName] = useState("");
  const [state, setState] = useState<PanelState>({ status: "idle" });
  const submittingRef = useRef(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return; // no concurrent classify from this view
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      // Cheap client-side guard so an empty box never bills a call; the route
      // enforces the same (and the length bound) authoritatively.
      setState({
        status: "result",
        classifiedName: "",
        result: { status: "invalid", reason: "Enter a product name to classify." },
      });
      return;
    }

    submittingRef.current = true;
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ productName: trimmed }),
      });
      const data = (await res.json()) as SingleClassifyResult | { error: string };
      if ("error" in data) throw new Error(data.error);
      setState({ status: "result", classifiedName: trimmed, result: data });
    } catch (err) {
      setState({
        status: "error",
        message:
          err instanceof Error ? err.message : "The classification failed unexpectedly.",
      });
    } finally {
      submittingRef.current = false;
    }
  }

  const isLoading = state.status === "loading";

  // One screen-reader announcement for the async outcome (Story 7).
  const spoken =
    state.status === "loading"
      ? "Classifying…"
      : state.status === "error"
        ? `Classification failed: ${state.message}`
        : state.status === "result"
          ? state.result.status === "classified"
            ? `Classified as ${state.result.prediction.articleType}, ${state.result.prediction.confidence} confidence.`
            : state.result.status === "declined"
              ? `Declined: ${state.result.reason}`
              : `Invalid input: ${state.result.reason}`
          : "";

  return (
    <section
      aria-labelledby="single-heading"
      className="mb-6 rounded-md border border-slate-800 bg-slate-900/40 px-4 py-3"
    >
      <h2 id="single-heading" className="text-sm font-semibold text-slate-300">
        Try it on your own product name
      </h2>
      <p className="mt-1 text-slate-400">
        Type any apparel product name and the same classifier places it — from the
        name alone, constrained to the demo&apos;s article-type vocabulary.
      </p>

      <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[16rem]">
          <label htmlFor="single-name" className="block text-slate-300">
            Product name
          </label>
          <input
            id="single-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Nike running shorts"
            maxLength={200}
            autoComplete="off"
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-600 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
        </div>
        <button
          type="submit"
          disabled={isLoading}
          aria-busy={isLoading}
          className="rounded-md bg-sky-500 px-4 py-2 font-medium text-slate-950 transition hover:bg-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "Classifying…" : "Classify"}
        </button>
      </form>

      {/* Async outcome announced for screen readers (Story 7). */}
      <div role="status" aria-live="polite" className="sr-only">
        {spoken}
      </div>

      <div className="mt-3">
        {state.status === "error" && (
          <div
            role="alert"
            className="rounded-md border border-red-400/50 bg-red-950/40 px-3 py-2 text-red-200"
          >
            <p className="font-medium">Classification failed.</p>
            <p className="mt-1 text-red-300">{state.message}</p>
            <p className="mt-1 text-red-300">Try again.</p>
          </div>
        )}

        {state.status === "result" && state.result.status === "classified" && (
          <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
            <p className="text-slate-400">
              Classified <span className="text-slate-200">{state.classifiedName}</span> as
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-100">
              {state.result.prediction.articleType}{" "}
              <span className="text-sm font-normal capitalize text-slate-400">
                · {state.result.prediction.confidence} confidence
              </span>
            </p>
            <p className="mt-1 text-slate-300">{state.result.prediction.rationale}</p>
          </div>
        )}

        {state.status === "result" && state.result.status === "declined" && (
          <div className="rounded-md border border-amber-400/40 bg-amber-950/30 px-3 py-2 text-amber-200">
            <p className="font-medium">Not classified</p>
            <p className="mt-1 text-amber-300/90">{state.result.reason}</p>
          </div>
        )}

        {state.status === "result" && state.result.status === "invalid" && (
          <div className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-slate-300">
            {state.result.reason}
          </div>
        )}
      </div>
    </section>
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
