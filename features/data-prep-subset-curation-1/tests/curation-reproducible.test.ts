// @scaffolding — named surface: the `pnpm curate [outpath]` CLI. /build may
// restructure the script as long as this command regenerates the subset and the
// determinism + in-sync behaviors below still hold.
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const COMMITTED = resolve(repoRoot, "docs/apparel-subset.csv");

function regenerateTo(outPath: string): void {
  // `pnpm curate <outPath>` must read docs/styles.csv and write the subset to outPath.
  execFileSync("pnpm", ["curate", outPath], { cwd: repoRoot, stdio: "pipe" });
}

describe("curation reproducibility", () => {
  it("regenerates a byte-identical file on repeated runs (deterministic)", () => {
    const dir = mkdtempSync(join(tmpdir(), "curate-"));
    const a = join(dir, "a.csv");
    const b = join(dir, "b.csv");
    regenerateTo(a);
    regenerateTo(b);
    expect(existsSync(a)).toBe(true);
    expect(readFileSync(a)).toEqual(readFileSync(b));
  });

  it("produces output byte-identical to the committed subset (in sync)", () => {
    const dir = mkdtempSync(join(tmpdir(), "curate-"));
    const out = join(dir, "out.csv");
    regenerateTo(out);
    expect(existsSync(COMMITTED), `${COMMITTED} must exist`).toBe(true);
    expect(readFileSync(out)).toEqual(readFileSync(COMMITTED));
  });
});
