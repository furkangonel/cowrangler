<p align="center">
  <img src="assets/octopuses/oct.png" width="180" alt="Co-Wrangler" />
</p>

<h1 align="center">Co-Wrangler</h1>

<p align="center">
  <strong>An AI developer agent with two surfaces: a desktop app for code and design, and a CLI.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Electron-2C2E3B?style=flat&logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB" alt="React">
  <img src="https://img.shields.io/badge/Version-2.2.0-EC5A29?style=flat" alt="Version">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/furkangonel/cowrangler?style=flat" alt="License"></a>
</p>

---

## What it is

Co-Wrangler runs an agent in your workspace rather than beside it. It reads and
edits files, runs shell commands, drives git, talks to MCP servers, and renders
interfaces — with a permission system that decides what it may do before each
call, not after.

One engine, three places to use it:

| | Where | For |
| --- | --- | --- |
| **Code** | Desktop | Multi-session work on a codebase: file tree, diffs, terminal, live preview, task plans. |
| **Design** | Desktop, its own window | Prototyping interfaces on a canvas — React and HTML artboards, device mockups, templates, accessibility checks. |
| **CLI** | Terminal | The same agent without the window. Model picker, background execution, batch runs, cron jobs, LSP. |

Code and Design are two surfaces of one desktop app. The CLI is a separate
binary. All three share `~/.cowrangler` — the same credentials, the same
sessions database, the same skills, the same permission policy.

---

## Install

**Desktop** — pre-built binaries are on the
[Releases page](https://github.com/furkangonel/cowrangler/releases):

| Platform | File |
| --- | --- |
| macOS (Intel / Apple Silicon) | `Cowrangler-<version>.dmg` |
| Windows | `Cowrangler-Setup-<version>.exe` |
| Linux | `Cowrangler-<version>.AppImage` |

**CLI**

```bash
npm install -g @cowrangler/cli
cowrangler setup     # pick a provider, paste a key
cowrangler           # start
```

**From source**

```bash
git clone https://github.com/furkangonel/cowrangler.git
cd cowrangler
npm run setup        # install, build, link the CLI
npm run desktop:dev  # run the desktop app
```

Node ≥ 18. On macOS you need the Xcode command line tools for the native
modules (`better-sqlite3`, `node-pty`).

---

## Permissions

The permission system is the one Anthropic ships with Claude Code — same modes,
same `Tool(specifier)` rule grammar, same settings precedence — so a policy you
already know how to write works here unchanged.

Two independent controls. **Rules** decide specific cases, in the order
`deny` → `ask` → `allow`. **The mode** decides everything the rules did not.

```json
// .cowrangler/settings.json
{
  "permissions": {
    "defaultMode": "acceptEdits",
    "allow": ["Bash(npm run *)", "Bash(git commit *)"],
    "ask":   ["Bash(git push *)"],
    "deny":  ["Read(.env)", "Read(secrets/**)"]
  },
  "sandbox": {
    "enabled": true,
    "network": { "allowedDomains": ["registry.npmjs.org", "*.github.com"] }
  }
}
```

| Mode | When no rule matches |
| --- | --- |
| `default` | Ask on first use of each tool. Reads in the workspace run freely. |
| `acceptEdits` | Workspace edits apply; anything outside prompts. |
| `plan` | Explore and propose. No writes until you approve the plan. |
| `auto` | Reversible work runs, sandboxed and checkpointed. Irreversible or external actions stop for you. |
| `dontAsk` | Nothing prompts; uncovered calls are refused. For unattended runs. |
| `bypassPermissions` | No checks beyond deny rules. Containers and VMs only. |

Underneath both sits the **sandbox**: rules decide whether a command runs, the
sandbox decides what it can touch while it runs, enforced by the OS (Seatbelt on
macOS, bubblewrap on Linux and WSL2) for the command and every process it
spawns. A command the sandbox can fully contain runs without a prompt in any
mode — which is why `npm run build` doesn't interrupt you but a write to
`~/.zshrc` always will.

Some things no mode auto-approves: writes to the files that decide what the
agent may do next (`.cowrangler/settings.json`, `.git/hooks`, `.mcp.json`, shell
startup files); deletes aimed at a filesystem root or the workspace itself; any
call reaching a host you haven't allowed — `curl https://attacker.test` is
reversible on your disk and an exfiltration path everywhere else, so it asks
even in `auto`; and a short list of commands — `rm -rf /`, `mkfs`, fork bombs —
refused even in `bypassPermissions`.

When a command genuinely can't run confined, the failure says so and names the
sanctioned way out — a retry with `dangerouslyDisableSandbox`, which always asks
you first. The alternative is a dead end, and a capable model reacts to a dead
end by looking for a gap in the boundary rather than telling you about it.

**[→ Full permission reference](./docs/permissions.md)**

---

## Repository layout

```
apps/
  cli/           the terminal client
  desktop/       the Electron app — Code and Design surfaces
packages/
  core/          the agent engine: tools, permissions, sandbox, sessions, MCP
  adapters/
    cli/         surface adapter — terminal
    code/        surface adapter — desktop Code
    design/      surface adapter — desktop Design
bundled_skills/  skills shipped with the product
docs/            permissions, brand, plugin authoring
```

`packages/core` holds everything that is not a user interface. A surface adapter
is a thin layer that tells core which tools that surface exposes, which system
prompt it uses, and how it renders events. Adding a surface means adding an
adapter, not forking the engine.

---

## Where things live

| | Global — `~/.cowrangler` | Project — `./.cowrangler` |
| --- | --- | --- |
| Credentials | `credentials.env`, OS keychain | — |
| Configuration | `config.yaml` | `config.yaml` (overrides) |
| Permissions | `settings.json` | `settings.json` (shared), `settings.local.json` (yours) |
| Skills | `skills/` | `skills/` |
| Agents | `agents/` | `agents/` |
| Sessions | `sessions.db` | — |
| Memory | `memory.md` | `memory/` |
| Plugins | `plugins/` | — |

Nothing is written into a project on startup. Project files appear only when
something needs them.

---

## Extending

Plugins add tools, models, providers, skills and UI actions to the same engine,
so a plugin written once works in Code, Design and the CLI.

**[→ Plugin development guide](./PLUGINS.md)**

---

## Documentation

- **[Permissions](./docs/permissions.md)** — modes, rule syntax, sandboxing, settings precedence
- **[Brand and theming](./docs/brand.md)** — design tokens, contrast rules, how to add a colour
- **[Desktop](./apps/desktop/src/desktop/README.md)** — Code and Design surfaces
- **[Design mode](./apps/desktop/src/desktop/components/design/README.md)** — canvas, templates, export
- **[CLI](./apps/cli/src/cli/README.md)** — commands, flags, batch and cron
- **[Plugins](./PLUGINS.md)** — authoring guide
- **[Contributing](./CONTRIBUTING.md)** · **[Security](./SECURITY.md)** · **[Changelog](./CHANGELOG.md)**

---

## License

MIT. See [LICENSE](./LICENSE).
