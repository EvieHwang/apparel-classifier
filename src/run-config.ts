// Fixed dashboard run size (feature 3).
//
// SDK-free, dependency-light module so the config test can import the value without
// dragging in the server route or the Anthropic SDK. The dashboard exposes no
// user-facing N: every run uses this constant.
//
// @frozen value: 3 <= RUN_SIZE <= subset size on the real curated subset, so the
// sampler never throws RangeError and all three corruption tags (near/far/blank)
// are reachable. Chosen modest to bound LLM latency and cost on a live run.
export const RUN_SIZE = 12;
