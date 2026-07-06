<p align="center">
  <img src="https://em-content.zobj.net/source/apple/391/octopus_1f419.png" width="120" alt="Octopus" />
</p>

<h1 align="center">Cowrangler</h1>

<p align="center">
  <strong>Tame the AI developer chaos with CLI, Desktop, and Design interfaces</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Electron-2C2E3B?style=flat&logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB" alt="React">
  <img src="https://img.shields.io/badge/Version-2.1.0-orange?style=flat" alt="Version">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/furkangonel/cowrangler?style=flat" alt="License"></a>
</p>

---

## What is Cowrangler?

**Cowrangler** is an enterprise-grade personal AI developer companion designed to handle code modification, system tasks, and interface design autonomously. Instead of simple chat overlays, Cowrangler works directly in your workspace—offering file manipulation, shell command running, macOS desktop automation, and custom design sandbox components.

---

## The Cowrangler Ecosystem

Cowrangler is modular and can be used in three distinct environments depending on your developer needs:

### 1. Terminal CLI (Core Agent)
The CLI runs directly in your terminal, providing rapid interaction, model configurations, and local automation without visual bloat. It comes with 25+ file-system, git, and shell execution tools.
* **Key Features:** Arrow-key model picker, background terminal execution, custom SOP skills, and command line task management.
* **[→ Go to CLI Documentation](./apps/cli/src/cli/README.md)**

### 2. Electron Desktop (Visual Workspace)
The Desktop app wraps the core agent engine inside a sleek visual interface, bringing structure to your multi-session developer tasks.
* **Key Features:** Visual project management, real-time checklist checklists, in-app credentials vaults, and visual MCP connector configurators.
* **[→ Go to Desktop Documentation](./apps/desktop/src/desktop/README.md)**

### 3. Visual Design (UI Sandbox Canvas)
Built directly into the Desktop client, the Design panel is an interactive workspace for prototyping and visually editing user interfaces side-by-side with the agent.
* **Key Features:** Live React/HTML rendering canvas, mobile/tablet/desktop mockup wrappers, design template collection, and direct file exporting.
* **[→ Go to Design Documentation](./apps/desktop/src/desktop/components/design/README.md)**

### 🔌 Build Your Own Plugin
Extend Cowrangler with custom tools, models, providers, skills, and UI actions — all loaded into the same agent engine across CLI, Desktop, and Design.
* **[→ Go to Plugin Development Guide](./PLUGINS.md)**

---

## Project Architecture

Cowrangler maintains synchronization between all three interfaces by utilizing a shared global and local scoping strategy:

<table>
<tr>
<td width="50%">

### Global Scope
`~/.cowrangler`

* **Credential Vault:** `credentials.env` stores provider API keys once per machine.
* **Global Configuration:** `config.yaml` manages preferred default models, themes, and parameters.
* **Universal Skills:** `skills/` houses SOPs accessible across all directories.
* **Sessions Database:** `sessions.db` is a centralized SQLite database tracking conversations globally.

</td>
<td width="50%">

### Local Scope
`./.cowrangler`

* **Project Memory:** `memory.md` contains repository guidelines and guidelines injected automatically into prompts.
* **Task State:** `tasks.json` isolates the active session's task checklist.
* **Local Skills:** `skills/` defines procedures used specifically in this codebase.
* **Local Overrides:** `config.yaml` overrides global preferences for this repository.

</td>
</tr>
</table>

---

## License & Contributing

Cowrangler is open-source under the [MIT License](./LICENSE). Contributions to the CLI tool, Desktop experience, or Design components are always welcome. Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for details on getting started.
