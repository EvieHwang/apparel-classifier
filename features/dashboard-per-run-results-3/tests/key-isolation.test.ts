// Structural guard for Story 5 + the feature-2 invariant: the Anthropic SDK and the
// real adapter (src/anthropic.ts) stay OUT of the test import graph and out of every
// headless seam. Only the server route (under app/, not scanned here) may touch the
// SDK. @frozen: this keeps the automated suite SDK-free, network-free, and key-free.
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const srcRoot = join(repoRoot, "src");
const featuresRoot = join(repoRoot, "features");
const appRoot = join(repoRoot, "app"); // created by /build; the SDK's one allowed home (server only)
const selfPath = fileURLToPath(import.meta.url);

// The one module legitimately allowed to import the SDK (feature 2's real adapter).
const allowedSdkFile = join(srcRoot, "anthropic.ts");

function collectTs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return (readdirSync(dir, { recursive: true }) as string[])
    .filter((p) => p.endsWith(".ts") || p.endsWith(".tsx"))
    .map((p) => join(dir, p));
}

const SDK_PKG = "@anthropic-ai/sdk";
const ADAPTER_IMPORT = /from\s+['"][^'"]*\/anthropic['"]/;
// A Next.js client component declares itself with a top-of-file "use client"
// directive (allowing only leading comments/whitespace before it).
const USE_CLIENT = /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/;

// src/ + features/ never legitimately touch the SDK (except the allowed adapter).
const allTs = [...collectTs(srcRoot), ...collectTs(featuresRoot)].filter(
  (f) => f !== selfPath && f !== allowedSdkFile,
);
// app/ DOES host the server route that imports the SDK — so the rule there is
// narrower: a *client* component must never pull the SDK or the real adapter in.
const appFiles = collectTs(appRoot);

describe("key / SDK isolation", () => {
  it("actually scanned the source + test trees (guards against a vacuous pass)", () => {
    // If path resolution broke and the scan found nothing, the offender checks
    // below would pass trivially. Anchor on known files that must be present.
    expect(allTs.length).toBeGreaterThan(5);
    expect(allTs.some((f) => f.endsWith(join("src", "run.ts")))).toBe(true);
    expect(allTs.some((f) => f.includes(join("dashboard-per-run-results-3", "tests")))).toBe(true);
  });

  it("no headless seam or test file imports the Anthropic SDK (only src/anthropic.ts may)", () => {
    const offenders = allTs.filter((f) => readFileSync(f, "utf8").includes(SDK_PKG));
    expect(offenders).toEqual([]);
  });

  it("no test file imports the real adapter module (src/anthropic)", () => {
    const offenders = allTs
      .filter((f) => f.startsWith(featuresRoot))
      .filter((f) => ADAPTER_IMPORT.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  // The actual browser-leak surface (Story 5): under app/, the server route MAY
  // import the SDK, but a client component ("use client") must never — that would
  // ship the SDK, and the key path, to the browser. app/ does not exist until
  // /build creates it; once it does, this engages. (The page IS a client component
  // because it owns the streaming/EventSource state.)
  it("no client component under app/ imports the Anthropic SDK or the real adapter", () => {
    const clientFiles = appFiles.filter((f) => USE_CLIENT.test(readFileSync(f, "utf8")));
    const offenders = clientFiles.filter((f) => {
      const content = readFileSync(f, "utf8");
      return content.includes(SDK_PKG) || ADAPTER_IMPORT.test(content);
    });
    expect(offenders).toEqual([]);
  });
});
