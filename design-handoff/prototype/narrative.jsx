// narrative.jsx
// THE FEATURE: the narrative & self-explanation pass (roadmap item 7).
// Everything here is framing copy that makes a forwarded link legible to a
// non-technical peer within a minute, plus the two required teaching payloads:
//   1. the normalization-vs-classification teaching point, and
//   2. the honesty note that the product name carries the signal.
// Voice: plainspoken and direct, matching the existing app. Audience: a product
// peer or hiring manager who opened a link with no context.

const { useState } = React;

// ── Hero ────────────────────────────────────────────────────────────────────
// Answers "what is this and why should I care" before any UI. Density-aware: at
// "minimal" it's a tight headline + one line; "guided" adds the stakes line.
function Hero({ accent, density }) {
  return (
    <header className="mb-8">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider" style={{ color: accent.text }}>
        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent.solid }}></span>
        Live demo · classify your own product below
      </div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">
        Apparel Classifier
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-300">
        Vendor product data arrives mislabeled &mdash; a pair of shorts filed as a bra, a
        category left blank. Those errors quietly compound downstream, distorting
        planning and inventory. This demo takes real, correctly-labeled apparel records,
        deliberately breaks the category field, and asks an LLM to put it back &mdash; then
        scores every guess against the original label.
      </p>
      {density === "guided" && (
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-400">
          The point isn&rsquo;t a clever party trick. It&rsquo;s a working argument that the
          taxonomy a merchandising team needs is already encoded in a model they can
          call today &mdash; and a demonstration of how to <em className="text-slate-300 not-italic font-medium">measure</em> that
          honestly when the answer is probabilistic.
        </p>
      )}
    </header>
  );
}

// ── How it works ──────────────────────────────────────────────────────────────
// The three-beat mental model: Corrupt → Classify → Score. This is what lets a
// cold reader parse the results table a moment later.
function HowItWorks({ accent }) {
  const steps = [
    {
      n: "1",
      title: "Corrupt",
      body: "Take a record with a known, correct type and damage it \u2014 swap it for a close sibling, a far-off type, or wipe it blank.",
    },
    {
      n: "2",
      title: "Classify",
      body: "The model sees the product\u2019s other fields \u2014 mainly its name \u2014 and predicts the original type, with a confidence and a one-line reason.",
    },
    {
      n: "3",
      title: "Score",
      body: "Each prediction is checked against the real label. Nothing is graded on a curve; a miss is a miss.",
    },
  ];
  return (
    <section aria-label="How this works" className="mb-8">
      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.n} className="relative rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-slate-950"
                style={{ backgroundColor: accent.solid }}
              >
                {s.n}
              </span>
              <span className="text-sm font-semibold text-slate-100">{s.title}</span>
              {i < steps.length - 1 && (
                <span className="ml-auto hidden text-slate-600 sm:inline" aria-hidden="true">&rarr;</span>
              )}
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-slate-400">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ── Teaching point: normalization vs classification ───────────────────────────
// Compact by default (an aside). Two other presentations available via Tweaks:
// "inline" (a bordered callout) and "collapsed" (a disclosure). All carry the
// same copy: this recovers the CATEGORY, it does NOT normalize vocabulary/format.
function TeachingPoint({ mode, accent }) {
  const body = (
    <>
      This recovers <span className="font-medium text-slate-200">which category</span> a
      product belongs to &mdash; Tshirts, Jeans, Briefs. It does <span className="font-medium text-slate-200">not</span> normalize
      vocabulary or formatting: &ldquo;Tshirt&rdquo; vs &ldquo;T-Shirt&rdquo; vs &ldquo;tee&rdquo; is a separate
      problem, deliberately left out of v1. Classification first; cleanup is its own job.
    </>
  );

  if (mode === "hidden") return null;

  if (mode === "inline") {
    return (
      <aside
        className="mb-6 rounded-lg border-l-2 bg-slate-900/40 py-3 pl-4 pr-4"
        style={{ borderLeftColor: accent.solid }}
      >
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: accent.text }}>
          What this is &mdash; and isn&rsquo;t
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">{body}</p>
      </aside>
    );
  }

  if (mode === "collapsed") {
    return <Disclosure summary="What this is — and isn’t (classification, not normalization)">{body}</Disclosure>;
  }

  // default: "aside" — a quiet footnote-weight line under the steps.
  return (
    <p className="mb-6 text-[13px] leading-relaxed text-slate-500">
      <span className="font-medium text-slate-400">What this is &mdash; and isn&rsquo;t.</span>{" "}
      {body}
    </p>
  );
}

// ── Honesty note: the product name carries the signal ─────────────────────────
// The intellectual-honesty beat that makes this a credibility artifact rather than
// a hype demo. Ties its own claim to the Blank column in the data.
function HonestyNote({ mode, accent }) {
  const body = (
    <>
      The model leans on the product <span className="font-medium text-slate-200">name</span>,
      and real apparel names usually contain the answer &mdash; &ldquo;Nike Men Navy Running
      Shorts&rdquo; all but says <span className="font-medium text-slate-200">Shorts</span>. So
      this measures how reliably the model recovers a category the name already hints
      at, even when the category field is wrong or missing &mdash; not classification from
      scratch. The <span className="font-medium text-slate-200">Blank</span> rows below are
      the closest thing to a cold read, and you can watch their accuracy lag the rest.
    </>
  );

  if (mode === "hidden") return null;

  if (mode === "collapsed") {
    return <Disclosure summary="One honest caveat — the name carries the signal">{body}</Disclosure>;
  }

  // "card" — used both below the hero and beside the table; same component, styled
  // as a quiet callout so it reads as the author being candid, not as a warning.
  return (
    <aside className="mb-6 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: accent.text }}>
        One honest caveat
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">{body}</p>
    </aside>
  );
}

// ── Disclosure (shared) ───────────────────────────────────────────────────────
// A minimal, accessible show/hide used by the "collapsed" placements.
function Disclosure({ summary, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-6 rounded-lg border border-slate-800 bg-slate-900/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] font-medium text-slate-300 hover:text-slate-100"
      >
        <span className="text-slate-500 transition-transform" style={{ transform: open ? "rotate(90deg)" : "none" }} aria-hidden="true">&rsaquo;</span>
        {summary}
      </button>
      {open && (
        <p className="px-4 pb-3.5 pl-9 text-[13px] leading-relaxed text-slate-400">{children}</p>
      )}
    </div>
  );
}

Object.assign(window, { Hero, HowItWorks, TeachingPoint, HonestyNote, Disclosure });
