import { defineConfig } from "vitest/config";

export default defineConfig({
  // Match Next.js's automatic JSX runtime so component files that use JSX
  // without importing React (e.g. app/page.tsx) can be rendered in tests
  // (react-dom/server) under the node environment. No effect on non-JSX tests.
  esbuild: { jsx: "automatic" },
  test: {
    // Feature test suites live under features/<feature>/tests/.
    include: ["features/**/tests/**/*.test.ts"],
    // Curation regeneration shells out to `pnpm curate`; give it room.
    testTimeout: 60_000,
  },
});
