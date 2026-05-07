<p align="center">
  <img src="https://em-content.zobj.net/source/apple/391/octopus_1f419.png" width="120" alt="Octopus" />
</p>

<h1 align="center">Co-Wrangler</h1>

<p align="center">
  <strong>Tame the AI chaos right from your terminal</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Version-1.2.0-orange?style=flat" alt="Version">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/furkangonel/co-wrangler?style=flat" alt="License"></a>
</p>

<p align="center">
  <a href="#what-is-this">What is This?</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#features">Features</a> •
  <a href="#tools">Tools</a> •
  <a href="#subagents">Subagents</a> •
  <a href="#skills--sops">Skills & Agents</a> •
  <a href="#commands">Commands</a>
</p>

---

## What is This?

Co-Wrangler is not just another chat wrapper. It's a terminal-native AI agent built for software engineers who want real work done.

**What can it do?**
- 📁 Read, edit, and create files across your entire codebase
- 🔧 Manage Git operations (commit, branch, diff, stash)
- 🌐 Fetch data from the web, make API requests
- 🤖 Delegate complex tasks to specialized subagents
- 🧠 Maintain project memory and context across sessions
- 📋 Enforce your team's Standard Operating Procedures (SOPs) via Skills
- 🎯 Plan and execute multi-step tasks autonomously

**Why should you use it?**
- Truly understands your codebase (not just text, but structure)
- Plans and executes multi-step tasks on its own
- Works with multiple AI providers (Claude, GPT, Gemini, and more)
- Encodes your team's workflow into reusable Skills
- Runs entirely in your terminal, in your project directory

<br>

<p align="center">
  <img src="./assets/cowrangler.png" alt="Co-Wrangler CLI" width="800" />
</p>

<br>

## Architecture

Two directories. Total control over your AI environment.

<table>
<tr>
<td width="50%">

### 🌍 Global Scope
`~/.cowrangler`

- **Credential vault:** `credentials.env` stores API keys once per machine, shared across all projects
- **Default config:** `config.yaml` sets your preferred model and temperature globally
- **Universal skills:** `skills/` for SOPs that apply to every project
- **Custom agents:** `agents/` for reusable agent configurations

</td>
<td width="50%">

### 📦 Local Scope
`./.cowrangler`

- **Project memory:** `memory.md` is injected into the system prompt on every boot — architecture decisions, conventions, context
- **Task state:** `AGENT_TODO.md` persists open tasks across sessions
- **Local overrides:** `config.yaml` and `skills/` override global settings for this repo only
- **Custom agents:** `agents/` for project-specific agent configurations

</td>
</tr>
</table>

**Priority Order:** Local settings > Global settings > Bundled defaults

## Quick Start

### One-Line Install (Recommended)

**Linux/macOS:**
```bash
curl -fsSL https://cowrangler.com/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://cowrangler.com/install.ps1 | iex
```

### First Time? Here's What You Need to Do

If you just downloaded the project and want to get started, follow these steps:

```bash
# 1. Clone and install globally
git clone https://github.com/furkangonel/co-wrangler.git
cd co-wrangler
npm run setup

# 2. Run the setup wizard (IMPORTANT: Do this before first use!)
cowrangler setup

# This interactive wizard will:
# - Guide you through provider selection
# - Help you set up API keys
# - Configure your default model
# - Save everything to ~/.cowrangler/

# 3. Navigate to any project and start
cd ~/your-project
cowrangler
```

**⚠️ Note:** New users MUST run `cowrangler setup` before the first use. This sets up your API credentials and model configuration.

**Supported Providers:**
- Anthropic (`claude-*`) → `ANTHROPIC_API_KEY`
- OpenAI (`gpt-*`, `o1-*`, `o3-*`) → `OPENAI_API_KEY`
- Google (`gemini-*`) → `GOOGLE_GENERATIVE_AI_API_KEY`
- Vertex AI (`vertex/*`) → GCP Project + `gcloud auth`
- GitHub Copilot (`copilot/*`) → `GITHUB_TOKEN`
- Groq (`groq/*`) → `GROQ_API_KEY`
- OpenRouter (`openrouter/*`) → `OPENROUTER_API_KEY`

## Features

### 🛠️ Tools (25+ Built-in)

Co-Wrangler ships with 25+ built-in tools organized into five categories.

| Category | Tools |
|---|---|
| **File System** | `read_file`, `write_file`, `edit_file`, `list_files`, `glob_files`, `search_in_files`, `copy_file`, `move_item`, `delete_file`, `file_info`, `append_to_file` |
| **Git** | `git_status`, `git_diff`, `git_log`, `git_add`, `git_commit`, `git_branch`, `git_stash`, `git_checkout_file` |
| **Web** | `fetch_webpage`, `web_search`, `http_request` |
| **System** | `execute_bash`, `get_system_info`, `which_command`, `sleep`, `notify`, `manage_todo` |
| **Agent** | `spawn_subagent`, `spawn_subagent_parallel`, `utilize_skill`, `create_skill`, `list_skills` |

### 🤖 Subagents

Long-running or specialized tasks can be delegated to focused subagents. Each has a distinct system prompt and restricted tool set.

| Subagent | Expertise |
|---|---|
| `explore` | Read-only codebase investigation (fast, safe, no writes) |
| `plan` | Architecture design & step-by-step implementation planning |
| `code-reviewer` | Correctness, security, performance, maintainability review |
| `verify` | Run tests, lint, type-check after code changes |
| `refactor` | Safe structural improvements without behavior change |
| `test-writer` | Write comprehensive unit/integration/e2e tests |
| `documentation` | JSDoc, TSDoc, README, API docs |
| `security-audit` | OWASP vulnerability scanning (injection, auth, secrets, deps) |
| `debugger` | Root cause analysis — finds the bug, proposes minimal fix |
| `performance` | Bottleneck profiling, N+1 queries, memory leaks, bundle size |
| `migration-planner` | Safe incremental migrations with rollback plans |

**Parallel Execution:** Use `spawn_subagent_parallel` to run multiple agents simultaneously — total time equals the slowest agent, not the sum.

### 📋 Skills & Custom Agents

#### Skills (SOPs)

Skills are Markdown files that encode Standard Operating Procedures. When loaded, the agent follows the SOP step by step.

**Bundled Skills (13):**
- `api-design` - RESTful API design principles
- `code-review` - Systematic code review
- `copy-editor` - Polish text — grammar, flow, clarity
- `debugging` - Systematic bug investigation
- `documentation` - Code documentation standards
- `executive-summarizer` - C-level executive summaries
- `git-workflow` - Professional Git branching & PR workflow
- `localization` - Localize text to feel native in target culture
- `professional-communicator` - Transform thoughts into professional emails
- `prompt-engineer` - Turn vague instructions into precision prompts
- `refactoring` - Safe, incremental refactoring techniques
- `simplify` - Audit code for reuse, quality, efficiency
- `testing` - Test writing with TDD approach

**Create Custom Skills:**

Add to `.cowrangler/skills/` or `~/.cowrangler/skills/`:

```markdown
---
name: deploy-process
description: Standard steps for deploying to production
---

1. Run the full test suite and confirm zero failures
2. Bump the version in package.json following semver
3. Build the Docker image and push to the registry
4. Apply the Kubernetes manifest and verify rollout status
5. Post a deployment notice to the #deployments channel
```

Usage:
```bash
❯ /skill deploy-process Deploy the auth service to production
```

#### Custom Agents (NEW!)

Just like Skills, you can now create custom agent configurations in `.cowrangler/agents/` or `~/.cowrangler/agents/`. Custom agents allow you to define specialized agent behaviors with specific system prompts and tool restrictions.

**Creating a Custom Agent:**

Create a folder in `.cowrangler/agents/` with an `AGENT.md` file:

```markdown
---
name: frontend-reviewer
description: Specialized agent for reviewing frontend code
model: claude-3-5-sonnet-20241022
temperature: 0.3
---

You are a specialized frontend code reviewer focusing on:
- React/TypeScript best practices
- Accessibility (a11y) compliance
- Performance optimization
- Component architecture

Always check for:
1. Proper TypeScript typing
2. Accessibility attributes
3. Memoization opportunities
4. Bundle size impact
```

The agent will automatically discover and list custom agents alongside bundled ones.

### 🎨 REPL Features

**Smart Autocomplete:**
- Type `/` to open command menu with descriptions (navigate with arrow keys, Tab to apply, Escape to dismiss)
- Type `@` followed by a path to browse files (supports subdirectory traversal)

**Session Management:**
- Up/Down arrows navigate command history
- History persisted across sessions in `.cowrangler_history`

**Keyboard Shortcuts:**
- `Ctrl+A/E` - Line start/end
- `Ctrl+U/K` - Delete to start/end
- `Ctrl+W` - Delete word
- `Ctrl+L` - Clear screen
- `Ctrl+O` - Cycle view modes

**View Modes (Ctrl+O to cycle):**
- **Brief:** Only agent messages shown (tools hidden)
- **Default:** Tools shown with ⎿ prefix (default)
- **Transcript:** Raw tool calls + full details

### 🔒 Sandbox Protection

Co-Wrangler keeps you safe with default sandbox mode:
- **Always blocked:** Critical patterns (`rm -rf /`, `dd if=`, `mkfs`, fork bombs)
- **Logged & confirmed:** Dangerous patterns (`sudo`, recursive rm, force push)
- **Output capped:** 512KB max to prevent runaway commands
- **Path validated:** Working directory always within allowed paths

Disable with `cowrangler --no-sandbox` (not recommended).

## Commands

### CLI Flags

```bash
cowrangler                    # Start interactive REPL
cowrangler setup              # Interactive provider setup wizard (run this first!)
cowrangler --brief            # Start in brief view (clean, tool-free output)
cowrangler --verbose          # Start in transcript view (full debug output)
cowrangler --no-sandbox       # Disable sandbox protection (not recommended)
cowrangler --permission <mode> # Set permission mode (default/plan/auto/bypass)
cowrangler --version          # Print version
cowrangler --help             # Show help
```

### In-Session Commands

| Command | Description |
|---|---|
| `/help` | List all commands with descriptions |
| `/status` | Show active model, context size, memory state, loaded tools and skills |
| `/model list` | List registered models |
| `/model set <name> [global\|local]` | Hot-swap the active model without restarting |
| `/model add <name>` | Register a new model name |
| `/key set <PROVIDER> <KEY>` | Save API key to global vault (live and persisted) |
| `/key list` | Display saved keys, masked for safe screen sharing |
| `/key delete <PROVIDER>` | Remove a key from the vault |
| `/skills` | List all loaded skills by source (bundled, global, local) |
| `/skill <id> [task]` | Stage a skill or execute a task with SOP enforced |
| `/agents` | List all available agents (bundled + custom) |
| `/tools` | List all registered tools with descriptions |
| `/memory show` | Print current project memory file |
| `/memory clear` | Reset project memory and refresh system prompt |
| `/context` | Show number of messages in context window |
| `/reset` | Clear conversation history and reload memory from disk |
| `/sandbox` | Show/configure sandbox settings |
| `/permissions` | Show/set permission mode |
| `/mode` | Switch view mode (brief/default/transcript) |
| `/version` | Print current version |
| `/exit` | Terminate session |

## Usage Examples

**1. Code Review:**
```
❯ /skill code-review Review src/auth.ts for security issues
```

**2. Write Tests:**
```
❯ /skill testing Write unit tests for src/utils/validator.ts
```

**3. Smart Refactoring:**
```
❯ Refactor src/helpers.ts to improve readability while keeping the same behavior
```

**4. Generate Documentation:**
```
❯ /skill documentation Create API docs for all endpoints in src/routes/
```

**5. Use Subagents:**
```
❯ Use the explore agent to analyze this codebase and give me an architecture overview
```

**6. Custom Agent:**
```
❯ /agents  # List available agents
❯ Use frontend-reviewer to check my React components
```

## Development

### Technical Stack

- **Language:** TypeScript (strict mode)
- **Runtime:** Node.js (ESM modules)
- **UI:** React + Ink (terminal UI)
- **AI SDK:** Vercel AI SDK (`@ai-sdk/*`)
- **Build:** `tsc` for TypeScript → JavaScript compilation
- **Package:** npm with ESM support

### Project Structure

```
co-wrangler/
├── src/
│   ├── core/              # Agent core, LLM, sandbox, permissions
│   ├── tools/             # 25+ tool implementations
│   ├── ui/                # CLI, commands, theme, setup wizard
│   │   └── ink/           # React Ink components
│   ├── utils/             # Helper functions
│   ├── bundled_skills/    # 13 bundled SOPs
│   └── types.d.ts         # TypeScript declarations
├── dist/                  # Compiled JavaScript (npm run build)
│   ├── core/
│   ├── tools/
│   ├── ui/
│   └── bundled_skills/
├── .cowrangler/           # Project-local settings
│   ├── agents/            # Custom agent configurations (NEW!)
│   ├── skills/            # Custom skills
│   ├── memory.md          # Project memory
│   ├── AGENT_TODO.md      # Task list
│   └── config.yaml        # Local config
├── assets/                # Images, resources
├── package.json
├── tsconfig.json
└── README.md
```

### Build & Development

```bash
# Install dependencies
npm install

# Build from source
npm run build

# Development mode (with hot reload)
npm run dev

# Setup for global usage
npm run setup

# Clean build artifacts
npm run clean
```

### Contributing

We welcome contributions! Here's how:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'feat: describe your change'`
4. Push the branch: `git push origin feature/your-feature`
5. Open a pull request

**What we're looking for:**
- 🐛 Bug reports and fixes
- ✨ New features and improvements
- 📋 New Skills and SOPs
- 🤖 Custom agent templates
- 📖 Documentation improvements
- 🧪 Test coverage (currently missing — help wanted!)

## Configuration

### Global Config (`~/.cowrangler/config.yaml`)

```yaml
model: claude-3-5-sonnet-20241022
temperature: 0.7
max_iterations: 25
view_mode: default
permission_mode: default
sandbox:
  enabled: true
  max_timeout_ms: 30000
  network_restricted: false
```

### Local Config (`.cowrangler/config.yaml`)

Same structure as global, but overrides for specific project.

### Credentials (`~/.cowrangler/credentials.env`)

```env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_GENERATIVE_AI_API_KEY=...
```

## Troubleshooting

**Q: I get "MISSING_KEY" error**
A: Run `cowrangler setup` to configure your API keys, or use `/key set <PROVIDER> <KEY>` in-session.

**Q: Model not recognized**
A: Check supported prefixes: `claude-*`, `gpt-*`, `gemini-*`, `vertex/*`, `groq/*`, `openrouter/*`, `copilot/*`

**Q: Sandbox blocking my commands**
A: Use `cowrangler --no-sandbox` to disable (not recommended for production), or adjust permission mode with `--permission bypass`.

**Q: How do I create custom agents?**
A: Create a folder in `.cowrangler/agents/` with an `AGENT.md` file following the format shown in the Custom Agents section.

## License

MIT — free to use, modify, and distribute.

---

<p align="center">
  <strong>🚀 Your terminal's best companion for AI-powered development!</strong>
</p>

<p align="center">
  <a href="https://github.com/furkangonel/co-wrangler">GitHub</a> •
  <a href="https://github.com/furkangonel/co-wrangler/issues">Issues</a> •
  <a href="https://github.com/furkangonel/co-wrangler/discussions">Discussions</a> •
  <a href="https://github.com/furkangonel/co-wrangler/blob/main/LICENSE">License</a>
</p>

<p align="center">
  <sub>Built with ❤️ for developers who want to tame the AI chaos</sub>
</p>
