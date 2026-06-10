# Multi-stage build for the Next.js app (standalone output). Node 22+ is required by
# feature 4's cumulative store, which uses the built-in node:sqlite. No secret value is
# ever baked into the image — the Anthropic API key is delivered at runtime via
# `fly secrets`, and the deploy token lives only in GitHub Actions.
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# Pin pnpm to the version verified against this lockfile. corepack's unpinned "latest"
# pnpm ignores package.json's `pnpm.onlyBuiltDependencies` and treats unbuilt dependency
# build scripts (esbuild/sharp) as a FATAL error in non-interactive installs; 10.33.0
# honors the field and builds them. Pinning keeps the image build identical to CI/local.
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# --- deps: install with the committed lockfile ---
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# --- build: compile the standalone server ---
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# --- runtime: minimal image serving the standalone output ---
FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Next standalone server bundle + static assets.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# The curated subset is read from disk at runtime (loadSubset reads docs/ via the
# process cwd), not bundled by the tracer — copy it explicitly so a live run works.
COPY --from=build /app/docs ./docs
EXPOSE 3000
CMD ["node", "server.js"]
