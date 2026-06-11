// mock-data.jsx
// Realistic stand-in data for the prototype. The real dashboard streams rows over SSE
// from /api/run; here we replay a fixed, representative batch so the narrative layer
// can be designed against a believable surface. Vocabulary (article types, subCategory
// grouping for near/far swaps) matches docs/apparel-subset-rationale.md exactly.

// One run's worth of records. Each row mirrors src/types.ts RunEntry:
//   trueArticleType, corruptedValue, corruptionTag (near-swap|far-swap|blank),
//   predictedArticleType, correct, confidence (high|medium|low), rationale.
// The display names are written in the Fashion-dataset house style on purpose — they
// usually telegraph the type, which is exactly the honesty note's point.
const MOCK_ROWS = [
  {
    id: "r1",
    name: "Puma Men Black Running Tshirt",
    trueArticleType: "Tshirts",
    corruptedValue: "Shirts",
    corruptionTag: "near-swap",
    predictedArticleType: "Tshirts",
    correct: true,
    confidence: "high",
    rationale: "Name ends in \u201CTshirt\u201D; the corrupted \u201CShirts\u201D is a Topwear sibling, but the display name is explicit.",
  },
  {
    id: "r2",
    name: "Levis Men Blue Slim Fit Jeans",
    trueArticleType: "Jeans",
    corruptedValue: "",
    corruptionTag: "blank",
    predictedArticleType: "Jeans",
    correct: true,
    confidence: "high",
    rationale: "\u201CJeans\u201D appears verbatim in the name; the missing field adds no doubt.",
  },
  {
    id: "r3",
    name: "Nike Men Navy Dri-FIT Running Shorts",
    trueArticleType: "Shorts",
    corruptedValue: "Bra",
    corruptionTag: "far-swap",
    predictedArticleType: "Shorts",
    correct: true,
    confidence: "high",
    rationale: "Far-swap to an Innerwear type ignored \u2014 the name plainly reads \u201CShorts.\u201D",
  },
  {
    id: "r4",
    name: "Allen Solly Women Pink Ruffle Top",
    trueArticleType: "Tops",
    corruptedValue: "Tshirts",
    corruptionTag: "near-swap",
    predictedArticleType: "Tops",
    correct: true,
    confidence: "medium",
    rationale: "Name ends in \u201CTop\u201D; the near-swap to Tshirts is plausible but overridden by the name.",
  },
  {
    id: "r5",
    name: "Wrangler Men Grey Formal Trousers",
    trueArticleType: "Trousers",
    corruptedValue: "Track Pants",
    corruptionTag: "near-swap",
    predictedArticleType: "Trousers",
    correct: true,
    confidence: "high",
    rationale: "\u201CTrousers\u201D is explicit; \u201CFormal\u201D further rules out the Track Pants sibling.",
  },
  {
    id: "r6",
    name: "Jockey Men White Briefs (Pack of 2)",
    trueArticleType: "Briefs",
    corruptedValue: "",
    corruptionTag: "blank",
    predictedArticleType: "Briefs",
    correct: true,
    confidence: "high",
    rationale: "\u201CBriefs\u201D is named directly; brand and pack framing are consistent with innerwear.",
  },
  {
    id: "r7",
    name: "Biba Women Red Printed Kurta",
    trueArticleType: "Kurtas",
    corruptedValue: "Dupatta",
    corruptionTag: "near-swap",
    predictedArticleType: "Kurtas",
    correct: true,
    confidence: "medium",
    rationale: "\u201CKurta\u201D in the name; the Dupatta sibling is rejected as it names a different garment.",
  },
  {
    id: "r8",
    name: "Status Quo Men Charcoal Striped Sweater",
    trueArticleType: "Sweaters",
    corruptedValue: "Jackets",
    corruptionTag: "near-swap",
    predictedArticleType: "Sweaters",
    correct: true,
    confidence: "high",
    rationale: "\u201CSweater\u201D explicit in the name; Jackets is a Topwear sibling but not supported by the text.",
  },
  {
    id: "r9",
    name: "United Colors of Benetton Women Denim Skirt",
    trueArticleType: "Skirts",
    corruptedValue: "Leggings",
    corruptionTag: "near-swap",
    predictedArticleType: "Skirts",
    correct: true,
    confidence: "high",
    rationale: "\u201CSkirt\u201D is in the name; \u201CDenim\u201D describes the fabric, not the Leggings sibling.",
  },
  {
    id: "r10",
    name: "Mast & Harbour Men Olive Sweatshirt",
    trueArticleType: "Sweatshirts",
    corruptedValue: "",
    corruptionTag: "blank",
    predictedArticleType: "Tshirts",
    correct: false,
    confidence: "low",
    rationale: "With the field blank, the name reads as casual topwear; the model defaulted to Tshirts over Sweatshirts.",
  },
];

// Authoritative cumulative totals (mirrors src/cumulative.ts CumulativeTotals shape):
// stabilized across many prior runs and visitors. Blank trails the rest — the honesty
// note's claim, visible in the data.
const MOCK_CUMULATIVE = {
  runs: 47,
  total: 470,
  accuracy: 0.89,
  byTag: {
    "near-swap": { correct: 213, count: 226 }, // ~94%
    "far-swap": { correct: 86, count: 92 }, //   ~93%
    blank: { correct: 119, count: 152 }, //       ~78%
  },
};

const TAG_LABELS = {
  "near-swap": "Near swap",
  "far-swap": "Far swap",
  blank: "Blank",
};

// Short, plain-language gloss of each corruption tag for the narrative tooltips.
const TAG_GLOSS = {
  "near-swap": "Replaced with a sibling type from the same group (e.g. Tshirts \u2192 Shirts).",
  "far-swap": "Replaced with an unrelated type from a different group (e.g. Shorts \u2192 Bra).",
  blank: "The category field was wiped \u2014 the model gets no hint at all.",
};

function pct(n) {
  return `${Math.round(n * 100)}%`;
}

// Per-run breakdown computed from MOCK_ROWS, in the same shape the real score produces.
function computeBreakdown(rows) {
  const tags = ["near-swap", "far-swap", "blank"];
  const out = {};
  for (const tag of tags) {
    const cells = rows.filter((r) => r.corruptionTag === tag);
    const correct = cells.filter((r) => r.correct).length;
    out[tag] = {
      count: cells.length,
      correct,
      accuracy: cells.length ? correct / cells.length : null,
    };
  }
  return out;
}

function runAccuracy(rows) {
  if (!rows.length) return 0;
  return rows.filter((r) => r.correct).length / rows.length;
}

Object.assign(window, {
  MOCK_ROWS,
  MOCK_CUMULATIVE,
  TAG_LABELS,
  TAG_GLOSS,
  pct,
  computeBreakdown,
  runAccuracy,
});
