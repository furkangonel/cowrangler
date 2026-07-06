import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["packages/**/src/**/*.ts", "apps/**/src/**/*.ts"],
      exclude: ["apps/cli/src/main.ts", "**/*.d.ts"],
    },
    // ESM ortamı — ts files are run directly by vitest
    testTimeout: 15_000,
  },
});
