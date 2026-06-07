// Curation CLI: reads docs/styles.csv, applies the curation transform, and
// writes docs/apparel-subset.csv. This script is the only writer of the
// committed subset — the artifact is never hand-edited.
//
// Usage:
//   pnpm curate            -> writes docs/apparel-subset.csv (the deliverable)
//   pnpm curate <outPath>  -> writes to a scratch path (for verification)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { curate, type CurationParams } from "../src/curate.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const SOURCE = resolve(repoRoot, "docs/styles.csv");
const DEFAULT_OUT = resolve(repoRoot, "docs/apparel-subset.csv");

// The contract of this cut. Single source of truth so the rationale and the
// curation step cannot drift apart.
const PARAMS: CurationParams = {
  masterCategory: "Apparel",
  minRowsPerType: 50,
  minTypesPerSubcategory: 2,
  maxRowsPerType: 500,
};

const outArg = process.argv[2];
const outPath = outArg ? resolve(process.cwd(), outArg) : DEFAULT_OUT;

const source = readFileSync(SOURCE, "utf8");
const subset = curate(source, PARAMS);
writeFileSync(outPath, subset);

const rowCount = subset.split("\n").filter((l) => l.length > 0).length - 1;
console.log(`Wrote ${rowCount} curated rows to ${outPath}`);
