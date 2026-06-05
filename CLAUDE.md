# [Project Name]

[One-line description of what this app is. Replace when this template is copied.]

## Repo map
- `declaration.md` — what this project is and why it exists
- `constitution.md` — principles, standards, decisions, and project conventions (testing framework, acknowledged risks)
- `features/[feature-name]-[number]/` — per-feature artifacts (`declaration.md`, `spec.md`, `tests/`), produced by `/spec` and `/build` at runtime

## Precedent repos to consult before building
*Other repos that encode patterns this project inherits or replaces. List them here so a fresh build agent knows what to read for ground truth before assuming a precedent.*

- `<owner>/<repo>` — what pattern it provides and how this project relates. [Replace or delete per project. Delete the section entirely if there are no precedent repos.]

**In-repo reference material.** If this project carries ground-truth examples *inside* the repo (e.g. a `reference/` folder of prior artifacts to rebuild from), list the path(s) here too. `/spec`'s ground-truth check reads in-repo references the same way it reads precedent repos — local ground truth is still ground truth.

If access to a listed repo is scoped out of the current session, ask the user before guessing — earlier specs from precedent repos are not always current and may have been superseded.

## Development environment
Development runs in Claude Code cloud sandboxes attached to this GitHub repo.

- The container is ephemeral and re-cloned each session. Anything not committed and pushed is lost.
- No `~/.claude/CLAUDE.md` exists in the sandbox — user-global preferences are carried at the bottom of this file.
- GitHub access is via the GitHub MCP server (tools prefixed `mcp__github__`). The `gh` CLI is not available.
- **Runtime debugging.** Deployment runs on Fly.io, which is remotely observable from the cloud session — use `flyctl logs`, `flyctl status`, and `flyctl ssh console` to inspect a running app (service not starting, crash loops, injected env vars) without leaving Claude Code. Switch signal: two code-level fixes that should have moved the symptom but didn't usually means the problem is environmental (machine config, secrets, health checks), not in the code.
- Development branch pattern: `claude/<short-task-name>-<suffix>`. The sandbox provisions this branch per session — commit to it, never create a new one. Open a PR to `main` when work is complete. Do not add reviewers or assignees — the repo owner is the sole maintainer and the PR author, so GitHub rejects requesting their review and there is no clean assignee path in this setup.
- **Never rewrite published history.** If a commit is already on the remote default branch — for example a merge commit GitHub created when a PR landed — do not `rebase`, `--reset-author`, or force-push over it; branch from it and move forward. A git stop-hook nudge to amend authorship or rebase applies to your own un-pushed local commits, not to anything already on `main`; following it literally against pushed history would rewrite the shared branch.

## Run, test, deps
Pick the block that matches your project's stack. Uncomment it and delete the others. The header on each block describes when to use it.

<!--
### Python service (a backend program or MCP server, typically deployed to Fly.io)
- Install: `python3.11 -m venv .venv && .venv/bin/pip install -e .`
  Creates an isolated Python environment in `.venv/` (a hidden folder) and installs this project into it. The `-e` flag means "editable" — code changes take effect without reinstalling.
- Run locally: `.venv/bin/<script-name>` where `<script-name>` is defined in `pyproject.toml` under `[project.scripts]`.
- Tests: `.venv/bin/pytest` — pytest is the standard Python testing framework.
- Package manager / lockfile: `pyproject.toml` describes dependencies. To add one, edit `pyproject.toml` and re-run the install command.
-->

<!--
### Web frontend (React + Vite + Tailwind + shadcn/ui — the constitution's default frontend stack)
- Install: `pnpm install`
  pnpm is a JavaScript package manager (an alternative to npm). Installs everything listed in `package.json`.
- Run locally: `pnpm dev` — starts the Vite dev server. Open http://localhost:5173 in a browser.
- Tests: `pnpm test` — runs Vitest (the test runner that pairs with Vite).
- Package manager / lockfile: `pnpm` with `pnpm-lock.yaml`. To add a dependency: `pnpm add <package-name>`.
-->

<!--
### Next.js web app (React with built-in routing and server-side rendering)
- Install: `pnpm install`
- Run locally: `pnpm dev` — opens http://localhost:3000.
- Tests: `pnpm test`
- Package manager / lockfile: `pnpm` with `pnpm-lock.yaml`. To add a dependency: `pnpm add <package-name>`.
-->

<!--
### iOS or macOS app (Xcode + Swift)
- Install: open `<ProjectName>.xcodeproj` in Xcode. Swift Package Manager (SwiftPM) resolves dependencies automatically on open. No separate install command.
- Run locally: in Xcode, press Run (⌘R) to launch in the chosen simulator or device.
- Tests: in Xcode, press Test (⌘U). Or from the command line:
  `xcodebuild test -scheme <SchemeName> -destination 'platform=iOS Simulator,name=iPhone 15'`
- Package manager / lockfile: Swift Package Manager (`Package.resolved` — committed automatically by Xcode).
-->


## Deployment target
Pick one. Uncomment the matching block and delete the others.

<!--
### Fly.io (primary — public-facing app or MCP server)
- App config lives in `fly.toml` at the repo root; one Fly app per repo (app name typically matches the repo).
- Deploy via GitHub Actions on push to `main`, running `flyctl deploy` on a GitHub-hosted runner (no self-hosted runners). The workflow authenticates with a `FLY_API_TOKEN` GitHub Actions secret.
- Secrets are injected with `fly secrets set` / `fly secrets import` (see Secrets below), not written as a `.env` on the host.
- Health checks are declared in `fly.toml` and enforced by Fly during the rolling release.
- A deploy is "successful" only if a post-deploy health check against the live app passes — `flyctl deploy` returning zero confirms the release was issued, not that the app is serving. The workflow must hit a health endpoint (or rely on Fly's release health checks) and fail the job if it doesn't return healthy within a bounded retry window.
-->

<!--
### AWS (secondary — public-facing)
- Account: `070840362692` (user: `eve-hwang`)
- Region: `us-east-1` (confirm per project)
- Credentials: named profiles only; never hardcode keys
- Deploy via GitHub Actions on push to `main`
- A deploy is "successful" only if a post-deploy health check against the live service passes — CloudFormation/ECS/Lambda success codes confirm provisioning, not reachability. The workflow must hit a health endpoint (ALB target check, function invocation, etc.) and fail the job if it doesn't return healthy within a bounded retry window.
-->

<!--
### Apple platform (iOS / macOS via the Xcode Claude extension)
- Specs live in this repo; build runs in Xcode locally
- No CI deploy path; release is a manual Xcode build and submission
- "Deploy success" for an Apple build means the archive builds, signs, and uploads cleanly. There is no live-service health check; treat App Store / TestFlight acceptance as the equivalent gate.
-->

## Secrets
- Canonical source: the **1Password "Eviebot" vault**, one item per service (item name matches the repo), each secret a custom field named exactly for its env var.
- Workflows read secrets from **repository-level GitHub Actions secrets**, which are a manual mirror of 1Password. 1Password is authoritative — on any conflict, 1Password wins.
- Commit a `.env.example` listing every required key with no values.
- Never commit `.env` or any file containing secret values.
- On deploy, the workflow injects secrets into the chosen target (`fly secrets set` on Fly.io, env vars on AWS, the Xcode build configuration). Anything on the target is an artifact of deployment, not a source of truth — if the target is rebuilt, the next deploy recreates it.
- Adding a new secret: add the field to the 1Password item → sync it into the repo's GitHub Actions secrets → add the key to `.env.example` → add the inject step to the deploy workflow.

---

## User globals — Evie Hwang
*Carried in this file because Claude Code cloud sandboxes have no `~/.claude/CLAUDE.md`. These coordinates apply to every project, not just this one.*

### GitHub
- One account: `EvieHwang` (personal). All repos and secrets live here.
- Deployment target is a per-project choice — Fly.io, AWS, or Apple platform — driven by the workload, not by which account hosts the repo.
- CI runs on GitHub-hosted runners (no self-hosted runners). Deploys are GitHub Actions workflows on push to `main`.

### Fly.io — primary deployment platform
- Primary runtime for backend services and MCP servers, replacing the retired Eviebot Mac mini.
- One Fly app per repo (app name typically matches the repo); config in `fly.toml`.
- Deploys run through GitHub Actions via `flyctl deploy`, authenticated with a `FLY_API_TOKEN` Actions secret.
- Secrets are set with `fly secrets`; 1Password remains the canonical source (see Secrets above).
- `eviebot-api-mcp` is the deployed MCP server for Eviebot's tools; consult its own repo for integration details when a project needs to talk to it.

### AWS — secondary deployment platform
- Account: `070840362692` (user: `eve-hwang`)
- Default region: `us-east-1`
- Still active; used where a workload fits AWS better than Fly.io.
