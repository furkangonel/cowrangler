<p align="center">
  <img src="https://em-content.zobj.net/source/apple/391/octopus_1f419.png" width="100" alt="Octopus" />
</p>

<h1 align="center">Cowrangler CLI</h1>

<p align="center">
  <strong>The terminal-native personal AI developer agent</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Interface-CLI-orange?style=flat" alt="Interface">
</p>

---

<p align="center">
  <img src="../../assets/CLI.png" alt="Cowrangler CLI Terminal Interface" width="800" />
</p>

**Cowrangler CLI** is a terminal-native AI agent designed to automate your development workflows right where you write code. It operates directly inside your project directories, maintaining context of your git branch, files, and project goals, with full access to a powerful set of local tools.

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

### Centralized Permissions

To prevent destructive command runs (e.g. `rm -rf /` or unauthorized network scripts), Cowrangler uses a central gatekeeper:
- If a tool requires permission (like running shell scripts or system file operations), a wizard prompt will appear in the CLI showing: `[↑/↓: Gezin | Enter: Seçimi onayla]`.
- You can navigate options like **Allow** or **Deny** directly using keyboard arrow keys.
- Approving a implementation plan automatically pre-approves modifications for the files listed in that plan.

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
