// The per-run results table, extracted from app/page.tsx (feature 7).
//
// It lives in its own module — not as a named export from page.tsx — because Next.js
// rejects non-reserved named exports from a route's page file ("ResultsTable" is not a
// valid Page export field). The feature-7 spec named `ResultsTable` as a @scaffolding
// test seam exported from app/page.tsx; that surface is refined here (see
// build-deviations.md) while the asserted behaviour is unchanged.
//
// SDK-free and key-free: it imports only React and type-only shapes, so the
// key-isolation guard (which scans all of app/) stays green. Every model-derived string
// renders as plain text (never raw HTML), so the no-raw-html guard holds.
import type { RunEntry, Tag } from "../src/types";

export const TAG_LABELS: Record<Tag, string> = {
  "near-swap": "Near swap",
  "far-swap": "Far swap",
  blank: "Blank",
};

// The plain-language sub-header row (Story 4) sits above the existing technical header so
// a cold reader can parse the columns without the internal vocabulary; each row's
// Corrupted cell also shows the human corruption-tag label derived from RunEntry.corruptionTag.
export function ResultsTable({ rows }: { rows: RunEntry[] }) {
  return (
    <table className="w-full border-collapse text-left">
      <caption className="sr-only">
        Per-record classification results: true article type, the corrupted value the
        model was shown, the prediction, whether it was correct, the model&apos;s
        confidence, and its rationale.
      </caption>
      <thead>
        <tr className="text-slate-500">
          <th scope="col" className="pb-0.5 pr-3 text-[11px] font-normal">the real label</th>
          <th scope="col" className="pb-0.5 pr-3 text-[11px] font-normal">what we broke it to</th>
          <th scope="col" className="pb-0.5 pr-3 text-[11px] font-normal">the model&rsquo;s guess</th>
          <th scope="col" className="pb-0.5 pr-3 text-[11px] font-normal">vs. the real label</th>
          <th scope="col" className="pb-0.5 pr-3 text-[11px] font-normal" />
          <th scope="col" className="pb-0.5 text-[11px] font-normal">why</th>
        </tr>
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
                {/* Human-readable corruption category so a cold reader can parse the
                    table without the internal near/far/blank vocabulary (Story 4). */}
                <div className="text-[11px] text-slate-600">
                  {TAG_LABELS[row.corruptionTag]}
                </div>
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
