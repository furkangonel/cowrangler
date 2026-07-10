import { defineConfig } from "@playwright/test";

/**
 * Electron E2E config — launches the *unpackaged* build (apps/desktop/out/main/index.js)
 * directly rather than a full electron-builder installer, so tests only need
 * `npm run desktop:build` and not a signed/packed artifact.
 *
 * Run: npm run test:e2e  (builds first via pretest:e2e, see root package.json)
 */
export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, // tek bir Electron uygulama örneği paylaşılıyor
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
});
