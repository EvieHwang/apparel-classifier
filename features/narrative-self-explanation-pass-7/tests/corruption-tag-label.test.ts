// @scaffolding
// Feature 7 — the owner-approved table polish: each results-table row shows a
// human-readable corruption-tag label (Near swap / Far swap / Blank) derived from the
// existing RunEntry.corruptionTag.
//
// The BEHAVIOUR under test (a row's corruption category is shown in human terms) is the
// real contract. The SEAM used to observe it — a named `ResultsTable` export from
// app/page.tsx rendered with injected rows — is named here only so the per-row behaviour
// is unit-renderable before /build wires it. /build may refine that surface (rename the
// export, restructure the component) as long as the page still labels each row's
// corruption tag in human terms; log any such change in build-deviations.md and update
// this import to match.
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
// Seam refined in /build: Next.js rejects non-reserved named exports from a route page,
// so ResultsTable lives in app/results-table.tsx (re-used by app/page.tsx). The asserted
// behaviour — each row's corruption tag shown in human terms — is unchanged. See
// build-deviations.md.
import { ResultsTable } from "../../../app/results-table.tsx";
import type { RunEntry } from "../../../src/types.ts";

const rows: RunEntry[] = [
  {
    id: "r-near",
    trueArticleType: "Tshirts",
    corruptionTag: "near-swap",
    corruptedValue: "Shirts",
    predictedArticleType: "Tshirts",
    confidence: "high",
    rationale: "Name reads like a t-shirt.",
    correct: true,
  },
  {
    id: "r-far",
    trueArticleType: "Jeans",
    corruptionTag: "far-swap",
    corruptedValue: "Sandals",
    predictedArticleType: "Jeans",
    confidence: "medium",
    rationale: "Denim trousers.",
    correct: true,
  },
  {
    id: "r-blank",
    trueArticleType: "Briefs",
    corruptionTag: "blank",
    corruptedValue: "",
    predictedArticleType: "Trunk",
    confidence: "low",
    rationale: "Underwear, exact type unclear.",
    correct: false,
  },
];

describe("results table — per-row corruption-tag label", () => {
  it("exposes ResultsTable as a renderable seam", () => {
    expect(typeof ResultsTable).toBe("function");
  });

  it("shows the human label for each corruption tag (near / far / blank)", () => {
    const html = renderToStaticMarkup(React.createElement(ResultsTable, { rows }));
    expect(html).toContain("Near swap");
    expect(html).toContain("Far swap");
    expect(html).toContain("Blank");
  });

  it("preserves the existing per-row values", () => {
    const html = renderToStaticMarkup(React.createElement(ResultsTable, { rows }));
    // true types, a corrupted value, and a prediction still render
    expect(html).toContain("Tshirts");
    expect(html).toContain("Sandals");
    expect(html).toContain("Trunk");
  });
});
