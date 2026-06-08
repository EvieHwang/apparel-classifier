// Cumulative read endpoint (feature 4).
//
// Returns the current cumulative totals (the cross-run counters) as JSON. Read-only,
// no parameters, server-authoritative — the browser never submits or recomputes the
// tally. It pulls in the SQLite store (a native driver), so by design NO test imports
// it; it is a manually validated shell, exactly as /api/run is.
//
// Fails SOFT (spec edge case): a store read fault returns a clear non-2xx the page can
// degrade on (it keeps its last-known panel and the Run button still works), never a
// hang and never a 500 that takes the page down. The payload is aggregate integer
// counts only — no PII, no secrets, no per-record data.
import { getCumulativeStore } from "../../../src/cumulative-sqlite";

// Always reflect the live counters; never statically cache.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const totals = await getCumulativeStore().read();
    return Response.json(totals, {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    console.error("Cumulative read failed:", err);
    return Response.json(
      { error: "The cumulative tally is temporarily unavailable." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
