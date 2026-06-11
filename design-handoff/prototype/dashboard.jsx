// dashboard.jsx
// Faithful recreation of the existing dashboard panels (app/page.tsx), adapted to
// run on mocked data so the narrative layer can be designed against a real surface.
// Markup, classes, and the dark/slate/sky vocabulary mirror the production app:
// run control + headline accuracy, cumulative panel, single-record panel,
// by-corruption-type breakdown, and the per-record results table.

const { useState: useStateD, useRef: useRefD, useEffect: useEffectD } = React;

// ── Run control + headline accuracy ──────────────────────────────────────────
function RunControls({ accent, status, rows, accuracyPct, onRun }) {
  const isRunning = status === "running";
  const label = isRunning ? "Running\u2026" : status === "idle" ? "Run" : "Run again";
  return (
    <div className="mb-6 flex flex-wrap items-center gap-4">
      <button
        type="button"
        onClick={onRun}
        disabled={isRunning}
        aria-busy={isRunning}
        className="rounded-md px-4 py-2 font-medium text-slate-950 transition disabled:cursor-not-allowed disabled:opacity-60"
        style={{ backgroundColor: accent.solid }}
      >
        {label}
      </button>
      <p className="text-slate-200">
        <span className="text-slate-400">Accuracy:</span>{" "}
        <span className="font-semibold tabular-nums">
          {status === "idle" ? "\u2014" : accuracyPct}
        </span>
        {status === "running" && (
          <span className="text-slate-400"> (live, {rows.length} so far)</span>
        )}
        {status === "done" && (
          <span className="text-slate-400"> ({rows.length} records)</span>
        )}
      </p>
    </div>
  );
}

// ── Cumulative across all runs ───────────────────────────────────────────────
function CumulativePanel({ totals }) {
  return (
    <section className="mb-6 rounded-md border border-slate-800 bg-slate-900/40 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-300">Cumulative across all runs</h2>
        <span className="text-slate-500">
          {totals.runs} runs &middot; {totals.total} records
        </span>
      </div>
      <p className="mt-2 text-slate-200">
        <span className="text-slate-400">Overall:</span>{" "}
        <span className="text-2xl font-semibold tabular-nums">{window.pct(totals.accuracy)}</span>
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Object.keys(window.TAG_LABELS).map((tag) => {
          const cell = totals.byTag[tag];
          const acc = cell.count ? cell.correct / cell.count : null;
          return (
            <div key={tag} className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
              <div className="text-slate-400">{window.TAG_LABELS[tag]}</div>
              <div className="text-lg font-semibold tabular-nums">{acc == null ? "\u2014" : window.pct(acc)}</div>
              <div className="text-slate-500">{cell.count} records</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── By-corruption-type breakdown (per-run, on completion) ─────────────────────
function Breakdown({ breakdown }) {
  return (
    <section aria-labelledby="breakdown-heading" className="mb-6">
      <h2 id="breakdown-heading" className="mb-2 text-sm font-semibold text-slate-300">
        Accuracy by corruption type
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Object.keys(window.TAG_LABELS).map((tag) => {
          const cell = breakdown[tag];
          return (
            <div key={tag} className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
              <div className="text-slate-400">{window.TAG_LABELS[tag]}</div>
              <div className="text-lg font-semibold tabular-nums">
                {cell.accuracy == null ? "\u2014" : window.pct(cell.accuracy)}
              </div>
              <div className="text-slate-500">{cell.count} record{cell.count === 1 ? "" : "s"}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Single-record live panel ─────────────────────────────────────────────────
// Mirrors the production SingleRecordPanel: type a name, get a gated classification
// inline. Mocked locally with a tiny keyword classifier so the prototype is live.
function SingleRecordPanel({ accent }) {
  const [name, setName] = useStateD("");
  const [state, setState] = useStateD({ status: "idle" });
  const busy = useRefD(false);

  function fakeClassify(productName) {
    const n = productName.toLowerCase();
    const table = [
      ["shorts", "Shorts"], ["jeans", "Jeans"], ["trouser", "Trousers"], ["tshirt", "Tshirts"],
      ["t-shirt", "Tshirts"], ["tee", "Tshirts"], ["shirt", "Shirts"], ["kurta", "Kurtas"],
      ["sweater", "Sweaters"], ["sweatshirt", "Sweatshirts"], ["jacket", "Jackets"],
      ["skirt", "Skirts"], ["top", "Tops"], ["brief", "Briefs"], ["boxer", "Boxers"],
      ["bra", "Bra"], ["legging", "Leggings"], ["track", "Track Pants"], ["short", "Shorts"],
    ];
    for (const [kw, type] of table) {
      if (n.includes(kw)) {
        return {
          status: "classified",
          prediction: {
            articleType: type,
            confidence: n.split(" ").length > 2 ? "high" : "medium",
            rationale: `The name contains \u201C${kw}\u201D, which maps directly to ${type} in the demo vocabulary.`,
          },
        };
      }
    }
    return {
      status: "declined",
      reason: "This name doesn\u2019t resolve to any of the 25 article types in the demo vocabulary. Try an apparel product name like \u201CNike running shorts.\u201D",
    };
  }

  function submit(e) {
    e.preventDefault();
    if (busy.current) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setState({ status: "result", classifiedName: "", result: { status: "invalid", reason: "Enter a product name to classify." } });
      return;
    }
    busy.current = true;
    setState({ status: "loading" });
    setTimeout(() => {
      setState({ status: "result", classifiedName: trimmed, result: fakeClassify(trimmed) });
      busy.current = false;
    }, 650);
  }

  const isLoading = state.status === "loading";

  return (
    <section className="mb-6 rounded-md border border-slate-800 bg-slate-900/40 px-4 py-3">
      <h2 className="text-sm font-semibold text-slate-300">Try it on your own product name</h2>
      <p className="mt-1 text-slate-400">
        Type any apparel product name and the same classifier places it &mdash; from the name
        alone, constrained to the demo&rsquo;s article-type vocabulary.
      </p>
      <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[16rem]">
          <label htmlFor="single-name" className="block text-slate-300">Product name</label>
          <input
            id="single-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Nike running shorts"
            maxLength={200}
            autoComplete="off"
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2"
            style={{ caretColor: accent.solid }}
            onFocus={(e) => (e.target.style.borderColor = accent.solid)}
            onBlur={(e) => (e.target.style.borderColor = "")}
          />
        </div>
        <button
          type="submit"
          disabled={isLoading}
          aria-busy={isLoading}
          className="rounded-md px-4 py-2 font-medium text-slate-950 transition focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          style={{ backgroundColor: accent.solid }}
        >
          {isLoading ? "Classifying\u2026" : "Classify"}
        </button>
      </form>

      <div className="mt-3">
        {state.status === "result" && state.result.status === "classified" && (
          <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
            <p className="text-slate-400">
              Classified <span className="text-slate-200">{state.classifiedName}</span> as
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-100">
              {state.result.prediction.articleType}{" "}
              <span className="text-sm font-normal capitalize text-slate-400">
                &middot; {state.result.prediction.confidence} confidence
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

// ── Results table ────────────────────────────────────────────────────────────
// Adds a plain-language column-header row above the technical labels — part of the
// narrative pass: a cold reader can parse original → corrupted → predicted → result
// without already knowing the jargon. Hoverable tag glosses on the corrupted cell.
function ResultsTable({ rows, showPlainHeaders }) {
  return (
    <table className="w-full border-collapse text-left">
      <thead>
        {showPlainHeaders && (
          <tr className="text-slate-500">
            <th scope="col" className="pb-0.5 pr-3 text-[11px] font-normal">the real label</th>
            <th scope="col" className="pb-0.5 pr-3 text-[11px] font-normal">what we broke it to</th>
            <th scope="col" className="pb-0.5 pr-3 text-[11px] font-normal">the model&rsquo;s guess</th>
            <th scope="col" className="pb-0.5 pr-3 text-[11px] font-normal">vs. the real label</th>
            <th scope="col" className="pb-0.5 pr-3 text-[11px] font-normal"></th>
            <th scope="col" className="pb-0.5 text-[11px] font-normal">why</th>
          </tr>
        )}
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
              <td className="py-2 pr-3">
                <div>{row.trueArticleType}</div>
                <div className="text-[11px] text-slate-600">{row.name}</div>
              </td>
              <td className="py-2 pr-3">
                {row.corruptionTag === "blank" || row.corruptedValue === "" ? (
                  <span className="italic text-slate-500" title={window.TAG_GLOSS.blank}>(blank)</span>
                ) : (
                  <span title={window.TAG_GLOSS[row.corruptionTag]}>{row.corruptedValue}</span>
                )}
                <div className="text-[11px] text-slate-600">{window.TAG_LABELS[row.corruptionTag]}</div>
              </td>
              <td className="py-2 pr-3">{row.predictedArticleType}</td>
              <td className="py-2 pr-3">
                {row.correct ? (
                  <span className="text-green-400">&#10003; correct</span>
                ) : (
                  <span className="text-red-400">&#10007; wrong</span>
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

Object.assign(window, { RunControls, CumulativePanel, Breakdown, SingleRecordPanel, ResultsTable });
