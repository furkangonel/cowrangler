<p align="center">
  <img src="https://em-content.zobj.net/source/apple/391/octopus_1f419.png" width="120" alt="Octopus" />
</p>

<h1 align="center">co-wrangler</h1>

<p align="center">
  <strong>tame the AI chaos right from your terminal</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white" alt="Node.js">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/furkangonel/co-wrangler?style=flat" alt="License"></a>
</p>

<p align="center">
  <a href="#dual-brain-architecture">Architecture</a> •
  <a href="#install">Install</a> •
  <a href="#commands">Commands</a> •
  <a href="#skills--sops">Skills</a>
</p>

---

Co-Wrangler is a terminal-native AI agent built for software engineers. It runs inside your project directory, understands your codebase context, and executes multi-step tasks autonomously — file edits, git operations, web requests, subagent delegation, and more — all from a single interactive session.

It is not a chat wrapper. It is an agentic loop with tools, memory, and a skill system designed to encode and enforce your team's standard operating procedures.

<br>

<p align="center">
  <img src="./assets/cowrangler.png" alt="Co-Wrangler CLI" width="800" />
</p>

<br>

## Dual-Brain Architecture

Two directories. Total control over your AI environment.

<table>
<tr>
<td width="50%">

### Global Scope
`~/.cowrangler`

- **Credential vault:** `credentials.env` stores API keys once per machine, shared across all projects.
- **Default config:** `config.yaml` sets your preferred model and temperature globally.
- **Universal skills:** `skills/` for SOPs that apply to every project.

</td>
<td width="50%">

### Local Scope
`./.cowrangler`

- **Project memory:** `memory.md` is injected into the system prompt on every boot — use it for architecture decisions, conventions, and context that should always be in scope.
- **Task state:** `AGENT_TODO.md` persists open tasks across sessions.
- **Local overrides:** `config.yaml` and `skills/` override global settings for this repo only.

</td>
</tr>
</table>

Priority for skills and config is always: local overrides global, global overrides bundled defaults.

## Install

```bash
# Clone and install globally
git clone https://github.com/furkangonel/co-wrangler.git
cd co-wrangler
npm run setup

# Set your API key once
cowrangler
❯ /key set ANTHROPIC_API_KEY sk-ant-your-key-here

# Navigate to any project and start
cd ~/your-project
cowrangler
```

Supported providers: Anthropic (`claude-*`), OpenAI (`gpt-*`), Google (`gemini-*`), OpenRouter (`openrouter/*`), Groq (`groq/*`).

## Tools

Co-Wrangler ships with 25+ built-in tools organized into five categories.

| Category | Tools |
|---|---|
| File system | `read_file`, `write_file`, `edit_file`, `list_files`, `glob_files`, `grep_files`, `copy_file`, `delete_file`, `file_info`, `append_to_file` |
| Git | `git_status`, `git_diff`, `git_log`, `git_add`, `git_commit`, `git_branch`, `git_stash`, `git_checkout_file` |
| Web | `fetch_webpage`, `web_search`, `http_request` |
| System | `execute_bash`, `get_system_info`, `which_command`, `sleep`, `manage_todo` |
| Agent | `spawn_subagent`, `utilize_skill`, `create_skill`, `list_skills` |

## Subagents

Long-running or specialized tasks can be delegated to a focused subagent via `spawn_subagent`. Each subagent type has a distinct system prompt and a restricted tool set appropriate to its role.

Available types: `explorer`, `planner`, `verifier`, `code-reviewer`, `refactor`, `test-writer`, `documentation`, `security-audit`, `debugger`.

## Commands

| Command | Description |
|---|---|
| `/help` | List all commands with descriptions. |
| `/status` | Show active model, context size, memory state, loaded tools and skills. |
| `/model list` | List registered models. |
| `/model set <name> [global\|local]` | Hot-swap the active model without restarting the session. |
| `/model add <name>` | Register a new model name to the registry. |
| `/key set <PROVIDER> <KEY>` | Save an API key to the global vault (live and persisted). |
| `/key list` | Display saved keys, masked for safe screen sharing. |
| `/key delete <PROVIDER>` | Remove a key from the vault. |
| `/skills` | List all loaded skills by source (bundled, global, local). |
| `/skill <id> [task]` | Stage a skill or execute a task with a specific SOP enforced. |
| `/tools` | List all registered tools with descriptions. |
| `/memory show` | Print the current project memory file. |
| `/memory clear` | Reset project memory and refresh the system prompt. |
| `/context` | Show the number of messages in the current context window. |
| `/reset` | Clear conversation history and reload memory from disk. |
| `/version` | Print the current version. |
| `/exit` | Terminate the session. |

## Skills / SOPs

Skills are Markdown files that encode a Standard Operating Procedure. When the agent loads a skill before starting a task, it is instructed to follow the SOP step by step.

Co-Wrangler ships with seven bundled skills: `code-review`, `git-workflow`, `debugging`, `testing`, `refactoring`, `api-design`, and `documentation`.

To create a custom skill, create a folder in `.cowrangler/skills/` or `~/.cowrangler/skills/` and add a `SKILL.md` file:

```markdown
---
name: my-deploy-process
description: Standard steps for deploying the backend to production.
---

1. Run the full test suite and confirm zero failures.
2. Bump the version in package.json following semver.
3. Build the Docker image and push to the registry.
4. Apply the Kubernetes manifest and verify rollout status.
5. Post a deployment notice to the #deployments channel.
```

Invoke it directly, or let the agent discover it automatically based on the task:

```bash
❯ /skill my-deploy-process Deploy the auth service to production.
```

Skills can also be created from inside the session:

```bash
❯ /skill — then describe what you want to formalize
```

Or via the `create_skill` tool during an agent task.

## REPL Features

- **Autocomplete:** Type `/` to open a command menu with descriptions. Navigate with arrow keys, apply with Tab, dismiss with Escape.
- **File completions:** Type `@` followed by a path to browse files in the current directory. Subdirectory traversal is supported.
- **History:** Up/Down arrows navigate session history. History is persisted across sessions in `.wrangler_history`.
- **Shortcuts:** `Ctrl+A/E` (line start/end), `Ctrl+U/K` (delete to start/end), `Ctrl+W` (delete word), `Ctrl+L` (clear screen).
- **Step-by-step progress:** Each tool call the agent makes is displayed as a committed line with the tool name, relevant argument, and elapsed time — similar to how Claude Code renders its execution trace.

## Contributing

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'feat: describe your change'`
4. Push the branch: `git push origin feature/your-feature`
5. Open a pull request.

Bug reports and skill contributions are equally welcome.

## License

MIT — free to use, modify, and distribute.
