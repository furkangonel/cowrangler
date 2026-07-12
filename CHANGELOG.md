# Changelog

All notable changes to co-wrangler are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Version numbers follow [Semantic Versioning](https://semver.org/).

---

## [2.1.6] — 2026-07-12

### Fixed
- Plugin manager: implement full state cleanup on plugin re-initialization (properly clearing stale tools, subagents, dynamic models, interceptors, and skill paths when a plugin is uninstalled or reloaded).

## [2.1.5] — 2026-07-11

### Added
- Code tab: addable extra working directories beyond the locked primary workspace — the agent can read, edit, and run code in them via absolute paths (`agent:getCodeDirs`/`addCodeDir`/`removeCodeDir`, injected into the code system prompt).
- Sidebar "New task" button for the Code tab that opens a fresh Code home to pick a new workspace.

### Changed
- Neutralize the primary accent to monochrome — selected menu items, active tabs, and buttons now render black (light) / white (dark) instead of terracotta.
- Code chat now uses a plain sans typeface (distinct from Cowork's editorial serif); Cowork typography is unchanged.
- Code composer restyled to a minimal variant: colorless enter-icon send button and a textarea that grows up to 10 lines before scrolling.
- Code session header simplified — removed the back and "New" buttons; navigation moves to the sidebar.
- The primary Code workspace folder is locked once selected; switch folders by starting a new task.
- The Design button is minimal, uses the palette icon, and is shown only in the Cowork tab.

### Fixed
- Stop button no longer appears in the Code home composer when no folder is selected (it now shows only while the agent is actually working).

---

## [2.1.4] — 2026-07-10

### Added
- Store MCP server config/tool-list fingerprints and gate new or changed servers behind an approval callback (`mcp_trust.ts`), auto-trusting when no callback is wired (non-breaking).
- Scan MCP tool descriptions and tool results for prompt-injection patterns, and extend injection pattern matching to Turkish, Spanish, French, German, Russian, and Chinese.
- Add a provider-level circuit breaker to the native model runner so a provider outage short-circuits instead of retrying from scratch on every turn.
- Add periodic session DB archiving, a size cap, and `VACUUM` (`SessionDB.runMaintenance`), throttled to at most once a day.
- Persist every permission decision (auto/user, allow/deny, reason) as a machine-readable audit record in a new `permission_decisions` table.
- Show *why* a permission approval was requested (risk level + reason) in the prompt shown to the user.
- Record full tool-call results (not just name/args) in `/trajectory` recordings, truncated and privacy-bounded.
- Collapse duplicate tool-call results during context compaction instead of re-summarizing repeated identical calls.
- Show a compaction-point divider in the desktop chat UI instead of rendering the summary as a normal user message.
- Enable the Electron sandbox (`sandbox: true`) for the main and design windows.
- Back the CLI credential vault with the real OS keychain (macOS `security`, Linux `secret-tool`) instead of base64 obfuscation, with a Windows ACL fallback.
- Add a Playwright E2E suite (app launch, chat start, file drop, export) against the built Electron app.
- Add static IPC contract tests that catch renderer/main channel drift and duplicate handlers without an Electron runtime.
- Add a report-only Biome linter pass and real Bubblewrap sandbox coverage to CI.
- Show release notes in the desktop update-available banner.
- Prototype an embedding-based semantic code search tool (`semantic_code_search`), provider-agnostic and unit-tested against a fake embedder, with a real OpenAI embeddings implementation.

### Fixed
- Sandboxed Electron preload script failing to load (`Cannot use import statement outside a module`) by forcing the preload build to CommonJS.
- Agent errors that occur before streaming starts (e.g. missing API key) being silently dropped instead of shown in the chat UI.
- Removed a dead `agent:approvalRequest` IPC listener left over from before approvals were unified into `agent:qaPrompt`.

## [2.1.3] — 2026-07-09

### Changed
- Scope Cowork session context panel resources to the active project/session: active skills now come only from that session's context, and MCP servers only appear after they are used in that session.
- Show session plan files in Cowork Working Folders and improve touched-file detection for the current desktop file tools.
- Scope desktop agent events (`toolCall`, `progress`, `plan`, `done`) by project/session so stale activity from another session cannot leak into the active UI.
- Apply the live reasoning shimmer gradient to the Design sidebar button in both expanded and collapsed sidebar modes.

### Fixed
- Clear session-local UI state (tool calls, timelines, progress, and current plan) when switching or creating sessions.
- Start task watching on the real session id for new Cowork sessions instead of the temporary `__new__` placeholder.
- Handle unborn Git repositories in Code mode, including repos on a named branch such as `develop` before the first commit exists, without noisy `HEAD`/branch fatal logs.

## [2.1.2] — 2026-07-09

### Added
- Implement structured choice/text response resolution in ask_user tool and normalize selected options checking.
- Configure intent parameter for write_plan (plan_approval) and permission checks (permission_approval/destructive_confirmation).
- Render customized headers, alert badges, and action buttons in AskUserPrompt.tsx based on the AskUserIntent.
- Add interactive Approve, Modify, and Cancel buttons inside CodePlanPanel.tsx and Left Panel's ContextPanel.tsx.
- Group pinned sessions at the top of the sessions list in Code mode sidebar.
- Add comprehensive unit tests for structured responses.

## [2.1.1] — 2026-07-08

### Fixed
- Fixed plan approval auto-submission, session sync, and permission path mapping.
- Sorted sessions list by last active timestamp in descending order.
- Updated header sidebar button tooltips to "Diff" and "Preview".

## [2.1.0] — 2026-07-06

### Added
- **Dedicated Code agent prompt** — the Code tab now runs its own `desktop_code` system prompt instead of falling back to the generic session prompt. It is code-first (read → edit → run → verify), prefers running the code to prove it works, and treats git as **display-only**: the agent stages/commits/pushes or opens a PR only when you explicitly ask, never as a side effect of a task.
- **Code header ⋯ menu — Plan & Tasks** — a kebab next to the Terminal / Diff / Preview toggles opens two read-only right-panel views: **Plan** (the agent's `write_plan` output — title, summary, steps with file/risk badges) and **Tasks** (a deliberately primitive checkbox list of the agent's `manage_task` steps). Each is enabled only when the agent has actually produced a plan / task list.

### Changed
- **Code session matches Code Home** — the session view now uses the same layout as the home screen: folder · branch · PR row on top, composer with the model picker at the bottom. The separate middle control bar was removed.
- **Unified Code model pool** — the Code session model picker now reads the same pool as Code Home (saved models **+** plugin-contributed models), so plugin models like Antigravity appear consistently in both places.
- **Diff panel is display-only** — the working-tree diff view no longer has a "Create PR" action; it only shows changes.

### Removed
- **General Chat mode** — the project-less "General Chat" surface has been fully removed: the Chat tab, `GlobalChatView`, the `__global__` chat sessions, the `desktop_chat` system prompt, and the `FEATURES.chat` flag are gone. The global memory scope and global workspace directory (still used by the Code tab) are unchanged.
- **Cosmetic Code effort control** — the Low/Med/High "effort" selector was removed; it was never passed to the model call and had no effect.

---

## [2.0.9] — 2026-07-02

### Added
- **Subscription OAuth login** — `cowrangler login`, in-session `/login`, and a desktop **Models** tab section let you sign in with a plan you already pay for — **Claude Pro/Max, ChatGPT Plus, GitHub Copilot, Gemini, and Antigravity** — no API key required. PKCE + loopback (and device-code for Copilot) flows in `src/core/oauth_subscriptions.ts`; tokens are stored in the encrypted vault and auto-refreshed. `applyOAuthEnv()` injects valid tokens at CLI and desktop boot so models run keyless.
- **Checkpoints & `/undo`** — every agent file mutation (`write_file`, `edit_file`, `apply_patch`, `append_to_file`, `delete_file`, `move_item`) is snapshotted first (`src/core/checkpoints.ts`); `/undo` reverts the last change and `/checkpoints` lists history — without touching your real git history.
- **Terse output mode** — `/terse` (or `config.terse`) enables a token-efficient output profile that trims prose while keeping code, identifiers, and errors verbatim.
- **Plan mode commands** — `/plan` (read-only exploration) and `/act` (edits enabled) map to the existing permission system.
- **Autonomous goal mode** — `/goal <description>` drives the agent to break down, execute, verify, and complete a goal end-to-end.
- **`repo_map` tool** — lightweight repository map ranking the most-referenced source files with their top symbols, for fast orientation in large codebases.
- **Recipes** — parametrized, reusable workflows from `.cowrangler/recipes/*.yaml`, run with `/recipe <name> key=value …`.
- **Lifecycle hooks** — `.cowrangler/hooks.yaml` runs shell commands on `pre_tool_call` / `post_tool_call` / `session_start` / `session_end`.
- **`apply_patch` tool** — apply multiple search/replace hunks to a file atomically in one call.
- **More providers** — Mistral, DeepSeek, xAI (Grok), Together, Cerebras, Fireworks (`prefix/model`), alongside existing local models (Ollama/LM Studio/`local`).
- **Fuzzy model search** in the model picker (subsequence matching).
- **Prompt-injection scanner** (`src/core/context_security.ts`) sanitizes `COWRNGLR.md` and project memory before they're injected into the system prompt (strips hidden/zero-width characters, flags injection patterns).
- **Desktop packaging targets** — Windows `msi`, Linux `deb` and `rpm` in addition to the existing installers.
- **Image tools** — `generate_image` (OpenAI images / Google Imagen) and `analyze_image` (vision via OpenAI/OpenRouter/Anthropic) — synergistic with Design mode (asset generation, mockup→analysis).
- **Custom providers** — `config.custom_providers` lets you add any OpenAI-compatible endpoint (`<prefix>/model`) without touching code.
- **Long-term memory** — pluggable `MemoryProvider` interface (`src/core/memory_provider.ts`) + a dependency-free local recall backend that stores conversation turns and surfaces relevant past work each turn (`config.memory.recall: false` to disable).
- **Remote/isolated execution** — `execute_bash` honors `config.terminal.backend`: `ssh` runs commands on a remote host (the host is the isolation boundary), `docker` runs them in the sandbox's Docker provider.
- **Git worktrees** — `git_worktree` tool (create/list/remove) and a `spawn_subagent` `isolate: true` option that gives a sub-agent its own worktree so parallel/experimental work never touches the main tree.
- **`cowrangler serve`** — run the agent as a local HTTP service (`GET /health`, `POST /chat`, `POST /reset`) with optional bearer-token auth, for desktop/SDK/script integration.
- **Cron power features** — jobs now apply `context_from` (feed one job's output into another), `script` (pre-run data collection injected into the prompt), `provider` override, `workdir`, and `skills`.
- **`/copy`** — copy the last assistant response to the clipboard via OSC 52 (works over SSH).
- **Microbench eval harness** — `npm run bench` runs `scripts/microbench` against `cowrangler serve`, reporting pass rate and token totals per task.
- **Design mode P0 tooling**:
  - **Ahead-of-time esbuild-wasm compilation** for `jsx` screens (~10× faster than the previous in-iframe Babel-standalone path, adds TypeScript support); Babel is kept as an automatic fallback when esbuild-wasm can't initialize.
  - **Click-to-edit element inspector** — click any element in a rendered screen to select it; the next chat message is pre-seeded with a reference to that exact element/selector.
  - **WCAG AA accessibility scanner** — on-demand per-screen contrast and touch-target check, with an inline issue panel and a re-scan button.
  - **Version history / checkpoints for design screens** — manual "Save" snapshots plus an automatic snapshot before every restore (`design:createCheckpoint` / `design:listCheckpoints` / `design:restoreCheckpoint`).
  - **Mermaid diagrams** as a first-class screen kind alongside `html` / `jsx` / `svg`.
- **Global chat right panel** — the projesiz "General Chat" now shows the same Progress + Context side panel project sessions get, including which skills/tools were used in that conversation (previously hidden entirely for global chat).
- **Animated mascot loader** (`RobotLoader`) — a pixel-accurate loader generated from the real brand mark (`cw.png`'s own silhouette, sampled onto a 7px grid) replaces the plain spinner / "Thinking…" text as the chat "thinking" avatar and the Design mode thinking indicator: it scatters into pixels, reforms, and gives its legs a little step on every cycle.

### Changed
- **Chat tool allowlists tightened per surface** — General Chat now exposes only a lean, conversational tool set (`web_search`, `fetch_webpage`, `read_file`, `search_in_files`); Design chat gets a focused write/read/search/image/`ask_user` set (no `manage_task`, `spawn_subagent`, `execute_bash`, or git tools) with a 60-step budget (up from the default 25) so multi-screen requests don't get cut off mid-build.

### Fixed
- **`utilize_skill` no longer leaks across sessions** — a skill's SOP used to be copied into a project-wide context folder that got re-injected into *every* session for that project (and even the projesiz global chat) forever after one use. It's now scoped to the session/chat that invoked it (`.cowrangler/context/skills/<sessionId>/`), matching the existing per-session `tasks`/`plans` pattern. The `agent:chat` IPC handler is now the single authoritative place that syncs the active-session id, fixing General Chat and Design chat, which previously relied on a renderer-side call only project sessions made.
- **Stream-stall watchdog** — if a provider's response stream goes idle mid-turn (network hiccup, provider-side stall) past `config.stream_idle_timeout_ms` / `COWRANGLER_STREAM_IDLE_TIMEOUT_MS` (default 120s), the request is aborted and retried instead of hanging the turn forever.
- **`ask_user` auto-timeout** — a pending question now auto-resolves after 5 minutes (`COWRANGLER_ASK_USER_TIMEOUT_MS` to override, `0` to disable) so a turn can't hang indefinitely waiting on a prompt nobody answers.
- **Design mode CDN failover** — React/ReactDOM/Babel/Tailwind/Mermaid now load from an ordered list of mirrors (unpkg → jsdelivr → cdnjs); a single mirror 404ing no longer blanks the whole screen.
- **Design mode no-output nudge** — if the model ends its first turn describing a plan without writing any screen file, it gets one automatic follow-up nudge to start producing files instead of leaving the user with nothing.
- **Subscription OAuth logins now work across CLI and desktop** — tokens saved via the desktop app used to be encrypted with Electron's OS-keychain `safeStorage`, which a plain-Node CLI process can never decrypt (even though both read the same `~/.cowrangler/secrets.json`), so a provider connected in the desktop app silently looked "not logged in" to the CLI. Subscription tokens are now always stored in the portable format both environments can read, and existing keychain-encrypted logins self-migrate automatically the next time the desktop app applies OAuth env (no re-login needed once that happens). `missingKeyHint()` also now points at `cowrangler login <provider>` for Anthropic/OpenAI/Copilot/Antigravity instead of only suggesting an API key.

### Removed
- **Kanban** — the entire Kanban board subsystem (`cowrangler kanban …` CLI, `manage_kanban` tool, dispatcher/daemon, web board, config, and log channel) has been removed. Session task tracking continues via `manage_task`. The CLI README's Kanban section and tool-table reference have been cleaned up to match.

---

## [2.0.8] — 2026-06-30

### Added
- **Native Sandbox Runner** — Replaced synchronous execution with an asynchronous and non-blocking sandbox engine using `cowrangler-sandbox.bundle` supporting platform-specific isolation (macOS seatbelt, Linux bubblewrap, and Windows PowerShell).
- **Centralized & Interactive Tool Permissions** — Introduced an automatic permission checking mechanism in tool execution with interactive prompts (`executeAskUser`) for dangerous actions like `execute_bash` and system writes.
- **Wizard Keyboard Navigation** — Added keyboard navigation support (arrows, Enter, Escape) to handle interactive Q&A prompts in both Desktop UI and Ink CLI.
- **Reasoning Token Streaming** — Added real-time thinking/reasoning stream rendering in both Desktop and CLI for Anthropic Claude, OpenAI reasoning models, and Google Gemini models.
- **StatusBar Model Switcher** — Implemented an instant model switching dropdown directly in the desktop app's status bar footer.
- **Sandbox Tests** — Added a Vitest test suite (`tests/sandbox.test.ts`) covering the sandbox bundle, async execution, path limits, and dangerous command blockings.
- **Custom Connectors** — Restored support for manually adding custom MCP connectors via standard stdio, HTTP, or SSE configurations.
- **Dynamic Session Selection** — Connectors and plugins can now be seamlessly selected directly from the prompt area's inline menu.

### Changed
- **Connector UX Enhancements** — Transformed the connectors interface to support rich markdown descriptions and metadata display (capabilities, author info, privacy policies).
- **Connector Configuration Flow** — Enhanced connection logic by requiring user-supplied parameters (local path arguments, auth secrets) before validating connection steps for non-OAuth connectors.
- **UI Simplifications** — Streamlined sidebar and message input (`+` menu) to match standard visual layouts.

---

## [2.0.7] — 2026-06-25

### Added
- **Skill Upload Modal** — Introduced a custom drag-and-drop modal for skill uploads matching the native app experience.
- **Context Size Dropdown** — Replaced manual text input with a predefined selection dropdown (4K to 2M) for model context sizes.

### Changed
- **System Skills** — Hidden the internal `setup-cowork` skill from the UI and auto-injected it as a core system directive for the agent.
- **Task Management** — Replaced the global `AGENT_TODO.md` file with a session-specific `tasks.json` to ensure isolated agent task tracking per chat session.
- **Skill Imports** — Enhanced `.zip` and folder upload logic to recursively find nested `SKILL.md` files; added `jszip` dependency.

### Fixed
- **Connector Icons** — Updated Content Security Policy (CSP) to allow loading external images over HTTPS, fixing broken icons in the Connectors tab.

## [2.0.6] — 2026-06-23

### Added
- **General (project-less) chat** — the sidebar now splits into **Projects** and **Chats** tabs. Chats run under a dedicated `GlobalChatView` with a `__global__` project id and an isolated workspace dir (`~/.cowrangler/global-workspace`), so you can talk to the agent without setting up a project. Global sessions are persisted and listed in the sidebar.
- **Collapsible sidebar** — toggle the left panel to an icon-only rail from the titlebar.
- **Per-session model picker** — switch the model for a single session from its header, independent of the global default.
- **Session management** — rename and delete sessions inline from the sidebar (both project and global chats); deletion now permanently removes the session and its messages (`SessionDB.deleteSession`), not just the project link.
- **Project actions wired up** — the project header **Pin**, **Edit** (new `EditProjectModal`: name, description, instructions), and **Delete** controls now work.
- **New verified connectors** in the catalog — **Canva**, **Miro**, **Trimble SketchUp** (official remote OAuth MCP servers), plus **Airtable**, **GitLab**, and **Todoist** (stdio).
- **Skill file-tree view** — the desktop Skills tab shows a skill's full file/folder structure (`SkillDef.dir` + `skills:fileTree`), alongside upload format hints for `.md` / `.zip` / `.skill`.

### Changed
- **Instant model switching** — changing the model (in Settings or per session) now applies on the next message by swapping the model in place (`LLM.setModel`) instead of recreating the agent, preserving conversation history.
- **Entire desktop interface translated to English** (remaining Turkish UI strings, relative-time labels, update banner, panels).

### Fixed
- **Stop button now cancels provider-side generation** — `requestInterrupt` aborts the in-flight LLM request via `AbortController`; the run ends in a clean "interrupted" state instead of erroring or continuing to stream.
- **Built-in skills not showing in the desktop dev build** — `bundled_skills` is now resolved through a robust multi-candidate path lookup (covers `electron-vite` dev, tsc build, and packaged `resourcesPath`), so all bundled skills appear again.

---

## [2.0.5] — 2026-06-21

### Added
- **12 new default connectors** in the curated catalog (`src/core/connectors_catalog.ts`), all with verified official endpoints:
  - **Remote OAuth MCP servers:** Sentry, Vercel, Supabase, Asana, Atlassian (Jira & Confluence), ClickUp, Intercom, Figma, HubSpot.
  - **Remote API-key MCP:** Stripe.
  - **Web & AI search (stdio, API key):** Tavily, Exa, Firecrawl.
- **Two new connector categories** — `design` (Figma) and `business` (HubSpot) — with matching category icons (`Palette`, `Briefcase`).
- **Brand logos on connector cards** — each catalog entry can carry a `logo` URL (served from the simpleicons CDN in brand colour). New `ConnectorLogo` component renders the brand mark and falls back to the category icon when a logo is missing or fails to load (offline/404). Existing GitHub, Slack, Notion, Linear, PostgreSQL, and Brave entries now show their logos too.
- **In-app auto-update** (`electron-updater` + GitHub Releases) — on launch (packaged builds only) the app checks for a newer release and shows an `UpdateBanner`: **Yeni sürüm hazır → İndir → Yeniden başlat & güncelle**, with a live download progress bar. New `update.ipc.ts` drives `checkForUpdates` / `downloadUpdate` / `quitAndInstall`; exposed via preload (`window.electronAPI.updates`) and the renderer `ipc.updates` bridge. The release workflow already publishes the `latest*.yml` feeds via `electron-builder --publish always`.
- **macOS code signing + notarization** — `build.mac` now signs with Developer ID (hardened runtime + `assets/entitlements.mac.plist`) and notarizes (`notarize: true`). The release workflow passes `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` from repo secrets. Required for macOS auto-update to work (Squirrel.Mac refuses unsigned updates). Windows (nsis) and Linux (AppImage) auto-update without signing.

### Notes
- Endpoints were taken only from verified sources; OAuth connectors use the standard OAuth 2.1 + dynamic-registration loopback flow already wired through `connectors:authorize`. No core MCP/auth plumbing changed — new entries flow through the existing catalog → IPC → UI path.
- Auto-update is a no-op in dev (`!app.isPackaged`). If macOS signing secrets are absent, electron-builder skips signing **and** notarization gracefully (no build failure), so unsigned local mac packaging still works.

---

## [2.0.3] — 2026-06-20

### Added
- **Connectors catalog** (`src/core/connectors_catalog.ts`) — curated, real, working MCP connectors surfaced to users as "Connectors"; Browse → Add → auth flow (stdio servers that work out of the box, plus token/OAuth ones). Replaces the duplicated raw MCP add form.
- **Plugins catalog** (`src/core/plugins_catalog.ts`) — Cowrangler-signed, pre-installed plugins bundling related skills + recommended connectors; desktop **Plugins** tab to enable/disable.
- **Skill → Context copy** — invoking a skill (`utilize_skill`) now copies it into the project's CONTEXT (`.cowrangler/context/skills/`); the agent injects only context-active skills as full SOPs, preserving prompt caching. CONTEXT = project MEMORY + copied skills.
- **Skill upload** — desktop "New skill" now offers *Write instructions* or *Upload* (`.md` / `.zip` / `.skill`, via `skills:upload`).
- **Per-tool live status** — each tool call now reports its own start/done/error in real time (wrapped tool `execute`, keyed by the SDK `toolCallId`), so loaders and checkmarks update independently instead of in a batch.
- **Multi-platform desktop releases** — `.github/workflows/release-desktop.yml` builds macOS (`.dmg`/`.zip`), Windows (`.exe`), and Linux (`.AppImage`) on a `v*` tag and publishes to GitHub Releases.

### Changed
- **Rebranded display name** to **Cowrangler** (was "Co-Wrangler") across UI, app/product name, and docs. npm package id (`co-wrangler`) and the `cowrangler` CLI command are unchanged.
- **Models are now fully dynamic** — the hardcoded model list was removed; models are discovered live from each provider with a configured key (Anthropic, OpenAI, Google, OpenRouter, Groq) and cached for 24h. Desktop **Models & API** puts a manual `provider/model-id` entry on top with the discovered list below.
- **Desktop UI is fully English.**
- **Octopus** brand mark replaces the sparkle/Hermes glyphs (welcome screen, assistant avatar in a circle, status-bar lasso mark); the octopus no longer self-animates — it animates on hover only, keeping the active "thinking" loader.
- **Default model fallback removed** — if no model is configured the user is guided to pick one.
- Session titles are derived from the first 20 characters of the first prompt.

### Fixed
- **electron-builder config** — removed the invalid `nativeRebuilder` key and added the missing `author` field so `.dmg`/installer packaging succeeds.
- Nullish-coalescing/`||` mix in `ModelsTab` that broke the Vite/Babel build.

---

---

## [2.0.2] — 2026-06-05

### Added
- **Two-tier task management system** — replaces the flat `AGENT_TODO.md` markdown checklist with two purpose-built tools:
  - `manage_task` — structured session-scoped tasks (JSON-backed, ephemeral, cleared between sessions); actions: `create`, `start`, `done`, `block`, `unblock`, `list`, `clear`; every response returns a numbered list so the model never needs to track IDs
  - `manage_kanban` — persistent project-level task board (SQLite-backed, survives sessions); actions: `create`, `list`, `show`, `assign`, `done`, `fail`, `block`, `unblock`, `comment`, `stats`; short 8-char ID resolution for ergonomic CLI use
- **Kanban dispatcher** (`src/kanban/dispatcher.ts`) — automatically processes pending kanban tasks using subagents:
  - Foreground mode: `cowrangler kanban dispatch` (Ctrl+C to stop)
  - Daemon mode: `cowrangler kanban daemon start/stop/status` (PID-file managed background process)
  - Configurable concurrency (`--concurrency N`, default: 3)
  - `reclaim()` — automatically releases tasks stuck in `claimed/running` state beyond 10 minutes
  - Auto-block after 5 consecutive failures per task
- **Kanban live web UI** (`src/kanban/web.ts` + `src/kanban/board.html`) — `cowrangler kanban board` starts an Express-equivalent HTTP server (default port 4242) and opens the browser:
  - 4-column board: Pending / Running / Done / Blocked with live task counts
  - SSE (Server-Sent Events) real-time updates — board refreshes automatically on every task change
  - Task cards with priority badges, assigned-to labels, tag chips, running spinner
  - Click any card to open detail modal: full task info, output, error, blockers, comments
  - **Inline edit form** — ✎ Edit button in modal header; editable fields: title, description, priority, tags, assigned-to, status; saves via `PATCH /api/tasks/:id` with immediate board refresh
  - **Comment input** — post comments directly from the board; visible in task detail modal
  - **Offline banner** — shows server status instead of error toasts; auto-retries silently every 30s
  - Header branding: `kanban_ui_icon.png` + stacked CoWrangler / KANBAN text with matched widths
  - REST API: `GET /api/tasks`, `GET /api/tasks/:id`, `POST /api/tasks`, `PATCH /api/tasks/:id`, `PATCH /api/tasks/:id/status`, `POST /api/tasks/:id/comment`, `GET /api/stats`, `GET /api/events` (SSE)
  - Static asset serving: `GET /assets/:filename`
- **Kanban DB enhancements** (`src/kanban/db.ts`):
  - `update()` — patch title, description, priority, tags, assigned_to without touching status
  - `assign()` — explicit profile assignment
  - `reclaim()` — timeout-based stale task recovery
  - `tailEvents()` — last N board events for `cowrangler kanban tail` and SSE polling
  - `getBlockers()` / `getBlocked()` — dependency graph traversal
  - `boards()` — list all boards
  - `kanban_events` table — append-only event log (created, status_changed, assigned, commented, linked, updated); all mutations emit events; used for SSE broadcast and `tail` command
- **Expanded kanban CLI** (`src/main.ts`) — 3 verbs → 15 verbs: `list`, `create`, `show`, `assign`, `complete`, `fail`, `block`, `unblock`, `link`, `unlink`, `comment`, `stats`, `tail`, `board`, `dispatch`, `daemon`
- **`src/core/task_manager.ts`** — `TaskManager` singleton; JSON store at `.cowrangler/tasks.json`; stable 1-based `index` field so the model references tasks as `"1"`, `"2"` rather than UUIDs; `getTaskManager()` factory

### Changed
- **System prompt routing guidance** — agent now explicitly told when to use `manage_task` vs `manage_kanban`; session tasks for in-conversation steps, kanban tasks for persistent/delegated work
- **`DIRS.local.todo`** renamed to **`DIRS.local.tasks`** (`.cowrangler/AGENT_TODO.md` → `.cowrangler/tasks.json`); `ensureAgentTodo()` → `ensureTaskStore()`
- **`/todo` in-session command** — reads structured `tasks.json` instead of markdown checklist; displays `in_progress` task highlighted, completed tasks dimmed
- **`App.tsx` task polling** — reads `tasks.json` to surface active task title in status bar; shows `in_progress` task first, falls back to first `todo`
- `manage_todo` tool removed; replaced by `manage_task` + `manage_kanban`
- `copy-assets` build script now also copies `assets/kanban_ui_icon.png` → `dist/assets/`

### Fixed
- `EADDRINUSE` on `cowrangler kanban board` — use `--port <n>` to specify an alternate port if 4242 is occupied; or `lsof -ti:4242 | xargs kill -9` to release it

---

## [2.0.1] — 2026-05-19

### Added
- **Internationalization / i18n** (`src/i18n/`) — 6 languages: Turkish (`tr`), English (`en`), German (`de`), Spanish (`es`), French (`fr`), Italian (`it`); runtime language switching via `cowrangler --lang <code>`; automatic language detection on startup via `src/core/init.ts`
- **Interactive model picker** (`src/cli/model_picker_cli.ts`, `src/ui/ink/ModelPicker.tsx`) — `/model` (no args) opens arrow-key picker overlay inside TUI; `cowrangler model` standalone ANSI picker; filters by name/provider, shows installed API key status, hot-swaps model and persists to `config.yaml` without restart
- **MCP marketplace browser** (`src/cli/mcp_browse.ts`) — `cowrangler mcp browse`; curated 21 MCP servers across 7 categories; two-panel TUI (category tabs ←→, server list ↑↓, detail panel); `/` to search, Enter to launch install wizard
- **MCP setup wizard** (`src/cli/mcp_wizard.ts`) — `cowrangler mcp add`; guided stdio / HTTP / SSE transport selection; tests connection, writes to `config.yaml` and `credentials.env`
- **Gateway setup wizard** (`src/cli/gateway_wizard.ts`) — `cowrangler gateway setup`; Telegram (validates token via Telegram API, optional user whitelist) and Discord (token + optional guild ID) guided configuration
- **Skill slash injection** — unknown `/slash-commands` now auto-match against skill IDs; skill content is injected as a user message (not system prompt) to preserve prompt caching; supports extra args: `/git-workflow open a PR`
- **9 new bundled skills** added under categorized directories:
  - `creative/architecture-diagram` — system architecture diagram generation
  - `creative/creative-ideation` — structured brainstorming and idea generation
  - `creative/design-system` — design system component creation
  - `creative/excalidraw` — diagram drawing with Excalidraw
  - `data-science/data-analysis` — data analysis and visualization workflows
  - `data-science/jupyter-notebook` — Jupyter notebook management
  - `devops/ci-cd-pipeline` — CI/CD pipeline setup and management
  - `devops/docker-management` — Docker container and image management
  - `devops/webhook-subscriptions` — webhook integration and subscription management
- Apple skills reorganized into `apple/` subdirectory: `apple-notes`, `apple-reminders`, `findmy`, `imessage`, `macos-computer-use`

### Changed
- **StatusBar** is now always visible — idle: shows total session duration and last round time; busy: shows current request duration (unchanged)
- **LLM provider/model format** — `anthropic/claude-sonnet-4-6`, `openai/gpt-4o`, `google/gemini-2.5-pro` and similar `provider/model_name` strings now resolve correctly alongside existing short prefixes (`claude-*`, `gpt-*`, `gemini-*`); Hermes-compatible; fully backward compatible
- MCP marketplace UI translated from Turkish to English
- URL and documentation fields updated in `README.md` and `src/main.ts`

### Fixed
- **`computer_use` tool schema** (`src/tools/computer_use.ts`, `src/core/agent.ts`, `src/core/llm.ts`) — replaced `z.tuple()` with `z.array()` to fix tool call failures with OpenRouter and other providers
- **`send_message` tool** (`src/tools/brief_tool.ts`) — added `.default("normal")` to the `status` field; prevents Zod validation errors (`[object Object]` in logs) when weaker/free LLM models omit the required field

---

## [2.0.0] — 2026-05-17

### Added
- **computer_use tool** (`src/tools/computer_use.ts`) — macOS background desktop automation via [cua-driver](https://github.com/trycua/cua) over MCP (stdio); actions: `capture`, `click`, `double_click`, `right_click`, `middle_click`, `scroll`, `type`, `key`, `set_value`, `focus_app`, `list_apps`, `wait`; Set-of-Mark (SOM) capture mode labels every interactable element so the agent can click by index; multimodal tool results (screenshot + text as `ContentPart[]`); safety gates on destructive key combos and sensitive text patterns; macOS-only guard with clear error on other platforms
- **10 new bundled skills** — library grows from 13 to 23 total:
  - `macos-computer-use` — SOM workflow, capture modes, action reference, failure modes
  - `apple-notes` — `memo` CLI: create, search, edit, export Apple Notes
  - `apple-reminders` — `remindctl` CLI: today/week/overdue views, create reminders with due dates
  - `imessage` — `imsg` CLI: list chats, read history, send iMessages/SMS, watch for new messages
  - `findmy` — AirTag/device tracking via AppleScript + `screencapture` + optional `peekaboo`
  - `github-pr-workflow` — full PR lifecycle: branch → commit → push → open → monitor CI → auto-fix → merge (`gh` + `curl` fallback)
  - `github-code-review` — diff, inline comments, formal approve/request-changes/comment (`gh` + `curl` fallback)
  - `github-issues` — create, view, update, comment, and triage issues with severity/category matrix (`gh` + `curl` fallback)
  - `qa-testing` — 5-phase web QA: Plan → Explore → Collect Evidence → Categorize → Report; Critical/High/Medium/Low severity template
  - `skillify` — generate new skills from conversation patterns
- **Credential Pool** (`src/core/credential_pool.ts`) — multiple API keys per provider with least-used rotation; automatic failover on 429 rate-limit; `/key pool` management command
- **Batch Runner** (`src/batch/runner.ts`) — `cowrangler batch run --file tasks.jsonl`; parallel execution with `--concurrency N`; JSONL output; progress bar; exponential-backoff retry
- **Trajectory Recording** (`src/core/trajectory.ts`) — record/replay conversation sessions; JSON export; assertion testing (`contains`, `equals`, `matches`, `min`, `max`); `/trajectory start|stop|status`; `cowrangler replay <file>`
- **LSP Server** (`src/lsp/server.ts`) — JSON-RPC 2.0 Language Server Protocol over stdio; `textDocument/hover` (AI-powered); `textDocument/completion` (cowrangler keywords); `cowrangler lsp`; Neovim/Helix config examples
- **Skin/Theme Engine** (`src/core/skin.ts`) — YAML user skins at `~/.cowrangler/skins/<name>.yaml`; built-in skins: `default`, `mono`, `slate`, `matrix`; `/skin` command
- **Structured Logging** (`src/core/logger.ts`) — rotating log files (10 MB / 5 backups); 5 channels (`agent`, `errors`, `gateway`, `cron`, `kanban`); `/logs` command with color coding
- **Anthropic Prompt Caching** — `cache_control: ephemeral` on system message; cache token stats in status bar
- **Extended Thinking** — `COWRANGLER_THINKING=1` env var; `COWRANGLER_THINKING_BUDGET` token budget; model-capability guard
- **StatusBar improvements** — visible only during active requests; live elapsed timer resets per request; `◆` branding symbol
- **Test infrastructure** — Vitest, 42 unit tests across 4 suites; GitHub Actions CI (Node 20/22)
- `cowrangler update` — self-update via npm
- `cowrangler lsp` — start Language Server
- `cowrangler replay` — replay trajectory files
- `cowrangler batch` — run batch task files
- Dockerfile + `.dockerignore` for containerized usage

### Changed
- `StatusBar` now hides when agent is idle (was always visible)
- Credential keys rotate automatically on 429 without counting against MAX_RETRIES
- Agent `chat()` now records to `TrajectoryRecorder` when attached
- Dockerfile: removed redundant `COPY --from=builder /app/src/bundled_skills` step; `npm run build` already populates `dist/bundled_skills/` via the `copy-assets` script

### Fixed
- `Theme.error()` / `Theme.warn()` calls in `/logs` command replaced with valid `Theme.fail()` / `Theme.main()`

### Security
- `.gitignore` extended: `*.db`, `*.db-shm`, `*.db-wal` (SQLite session/kanban/cron files), `.cowrangler_history`, `audit.log`, `trajectories/`, `*.trajectory.json`, `coverage/`

---

## [1.1.2] — 2026-04-15

### Added
- Multi-profile system (`COWRANGLER_PROFILE`, `cowrangler profile` commands)
- Insights/Analytics engine (`/usage`, `/insights`)
- Messaging Gateway (Telegram + Discord platforms)
- Kanban multi-agent work queue
- MCP (Model Context Protocol) server support
- Cron scheduler (`cowrangler cron`)
- Skill usage tracking + Curator (automatic archiving)
- Plugin hook system (`pre_tool_call`, `post_tool_call`, `pre_llm_call`, `post_llm_call`)
- Token-based context compression + status bar

### Changed
- SQLite session store replaces JSONL file approach
- FTS5 full-text search across session history

---

## [1.0.0] — 2026-03-01

### Added
- Initial release
- Multi-provider LLM support (Anthropic, OpenAI, Gemini, OpenRouter, Groq, Vertex, GitHub Copilot)
- Tool registry with 40+ built-in tools
- Skill system (SKILL.md frontmatter)
- Interactive CLI (prompt_toolkit + Rich-inspired theming)
- File, git, web, code execution tools
- Permission system (`default`, `plan`, `auto`, `bypass` modes)
- Sandbox security (pattern-based command filtering)
- Project memory (`COWRNGLR.md` + `.cowrangler/memory.md`)
