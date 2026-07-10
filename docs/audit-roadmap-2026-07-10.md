# Cowrangler Audit Remediation Roadmap

Source: `COWRANGLER_KAPSAMLI_DENETIM_RAPORU_2026-07-10.md`

## Phase 1: Critical Security

- [x] 1.1 Add centralized IPC sender validation for every `ipcMain.handle` registration.
- [x] 1.2 Restrict `fs:openExternal`, plugin action `openUrl`, connector OAuth browser opens, and `window.open` handling to `http:`, `https:`, and `mailto:`.
- [x] 1.3 Add SSRF protection to `fetch_webpage` and `http_request`, including DNS resolution checks and per-redirect validation.
- [x] 1.4 Remove `markdown-pdf` and PhantomJS-backed PDF generation.
- [x] 1.4 Apply non-breaking production dependency audit fixes.
- [ ] 1.4 Upgrade Electron.
- [x] 1.4 Replace `xlsx` with `exceljs`.
- [ ] 1.4 Upgrade `vite`, `electron-builder`, and `electron-rebuild`.
- [x] 1.4 Add `npm audit --omit=dev --audit-level=high` as a CI gate.
- [x] 1.4 Add Dependabot or Renovate.
- [ ] 1.5 Finish the Vercel AI SDK to native client migration.
- [ ] 1.5 Remove `ai` and `@ai-sdk/*` dependencies after migration.
- [ ] 1.6 Add first-use trust approval for new MCP servers.
- [ ] 1.6 Persist MCP server fingerprints and require re-approval when tool lists change.
- [ ] 1.6 Run prompt-injection scanning on MCP tool descriptions and tool results.

## Phase 2: Near-Term Reliability And Quality

- [x] 2.1 Move 429/5xx retry, exponential backoff, and credential pool rotation into `model/native/runner.ts`.
- [x] 2.1 Standardize partial-message recovery in the native runner.
- [x] 2.2 Add renderer ErrorBoundary coverage around routes and major panels.
- [x] 2.2 Add reload fallback UI for renderer crashes.
- [x] 2.2 Add main-process `uncaughtException` and `unhandledRejection` logging and user-facing dialog behavior.
- [ ] 2.3 Add Biome or equivalent lint/format tooling to the main repo.
- [x] 2.3 Add lint CI with zero-warning enforcement.
- [x] 2.3 Start reducing `any` usage, beginning with `packages/core/src/model`.
- [x] 2.4 Tighten unsandboxed mode by requiring approval for `moderate` and higher risk commands.
- [x] 2.4 Add a persistent UI indicator when running without sandbox protection.
- [x] 2.5 Replace search-engine HTML scraping with Brave Search API, Tavily, or SearXNG support.
- [x] 2.5 Keep scraping only as a detectable fallback that reports degraded search.
- [ ] 2.6 Complete macOS Developer ID signing and notarization in release workflow.
- [ ] 2.7 Add IPC contract tests.
- [ ] 2.7 Add Playwright E2E tests for app launch, chat start, file drop, and export.
- [x] 2.7 Add coverage threshold gates in CI.
- [ ] 2.8 Replace CLI base64 vault storage with macOS Keychain, Linux libsecret, and Windows ACL support.

## Phase 3: Architecture, Product, And Hygiene

- [ ] 3.1 Evaluate `sandbox: true` for windows that do not need Node in preload.
- [ ] 3.1 Use a separate sandboxed profile for preview or third-party-rendering windows.
- [x] 3.2 Either extract UI strings into the i18n system or document i18n as limited to core messages.
- [ ] 3.3 Split large files: `commands.ts`, `DesignHome.tsx`, `agent.ts`, and `DesignEditor.tsx`.
- [x] 3.4 Confirm `.DS_Store` is ignored and not tracked by git.
- [x] 3.4 Clean web `uploads/` hygiene.
- [ ] 3.4 Rename the web package from `cowrangler-temp`.
- [ ] 3.5 Expand `trajectory.ts` into replayable model/tool/context audit records.
- [x] 3.6 Define and log precedence between static model catalog data and discovery results.
- [x] 3.7 Add `SECURITY.md`.
- [x] 3.7 Add issue templates.
- [x] 3.7 Add `"engines": { "node": ">=20" }`.
- [x] 3.8 Add coverage reporting enforcement or PR comments.

## Phase 4: Strengths To Extend

- [ ] 4.1 Add sandbox backend tests to the CI matrix, including real Linux Bubblewrap coverage.
- [ ] 4.2 Extend prompt-injection scanning to web page content and file read results.
- [ ] 4.2 Add language-broader prompt-injection patterns.
- [ ] 4.3 Store permission decisions as machine-readable audit records.
- [ ] 4.3 Show "why this was requested" explanations in the permission UI.
- [ ] 4.4 Add provider-level circuit breakers after repeated failures.
- [ ] 4.5 Add periodic session DB `VACUUM`, size limits, and archiving.
- [ ] 4.6 Prune low-information tool results before user messages during compaction.
- [ ] 4.6 Show compaction points in the UI.
- [ ] 4.7 Research and prototype embedding-based semantic code search on top of repomap.
- [ ] 4.8 Add delta updates and in-app release notes.
