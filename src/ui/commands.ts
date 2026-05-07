import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import yaml from "js-yaml";
import { Agent } from "../core/agent.js";
import { LLM } from "../core/llm.js";
import { SkillManager } from "../core/skills.js";
import { TOOL_SCHEMAS } from "../tools/registry.js";
import { Theme, UI } from "./theme.js";
import {
  DIRS,
  COWRNGLR_MD,
  PROJECT_ROOT,
  ensureLocalMemory,
} from "../core/init.js";
import { missingKeyHint, showSetupGuide } from "./setup.js";
import { SUB_AGENTS } from "../core/subagents.js";
import { getSandboxConfig, configureSandbox } from "../core/sandbox.js";
import { PermissionMode } from "../core/permissions.js";

export interface CommandContext {
  agent: Agent;
  skillManager: SkillManager;
  executeAgentDirective: (directive: string) => Promise<void>;
}

export class CommandRouter {
  private commands = new Map<
    string,
    { description: string; execute: Function }
  >();

  constructor() {
    this._registerCoreCommands();
  }

  public getCommandNames(): string[] {
    return Array.from(this.commands.keys()).sort();
  }

  /** Returns a map of command → one-line description, used by the REPL autocomplete. */
  public getCommandDescriptions(): Map<string, string> {
    const map = new Map<string, string>();
    for (const [name, data] of this.commands.entries()) {
      map.set(name, data.description);
    }
    return map;
  }

  public async route(input: string, ctx: CommandContext): Promise<boolean> {
    const parts = input.trim().split(/\s+/);
    const cmdName = parts[0].toLowerCase();
    const args = parts.slice(1);
    const command = this.commands.get(cmdName);
    if (command) {
      await command.execute(args, ctx);
      return true;
    }
    UI.error(`Unknown command: ${cmdName}. Type /help for the full list.`);
    return false;
  }

  private _registerCoreCommands() {
    // ── /help ─────────────────────────────────────────────────────────────────
    this.commands.set("/help", {
      description: "Show all available commands.",
      execute: () => {
        const lines = Array.from(this.commands.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(
            ([cmd, data]) =>
              `  ${Theme.accent.bold(cmd.padEnd(18))} ${Theme.dim("→ " + data.description)}`,
          );
        lines.push("");
        lines.push(
          `  ${Theme.dim("Tip:")} Type ${Theme.accent("/")} ${Theme.dim("+ TAB to autocomplete")}`,
        );
        lines.push(
          `  ${Theme.dim("Tip:")} Press ${Theme.accent("↑↓")} ${Theme.dim("to browse history")}`,
        );
        UI.box(lines.join("\n"), "Co-Wrangler Commands");
      },
    });

    // ── /exit ─────────────────────────────────────────────────────────────────
    this.commands.set("/exit", {
      description: "Exit Co-Wrangler.",
      execute: () => {
        UI.warn("Session terminated. Goodbye!");
        process.exit(0);
      },
    });

    // ── /reset ────────────────────────────────────────────────────────────────
    this.commands.set("/reset", {
      description:
        "Clear conversation history and reload project memory from disk.",
      execute: (args: string[], ctx: CommandContext) => {
        ctx.agent.reset();
        UI.success("Context cleared. Memory reloaded.");
      },
    });

    // ── /status ───────────────────────────────────────────────────────────────
    this.commands.set("/status", {
      description:
        "Show current session: model, context, memory, skills, tools.",
      execute: (args: string[], ctx: CommandContext) => {
        const skills = ctx.skillManager.getAvailableSkills();
        const memExists = fs.existsSync(DIRS.local.memory);
        const memSize = memExists ? fs.statSync(DIRS.local.memory).size : 0;
        const toolCount = Object.keys(TOOL_SCHEMAS).length;
        const lines = [
          `  ${Theme.dim("Model          ")} ${Theme.accent(ctx.agent.llm.model)}`,
          `  ${Theme.dim("Context        ")} ${Theme.accent(`${ctx.agent.contextLength} messages`)}`,
          `  ${Theme.dim("Max Iterations ")} ${Theme.accent(String(ctx.agent.maxIterations))}`,
          `  ${Theme.dim("Project Memory ")} ${memExists ? Theme.success(`${memSize} bytes`) : Theme.dim("empty")}`,
          `  ${Theme.dim("Skills Loaded  ")} ${Theme.accent(`${skills.length} (bundled + global + local)`)}`,
          `  ${Theme.dim("Tools Available")} ${Theme.accent(`${toolCount}`)}`,
          `  ${Theme.dim("Working Dir    ")} ${Theme.accent(process.cwd())}`,
        ];
        UI.box(lines.join("\n"), "Session Status");
      },
    });

    // ── /version ──────────────────────────────────────────────────────────────
    this.commands.set("/version", {
      description: "Show Co-Wrangler version.",
      execute: () => {
        UI.info("Co-Wrangler v1.1.2");
      },
    });

    // ── /tools ────────────────────────────────────────────────────────────────
    this.commands.set("/tools", {
      description: "List all available tools (capabilities).",
      execute: () => {
        const entries = Object.entries(TOOL_SCHEMAS).sort(([a], [b]) =>
          a.localeCompare(b),
        );
        const lines: string[] = [
          `  ${Theme.dim(`${entries.length} tools available`)}\n`,
        ];
        entries.forEach(([name, schema]) =>
          lines.push(
            `  ${Theme.success(`• ${name.padEnd(22)}`)} ${Theme.dim(schema.description.split("\n")[0].slice(0, 58))}`,
          ),
        );
        UI.box(lines.join("\n"), "Available Tools");
      },
    });

    // ── /skills ───────────────────────────────────────────────────────────────
    this.commands.set("/skills", {
      description: "List all loaded skills (SOPs).",
      execute: (args: string[], ctx: CommandContext) => {
        const skills = ctx.skillManager.getAvailableSkills();
        if (!skills.length) {
          return UI.warn(
            "No skills found. Add to ~/.cowrangler/skills/ or .cowrangler/skills/",
          );
        }
        const bySource: Record<string, any[]> = {
          bundled: [],
          global: [],
          local: [],
        };
        skills.forEach((s) => bySource[s.source].push(s));
        const lines: string[] = [];
        for (const [src, list] of Object.entries(bySource)) {
          if (!list.length) continue;
          lines.push(`  ${Theme.main(`[${src.toUpperCase()}]`)}`);
          list.forEach((s) =>
            lines.push(
              `    ${Theme.success(`• ${s.id.padEnd(20)}`)} ${Theme.dim(s.description.slice(0, 55))}`,
            ),
          );
          lines.push("");
        }
        lines.push(
          `  ${Theme.dim("Run:")} ${Theme.accent("/skill <id> <task>")}  ${Theme.dim("Read:")} ${Theme.accent("/skill <id>")}`,
        );
        UI.box(lines.join("\n"), `Skills (${skills.length} loaded)`);
      },
    });

    // ── /skill ────────────────────────────────────────────────────────────────
    this.commands.set("/skill", {
      description:
        "Use a skill: /skill <id> [task]  or just /skill <id> to stage it",
      execute: async (args: string[], ctx: CommandContext) => {
        if (!args.length)
          return UI.error("Usage: /skill <skill_id> [task description]");
        const rawId = args[0].replace(/^\/+/, "");
        const taskText = args.slice(1).join(" ");
        const available = ctx.skillManager.listSkillIds();

        if (!available.includes(rawId)) {
          return UI.error(
            `Skill '${rawId}' not found. Type /skills to see the list.`,
          );
        }
        if (!taskText) {
          console.log(
            `\n  ${Theme.main("⚡ SKILL STAGED:")} ${Theme.accent.bold(rawId)}\n` +
              `  ${Theme.dim("Your next message will use this skill's SOP.")}\n`,
          );
        } else {
          console.log(
            `\n  ${Theme.success("✓ SOP ENFORCED:")} ${Theme.accent.bold(rawId)}\n` +
              `  ${Theme.dim("Executing with specialized context...")}\n`,
          );
          await ctx.executeAgentDirective(
            `${taskText}\n\n[SYSTEM DIRECTIVE: Use the 'utilize_skill' tool to load '${rawId}' before starting.]`,
          );
        }
      },
    });

    // ── /memory ───────────────────────────────────────────────────────────────
    this.commands.set("/memory", {
      description: "View or clear project memory: /memory [show|clear]",
      execute: (args: string[], ctx: CommandContext) => {
        const action = args[0] ?? "show";
        if (action === "show") {
          if (!fs.existsSync(DIRS.local.memory)) {
            return UI.warn(
              "No memory file yet. Run /init or /memory clear to create one.",
            );
          }
          const content = fs.readFileSync(DIRS.local.memory, "utf-8");
          console.log("\n" + Theme.dim(content) + "\n");
          return;
        }
        if (action === "clear") {
          ensureLocalMemory(); // create if missing
          fs.writeFileSync(DIRS.local.memory, "# Project Memory\n", "utf-8");
          ctx.agent.refreshSystemPrompt();
          return UI.success(
            "Project memory cleared and system prompt refreshed.",
          );
        }
        UI.error("Usage: /memory [show|clear]");
      },
    });

    // ── /model ────────────────────────────────────────────────────────────────
    this.commands.set("/model", {
      description:
        "Manage models: /model [list|current|add|set] — live switch without restart",
      execute: (args: string[], ctx: CommandContext) => {
        const action = args[0];
        let globalConfig: any = {};
        if (fs.existsSync(DIRS.global.config)) {
          globalConfig =
            (yaml.load(fs.readFileSync(DIRS.global.config, "utf-8")) as any) ||
            {};
        }
        if (!globalConfig.saved_models) globalConfig.saved_models = [];

        if (!action || action === "current") {
          return UI.info(
            `Active model: ${Theme.accent.bold(ctx.agent.llm.model)}`,
          );
        }

        if (action === "list") {
          if (!globalConfig.saved_models.length) {
            return UI.warn("No saved models. Use: /model add <model_name>");
          }
          const current = ctx.agent.llm.model;
          const lines = globalConfig.saved_models.map(
            (m: string) =>
              `  ${m === current ? Theme.success("▶") : Theme.dim("○")} ${m === current ? Theme.accent.bold(m) : Theme.dim(m)}`,
          );
          return UI.box(lines.join("\n"), "Registered Models (▶ = active)");
        }

        if (action === "add" && args[1]) {
          if (globalConfig.saved_models.includes(args[1]))
            return UI.info(`'${args[1]}' already registered.`);
          globalConfig.saved_models.push(args[1]);
          fs.writeFileSync(DIRS.global.config, yaml.dump(globalConfig));
          return UI.success(`Model '${args[1]}' added to registry.`);
        }

        if (action === "set" && args[1]) {
          const targetModel = args[1];
          const scope = args[2] === "global" ? "global" : "local";

          // Validate by instantiating (checks env var presence)
          let newLlm: LLM;
          try {
            newLlm = new LLM(targetModel, 0.7);
          } catch (e: any) {
            if (e.message.startsWith("MISSING_KEY:")) {
              const missingKey = e.message.split(":")[1];
              return UI.error(missingKeyHint(missingKey));
            }
            return UI.error(`Cannot use model '${targetModel}': ${e.message}`);
          }

          // Hot-swap — no restart required
          ctx.agent.setModel(newLlm);

          if (scope === "global") {
            globalConfig.model = targetModel;
            if (!globalConfig.saved_models.includes(targetModel))
              globalConfig.saved_models.push(targetModel);
            fs.writeFileSync(DIRS.global.config, yaml.dump(globalConfig));
            return UI.success(
              `Global model → ${Theme.accent.bold(targetModel)}`,
            );
          } else {
            let localCfg: any = {};
            if (fs.existsSync(DIRS.local.config))
              localCfg =
                (yaml.load(
                  fs.readFileSync(DIRS.local.config, "utf-8"),
                ) as any) || {};
            localCfg.model = targetModel;
            fs.writeFileSync(DIRS.local.config, yaml.dump(localCfg));
            return UI.success(
              `Local model → ${Theme.accent.bold(targetModel)}`,
            );
          }
        }

        UI.error(
          "Usage:\n  /model list\n  /model current\n  /model add <name>\n  /model set <name> [global|local]",
        );
      },
    });

    // ── /key ──────────────────────────────────────────────────────────────────
    this.commands.set("/key", {
      description: "Manage API keys: /key [list|set|delete]",
      execute: (args: string[], ctx: CommandContext) => {
        const action = args[0];

        if (action === "list") {
          if (!fs.existsSync(DIRS.global.credentials))
            return UI.warn(
              "No credentials file. Use: /key set <PROVIDER> <key>",
            );
          const lines = fs
            .readFileSync(DIRS.global.credentials, "utf-8")
            .split("\n")
            .filter((l) => l.includes("=") && !l.startsWith("#"))
            .map((line) => {
              const [p, k] = line.split("=");
              const masked =
                k && k.length > 10
                  ? `${k.slice(0, 6)}${"•".repeat(12)}${k.slice(-4)}`
                  : "••••••••";
              return `  ${Theme.success(`• ${p.padEnd(32)}`)} ${Theme.dim(masked)}`;
            });
          if (!lines.length) return UI.info("No API keys saved yet.");
          return UI.box(lines.join("\n"), "Credential Vault");
        }

        // ── /key set vertex — Vertex AI setup guide ──────────────────────
        if (
          action === "set" &&
          args[1]?.toUpperCase() === "VERTEX" &&
          args.length === 2
        ) {
          const lines = [
            `  ${Theme.main("Vertex AI uses GCP authentication, not a simple API key.")}`,
            "",
            `  ${Theme.dim("Step 1")} — Save project ID:`,
            `    ${Theme.accent("/key set GOOGLE_VERTEX_PROJECT <project-id>")}`,
            "",
            `  ${Theme.dim("Step 2")} — Save region (default: us-central1):`,
            `    ${Theme.accent("/key set GOOGLE_VERTEX_LOCATION us-central1")}`,
            "",
            `  ${Theme.dim("Step 3")} — Authentication (choose one):`,
            `    ${Theme.success("a)")} ADC ${Theme.dim("(recommended — run once in terminal):")}`,
            `       ${Theme.accent("gcloud auth application-default login")}`,
            `    ${Theme.success("b)")} Service Account key file:`,
            `       ${Theme.accent("/key set GOOGLE_APPLICATION_CREDENTIALS /path/to/key.json")}`,
            "",
            `  ${Theme.dim("Usage:")} ${Theme.accent("vertex/gemini-2.0-flash")} ${Theme.dim("or")} ${Theme.accent("vertex/gemini-1.5-pro")}`,
          ];
          return UI.box(lines.join("\n"), "Vertex AI Setup Guide");
        }

        if (action === "set" && args.length >= 3) {
          const provider = args[1].toUpperCase();
          // Join args[2..] for values that might contain spaces like file paths
          const key = args.slice(2).join(" ");
          process.env[provider] = key;
          let content = fs.existsSync(DIRS.global.credentials)
            ? fs.readFileSync(DIRS.global.credentials, "utf-8")
            : "# Co-Wrangler Global API Keys\n";
          const regex = new RegExp(`^${provider}=.*`, "m");
          content = regex.test(content)
            ? content.replace(regex, `${provider}=${key}`)
            : content.trimEnd() + `\n${provider}=${key}\n`;
          fs.writeFileSync(DIRS.global.credentials, content, "utf-8");
          UI.success(
            `Key saved for ${Theme.accent.bold(provider)} (live + persisted).`,
          );

          // If a Vertex key was changed, auto-refresh LLM.
          // This allows changes to apply in the next message without running /model set.
          const VERTEX_KEYS = new Set([
            "GOOGLE_VERTEX_PROJECT",
            "GOOGLE_VERTEX_LOCATION",
            "GOOGLE_APPLICATION_CREDENTIALS",
          ]);
          if (
            VERTEX_KEYS.has(provider) &&
            ctx.agent.llm.model.startsWith("vertex/")
          ) {
            try {
              const freshLlm = new LLM(ctx.agent.llm.model);
              ctx.agent.setModel(freshLlm);
              UI.success(
                `LLM refreshed → ${Theme.accent.bold(ctx.agent.llm.model)} (${provider} updated)`,
              );
            } catch {
              // Might be a validation error — pass silently, user already got confirmation
            }
          }
          return;
        }

        if (action === "delete" && args[1]) {
          const provider = args[1].toUpperCase();
          if (!fs.existsSync(DIRS.global.credentials))
            return UI.warn("No credentials file.");
          let content = fs.readFileSync(DIRS.global.credentials, "utf-8");
          const regex = new RegExp(`^${provider}=.*\n?`, "m");
          if (!regex.test(content))
            return UI.warn(`Key '${provider}' not found.`);
          content = content.replace(regex, "");
          fs.writeFileSync(
            DIRS.global.credentials,
            content.trimEnd() + "\n",
            "utf-8",
          );
          delete process.env[provider];
          return UI.success(`Key for '${provider}' removed.`);
        }

        UI.error(
          "Usage:\n" +
            "  /key list\n" +
            "  /key set <KEY_NAME> <value>\n" +
            "  /key set VERTEX          ← Vertex AI setup guide\n" +
            "  /key delete <KEY_NAME>",
        );
      },
    });

    // ── /init ─────────────────────────────────────────────────────────────────
    this.commands.set("/init", {
      description:
        "AI-powered project scan: reads source files and writes a real COWRNGLR.md.",
      execute: async (args: string[], ctx: CommandContext) => {
        const force = args[0] === "--force" || args[0] === "-f";

        if (fs.existsSync(COWRNGLR_MD) && !force) {
          UI.warn(
            "COWRNGLR.md already exists. Use /init --force to regenerate.",
          );
          return;
        }

        UI.info(
          "Gathering project signals — handing off to AI for deep analysis...\n",
        );

        // ── Phase 1: Fast static signal collection ──────────────────────────
        // We gather everything that's cheap to read before hitting the LLM,
        // so the agent starts with rich context and wastes fewer tool calls.
        const signals: string[] = [];

        // Root-level file listing (non-noise)
        try {
          const rootLs = execSync(
            `ls -1 ${PROJECT_ROOT} | grep -vE "^(node_modules|dist|build|\\.git|\\.DS_Store|__pycache__)$" | head -40`,
            {
              encoding: "utf-8",
              cwd: PROJECT_ROOT,
              stdio: ["pipe", "pipe", "ignore"],
            },
          ).trim();
          signals.push(`### Root directory\n\`\`\`\n${rootLs}\n\`\`\``);
        } catch {
          /* ignore */
        }

        // Source file tree (up to 100 files, all common source dirs)
        try {
          const srcTree = execSync(
            `find ${PROJECT_ROOT} -type f \\( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.py" -o -name "*.go" -o -name "*.rs" -o -name "*.java" -o -name "*.rb" -o -name "*.cs" \\) | grep -vE "(node_modules|dist|build|\\.(git|cache))" | sed "s|${PROJECT_ROOT}/||" | sort | head -100`,
            {
              encoding: "utf-8",
              cwd: PROJECT_ROOT,
              stdio: ["pipe", "pipe", "ignore"],
            },
          ).trim();
          if (srcTree)
            signals.push(`### Source files\n\`\`\`\n${srcTree}\n\`\`\``);
        } catch {
          /* ignore */
        }

        // Package manifests (first 2000 chars each)
        for (const manifest of [
          "package.json",
          "pyproject.toml",
          "requirements.txt",
          "go.mod",
          "Cargo.toml",
          "pom.xml",
          "build.gradle",
        ]) {
          const p = path.join(PROJECT_ROOT, manifest);
          if (fs.existsSync(p)) {
            try {
              const raw = fs.readFileSync(p, "utf-8").slice(0, 2000);
              signals.push(`### ${manifest}\n\`\`\`\n${raw}\n\`\`\``);
            } catch {
              /* ignore */
            }
          }
        }

        // README (first 3000 chars)
        for (const readmeName of ["README.md", "readme.md", "README.txt"]) {
          const p = path.join(PROJECT_ROOT, readmeName);
          if (fs.existsSync(p)) {
            try {
              const raw = fs.readFileSync(p, "utf-8").slice(0, 3000);
              signals.push(`### ${readmeName}\n${raw}`);
            } catch {
              /* ignore */
            }
            break;
          }
        }

        // Git context
        try {
          const branch = execSync("git branch --show-current", {
            encoding: "utf-8",
            cwd: PROJECT_ROOT,
            stdio: ["pipe", "pipe", "ignore"],
          }).trim();
          const remote = execSync(
            "git remote get-url origin 2>/dev/null || true",
            {
              encoding: "utf-8",
              cwd: PROJECT_ROOT,
              stdio: ["pipe", "pipe", "ignore"],
            },
          ).trim();
          const log = execSync(
            `git log --pretty=format:"%h  %s  (%ar)" -15 2>/dev/null || true`,
            {
              encoding: "utf-8",
              cwd: PROJECT_ROOT,
              stdio: ["pipe", "pipe", "ignore"],
            },
          ).trim();
          const gitLines = [`Branch: ${branch}`];
          if (remote) gitLines.push(`Remote: ${remote}`);
          if (log) gitLines.push(`\nRecent commits:\n${log}`);
          signals.push(`### Git\n${gitLines.join("\n")}`);
        } catch {
          /* no git */
        }

        // Key config files (tsconfig, vite, eslint, jest, docker…)
        for (const cfg of [
          "tsconfig.json",
          "vite.config.ts",
          "vite.config.js",
          "webpack.config.js",
          "jest.config.ts",
          "jest.config.js",
          ".eslintrc.json",
          "eslint.config.js",
          "Dockerfile",
          "docker-compose.yml",
        ]) {
          const p = path.join(PROJECT_ROOT, cfg);
          if (fs.existsSync(p)) {
            try {
              const raw = fs.readFileSync(p, "utf-8").slice(0, 1200);
              signals.push(`### ${cfg}\n\`\`\`\n${raw}\n\`\`\``);
            } catch {
              /* ignore */
            }
          }
        }

        // Existing project memory (seed context)
        if (fs.existsSync(DIRS.local.memory)) {
          try {
            const mem = fs.readFileSync(DIRS.local.memory, "utf-8").trim();
            if (mem && mem !== "# Project Memory") {
              signals.push(`### Existing memory.md\n${mem}`);
            }
          } catch {
            /* ignore */
          }
        }

        const signalBlock = signals.join("\n\n");
        const today = new Date().toISOString().slice(0, 10);

        // ── Phase 2: Agent-driven deep analysis + file writing ──────────────
        // The agent reads real source files and writes COWRNGLR.md itself.
        // This produces actual architectural insight, not placeholder comments.
        const directive = `
SYSTEM TASK: /init — AI-powered project scan
=============================================

Your job is to deeply understand this codebase and produce a high-quality COWRNGLR.md.
The file acts as the agent's "brain" for this project — it is injected into every future
conversation. Make it genuinely useful.

## Pre-gathered signals
${signalBlock}

## Instructions

### Step 1 — Explore the source
Use \`read_file\` to read the most important source files.
Prioritise: entry point(s), core modules, main classes/functions, routing/config layer.
Read at least 6–10 files before writing. More is better.
Skip generated files, lock files, and test fixtures.

### Step 2 — Write COWRNGLR.md
Use \`write_file\` to create the file at exactly this path:
  ${COWRNGLR_MD}

The file MUST use this structure (fill every section with REAL observations — no placeholder comments):

\`\`\`markdown
# COWRNGLR.md
> Auto-generated by \`/init\` on ${today}. Edit freely — the agent reads this on every run.

## Overview
[2–3 sentences: what this project does, who it's for, core value proposition]

## Tech Stack
[Language(s), runtime version, frameworks, key libraries — one line each with purpose]

## Architecture
[How the codebase is structured. Layers, modules, patterns (MVC? service layer? event-driven?).
Call out the most important design decisions. Be specific — name actual directories and files.]

## Key Files & Modules
[10–15 most important files. Format: \`path/to/file\` — what it does]

## Entry Points & Commands
[How to install, build, run, test, lint. Copy the exact commands.]

## Conventions & Patterns
[Naming style, code organisation, error handling pattern, commit message format,
anything non-obvious observed in the code.]

## Agent Rules
- Always read a file with read_file before editing it.
- Run the build/test command after any code change to verify it compiles/passes.
[Add 3–5 more rules specific to THIS project based on what you found.]
\`\`\`

### Step 3 — Confirm
After writing, reply: "✓ COWRNGLR.md written. Agent context is now active."
`.trim();

        await ctx.executeAgentDirective(directive);

        // Immediately make the new file available to the agent's system prompt
        ctx.agent.refreshSystemPrompt();
      },
    });

    // ── /context ──────────────────────────────────────────────────────────────
    this.commands.set("/context", {
      description: "Show current conversation context size.",
      execute: (args: string[], ctx: CommandContext) => {
        const n = ctx.agent.contextLength;
        UI.info(`Context: ${Theme.accent.bold(String(n))} message(s).`);
        if (n > 80)
          UI.warn(
            "Context is getting large. Consider /reset to free up tokens.",
          );
      },
    });

    // ── /mode ─────────────────────────────────────────────────────────────────
    this.commands.set("/mode", {
      description:
        "Switch view mode: /mode [brief|default|transcript]  (Ctrl+O also cycles)",
      execute: (args: string[], ctx: CommandContext) => {
        const validModes = ["brief", "default", "transcript"];
        const requested = args[0]?.toLowerCase();

        if (!requested || !validModes.includes(requested)) {
          const lines = [
            `  ${Theme.dim("Current mode:")} ${Theme.accent(ctx.agent.viewMode ?? "default")}`,
            "",
            `  ${Theme.success("•")} ${Theme.accent("brief")}      ${Theme.dim("→ Tools are hidden; only send_message output")}`,
            `  ${Theme.success("•")} ${Theme.accent("default")}    ${Theme.dim("→ Tools are shown with ⎿ prefix (default)")}`,
            `  ${Theme.success("•")} ${Theme.accent("transcript")} ${Theme.dim("→ Everything in raw format (for debugging)")}`,
            "",
            `  ${Theme.dim("Tip:")} ${Theme.dim("You can also cycle with ")}${Theme.accent("Ctrl+O")}.`,
          ];
          return UI.box(lines.join("\n"), "View Mode");
        }

        ctx.agent.viewMode = requested as "brief" | "default" | "transcript";
        UI.success(`View mode: ${Theme.accent.bold(requested)}`);

        // Save to config
        const cfgPath = DIRS.local.config;
        let cfg: any = {};
        if (fs.existsSync(cfgPath)) {
          cfg = (yaml.load(fs.readFileSync(cfgPath, "utf-8")) as any) || {};
        }
        cfg.view_mode = requested;
        fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
        fs.writeFileSync(cfgPath, yaml.dump(cfg), "utf-8");
      },
    });

    // ── /agents ───────────────────────────────────────────────────────────────
    this.commands.set("/agents", {
      description: "List all available sub-agents and their capabilities.",
      execute: (args: string[], ctx: CommandContext) => {
        const detail = args[0];

        if (detail && SUB_AGENTS[detail]) {
          const agent = SUB_AGENTS[detail];
          const lines = [
            `  ${Theme.main("Type:")}       ${Theme.accent(agent.agentType)}`,
            `  ${Theme.main("When:")}       ${Theme.dim(agent.whenToUse)}`,
            `  ${Theme.main("Tools:")}      ${Theme.accent(agent.allowedTools.includes("*") ? "all" : agent.allowedTools.join(", "))}`,
            `  ${Theme.main("Read-only:")}  ${Theme.dim(agent.readOnly ? "Yes" : "No")}`,
            `  ${Theme.main("Sandbox:")}    ${Theme.dim(agent.sandboxMode ?? "inherit")}`,
            `  ${Theme.main("Max iter:")}   ${Theme.dim(String(agent.maxIterations ?? 20))}`,
          ];
          return UI.box(lines.join("\n"), `Agent: ${detail}`);
        }

        const entries = Object.entries(SUB_AGENTS);
        const lines: string[] = [
          `  ${Theme.dim(`${entries.length} built-in agents · spawn with `)}${Theme.accent("spawn_subagent")}\n`,
        ];
        entries.forEach(([name, def]) => {
          const toolSummary = def.allowedTools.includes("*")
            ? "all tools"
            : `${def.allowedTools.length} tools`;
          const badge = def.readOnly ? Theme.info(" [ro]") : "";
          lines.push(
            `  ${Theme.success("•")} ${Theme.accent.bold(name.padEnd(20))}${badge}`,
          );
          lines.push(`    ${Theme.dim(def.whenToUse.slice(0, 72))}`);
          lines.push(`    ${Theme.dim(`(${toolSummary})`)}\n`);
        });
        lines.push(
          `  ${Theme.dim("Usage:")} ${Theme.accent("/agents <name>")} ${Theme.dim("for full details")}`,
        );
        UI.box(lines.join("\n"), "Available Agents");
      },
    });

    // ── /sandbox ──────────────────────────────────────────────────────────────
    this.commands.set("/sandbox", {
      description:
        "Sandbox config: /sandbox [status|enable|disable|strict|audit]",
      execute: (args: string[], ctx: CommandContext) => {
        const action = args[0]?.toLowerCase() ?? "status";
        const sandboxCfg = getSandboxConfig();

        if (action === "status") {
          const lines = [
            `  ${Theme.dim("Enabled:         ")} ${sandboxCfg.enabled ? Theme.success("Yes") : Theme.fail("No")}`,
            `  ${Theme.dim("Workspace Root:  ")} ${Theme.accent(sandboxCfg.workspaceRoot)}`,
            `  ${Theme.dim("Max Timeout:     ")} ${Theme.accent(`${sandboxCfg.maxTimeoutMs}ms`)}`,
            `  ${Theme.dim("Network Blocked: ")} ${sandboxCfg.networkRestricted ? Theme.main("Yes") : Theme.dim("No")}`,
            `  ${Theme.dim("Audit Log:       ")} ${sandboxCfg.auditLogPath ? Theme.success(sandboxCfg.auditLogPath) : Theme.dim("Disabled")}`,
            `  ${Theme.dim("Blocked Bins:    ")} ${Theme.dim(sandboxCfg.blockedBinaries.slice(0, 6).join(", ") + "...")}`,
            "",
            `  ${Theme.dim("Toggle:")} ${Theme.accent("/sandbox enable")} ${Theme.dim("/")} ${Theme.accent("/sandbox disable")}`,
            `  ${Theme.dim("Strict:")} ${Theme.accent("/sandbox strict")} ${Theme.dim("→ also blocks network")}`,
            `  ${Theme.dim("Audit: ")} ${Theme.accent("/sandbox audit")} ${Theme.dim("→ writes audit.log")}`,
          ];
          return UI.box(lines.join("\n"), "Sandbox Status");
        }

        const cfgPath = DIRS.local.config;
        let cfg: any = {};
        if (fs.existsSync(cfgPath)) {
          cfg = (yaml.load(fs.readFileSync(cfgPath, "utf-8")) as any) || {};
        }
        if (!cfg.sandbox) cfg.sandbox = {};

        if (action === "enable") {
          cfg.sandbox.enabled = true;
          configureSandbox({ enabled: true });
          UI.success("Sandbox enabled — dangerous commands are protected.");
        } else if (action === "disable") {
          cfg.sandbox.enabled = false;
          configureSandbox({ enabled: false });
          UI.warn("Sandbox disabled — all bash commands will run directly.");
        } else if (action === "strict") {
          cfg.sandbox.enabled = true;
          cfg.sandbox.network_restricted = true;
          configureSandbox({ enabled: true, networkRestricted: true });
          UI.success("Strict mode active — network commands are also blocked.");
        } else if (action === "audit") {
          const logPath = DIRS.local.auditLog;
          cfg.sandbox.audit_log = true;
          configureSandbox({ auditLogPath: logPath });
          UI.success(`Audit log active: ${Theme.accent(logPath)}`);
        } else {
          return UI.error(
            "Valid options: status | enable | disable | strict | audit",
          );
        }

        fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
        fs.writeFileSync(cfgPath, yaml.dump(cfg), "utf-8");
      },
    });

    // ── /setup ────────────────────────────────────────────────────────────────
    this.commands.set("/setup", {
      description:
        "Provider setup guide. For interactive wizard: cowrangler setup",
      execute: () => {
        showSetupGuide();
      },
    });

    // ── /permissions ──────────────────────────────────────────────────────────
    this.commands.set("/permissions", {
      description:
        "Set permission mode: /permissions [default|plan|auto|bypass]",
      execute: (args: string[], ctx: CommandContext) => {
        const validModes: PermissionMode[] = [
          "default",
          "plan",
          "auto",
          "bypass",
        ];
        const requested = args[0]?.toLowerCase() as PermissionMode | undefined;

        if (!requested || !validModes.includes(requested)) {
          const cfgPath = DIRS.local.config;
          let currentMode = "default";
          if (fs.existsSync(cfgPath)) {
            const raw =
              (yaml.load(fs.readFileSync(cfgPath, "utf-8")) as any) || {};
            currentMode = raw.permission_mode ?? "default";
          }
          const lines = [
            `  ${Theme.dim("Active mode:")} ${Theme.accent.bold(currentMode)}\n`,
            `  ${Theme.success("•")} ${Theme.accent("default")} ${Theme.dim("→ Logs dangerous operations; blocks critical ones")}`,
            `  ${Theme.success("•")} ${Theme.accent("plan")}    ${Theme.dim("→ Default + requires approval for every step")}`,
            `  ${Theme.success("•")} ${Theme.accent("auto")}    ${Theme.dim("→ Only safe/moderate are automatic; dangerous is rejected")}`,
            `  ${Theme.main("•")} ${Theme.accent("bypass")} ${Theme.dim("→ Disables all security checks (trusted environment only)")}`,
          ];
          return UI.box(lines.join("\n"), "Permission Modes");
        }

        if (requested === "bypass") {
          UI.warn("WARNING: bypass mode disables all security checks!");
        }

        const cfgPath = DIRS.local.config;
        let cfg: any = {};
        if (fs.existsSync(cfgPath)) {
          cfg = (yaml.load(fs.readFileSync(cfgPath, "utf-8")) as any) || {};
        }
        cfg.permission_mode = requested;
        fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
        fs.writeFileSync(cfgPath, yaml.dump(cfg), "utf-8");

        UI.success(`Permission mode: ${Theme.accent.bold(requested)}`);
      },
    });
  }
}
