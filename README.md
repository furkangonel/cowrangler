# 🐙 Co-Wrangler

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)

**Co-Wrangler** is a highly autonomous, terminal-native AI engineering agent. Designed to wrangle complex codebases, manage local files, and execute Standard Operating Procedures (SOPs), it acts as your dedicated local co-pilot.

Unlike standard web-based chat interfaces, Co-Wrangler lives directly in your terminal. It understands the context of your current working directory, dynamically loads project-specific architectural rules, and securely manages your API keys in a centralized vault.

---

<br>

<p align="center">
  <img src="./assets/cowrangler.png" alt="Co-Wrangler CLI" width="800" />
</p>

<br>

---

## ✨ Key Features

- **🧠 Dual-Brain Architecture:** 
  - **Global Scope (`~/.cowrangler`):** Centralized API key vault, global default AI engine, and system-wide SOPs.
  - **Local Scope (`./.cowrangler`):** Project-specific memory (`memory.md`), active state tracking (`AGENT_TODO.md`), and localized overrides.
- **🔐 Secure Vault:** Your API keys are stored globally and securely. No more copying `.env` files across multiple projects or risking accidental commits.
- **🔄 Dynamic Model Registry:** Easily register and switch between AI engines (Gemini, Claude, GPT via OpenRouter) directly from the CLI without touching the code.
- **🛠️ Enforceable SOPs (Skills):** Write markdown-based skills (e.g., `clean_code.md`) and force the agent to strictly follow your team's architectural standards on every prompt.
- **💻 Beautiful CLI Dashboard:** Rendered markdown, syntax highlighting, and a clean interface built with `chalk` and `boxen` for a premium developer experience.

---

## 🚀 1-Click Installation & Quick Start

Get Co-Wrangler up and running on your machine in seconds.

### 1. Install Globally
Clone the repository and run the automated setup script:
```bash
git clone [https://github.com/yourusername/co-wrangler.git](https://github.com/yourusername/co-wrangler.git)
cd co-wrangler
npm run setup
```
*(This command installs dependencies, compiles the TypeScript code, and globally links the `cowrangler` executable to your system).*

### 2. Set Your API Key
Set your OpenRouter (or preferred provider) API key in your global vault. You only need to do this once for your entire machine!
```bash
cowrangler

# Inside the Co-Wrangler CLI, type:
❯ /key set OPENROUTER_API_KEY sk-or-v1-your-key-here
```

### 3. Start Hacking
Navigate to any project directory on your computer and wake up your agent:
```bash
cd ~/my-awesome-project
cowrangler
```

---

## 🕹️ System Directives (Commands)

Co-Wrangler provides a powerful set of slash-commands to manage your AI environment on the fly.

| Command | Description |
| :--- | :--- |
| `/help` | Displays the user manual and available commands. |
| `/model add <name>` | Registers a new AI engine (e.g., `openrouter/anthropic/claude-3-5-sonnet`). |
| `/model set <name> [global/local]` | Switches the active model. Use `local` to override the global setting only for the current project. |
| `/model list` | Lists all registered AI models in your environment. |
| `/key set <PROVIDER> <KEY>` | Securely saves an API key to your global vault. |
| `/key list` | Displays your saved API keys (safely masked for screen-sharing). |
| `/tools` | Lists all available system tools (file reading, writing, web search, etc.). |
| `/skills` | Lists all loaded Standard Operating Procedures (SOPs). |
| `/skill <id> <task>` | Forces the agent to utilize a specific skill before executing the given task. |
| `/reset` | Flushes the current conversation history while preserving the core project memory. |
| `/exit` | Safely terminates the session and exits the CLI. |

---

## 📁 Architecture & File System

Co-Wrangler automatically generates two hidden directories to contextually manage your AI:

### Global Scope (`~/.cowrangler/`)
Applies to all projects on your machine.
- `credentials.env` → Your centralized, secure API key vault.
- `config.yaml` → Global default model and registered model list.
- `skills/` → SOPs available globally (e.g., universal Clean Code guidelines).

### Local Scope (`./.cowrangler/`)
Created automatically in the directory where you run `cowrangler`.
- `memory.md` → **Crucial:** Document your project's tech stack, architectural rules, and history here. The agent reads this context on every boot.
- `AGENT_TODO.md` → The agent uses this file to track its current state and pending tasks across sessions.
- `config.yaml` → Local overrides for the AI model (if a specific project requires a different engine).
- `skills/` → Project-specific SOPs (e.g., `react_native_architecture`).

---

## 📚 Writing Custom Skills (SOPs)

You can extend Co-Wrangler's capabilities by adding Markdown files to the `skills/` directory (either global or local). Create a folder (e.g., `clean_code`) and inside it, a `SKILL.md` file with YAML frontmatter:
```markdown
---
name: Clean Code Standards
description: General rules for writing clean, modular, and maintainable code.
---

1. Functions must adhere to the Single Responsibility Principle.
2. Avoid magic numbers; use clear, descriptive constants instead.
3. Always comment complex business logic and edge cases.
4. Variable names must be descriptive and written in English.
```

Force the agent to use it during a task:
```bash
❯ /skill clean_code Refactor the user authentication controller.
```

---

## 🤝 Contributing

Contributions are highly welcome! Whether you want to add new core tools, fix bugs, or improve the UI, please feel free to open an issue or submit a Pull Request.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
