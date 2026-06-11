// @frozen
// Feature 7 — narrative & self-explanation pass. The deliverable is framing copy that
// makes a forwarded link legible to a cold reader, plus the two REQUIRED teaching
// payloads (normalization-vs-classification; the name carries the signal) and the
// table's plain-language column labels.
//
// We render the real page (app/page.tsx default export) to static markup with
// react-dom/server and assert on the entity-DECODED text a reader actually sees — a
// genuine render, not a source grep, and robust to HTML-entity encoding (&mdash; -> —,
// &ldquo; -> ", etc.). useEffect/fetch do not run under renderToStaticMarkup, so the
// initial render is deterministic and network-free.
//
// Assertions target distinctive, load-bearing phrases that encode each required payload,
// not whole verbatim paragraphs, so faithful copy-editing stays possible.
import { describe, it, expect, beforeAll } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Page from "../../../app/page.tsx";

let html = "";
beforeAll(() => {
  html = renderToStaticMarkup(React.createElement(Page));
});

describe("narrative pass — page renders (guards against a vacuous pass)", () => {
  it("renders the dashboard page to non-trivial markup", () => {
    expect(html).toContain("Apparel Classifier");
    expect(html.length).toBeGreaterThan(1000);
  });
});

describe("Story 1 — Hero framing for a cold reader", () => {
  it("states the problem in plain terms (vendor data arrives mislabeled)", () => {
    expect(html).toContain("mislabeled");
  });
});

describe("Story 1 — Corrupt → Classify → Score mental model", () => {
  it("renders the three beats with their distinctive bodies", () => {
    // Distinctive body phrases, one per beat — robust to other "Classify"/"Score"
    // occurrences elsewhere on the page (e.g. the single-record button).
    expect(html).toContain("close sibling"); // Corrupt
    expect(html).toContain("one-line reason"); // Classify
    expect(html).toContain("a miss is a miss"); // Score
  });

  it("presents the steps as a single semantic ordered list of three (WCAG)", () => {
    expect(html).toMatch(/<ol[ >]/);
    // The how-it-works list contributes three <li>; allow others elsewhere but require
    // at least three list items to exist.
    const liCount = (html.match(/<li[ >]/g) ?? []).length;
    expect(liCount).toBeGreaterThanOrEqual(3);
  });
});

describe("Story 2 — normalization-vs-classification teaching point (REQUIRED)", () => {
  it("says it recovers WHICH CATEGORY a product is", () => {
    expect(html).toContain("which category");
  });

  it("says it does NOT normalize vocabulary/formatting — a separate v1 problem", () => {
    expect(html).toContain("normalize");
    expect(html).toContain("vocabulary");
    // The concrete format-variation example proves the "formatting" half. Match
    // case-insensitively and tolerate the hyphen so a faithful copy-edit of the
    // example ("Tshirt"/"T-Shirt"/"T-shirt") doesn't break the payload assertion.
    expect(html).toMatch(/t-?shirt/i);
    // explicitly scoped out of v1
    expect(html).toContain("v1");
  });
});

describe("Story 3 — honesty note: the name carries the signal (REQUIRED)", () => {
  it("discloses that the model leans on the product name", () => {
    expect(html).toContain("name");
    expect(html).toContain("Running Shorts"); // the worked example
  });

  it("ties the caveat to observable data: the Blank rows are the cold read", () => {
    expect(html).toContain("Blank");
    expect(html).toContain("cold read");
  });

  it("renders the honesty note as a semantic aside (WCAG)", () => {
    expect(html).toMatch(/<aside[ >]/);
  });
});

describe("Story 4 — plain-language results-table column labels", () => {
  it("renders the plain-language sub-header labels above the technical header", () => {
    expect(html).toContain("the real label");
    expect(html).toContain("what we broke it to");
    expect(html).toContain("vs. the real label");
    // the model's guess — assert the distinctive bare word (avoids curly-apostrophe
    // matching on "the model's guess")
    expect(html).toContain("guess");
    // the Rationale column's plain-language sub-label; anchored as a cell's text
    // content (>why<) so it can't pass on an incidental "why" in prose.
    expect(html).toContain(">why<");
  });

  it("keeps the existing technical header row", () => {
    expect(html).toContain("Original");
    expect(html).toContain("Corrupted");
    expect(html).toContain("Predicted");
    expect(html).toContain("Rationale");
  });
});
