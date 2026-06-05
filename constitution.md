# Constitution

## Standards
Interface:        Apple Human Interface Guidelines
                  developer.apple.com/design/human-interface-guidelines
Accessibility:    WCAG 2.1 AA
                  w3.org/WAI/WCAG21/quickref
Security:         OWASP Top 10
                  owasp.org/www-project-top-ten
API contracts:    OpenAPI Specification
                  spec.openapis.org

Extended (apply when relevant):
API design:       Microsoft REST API Guidelines
AI integration:   OWASP Top 10 for LLMs
Security depth:   OWASP ASVS

Agents follow these without deviation unless the declaration 
explicitly requires otherwise. Deviation must be surfaced as 
a decision, not made silently.

## Architectural principles
- The spec is the contract. Its requirements are never modified during implementation; if a requirement is wrong, `/build` stops and kicks back to `/spec` rather than patching it mid-build.
- No Docker for local development unless the project has multi-service dependencies that genuinely require it.
- All deployments run through GitHub Actions, triggered by push to `main`.
- Prefer first-class deploy tooling (`flyctl deploy` from GitHub Actions) over SSH-based deploy steps.

[Add app-specific principles below as they are decided.]

## Patterns in use
- **Frontend stack:** React + TypeScript + Tailwind + shadcn/ui. Vanilla JS is acceptable only for stateless single-page tools.
- **UI aesthetic:** information-dense, 14px base, tight line heights, dark mode as a first-class surface.
- **UX checklist:** apply Nielsen's 10 heuristics as a general sanity-check on any interface; Apple HIG (see Standards) is the authoritative reference for platform decisions.
- **Python service layout:** `pyproject.toml` with a console-script entry point (not `requirements.txt`); Fly deployment config (`fly.toml`, and a `Dockerfile` if the build needs one) lives at the repo root.

[Add app-specific patterns below as they are established.]

## Spec-authoring lessons
*Recurring spec/test-authoring mistakes learned from real builds, routed here by `/retro` from `build-deviations.md` so the next `/spec` doesn't repeat them. `/spec` reads this section before drafting. Keep each entry concrete: the mistake, and the rule that prevents it, tagged with the feature it came from. Populated by `/retro`.*

- [e.g. "Don't assert the exact JWT algorithm in a test — assert that an expired/forged token is rejected. (auth-1)"]

## Quality gates
- All tests pass — and CI runs the same build the deploy runs. If the test runner doesn't type-check/compile (Vitest, esbuild, isolatedModules), CI also runs the production build (`tsc` / `pnpm build` / `mypy` / `go build`).
- `README.md` and `CLAUDE.md` exist and are current.
- `.env.example` lists every key the deploy workflow injects — no drift between the committed example and the actual required secrets.

[Add app-specific gates below as they are established.]

## Testing
*One block per test runner. A polyglot repo (e.g. a Python API plus a JS/TS frontend) has more than one — list each, because the green bar `/build` must hit is **every** runner passing. `Test root` records how this runner discovers the per-feature suites under `features/*/tests/` — the one-time wiring `/spec` establishes so feature tests are executable without per-feature path hacks (see `/spec` → "Multi-runner repos"). A single-runner project has just one block. Populated by `/spec` on first use.*

- **Runner:** [name, e.g. pytest]
  **Run:** `[command]`
  **Test root:** [how this runner finds feature tests — e.g. a `pytest.ini`/`pyproject` `testpaths`, a Vitest `include` glob, an import alias — or note that feature tests live in `features/*/tests/<runner>/`]

## Out of scope
[List what this codebase explicitly does not do. Populated per app.]

## Decision log
| Date | Decision | Rationale |
|------|----------|-----------|
[populated as significant decisions are made]

## Acknowledged risks
*Cross-feature accumulation surface. Each adversarial-gate finding the owner marks `acknowledged` gets one row here so the project never silently forgets that it knowingly took on risk. Severity is the unmitigated severity — an acknowledged HIGH stays HIGH. Populated by `/spec` when a finding is acknowledged.*

| Feature | Finding | Severity | Risk | Rationale | Mitigation |
|---------|---------|----------|------|-----------|------------|
[populated by the adversarial gate in /spec]
