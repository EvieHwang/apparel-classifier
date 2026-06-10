// Cheap liveness endpoint (feature 6, Story 4 AC3 / Story 1 AC2). Returns 200 without
// calling the model and without requiring the Anthropic API key, so the deploy's health
// gate measures "is the app serving," not "is the key present." Imports no model SDK,
// reads no secret env var, and consults no limiter — cheap, always serving, and safe to
// hit before secrets are configured. fly.toml's health check targets this path.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json({ status: "ok" }, { status: 200 });
}
