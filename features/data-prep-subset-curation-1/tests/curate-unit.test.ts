// @scaffolding — named surface: a pure `curate(sourceCsv, params)` transform.
// /build may re-site/rename the module as long as this import target and the
// asserted behaviors hold. These cases cover the edges the real-data invariant
// tests cannot reach: comma/bare-quote preservation, the inclusive floor
// boundary, the cap, source-order determinism, and subCategory drop.
import { describe, it, expect } from "vitest";
import { splitRow, HEADER } from "./csv.js";
// Resolves to src/curate.ts (or wherever /build sites it) under Vitest.
import { curate, type CurationParams } from "../../../src/curate.js";

const COMMA_NAME = "Myntra Men's Yes, its all about me White T-shirt";
const QUOTE_NAME = 'Nike Women EM Tempo 3.5" Pink Tshirt';

// Small synthetic source. Columns:
// id,gender,masterCategory,subCategory,articleType,baseColour,season,year,usage,productDisplayName
const FIXTURE = [
  HEADER,
  `1,Men,Footwear,Shoes,Casual Shoes,Black,Fall,2011,Casual,Some Shoe`, // non-Apparel -> dropped
  `2,Men,Apparel,Topwear,Tshirts,White,Summer,2011,Casual,${COMMA_NAME}`, // kept (1st Tshirt), comma name
  `3,Women,Apparel,Topwear,Tshirts,Pink,Summer,2012,Sports,${QUOTE_NAME}`, // kept (2nd Tshirt), bare quote
  `4,Men,Apparel,Topwear,Tshirts,Blue,Fall,2013,Casual,Third Tshirt`, // dropped by cap (3rd)
  `5,Men,Apparel,Topwear,Tshirts,Grey,Fall,2014,Casual,Fourth Tshirt`, // dropped by cap (4th)
  `6,Men,Apparel,Topwear,Shirts,Navy,Fall,2011,Formal,A Shirt`, // kept (Shirts count 2 == floor)
  `7,Men,Apparel,Topwear,Shirts,Black,Fall,2012,Formal,Another Shirt`, // kept
  `8,Men,Apparel,Topwear,Sweaters,Red,Winter,2011,Casual,Lonely Sweater`, // dropped (count 1 < floor 2)
  `9,Men,Apparel,Bottomwear,Jeans,Blue,Summer,2011,Casual,Jeans One`, // Bottomwear has only 1 type ->
  `10,Men,Apparel,Bottomwear,Jeans,Blue,Summer,2012,Casual,Jeans Two`, //   whole subCategory dropped
  `11,Men,Apparel,Bottomwear,Jeans,Blue,Summer,2013,Casual,Jeans Three`,
  `12,Men,Apparel,Topwear,,Black,Fall,2011,Casual,Missing ArticleType`, // malformed (no articleType) -> dropped
].join("\n");

// floor = 2 (Shirts at exactly 2 must be kept, Sweaters at 1 dropped),
// cap = 2 (Tshirts truncated 4 -> 2), >= 2 types per subCategory.
const PARAMS: CurationParams = {
  masterCategory: "Apparel",
  minRowsPerType: 2,
  minTypesPerSubcategory: 2,
  maxRowsPerType: 2,
};

function dataRows(csv: string) {
  return csv
    .split(/\r?\n/)
    .filter((l) => l.length > 0)
    .slice(1)
    .map(splitRow);
}

describe("curate() pure transform", () => {
  const out = curate(FIXTURE, PARAMS);
  const rows = dataRows(out);

  it("preserves the header", () => {
    expect(out.split(/\r?\n/)[0]).toBe(HEADER);
  });

  it("filters, applies floor/cap/subcategory rules, and keeps source order", () => {
    // Expected survivors in source order: ids 2,3 (Tshirts, capped), 6,7 (Shirts).
    // Dropped: 1 (non-Apparel), 4,5 (over cap), 8 (below floor),
    //          9,10,11 (Bottomwear has <2 types), 12 (malformed).
    expect(rows.map((r) => r[0])).toEqual(["2", "3", "6", "7"]);
  });

  it("preserves a productDisplayName containing a comma, verbatim", () => {
    const row = rows.find((r) => r[0] === "2")!;
    expect(row[9]).toBe(COMMA_NAME);
    expect(row[4]).toBe("Tshirts"); // columns not shifted by the embedded comma
  });

  it("preserves a productDisplayName containing a bare double-quote, verbatim", () => {
    const row = rows.find((r) => r[0] === "3")!;
    expect(row[9]).toBe(QUOTE_NAME);
  });

  it("respects the per-type cap exactly (Tshirts 4 -> 2)", () => {
    expect(rows.filter((r) => r[4] === "Tshirts")).toHaveLength(2);
  });

  it("keeps a type sitting exactly on the inclusive floor (Shirts == 2)", () => {
    expect(rows.filter((r) => r[4] === "Shirts")).toHaveLength(2);
  });

  it("drops a type one below the floor (Sweaters == 1)", () => {
    expect(rows.some((r) => r[4] === "Sweaters")).toBe(false);
  });

  it("drops a subCategory left with < 2 qualifying types (Bottomwear/Jeans)", () => {
    expect(rows.some((r) => r[3] === "Bottomwear")).toBe(false);
  });

  it("is deterministic — identical input yields identical output", () => {
    expect(curate(FIXTURE, PARAMS)).toBe(out);
  });
});
