# Feature declaration — Single-record live panel (feature 5)

## What
A live panel on the demo page where any visitor types a single product name,
submits it, and sees the classifier's guess inline: the predicted `articleType`,
a confidence level, and a short rationale. It reuses the exact server-side
classification path the scored demo uses (same model, same closed vocabulary),
so it is provably *the same classifier* — just pointed at one user-supplied
record instead of a sampled, corrupted one.

## Why
The scored dashboard proves accuracy on the project's own curated records, but a
forwarded link is more convincing when the recipient can poke it with *their own*
example. The panel turns a passive demo into a hands-on one: type "Nike running
shorts", watch the classifier place it. It also makes the honesty of the method
tangible — the visitor sees the prediction is driven by the product name alone,
the same teaching point the narrative pass (#7) will later make explicit in copy.

## Success
- A visitor can type a product name, submit, and see predicted `articleType` +
  confidence + rationale, returned by the same Anthropic-backed classifier the
  scored demo uses, constrained to the same closed vocabulary.
- Input that isn't a usable product name (empty, whitespace-only, or absurdly
  long) is rejected before any model call.
- An off-distribution input (something the classifier can't confidently place as
  apparel) is **declined** rather than forced into a confidently-wrong label —
  via a confidence gate (a `low`-confidence result is shown as a decline).
- The API key never reaches the browser; the automated suite stays SDK-free,
  network-free, and key-free, exactly as the run route is.

## Shape touched
- **Single-record panel** (declaration Shape) — the new UI surface and its
  one-shot `POST → JSON` server route.
- **Classification service** (declaration Shape) — reused wholesale
  (`createAnthropicClassifier(createRunStructured(client))`, the frozen
  `ClassificationInput` / `Prediction` shapes, the closed vocabulary from
  `loadSubset`). The only new logic is input validation and the confidence gate.

## Out of scope
- **Rate limiting** — belongs to #6 ("Go public safely"). This feature ships
  without it but must not preclude it.
- **Narrative / honesty copy** — belongs to #7.
- **Scoring / ground truth** — a user's product name has no true label, so there
  is no ✓/✗ and no accuracy here; the output is a prediction only.
- **Streaming** — one classification has nothing to stream; a plain request/
  response is used, not SSE.
- Any change to feature 2's frozen shapes, corruption, scoring, or
  leak-prevention logic.
