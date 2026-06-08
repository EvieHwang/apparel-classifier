// Story 6 (XSS guard): model-derived strings — above all the classifier `rationale`,
// which can echo a hostile product name — must render as text, never as HTML. The one
// concrete vector in React is `dangerouslySetInnerHTML`; this guard forbids it anywhere
// under app/. @frozen security contract. Forward-looking: it engages once /build adds the
// single-record panel, alongside the app/ files features 3–4 already created.
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const appRoot = join(repoRoot, "app");

function collectTs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return (readdirSync(dir, { recursive: true }) as string[])
    .filter((p) => p.endsWith(".ts") || p.endsWith(".tsx"))
    .map((p) => join(dir, p));
}

const appFiles = collectTs(appRoot);

describe("no raw-HTML rendering of model output (app/)", () => {
  it("actually found the app/ tree (guards against a vacuous pass)", () => {
    // If path resolution broke and the scan found nothing, the guard below would pass
    // trivially. Anchor on a file that must exist.
    expect(appFiles.length).toBeGreaterThan(2);
    expect(appFiles.some((f) => f.endsWith("page.tsx"))).toBe(true);
  });

  it("no file under app/ uses dangerouslySetInnerHTML", () => {
    const offenders = appFiles.filter((f) =>
      readFileSync(f, "utf8").includes("dangerouslySetInnerHTML"),
    );
    expect(offenders).toEqual([]);
  });
});
