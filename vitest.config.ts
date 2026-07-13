import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "packages/**/*.test.ts", "apps/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      // Live OAuth/E2E coverage executes in separate service/WordPress processes and is
      // reported as scenario evidence. These thresholds protect the in-process fast-suite
      // baseline from regression without pretending that cross-process lines are uncovered.
      thresholds: { lines: 68, functions: 75, branches: 55, statements: 65 },
      exclude: ["tests/**", "**/dist/**", "**/*.d.ts", "apps/chatgpt-ui/src/main.tsx"],
    },
    testTimeout: 30_000,
  },
});
