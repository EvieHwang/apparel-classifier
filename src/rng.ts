// Deterministic 32-bit PRNG (mulberry32). Same seed => same sequence, across
// runtimes — so a run is reproducible from its integer seed without depending on
// `Math.random` or a runtime-dependent shuffle (spec: Determinism).
//
// This mirrors the PRNG the test helpers use; the contract is "same seed => same
// result within a run", not byte-compatibility with any particular generator.
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
