// Structural guard for Story 6: the SQLite driver and the SQLite-backed store stay
// OUT of the test import graph and out of every "use client" component — the browser
// never pulls a native module and `pnpm test` never has to load one. The store the
// bar exercises is the in-memory reference; the SQLite store is validated manually
// (exactly as src/anthropic.ts is). Also asserts the DB file is git-ignored.
//
// Technique mirrors key-isolation.test.ts: read file CONTENTS and assert no forbidden
// import string — never actually import the offending module, so a native driver
// never loads here. @frozen behavior; the SQLite-store module *path*
// (`cumulative-sqlite`) and the driver list are the named surface (@scaffolding) —
// /build may re-site the module or pick another SQLite driver, updating this guard.
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const srcRoot = join(repoRoot, "src");
const featuresRoot = join(repoRoot, "features");
const appRoot = join(repoRoot, "app");
const selfPath = fileURLToPath(import.meta.url);

function collectTs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return (readdirSync(dir, { recursive: true }) as string[])
    .filter((p) => p.endsWith(".ts") || p.endsWith(".tsx"))
    .map((p) => join(dir, p));
}

// A SQLite driver import specifier — matched only in `from "…"` / `require("…")`
// position so the bare word "sqlite" in a comment is never a false offender.
const SQLITE_DRIVER =
  /(?:from\s+|require\(\s*)['"](?:better-sqlite3|node:sqlite|sqlite3|bun:sqlite|@?libsql(?:\/client)?)['"]/;
// An import of the SQLite-backed store module (its path contains `cumulative-sqlite`).
const SQLITE_STORE_MODULE = /(?:from\s+|require\(\s*)['"][^'"]*cumulative-sqlite['"]/;
// A Next.js client component declares itself with a top-of-file "use client".
const USE_CLIENT = /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/;

// The one src module legitimately allowed to import the driver (the SQLite store).
// @scaffolding: if /build renames the module, update this path too.
const allowedSqliteFile = join(srcRoot, "cumulative-sqlite.ts");

// src/ + features/ never legitimately import the driver (except the allowed store)
// and never import the SQLite-store module (only the app/ server routes may).
const srcAndFeatures = [...collectTs(srcRoot), ...collectTs(featuresRoot)].filter(
  (f) => f !== selfPath,
);
const appFiles = collectTs(appRoot);

describe("persistence isolation (Story 6)", () => {
  it("actually scanned the source + test trees (guards against a vacuous pass)", () => {
    expect(srcAndFeatures.length).toBeGreaterThan(5);
    expect(srcAndFeatures.some((f) => f.endsWith(join("src", "run.ts")))).toBe(true);
    expect(
      srcAndFeatures.some((f) =>
        f.includes(join("cumulative-tally-persistence-4", "tests")),
      ),
    ).toBe(true);
  });

  it("no headless seam or test file imports a SQLite driver (only the SQLite store may)", () => {
    const offenders = srcAndFeatures
      .filter((f) => f !== allowedSqliteFile)
      .filter((f) => SQLITE_DRIVER.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("no test file imports the SQLite-backed store module (the bar uses the in-memory store)", () => {
    const offenders = srcAndFeatures
      .filter((f) => f.startsWith(featuresRoot))
      .filter((f) => SQLITE_STORE_MODULE.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  // The real browser-leak surface: under app/, a server route MAY import the SQLite
  // store/driver, but a "use client" component must never — that would ship a native
  // module (and a filesystem path) toward the browser bundle.
  it("no client component under app/ imports a SQLite driver or the SQLite store module", () => {
    const clientFiles = appFiles.filter((f) => USE_CLIENT.test(readFileSync(f, "utf8")));
    const offenders = clientFiles.filter((f) => {
      const content = readFileSync(f, "utf8");
      return SQLITE_DRIVER.test(content) || SQLITE_STORE_MODULE.test(content);
    });
    expect(offenders).toEqual([]);
  });

  it("git-ignores the database file (runtime state, never committed)", () => {
    const gitignore = readFileSync(join(repoRoot, ".gitignore"), "utf8");
    // Some line must plausibly ignore the cumulative DB file: a *.sqlite/*.db glob, a
    // data/ dir, or a cumulative-named db. /build picks the exact form.
    const ignoresDb =
      /(^|\n)\s*(\*?\.(sqlite3?|db)\b|\/?data\/|[^\n]*cumulative[^\n]*\.(sqlite3?|db))/i.test(
        gitignore,
      );
    expect(ignoresDb).toBe(true);
  });

  it("documents the DB-path config key in .env.example (constitution no-drift gate)", () => {
    // The store path is configurable (default for local dev; #6 injects the Fly volume
    // mount). The constitution requires .env.example to list every key the deploy
    // injects — so the key must be documented here, with no value, to prevent drift.
    // The exact key name is the named config surface (@scaffolding); /build may rename
    // it but must keep .env.example and this guard in sync.
    const example = readFileSync(join(repoRoot, ".env.example"), "utf8");
    expect(example).toMatch(/CUMULATIVE_DB_PATH/);
  });
});
