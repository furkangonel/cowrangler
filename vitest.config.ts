import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // Package exports point at dist for production. Tests must exercise current
    // source, otherwise an old dist tree can make a regression test pass/fail
    // against code that is no longer in the working tree.
    alias: [
      {
        find: /^@cowrangler\/core\/(.+)\.js$/,
        replacement: path.join(root, "packages/core/src/$1.ts"),
      },
      {
        find: "@cowrangler/core",
        replacement: path.join(root, "packages/core/src/index.ts"),
      },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["packages/**/src/**/*.ts", "apps/**/src/**/*.ts"],
      exclude: ["apps/cli/src/main.ts", "**/*.d.ts"],
      thresholds: {
        statements: 3,
        branches: 40,
        functions: 20,
        lines: 3,
      },
    },
    // ESM ortamı — ts files are run directly by vitest
    testTimeout: 15_000,
  },
});
