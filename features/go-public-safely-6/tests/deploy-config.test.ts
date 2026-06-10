// @scaffolding — content-contract checks on the committed deploy config (Stories 4,
// 6, 7). These assert PROPERTIES the deploy must hold (health-gated, volume-backed DB,
// no baked secrets, no env drift), parsed loosely from the files — not exact TOML/YAML
// formatting, which /build owns. The files don't exist until /build creates them, so
// these are red until then (the point of writing tests first).
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const read = (rel: string) => readFileSync(resolve(repoRoot, rel), "utf8");
const has = (rel: string) => existsSync(resolve(repoRoot, rel));

const HEALTH_PATH = "/api/health";

describe("fly.toml — health-gated release + volume-backed DB (Stories 4, 6)", () => {
  it("exists", () => {
    expect(has("fly.toml"), "fly.toml must exist at repo root").toBe(true);
  });

  it("names the app and declares a health check on the health path (gates the release)", () => {
    const toml = read("fly.toml");
    expect(toml).toMatch(/app\s*=\s*["']apparel-classifier["']/);
    // The path must be a declared check (a `path = "/api/health"` key on a
    // non-comment line), not merely mentioned in a comment — and a check block must
    // exist. A declared HTTP health check is what makes flyctl's zero exit mean
    // "serving", the primary deploy gate (Story 4 AC2). A bare substring would pass
    // on a commented-out or non-gating mention.
    expect(toml).toMatch(
      new RegExp(`^\\s*path\\s*=\\s*["']${HEALTH_PATH}["']`, "m"),
    );
    expect(toml).toMatch(/check/i); // a [[...checks]] / [checks] block is present
  });

  it("mounts a volume and points CUMULATIVE_DB_PATH under its destination (Story 6)", () => {
    const toml = read("fly.toml");
    const dest = toml.match(/destination\s*=\s*["']([^"']+)["']/);
    expect(dest, "fly.toml must declare a [mounts] destination").not.toBeNull();
    const dbPath = toml.match(/CUMULATIVE_DB_PATH\s*=\s*["']([^"']+)["']/);
    expect(dbPath, "fly.toml must set CUMULATIVE_DB_PATH so the DB lands on the volume").not.toBeNull();
    if (dest && dbPath) {
      const destDir = dest[1].replace(/\/+$/, "");
      // The DB file must live under the mounted volume, or it's wiped on redeploy.
      expect(dbPath[1].startsWith(destDir + "/")).toBe(true);
    }
  });

  it("bakes no secret value", () => {
    const toml = read("fly.toml").toLowerCase();
    expect(toml).not.toContain("sk-ant");
    expect(toml).not.toMatch(/anthropic_api_key\s*=\s*["'][^"']+["']/);
  });
});

describe(".github/workflows/deploy.yml — push-to-main flyctl deploy (Story 4)", () => {
  const WF = ".github/workflows/deploy.yml";
  it("exists", () => {
    expect(has(WF), `${WF} must exist`).toBe(true);
  });

  it("triggers on push to main, runs flyctl deploy, and uses FLY_API_TOKEN", () => {
    const yml = read(WF);
    expect(yml).toMatch(/on:\s*[\s\S]*push/); // push trigger present
    expect(yml).toMatch(/main/); // targeting main
    expect(yml.toLowerCase()).toMatch(/flyctl\s+deploy|flyctl-actions|fly\s+deploy/);
    expect(yml).toContain("FLY_API_TOKEN");
  });

  it("does not embed a secret value", () => {
    const yml = read(WF).toLowerCase();
    expect(yml).not.toContain("sk-ant");
  });
});

describe("Dockerfile — builds the app, no baked secret (Story 7)", () => {
  it("exists and builds a node app", () => {
    expect(has("Dockerfile"), "Dockerfile must exist").toBe(true);
    const df = read("Dockerfile").toLowerCase();
    expect(df).toContain("node");
  });

  it("contains no secret value", () => {
    const df = read("Dockerfile").toLowerCase();
    expect(df).not.toContain("sk-ant");
    expect(df).not.toContain("fly_api_token");
    expect(df).not.toMatch(/anthropic_api_key\s*=\s*\S+/);
  });
});

describe(".env.example — every injected key, no values, no drift (Story 7)", () => {
  it("lists ANTHROPIC_API_KEY and CUMULATIVE_DB_PATH", () => {
    const env = read(".env.example");
    expect(env).toMatch(/^ANTHROPIC_API_KEY=/m);
    expect(env).toMatch(/^CUMULATIVE_DB_PATH=/m);
  });

  it("carries no values (keys only)", () => {
    const env = read(".env.example");
    // Every assignment line has an empty right-hand side.
    for (const line of env.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) expect(m[2].trim(), `${m[1]} must have no value in .env.example`).toBe("");
    }
  });
});
