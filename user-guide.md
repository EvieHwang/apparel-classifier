# User Guide

A build framework for Claude Code, distributed as a template repository. It provides slash commands (in `.claude/commands/`) that produce a per-feature spec and test suite in `features/[name]-[number]/`, then build against them. The spec and tests are the contract between what you wanted and what got built.

This guide is the human's map: which command to reach for, and how the pieces fit. Each command's exact procedure lives in its own file in `.claude/commands/` — that file is the source of truth, and you can read it if you want the mechanics.

---

## The division of labor

The framework draws one line and holds it:

- **You own intent and the definition of done.** What to build, why, what's out of scope, the standards that apply, the risks you knowingly accept. The model can't derive these — they live in `declaration.md`, `constitution.md`, the per-feature declaration, and above all in the **tests**, which are the executable statement of "done."
- **The runtime owns orchestration and execution.** Planning the work, decomposing it, running pieces in parallel, iterating until the tests pass. You don't manage waves, state files, or convergence loops — the runtime does that natively, and the framework stays out of its way.

The one place the framework still inserts itself into execution is the **adversarial gate**: an independent, clean-context attack on the spec and tests before any code is written. That isn't process supervision — it catches blind spots the authoring pass can't see in itself, no matter how capable the model is.

**How stops reach you.** Each command runs autonomously and stops only at the decisions you own (a declaration to confirm, gate findings to disposition, a plan to approve, a risk to acknowledge). When a command hits one of those stops, it raises it as an `AskUserQuestion` prompt rather than printing prose and waiting — so a cloud/web/mobile session actually notifies you that the run is parked on your input, instead of stalling silently until you check back. This governs *how* a stop surfaces, not *when* one happens: it adds no new stops, and the commands proceed without pausing everywhere they already did.

---

## The mainline

Most work follows one path:

**`/setup` → `/spec` → `/build`.**

1. **`/setup`** — run once on a fresh clone. Coached fill of `CLAUDE.md` and `declaration.md`, so the project has a statement of intent and an operational map before any feature work begins. (It runs the project declaration as its second phase — see `/declaration` under the utilities.)
2. **`/spec`** — after you've talked through the next feature with Claude, `/spec` writes the feature's `spec.md` and its executable test suite, runs them past an independent adversarial gate, and opens a handoff PR. It produces the feature declaration *inline* from that conversation, so you don't author one separately.
3. **`/build`** — in a fresh session after the spec PR merges, implements against the tests until every suite passes, then opens a PR.

That's the whole standard loop: `/setup` once at the start, then `/spec` → merge → `/build` repeated per feature.

## The utilities

Everything else is a tool you reach for in a specific situation — not a step in the mainline.

**Scope-clarification passes — when intent is fuzzy.** These are the two halves of the mainline's scoping work, pulled out to run on their own. Each produces a declaration and stops; each is otherwise absorbed into a mainline command, so you only call it independently when the scope is genuinely unclear.

- **`/feature`** — *feature-level.* Run it before `/spec` when a feature's scope is ambiguous and you want a coached scoping pass. It also carries the walking-skeleton coaching for a project's **first** feature. Skip it when the scope is already clear — `/spec` writes the declaration itself.
- **`/declaration`** — *project-level.* Run it when the project's intent, Shape, or Roadmap shifts as you learn, and you want to revise `declaration.md` deliberately. `/setup` runs this as its second phase on a fresh clone, so you only invoke it on its own *later*, to update what setup first established.

**`/patch`** — a small bounded change (bug fix, tweak, polish, contained feature) where the intent is clear and the work fits one session. No feature artifacts; the PR body is the documentation. Use when you know what correct looks like and the change is contained.

**`/retro`** — after a build, a coached retro that closes the learning loop: it proposes changes to `constitution.md`, `CLAUDE.md`, and the skill prompts based on what the build taught.

**`/upgrade`** — pull the latest framework-owned files into the project.

---

## Core documents

- **`declaration.md`** — the project's statement of intent: what it is, why, for whom, what it explicitly doesn't do, plus **Shape** (3–7 named components/seams) and **Roadmap** (3–7 anticipated features in rough order). Shape and Roadmap are revisable as the project learns.
- **`constitution.md`** — the project's accumulated judgment: standards registry, architectural principles, patterns in use, spec-authoring lessons (mistakes prior builds taught, fed back by `/retro` and read by `/spec`), quality gates, testing (one block per runner — polyglot repos have several), decision log, acknowledged risks.
- **`CLAUDE.md`** — the app's operational map: repo layout, run/test/deploy context, and user-global identity coordinates.

The model reads these before acting; you don't have to remind it to.

---

## Which command edits which files

A command writing outside its lane is how top-level intent gets corrupted, so the ownership is explicit:

| Command | Writes / edits |
|---|---|
| `/setup` | `README.md`, `CLAUDE.md` (project sections), `declaration.md` |
| `/declaration` | `declaration.md` |
| `/feature` | `features/[name]/declaration.md` |
| `/spec` | `features/[name]/spec.md` + `tests/`; **appends** to `constitution.md` (`## Acknowledged risks`, `## Testing` on first use); may update `declaration.md`'s Roadmap when the build order shifts — but says so |
| `/build` | feature source code, `features/[name]/build-deviations.md`; corrects tests only per its contract |
| `/retro` | `features/[name]/retro.md`; **proposes** (never auto-applies) edits to `constitution.md` / `CLAUDE.md` / skills, including `## Spec-authoring lessons` entries |
| `/patch` | scoped code + tests for the one change |
| `/upgrade` | framework-owned files wholesale; merges `CLAUDE.md` / `constitution.md` framework sections behind per-edit approval |

The rule behind the table: top-level `declaration.md` is rewritten only by `/setup` and `/declaration` (with `/spec` allowed to adjust the Roadmap, explicitly). `constitution.md` grows by append during `/spec` (risks, testing) and `/retro` (spec-authoring lessons); its principle/pattern/standard sections change deliberately — via a `/retro` proposal or `/upgrade` — not as a side effect of a feature build.

---

## Running a quick change

```
/patch
```

Identifies the minimal change, presents a plan with breakage risk surfaced, waits for approval, implements only that, runs existing tests, and opens a PR. The PR body (Intent / Change / Verification / Risk) is the record.

---

## Running a feature build

The path is `/spec` → merge the spec PR → `/build` in a fresh session. The two commands run in separate sessions because the cloud sandbox re-clones from `main` each time — so the spec has to be merged before the build can start from it.

### Optionally scope first — `/feature`

```
/feature   feature-name: [name]
```

Reach for `/feature` only when a feature's scope is genuinely fuzzy and you want a coached scoping pass — including the walking-skeleton coaching on a project's first feature. It produces `features/[name]-[number]/declaration.md`. If you skip it, `/spec` produces the declaration inline from the conversation that led up to it.

### Spec — `/spec`

```
... chat about the next feature ...
/spec   feature-name: [name]
```

`/spec` runs one forward pass:

1. **Declaration** — the feature's intent, from the prior conversation (or from a `/feature` run if you did one).
2. **Spec** — `spec.md`: behavioral requirements *and* the design that satisfies them, written together in one pass. Constraints are behavioral, not implementation prescriptions.
3. **Tests** — an executable suite in `tests/` that is the acceptance bar. A weak test is worse than no test, so the suite is the real deliverable, not a sketch — but a *premature* test that pins implementation detail just to be writable is the opposite failure, and `/spec` guards against both. Each test is tagged `@frozen` (a real contract `/build` must satisfy as written) or `@scaffolding` (an interface named provisionally that `/build` may refine as long as the behavior holds). Polyglot repos with more than one runner (e.g. pytest + Vitest) are wired once in `constitution.md`'s `## Testing` so feature tests are executable without per-feature path hacks.
4. **Adversarial gate** — a fresh sub-agent in clean context whose only job is to attack the spec and tests. Independence is the point: a review folded into the authoring pass inherits that pass's blind spots. When you choose to *fix* a HIGH/MEDIUM security finding, a second cheap clean-context pass re-checks just that fix diff, so the fix isn't trusted solely because the same author wrote it.

This is a single gate, not a loop — no requirements↔architecture round-trips, no stability markers, no convergence counters. `/spec` stops only for decisions you must make: the gate's findings (you choose to fix, acknowledge, or proceed for each), scope drift, tension with the declaration, or a risk that needs your explicit acknowledgment. Acknowledged risks are recorded in `constitution.md`. When the gate is resolved, `/spec` commits and opens a handoff PR against `main`.

**Merge that PR**, then start a new session.

### Build — `/build`

```
/build   feature-name: [name]
```

`/build` assumes the spec and tests are final and merged. It plans the work, decomposes it (parallel subagents / Dynamic Workflows where the work warrants it), and implements against the tests, iterating until every runner's suite passes — in a polyglot repo the bar is all runners green, not just one. Then it opens a PR.

During build:
- **Tests are the source of truth.** A failing test means the implementation is wrong — unless the test itself is genuinely in error, in which case the correction is logged in `build-deviations.md`. `@frozen` tests are satisfied as written; `@scaffolding` tests give `/build` latitude to refine the named interface surface as long as the asserted behavior still holds (also logged).
- **Requirements are immutable.** If a requirement looks actually wrong, `/build` stops and kicks back to `/spec` rather than editing the spec — requirements get revised against a fresh adversarial gate, not patched mid-build.
- **Design is a recommendation.** When reality contradicts the design, `/build` satisfies the behavioral requirement a different way and logs the deviation in `build-deviations.md`.

### Retro

```
/retro   feature-name: [name]
```

Optional but recommended. A coached conversation producing `retro.md` — what went well, what didn't (with build deviations as evidence), whether the adversarial gate earned its keep, and concrete proposed changes to `constitution.md`, `CLAUDE.md`, and skill prompts. This is also where the **feedback loop closes**: `/retro` mines `build-deviations.md` for recurring spec-authoring mistakes and proposes entries for `constitution.md`'s `## Spec-authoring lessons`, which the next `/spec` reads — so the same authoring mistakes don't recur silently across features. Template-level lessons are marked separately so they lift directly into a framework-update PR.

---

## New project setup

After cloning the template:

1. `/setup` — coached fill of `CLAUDE.md` (name, description, run/test/deps, deployment target) and a README stub, then `/declaration` as its second phase. Both happen in one session. The low-stakes operational fields default to *expert mode* — `/setup` proposes a full draft and asks for diffs rather than walking one question per turn — while the genuine forks (Shape, Roadmap) still go one at a time. In the cloud sandbox `/setup` ends by pushing and opening a setup PR; merge it before the first `/feature`, which (like every later session) starts fresh from `main`.
2. Edit `constitution.md`'s app-specific sections as the project develops; the template ships with universal defaults already filled in (prune anything that doesn't apply).
3. Pick an approach for your first piece of work.

---

## Keeping the framework up to date

```
/upgrade
```

Fetches the latest framework-owned files and writes them into the current project, then opens a PR.

- **Replaced wholesale** (projects have no reason to customize these): `FRAMEWORK_VERSION`, `user-guide.md`, `features/README.md`, `.claude/commands/*.md`.
- **Never replaced wholesale** (mix framework template sections with project-specific content): `CLAUDE.md` and `constitution.md`. `/upgrade` works these section by section — it semantically merges each framework-owned section (preserving any project-specific lines you added) and proposes deletions for sections the framework has retired, then prompts you per edit in-session (apply / skip / show full). Only the edits you approve are written; project-specific sections are never touched. The PR body lists which edits were applied vs. skipped.

`FRAMEWORK_VERSION` holds the date the framework was last fetched; `/upgrade` reads it to detect whether an upgrade is needed. To force a same-day re-upgrade, delete the file locally first.

A project crossing the V1→V2 boundary will have stale command files (`requirements`, `architecture`, `adversarial`, `tests`, `dag`, `next`); `/upgrade` removes them as part of the upgrade.

**Bootstrapping a pre-`/upgrade` project:** open a session on the old project and ask Claude to `curl` the upgrade command into place:

```
curl -sf https://raw.githubusercontent.com/EvieHwang/evie-dev-framework/main/.claude/commands/upgrade.md -o .claude/commands/upgrade.md
```

Then run `/upgrade` to pull in the rest.
