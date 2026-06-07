# Build deviations — Core classification loop (feature 2)

Honest record of where the build diverged from the spec's **design** (a
recommendation, not a contract). No `spec.md` requirement was changed; no test
assertion was weakened. Written for a future spec author (`/retro` mines this).

## 1. Adapter split: SDK-free tested seam vs. SDK-backed real wrapper

**Design contradicted.** The design (`spec.md` → Components & seams → *Anthropic
adapter*) describes one module that "wraps `client.messages.parse` with the `zod`
enum over the vocabulary" while "imports the SDK only as `import type`."

**Why it can't be taken literally.** Constraining the structured output to the
closed vocabulary requires `zod` (`z.enum`) **and** the SDK's `zodOutputFormat`
helper — both are *runtime* imports, not type-only. A single module cannot both
call `zodOutputFormat` and import the SDK "only as `import type`."

**What was done instead.** The seam was split into two modules:
- `src/classify.ts` — `createAnthropicClassifier(runStructured)`, the factory the
  tests inject. Imports **nothing** from the SDK or `zod` (type-only imports of
  local types). This is the module `classifier-adapter.test.ts` touches.
- `src/anthropic.ts` — `createRunStructured(client)`, the real, manually-validated
  wrapper around `client.messages.parse` (model `claude-opus-4-8`, `zod` enum over
  the vocabulary, adaptive thinking, no sampling params). Imports `zod` and
  `zodOutputFormat` at runtime and the SDK client as `import type`. **No file under
  `tests/` imports this module.**

**Behavior preserved.** Story 5's behavioral guarantee — "the automated test suite
runs with no SDK runtime dependency and no network" — holds, because the only
module with SDK/`zod` runtime imports (`anthropic.ts`) is never in the test import
graph. The two adapter tests (mapping, fail-fast) pass as written against
`createAnthropicClassifier`.

**Spec-authoring lesson.** State the *behavioral* invariant ("no module the test
suite transitively imports may have an SDK or `zod` runtime import"), not the
*mechanism* ("the adapter module imports the SDK only as `import type`"). The
mechanism is unachievable once the real call needs `zodOutputFormat`/`z` at
runtime, and forcing one module invites either a fake adapter or a test-time SDK
dependency. The fix is a two-module split, which the behavioral framing would have
made obvious.
