# Feature Declaration — Cumulative tally + persistence (feature 4)

## What
A cumulative accuracy figure that survives across runs **and** across visitors,
shown alongside the existing jumpy per-run number. Each time a run completes
successfully, the server folds that run's per-record results into a small set of
durable counters — overall correct/total, the same split by corruption type
(near-swap / far-swap / blank), and a run count — and the dashboard displays the
stabilized cumulative accuracy (overall + by-corruption-type breakdown). The
counters live in a single SQLite database so the number survives an app restart.
On first use, before any run has been recorded, the dashboard shows a clear
"no runs yet" empty state rather than a 0/0 → NaN figure. When a visitor's own run
finishes, the cumulative figure ticks to include it (live update), without a page
reload.

## Why
A single run of N≈12 records produces a headline accuracy that jumps around run to
run — convincing only if you happen to catch a good one. The credibility of the demo
rests on a number that *settles*: "across every run anyone has ever triggered, the
classifier recovers X% of corrupted labels." That requires persistence — the count
has to outlive a single request, a single visitor, and an app restart. This is the
project's first piece of durable state; it is deliberately the smallest one that
does the job (running counters, not a history table), and it stays honest by
counting only completed runs and computing the figure server-side from the engine's
own scoring, never from a number the browser made up.

## Success
- A "cumulative across all runs" panel sits alongside the per-run figure, showing a
  stabilized overall accuracy, a run/record count, and a near/far/blank breakdown.
- The cumulative figure is computed server-side from completed runs' authoritative
  `RunScore`/`RunEntry` data; the browser never invents or recomputes it.
- Only a **successfully completed** run is counted. A run that fails fast mid-way
  (Story 4 of feature 3) contributes **nothing** to the cumulative counters.
- The counters survive an app restart (durable SQLite), and aggregate runs from
  **different** visitors, not just the current session.
- Before any run is recorded, the panel shows a clear "no runs yet" empty state —
  never `NaN`, never a divide-by-zero figure; the same `null`→"—" treatment used for
  zero-count tags in feature 3.
- When the current visitor's run completes, the cumulative figure updates to include
  it without a manual page reload (live tick).
- Concurrent runs from different visitors are all counted — a simultaneous second run
  cannot silently overwrite the first's contribution (atomic increment).
- Consumes feature 2/3's frozen `RunEntry` / `RunScore` shapes unchanged and does
  **not** alter feature 3's run-stream event sequence (`entry*` then `score`|`error`);
  the cumulative figure is delivered over its own read endpoint, not a new stream event.

## Shape touched
Scoring & tally (the cumulative counters and the fold from a run into them — this is
the "maintains the cumulative cross-run tally … needs lightweight persistence" line of
the project Shape), Dashboard UI (the cumulative panel + the empty state + the live
tick). Adds the project's first persistence layer (a SQLite-backed store) behind the
existing server route, plus one read endpoint.

## Out of scope
- **No per-run history / time series / per-visitor breakdown** — running counters
  only. You cannot list past runs or chart accuracy over time.
- **No rate limiting and no abuse protection** (#6). Because the panel aggregates
  every visitor's runs, anyone who can trigger a run moves the number; bounding that
  (per-IP caps) is #6's job, not this feature's.
- **No Fly volume provisioning, deploy, or CI** (#6). This feature makes the store
  durable on a local filesystem path and names the contract #6 must honor (a mounted,
  writable volume so the DB survives redeploys); it does not wire the volume itself.
- **No reset / admin surface** — the counters only ever accumulate; there is no
  in-app way to clear or seed them.
- **No change** to feature 2/3's frozen `RunResult` / `RunScore` / `RunEntry` shapes,
  to the corruption / scoring / leak-prevention logic, or to feature 3's run-stream
  event sequence.
- **No narrative copy pass** (#7) — only enough labelling to read the panel.
