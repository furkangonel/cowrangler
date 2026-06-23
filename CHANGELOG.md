# Changelog

All notable changes to co-wrangler are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Version numbers follow [Semantic Versioning](https://semver.org/).

---

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
