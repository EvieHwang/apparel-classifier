// Shared CSV helpers for the curation tests.
// The dataset's final column (productDisplayName) may contain unquoted commas,
// so we split on the first 9 commas only and treat the remainder as column 10.
import { readFileSync } from "node:fs";

export const HEADER =
  "id,gender,masterCategory,subCategory,articleType,baseColour,season,year,usage,productDisplayName";

export const COLUMNS = HEADER.split(",");

export interface Row {
  id: string;
  gender: string;
  masterCategory: string;
  subCategory: string;
  articleType: string;
  baseColour: string;
  season: string;
  year: string;
  usage: string;
  productDisplayName: string;
}

// Split a CSV line into exactly 10 fields, last field = remainder after 9 commas.
export function splitRow(line: string): string[] {
  const out: string[] = [];
  let rest = line;
  for (let i = 0; i < COLUMNS.length - 1; i++) {
    const idx = rest.indexOf(",");
    if (idx === -1) {
      out.push(rest);
      rest = "";
    } else {
      out.push(rest.slice(0, idx));
      rest = rest.slice(idx + 1);
    }
  }
  out.push(rest);
  return out;
}

function toRow(fields: string[]): Row {
  return {
    id: fields[0],
    gender: fields[1],
    masterCategory: fields[2],
    subCategory: fields[3],
    articleType: fields[4],
    baseColour: fields[5],
    season: fields[6],
    year: fields[7],
    usage: fields[8],
    productDisplayName: fields[9] ?? "",
  };
}

export interface ParsedCsv {
  headerLine: string;
  rows: Row[];
}

export function parseCsvFile(path: string): ParsedCsv {
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const headerLine = lines[0];
  const rows = lines.slice(1).map((l) => toRow(splitRow(l)));
  return { headerLine, rows };
}
