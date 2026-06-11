// app.jsx — composition: narrative layer + recreated dashboard + Tweaks.
const { useReducer } = React;

// Accent stays strictly within the app's cool, dark/slate/sky vocabulary.
const ACCENTS = {
  sky: { solid: "#0ea5e9", text: "#7dd3fc", label: "Sky" }, // current app accent
  cyan: { solid: "#06b6d4", text: "#67e8f9", label: "Cyan" },
  indigo: { solid: "#6366f1", text: "#a5b4fc", label: "Indigo" },
};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "introDensity": "standard",
  "showSteps": true,
  "teachingPlacement": "aside",
  "honestyPlacement": "below-hero",
  "plainTableHeaders": true,
  "accent": "sky"
}/*EDITMODE-END*/;

// Simulated streaming run: rows arrive one at a time, like the real SSE stream.
function runReducer(state, action) {
  switch (action.type) {
    case "start":
      return { status: "running", rows: [] };
    case "row":
      return { status: "running", rows: [...state.rows, action.row] };
    case "done":
      return { status: "done", rows: state.rows };
    case "reset":
      return { status: "idle", rows: [] };
    default:
      return state;
  }
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const accent = ACCENTS[t.accent] || ACCENTS.sky;

  const [run, dispatch] = useReducer(runReducer, { status: "idle", rows: [] });
  const timers = React.useRef([]);

  function startRun() {
    if (run.status === "running") return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    dispatch({ type: "start" });
    window.MOCK_ROWS.forEach((row, i) => {
      timers.current.push(setTimeout(() => dispatch({ type: "row", row }), 260 * (i + 1)));
    });
    timers.current.push(
      setTimeout(() => dispatch({ type: "done" }), 260 * (window.MOCK_ROWS.length + 1))
    );
  }

  const accuracyPct = run.rows.length ? window.pct(window.runAccuracy(run.rows)) : "\u2014";
  const breakdown = window.computeBreakdown(run.rows);

  // Honesty note appears in exactly one place, chosen by the tweak.
  const honestyMode = t.honestyPlacement === "collapsed" ? "collapsed" : "card";
  const honestyAtHero = t.honestyPlacement === "below-hero" || t.honestyPlacement === "collapsed";
  const honestyAtTable = t.honestyPlacement === "by-table";

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <Hero accent={accent} density={t.introDensity} />

      {t.showSteps && t.introDensity !== "minimal" && <HowItWorks accent={accent} />}

      <TeachingPoint mode={t.teachingPlacement} accent={accent} />

      {honestyAtHero && <HonestyNote mode={honestyMode} accent={accent} />}

      <RunControls
        accent={accent}
        status={run.status}
        rows={run.rows}
        accuracyPct={accuracyPct}
        onRun={startRun}
      />

      <CumulativePanel totals={window.MOCK_CUMULATIVE} />

      <SingleRecordPanel accent={accent} />

      {run.status === "done" && <Breakdown breakdown={breakdown} />}

      {honestyAtTable && <HonestyNote mode="card" accent={accent} />}

      <ResultsTable rows={run.rows} showPlainHeaders={t.plainTableHeaders} />

      <footer className="mt-10 border-t border-slate-800 pt-4 text-xs text-slate-600">
        Prototype of the narrative &amp; self-explanation pass (roadmap feature 7). Run data
        is a fixed sample replayed locally; the live app streams real classifications.
      </footer>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Narrative" />
        <TweakRadio
          label="Intro density"
          value={t.introDensity}
          options={["minimal", "standard", "guided"]}
          onChange={(v) => setTweak("introDensity", v)}
        />
        <TweakToggle
          label="Show how-it-works steps"
          value={t.showSteps}
          onChange={(v) => setTweak("showSteps", v)}
        />
        <TweakSection label="Teaching point (normalization vs. classification)" />
        <TweakSelect
          label="Placement"
          value={t.teachingPlacement}
          options={["aside", "inline", "collapsed", "hidden"]}
          onChange={(v) => setTweak("teachingPlacement", v)}
        />
        <TweakSection label="Honesty note (the name carries the signal)" />
        <TweakSelect
          label="Placement"
          value={t.honestyPlacement}
          options={["below-hero", "by-table", "collapsed", "hidden"]}
          onChange={(v) => setTweak("honestyPlacement", v)}
        />
        <TweakSection label="Results table" />
        <TweakToggle
          label="Plain-language column headers"
          value={t.plainTableHeaders}
          onChange={(v) => setTweak("plainTableHeaders", v)}
        />
        <TweakSection label="Accent (cool family)" />
        <TweakColor
          label="Accent"
          value={accent.solid}
          options={[ACCENTS.sky.solid, ACCENTS.cyan.solid, ACCENTS.indigo.solid]}
          onChange={(v) => {
            const key = Object.keys(ACCENTS).find((k) => ACCENTS[k].solid === v) || "sky";
            setTweak("accent", key);
          }}
        />
      </TweaksPanel>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
