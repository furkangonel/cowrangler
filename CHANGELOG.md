# Changelog

All notable changes to co-wrangler are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Version numbers follow [Semantic Versioning](https://semver.org/).

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
