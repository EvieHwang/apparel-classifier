// Orchestrator.
//
// `runClassificationCycle` wires sampler -> tag-assigner -> corruption ->
// classifier -> scorer with a single seeded PRNG, and returns one run's
// `RunResult`. It is the headless keystone the dashboard (#3) and live panel (#5)
// call. Leak prevention lives here: the `ClassificationInput` it builds carries
// only the allowed fields and the corrupted/blank label — never the true
// `articleType`, never the `subCategory`.
import { corrupt, assignTags } from "./corrupt";
import { sampleRecords } from "./dataset";
import { makeRng } from "./rng";
import { score } from "./score";
import type {
  Classify,
  ClassificationInput,
  RunEntry,
  RunResult,
  Subset,
} from "./types";

export interface RunOptions {
  subset: Subset;
  /** Run size: how many records to sample (without replacement). */
  n: number;
  /** Integer seed for the run's PRNG — same seed => identical run. */
  seed: number;
  /** Injected classifier seam (stub in tests, Anthropic adapter in the demo). */
  classify: Classify;
  /**
   * Additive observation hook (feature 3): called once per record, in run order,
   * with that record's `RunEntry`, immediately after the entry is built and before
   * the returned `RunResult` resolves. Purely observational — it alters nothing
   * the cycle computes or returns, and on a fail-fast run it is called only for the
   * records successfully classified before the failure. The dashboard uses it to
   * stream entries without duplicating this loop's leak-prevention.
   */
  onEntry?: (entry: RunEntry) => void;
}

export async function runClassificationCycle({
  subset,
  n,
  seed,
  classify,
  onEntry,
}: RunOptions): Promise<RunResult> {
  // One PRNG threaded through sampling, tag assignment, and corruption so the
  // whole run is reproducible from `seed` alone.
  const rng = makeRng(seed);

  const records = sampleRecords(subset, n, rng);
  const tags = assignTags(n, rng);

  const entries: RunEntry[] = [];
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const tag = tags[i];
    const corruptedValue = corrupt(record, tag, subset, rng);

    // Exactly the fields the model is allowed to see — no id, no subCategory, no
    // true articleType. The corrupted/blank label takes the articleType slot.
    const input: ClassificationInput = {
      gender: record.gender,
      baseColour: record.baseColour,
      season: record.season,
      year: record.year,
      usage: record.usage,
      productDisplayName: record.productDisplayName,
      articleType: corruptedValue,
    };

    // Fail-fast: a rejecting classifier propagates and rejects the whole run
    // (no partial RunResult, no swallowed error).
    const prediction = await classify(input, subset.vocabulary);

    const entry: RunEntry = {
      id: record.id,
      trueArticleType: record.articleType,
      corruptionTag: tag,
      corruptedValue,
      predictedArticleType: prediction.articleType,
      confidence: prediction.confidence,
      rationale: prediction.rationale,
      correct: prediction.articleType === record.articleType,
    };
    entries.push(entry);

    // Additive per-entry observation (feature 3). Fires only after a successful
    // classification, so a fail-fast run observes exactly the pre-failure records.
    onEntry?.(entry);
  }

  return { ...score(entries), entries };
}
