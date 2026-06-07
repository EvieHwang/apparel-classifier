// Corruption engine.
//
// `corrupt` produces the label the model is shown for one record under one tag;
// `assignTags` produces a balanced, deterministic tag sequence for a run. Both are
// pure given the injected seeded PRNG (spec Story 3 + the balanced-tags edge case).
import type { ApparelRecord, Subset, Tag } from "./types";

// Pick one element of a non-empty list deterministically via the rng.
function pick<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

/**
 * Corrupt a record's `articleType` per its tag:
 *  - `blank`     -> "" (the empty string).
 *  - `near-swap` -> a *different* sibling type in the *same* subCategory.
 *  - `far-swap`  -> a type from the set difference `vocabulary \ types(trueSub)`,
 *                   which is guaranteed ≠ the true type and lives in a different
 *                   subCategory — even when a label (e.g. "Shorts") spans two
 *                   subCategories, the leak-prevention guarantee of Story 2.
 *
 * Only ever selects an existing vocabulary label or blanks; never invents a value.
 * Throws on a corpus-contract violation (no sibling / no far target) rather than
 * silently emitting the true value or an invalid label.
 */
export function corrupt(
  record: ApparelRecord,
  tag: Tag,
  subset: Subset,
  rng: () => number,
): string {
  if (tag === "blank") return "";

  const trueType = record.articleType;
  const homeTypes = subset.typesBySubCategory.get(record.subCategory) ?? [];

  if (tag === "near-swap") {
    const siblings = homeTypes.filter((t) => t !== trueType);
    if (siblings.length === 0) {
      throw new Error(
        `corrupt: no near-swap sibling for "${trueType}" in subCategory ` +
          `"${record.subCategory}" (corpus-contract violation)`,
      );
    }
    return pick(siblings, rng);
  }

  // far-swap: vocabulary minus every type whose home is the true subCategory.
  // Set difference (not "another subCategory's list") so a label shared across
  // subCategories — Shorts under both Bottomwear and Loungewear — can never be the
  // chosen far value for a record whose true type is that label.
  const farCandidates = subset.vocabulary.filter((t) => !homeTypes.includes(t));
  if (farCandidates.length === 0) {
    throw new Error(
      `corrupt: no far-swap target outside subCategory "${record.subCategory}" ` +
        `(single-subCategory subset — corpus-contract violation)`,
    );
  }
  return pick(farCandidates, rng);
}

/**
 * Assign one tag to each of `n` records, balanced across the three tags (counts
 * differ by at most 1), then shuffled deterministically by the rng. Round-robin
 * over the fixed tag order gives the balance; the shuffle removes positional bias.
 */
export function assignTags(n: number, rng: () => number): Tag[] {
  const order: Tag[] = ["near-swap", "far-swap", "blank"];
  const tags: Tag[] = [];
  for (let i = 0; i < n; i++) tags.push(order[i % order.length]);

  // Fisher-Yates shuffle preserves the per-tag counts, so balance still holds.
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [tags[i], tags[j]] = [tags[j], tags[i]];
  }
  return tags;
}
