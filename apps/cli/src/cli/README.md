<p align="center">
  <img src="../../../../assets/octopuses/oct.png" width="200" alt="Octopus" />
</p>

<h1 align="center">Co-Wrangler CLI</h1>

<p align="center">
  <strong>The same agent as the desktop app, without the window.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Interface-CLI-EC5A29?style=flat" alt="Interface">
</p>

---

<p align="center">
  <img src="../../assets/CLI.png" alt="Cowrangler CLI Terminal Interface" width="800" />
</p>

**Co-Wrangler CLI** runs the same agent engine as the desktop app, in your
terminal. It works inside your project directory with the same tools, the same
skills and the same permission policy — and shares `~/.cowrangler` with Desktop,
so credentials, sessions and settings carry across both.

---

## Quick Start

### Installation

Install Cowrangler globally on your machine:

**Linux/macOS:**
```bash
curl -fsSL https://cowrangler.com/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://cowrangler.com/install.ps1 | iex
```

### Initial Setup

Before using the CLI for the first time, you must run the interactive setup wizard to configure your AI providers, API keys, and default models:

```bash
cowrangler setup
```

This wizard will write your credentials to `~/.cowrangler/credentials.env` and configuration preferences to `~/.cowrangler/config.yaml`.

**Supported Providers:**
- **Anthropic** (`claude-*`) → Requires `ANTHROPIC_API_KEY`
- **OpenAI** (`gpt-*`, `o1-*`, `o3-*`) → Requires `OPENAI_API_KEY`
- **Google** (`gemini-*`) → Requires `GOOGLE_GENERATIVE_AI_API_KEY`
- **Vertex AI** (`vertex/*`) → Requires GCP Project + `gcloud auth`
- **GitHub Copilot** (`copilot/*`) → Requires `GITHUB_TOKEN`
- **Groq** (`groq/*`) → Requires `GROQ_API_KEY`
- **OpenRouter** (`openrouter/*`) → Requires `OPENROUTER_API_KEY`

---

## Command Reference

Launch and manage your agent directly from the command line:

```bash
# Start an interactive chat session in the current directory
cowrangler

# Run the setup wizard to manage API keys & preferences
cowrangler setup

# Open the interactive model picker to change the global default model
cowrangler model

# Check current configuration details
cowrangler config
```

### MCP Connector Commands

Connect any Model Context Protocol (MCP) server:

```bash
# Open the marketplace of curated MCP servers
cowrangler mcp browse

# Run a step-by-step wizard to install a new server (stdio, HTTP, SSE)
cowrangler mcp add
```

---

## Interactive Chat Features

When inside a running `cowrangler` terminal chat session, you have access to a rich command line interface:

### Slash Commands

Control the conversation and swap configuration on the fly:

* `/model` — Opens the overlay model picker (navigate with `↑/↓` and press `Enter`).
* `/model set <model_name>` — Instantly hotswap the active model for this session.
* `/skill <skill-id> [instructions]` — Force the agent to follow a specific Standard Operating Procedure (SOP).
* `/exit` or `Ctrl+C` — Safely exit the chat session.

### Permissions

Co-Wrangler uses the permission model Anthropic ships with Claude Code — the
same modes, the same `Tool(specifier)` rules, the same settings precedence.

`/permissions` with no argument shows the active mode, every mode available, how
many rules are in force, and any rule that could not be parsed.
`/permissions <mode>` switches:

| Mode | When no rule matches |
| --- | --- |
| `default` | Ask on first use of each tool; reads in the workspace run freely |
| `acceptEdits` | Workspace edits apply; anything outside prompts |
| `plan` | Explore and propose; no writes until you approve |
| `auto` | Reversible work runs sandboxed and checkpointed; irreversible or external actions stop |
| `dontAsk` | Nothing prompts — uncovered calls are refused |
| `bypassPermissions` | No checks beyond deny rules. Containers and VMs only |

`/plan` and `/act` are shortcuts for `plan` and `default`.

Rules live in `.cowrangler/settings.json` (shared with the project),
`.cowrangler/settings.local.json` (yours) or `~/.cowrangler/settings.json`:

```json
{
  "permissions": {
    "allow": ["Bash(npm run *)"],
    "ask":   ["Bash(git push *)"],
    "deny":  ["Read(.env)"]
  }
}
```

When a call needs your answer, the prompt names the command, the reason, and the
rule that would be saved if you choose **Always allow**. Navigate with `↑/↓` and
confirm with `Enter`. A prompt left unanswered for ten minutes resolves as
**Deny**, so an unattended run stops rather than hanging.

A command the sandbox can fully contain — confined to the workspace and the
allowed domains, enforced by the OS — runs without a prompt in any mode. Writes
to files that could widen the agent's own permissions always prompt, and a short
list of commands (`rm -rf /`, `mkfs`, fork bombs) is refused in every mode.

**[→ Full permission reference](../../../../docs/permissions.md)**

---

## Tools & Capabilities

The agent is equipped with over 25 built-in tools to act on your workspace:

| Category | Available Tools |
|---|---|
| **File System** | `read_file`, `write_file`, `edit_file`, `list_files`, `glob_files`, `search_in_files`, `copy_file`, `move_item`, `delete_file`, `file_info`, `append_to_file` |
| **Git** | `git_status`, `git_diff`, `git_log`, `git_add`, `git_commit`, `git_branch`, `git_stash`, `git_checkout_file` |
| **Web** | `fetch_webpage`, `web_search`, `http_request` |
| **System** | `execute_bash`, `get_system_info`, `which_command`, `sleep`, `notify`, `manage_task` |
| **Agent** | `spawn_subagent`, `spawn_subagent_parallel`, `utilize_skill`, `create_skill`, `list_skills` |
| **Desktop** | `computer_use` — macOS background automation (clicks, keyboard strokes, capture) |

---

## Customization

### Project Memory

Every directory can contain a local memory file: `./.cowrangler/memory.md`. 
Use this file to store architectural guidelines, style conventions, or project notes. The agent automatically reads and injects this memory on boot to align its decisions with your codebase rules.

### Standard Operating Procedures (Skills)

Encode your team's workflow procedures into Markdown files with YAML frontmatter. Place them under `~/.cowrangler/skills/` (global) or `./.cowrangler/skills/` (project-specific):

```markdown
---
name: pr-preparation
description: Steps before submitting a Pull Request
---

1. Run the local linter and formatter: `npm run lint`
2. Run the test suite: `npm test`
3. Generate a git diff summary to review your changes
4. Open a pull request naming the branch appropriately
```

Execute this skill inside the chat session:
```text
> /pr-preparation Prepare my current changes for review
```

---

## Manual Installation from Source

If you prefer building and installing Cowrangler manually:

```bash
# 1. Clone repository
git clone https://github.com/furkangonel/cowrangler.git
cd cowrangler

# 2. Run automated setup (installs dependencies, builds TypeScript, links globally)
npm run setup

# 3. Initialize your environment
cowrangler setup
```
