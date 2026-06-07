import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Feature test suites live under features/<feature>/tests/.
    include: ["features/**/tests/**/*.test.ts"],
    // Curation regeneration shells out to `pnpm curate`; give it room.
    testTimeout: 60_000,
  },
});
