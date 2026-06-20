<p align="center">
  <img src="https://em-content.zobj.net/source/apple/391/octopus_1f419.png" width="120" alt="Octopus" />
</p>

<h1 align="center">Cowrangler Desktop</h1>

<p align="center">
  <strong>A Claude-Cowork-style visual workspace for your AI agent</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-2C2E3B?style=flat&logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB" alt="React">
  <img src="https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/Version-2.0.3-E05C2A?style=flat" alt="Version">
</p>

<p align="center">
  <a href="#what-is-it">What is it?</a> •
  <a href="#download">Download</a> •
  <a href="#run-from-source">Run from source</a> •
  <a href="#features">Features</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#packaging">Packaging</a> •
  <a href="#troubleshooting">Troubleshooting</a>
</p>

---

> Looking for the terminal version? See **[→ README.md (CLI)](./README.md)**. Both editions share the same `~/.cowrangler` config, credentials, skills, and sessions.

---

## What is it?

Cowrangler Desktop is a graphical front-end for the Cowrangler agent, modeled after Claude's Cowork experience. It wraps the same agent core (the one that powers the CLI) in an Electron + React app with:

- A **project-based workspace** — each project has its own working folder, instructions, sessions, and memory.
- A **live chat** with streaming responses, tool-call activity, and a right-hand **progress panel** that shows the agent's task list and live activity in real time.
- **Slash skill invocation** — type `/` in the composer to call any installed skill.
- **In-app settings** to edit models, API keys, connectors/MCP servers, and skills — no config files required.
- **Light "paper" and dark themes** with instant switching (Settings → Görünüm).

It is a desktop client, not a separate agent: anything you configure in the CLI works here and vice-versa.

---

## Download

> **Pre-built binaries** are published on the [GitHub Releases page](https://github.com/furkangonel/co-wrangler/releases).

| Platform | File | Notes |
|----------|------|-------|
| 🍎 macOS (Apple Silicon / Intel) | `Cowrangler-<version>.dmg` | Open the DMG, drag the app to Applications |
| 🐧 Linux | `Cowrangler-<version>.AppImage` | `chmod +x` then run |
| 🪟 Windows | `Cowrangler-Setup-<version>.exe` | Run the installer |

### First launch — guaranteed to work

1. **macOS Gatekeeper:** the app is not notarized yet, so the first time you open it macOS may say *"cannot be opened"*. Right-click the app → **Open** → **Open**, or run:
   ```bash
   xattr -dr com.apple.quarantine "/Applications/Cowrangler.app"
   ```
2. On first run, open **Settings → Modeller & API** and add at least one API key (Anthropic, OpenAI, OpenRouter, …), then pick your default model.
3. Create a project, point it at a working folder, and start a chat.

If you already use the CLI, your keys and models are picked up automatically — the desktop app reads the same `~/.cowrangler/credentials.env` and `config.yaml`.

---

## Run from source

Requirements: **Node.js ≥ 18**, **npm**, and (macOS) Xcode Command Line Tools for the native `better-sqlite3` module.

```bash
git clone https://github.com/furkangonel/co-wrangler.git
cd co-wrangler

# One-shot setup (installs deps + rebuilds native modules for Electron)
./setup-desktop.sh

# Start the app in development (hot-reload)
npm run desktop:dev
```

If you prefer manual steps:

```bash
npm install --legacy-peer-deps
npm run desktop:rebuild     # rebuild better-sqlite3 against Electron's ABI
npm run desktop:dev
```

---

## Features

| Area | What you get |
|------|--------------|
| **Projects** | Create projects with an icon, description, and working folder. Each project isolates its sessions, instructions, and outputs. |
| **Sessions** | Claude-style chat: streaming assistant messages, user bubbles, persistent history (SQLite), "new chat", and back-to-project navigation. |
| **Slash skills** | Type `/` in the composer to fuzzy-search and insert any installed skill. |
| **Progress panel** | Live "Agent çalışıyor" banner with the active tool, a task checklist with a progress bar, and a live tool-call activity feed. |
| **Models & API** | Pick a default model, group by provider, enter a **custom model id**, and add/show/remove API keys — all in-app. |
| **Connectors & MCP** | Add, remove, and test MCP servers (stdio / HTTP / SSE) from the UI. |
| **Skills** | Browse bundled/global/local skills, toggle them on/off, view their content, **create new skills**, open the skills folder, and delete your own. |
| **Themes** | Light "paper" and dark themes (warm Cowrangler orange accent) with instant switching and font-size control. |

---

## Configuration

Everything lives under `~/.cowrangler/` (shared with the CLI):

| Path | Purpose |
|------|---------|
| `~/.cowrangler/config.yaml` | Default model, theme, disabled skills, and other settings |
| `~/.cowrangler/credentials.env` | API keys (written by Settings → Modeller & API) |
| `~/.cowrangler/skills/` | Your global skills (the "New skill" button writes here) |
| `~/.cowrangler/sessions.db` | Session & message history (SQLite) |

Desktop-only preferences (`desktop.theme`, `desktop.fontSize`) are stored in `config.yaml` and don't affect the CLI.

---

## Packaging

Build a distributable for your platform with electron-builder:

```bash
npm run desktop:pack
```

Output lands in `release/`. Targets are configured in `package.json` under `build` (mac `.dmg`, win `.exe`, linux `AppImage`). To build the renderer/main bundles without packaging:

```bash
npm run desktop:build
```

---

## Troubleshooting

**`NODE_MODULE_VERSION` mismatch / `better_sqlite3.node` error on launch**
The native SQLite module was compiled for system Node, not Electron. Rebuild it:
```bash
npm run desktop:rebuild
# or, pinning Electron's version explicitly:
./node_modules/.bin/electron-rebuild -f -w better-sqlite3 -v $(node -p "require('electron/package.json').version")
```

**Bottom-left shows an API-key / "MISSING_KEY" error when sending a message**
Add the relevant key under **Settings → Modeller & API**. The desktop app loads keys from `~/.cowrangler/credentials.env` on startup, so CLI-configured keys also work.

**`Autofill.enable failed` in the dev console**
Harmless Chromium DevTools noise — safe to ignore.

**Blank window in dev**
Make sure the Vite dev server is running (it starts automatically with `npm run desktop:dev` on `http://localhost:5173`). Quit and re-run if the port was taken.

---

<p align="center">
  <sub>Built on the same agent core as the <a href="./README.md">Cowrangler CLI</a>. MIT licensed.</sub>
</p>
