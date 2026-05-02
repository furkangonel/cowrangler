import fs from "fs";
import { execSync } from "child_process";
import yaml from "js-yaml";
import { Agent } from "../core/agent.js";
import { LLM } from "../core/llm.js";
import { SkillManager } from "../core/skills.js";
import { TOOL_SCHEMAS } from "../tools/registry.js";
import { Theme, UI } from "./theme.js";
import { DIRS } from "../core/init.js";

export interface CommandContext {
  agent: Agent;
  skillManager: SkillManager;
  executeAgentDirective: (directive: string) => Promise<void>;
}

export class CommandRouter {
  private commands = new Map<string, { description: string; execute: Function }>();

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
    if (command) { await command.execute(args, ctx); return true; }
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
          .map(([cmd, data]) =>
            `  ${Theme.accent.bold(cmd.padEnd(18))} ${Theme.dim("→ " + data.description)}`
          );
        lines.push("");
        lines.push(`  ${Theme.dim("Tip:")} Type ${Theme.accent("/")} ${Theme.dim("+ TAB to autocomplete")}`);
        lines.push(`  ${Theme.dim("Tip:")} Press ${Theme.accent("↑↓")} ${Theme.dim("to browse history")}`);
        UI.box(lines.join("\n"), "Co-Wrangler Commands");
      },
    });

    // ── /exit ─────────────────────────────────────────────────────────────────
    this.commands.set("/exit", {
      description: "Exit Co-Wrangler.",
      execute: () => { UI.warn("Session terminated. Goodbye!"); process.exit(0); },
    });

    // ── /reset ────────────────────────────────────────────────────────────────
    this.commands.set("/reset", {
      description: "Clear conversation history and reload project memory from disk.",
      execute: (args: string[], ctx: CommandContext) => {
        ctx.agent.reset();
        UI.success("Context cleared. Memory reloaded.");
      },
    });

    // ── /status ───────────────────────────────────────────────────────────────
    this.commands.set("/status", {
      description: "Show current session: model, context, memory, skills, tools.",
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
      execute: () => { UI.info("Co-Wrangler v1.1.0"); },
    });

    // ── /tools ────────────────────────────────────────────────────────────────
    this.commands.set("/tools", {
      description: "List all available tools (capabilities).",
      execute: () => {
        const entries = Object.entries(TOOL_SCHEMAS).sort(([a], [b]) => a.localeCompare(b));
        const lines: string[] = [`  ${Theme.dim(`${entries.length} tools available`)}\n`];
        entries.forEach(([name, schema]) =>
          lines.push(`  ${Theme.success(`• ${name.padEnd(22)}`)} ${Theme.dim(schema.description.split("\n")[0].slice(0, 58))}`)
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
          return UI.warn("No skills. Add to ~/.cowrangler/skills/ or .cowrangler/skills/");
        }
        const bySource: Record<string, any[]> = { bundled: [], global: [], local: [] };
        skills.forEach((s) => bySource[s.source].push(s));
        const lines: string[] = [];
        for (const [src, list] of Object.entries(bySource)) {
          if (!list.length) continue;
          lines.push(`  ${Theme.main(`[${src.toUpperCase()}]`)}`);
          list.forEach((s) =>
            lines.push(`    ${Theme.success(`• ${s.id.padEnd(20)}`)} ${Theme.dim(s.description.slice(0, 55))}`)
          );
          lines.push("");
        }
        lines.push(`  ${Theme.dim("Run:")} ${Theme.accent("/skill <id> <task>")}  ${Theme.dim("Read:")} ${Theme.accent("/skill <id>")}`);
        UI.box(lines.join("\n"), `Skills (${skills.length} loaded)`);
      },
    });

    // ── /skill ────────────────────────────────────────────────────────────────
    this.commands.set("/skill", {
      description: "Use a skill: /skill <id> [task]  or just /skill <id> to stage it",
      execute: async (args: string[], ctx: CommandContext) => {
        if (!args.length) return UI.error("Usage: /skill <skill_id> [task description]");
        const rawId = args[0].replace(/^\/+/, "");
        const taskText = args.slice(1).join(" ");
        const available = ctx.skillManager.listSkillIds();

        if (!available.includes(rawId)) {
          return UI.error(`Skill '${rawId}' not found. Type /skills to see the list.`);
        }
        if (!taskText) {
          console.log(`\n  ${Theme.main("⚡ SKILL STAGED:")} ${Theme.accent.bold(rawId)}\n` +
            `  ${Theme.dim("Your next message will use this skill's SOP.")}\n`);
        } else {
          console.log(`\n  ${Theme.success("✓ SOP ENFORCED:")} ${Theme.accent.bold(rawId)}\n` +
            `  ${Theme.dim("Executing with specialized context...")}\n`);
          await ctx.executeAgentDirective(
            `${taskText}\n\n[SYSTEM DIRECTIVE: Use the 'utilize_skill' tool to load '${rawId}' before starting.]`
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
          if (!fs.existsSync(DIRS.local.memory)) return UI.warn("No project memory file found.");
          const content = fs.readFileSync(DIRS.local.memory, "utf-8");
          console.log("\n" + Theme.dim(content) + "\n");
          return;
        }
        if (action === "clear") {
          fs.writeFileSync(DIRS.local.memory, "# Project Memory\n", "utf-8");
          ctx.agent.refreshSystemPrompt();
          return UI.success("Project memory cleared and system prompt refreshed.");
        }
        UI.error("Usage: /memory [show|clear]");
      },
    });

    // ── /model ────────────────────────────────────────────────────────────────
    this.commands.set("/model", {
      description: "Manage models: /model [list|current|add|set] — live switch without restart",
      execute: (args: string[], ctx: CommandContext) => {
        const action = args[0];
        let globalConfig: any = {};
        if (fs.existsSync(DIRS.global.config)) {
          globalConfig = (yaml.load(fs.readFileSync(DIRS.global.config, "utf-8")) as any) || {};
        }
        if (!globalConfig.saved_models) globalConfig.saved_models = [];

        if (!action || action === "current") {
          return UI.info(`Active model: ${Theme.accent.bold(ctx.agent.llm.model)}`);
        }

        if (action === "list") {
          if (!globalConfig.saved_models.length) {
            return UI.warn("No saved models. Use: /model add <model_name>");
          }
          const current = ctx.agent.llm.model;
          const lines = globalConfig.saved_models.map((m: string) =>
            `  ${m === current ? Theme.success("▶") : Theme.dim("○")} ${m === current ? Theme.accent.bold(m) : Theme.dim(m)}`
          );
          return UI.box(lines.join("\n"), "Registered Models (▶ = active)");
        }

        if (action === "add" && args[1]) {
          if (globalConfig.saved_models.includes(args[1])) return UI.info(`'${args[1]}' already registered.`);
          globalConfig.saved_models.push(args[1]);
          fs.writeFileSync(DIRS.global.config, yaml.dump(globalConfig));
          return UI.success(`Model '${args[1]}' added to registry.`);
        }

        if (action === "set" && args[1]) {
          const targetModel = args[1];
          const scope = args[2] === "global" ? "global" : "local";

          // Validate by instantiating (checks API key presence)
          let newLlm: LLM;
          try {
            newLlm = new LLM(targetModel, 0.7);
          } catch (e: any) {
            if (e.message.startsWith("MISSING_KEY:")) {
              return UI.error(`Missing API key: ${e.message.split(":")[1]}. Run: /key set <KEY_NAME> <value>`);
            }
            return UI.error(`Cannot use model '${targetModel}': ${e.message}`);
          }

          // Hot-swap — no restart required
          ctx.agent.setModel(newLlm);

          if (scope === "global") {
            globalConfig.model = targetModel;
            if (!globalConfig.saved_models.includes(targetModel)) globalConfig.saved_models.push(targetModel);
            fs.writeFileSync(DIRS.global.config, yaml.dump(globalConfig));
            return UI.success(`Global model → ${Theme.accent.bold(targetModel)}`);
          } else {
            let localCfg: any = {};
            if (fs.existsSync(DIRS.local.config)) localCfg = (yaml.load(fs.readFileSync(DIRS.local.config, "utf-8")) as any) || {};
            localCfg.model = targetModel;
            fs.writeFileSync(DIRS.local.config, yaml.dump(localCfg));
            return UI.success(`Local model → ${Theme.accent.bold(targetModel)}`);
          }
        }

        UI.error("Usage:\n  /model list\n  /model current\n  /model add <name>\n  /model set <name> [global|local]");
      },
    });

    // ── /key ──────────────────────────────────────────────────────────────────
    this.commands.set("/key", {
      description: "Manage API keys: /key [list|set|delete]",
      execute: (args: string[], ctx: CommandContext) => {
        const action = args[0];

        if (action === "list") {
          if (!fs.existsSync(DIRS.global.credentials)) return UI.warn("No credentials file. Use: /key set <PROVIDER> <key>");
          const lines = fs.readFileSync(DIRS.global.credentials, "utf-8")
            .split("\n")
            .filter((l) => l.includes("=") && !l.startsWith("#"))
            .map((line) => {
              const [p, k] = line.split("=");
              const masked = k && k.length > 10 ? `${k.slice(0, 6)}${"•".repeat(12)}${k.slice(-4)}` : "••••••••";
              return `  ${Theme.success(`• ${p.padEnd(32)}`)} ${Theme.dim(masked)}`;
            });
          if (!lines.length) return UI.info("No API keys saved yet.");
          return UI.box(lines.join("\n"), "Credential Vault");
        }

        if (action === "set" && args.length >= 3) {
          const provider = args[1].toUpperCase();
          const key = args[2];
          process.env[provider] = key;
          let content = fs.existsSync(DIRS.global.credentials) ? fs.readFileSync(DIRS.global.credentials, "utf-8") : "# Co-Wrangler Global API Keys\n";
          const regex = new RegExp(`^${provider}=.*`, "m");
          content = regex.test(content)
            ? content.replace(regex, `${provider}=${key}`)
            : content.trimEnd() + `\n${provider}=${key}\n`;
          fs.writeFileSync(DIRS.global.credentials, content, "utf-8");
          return UI.success(`Key saved for ${Theme.accent.bold(provider)} (live + persisted).`);
        }

        if (action === "delete" && args[1]) {
          const provider = args[1].toUpperCase();
          if (!fs.existsSync(DIRS.global.credentials)) return UI.warn("No credentials file.");
          let content = fs.readFileSync(DIRS.global.credentials, "utf-8");
          const regex = new RegExp(`^${provider}=.*\n?`, "m");
          if (!regex.test(content)) return UI.warn(`Key '${provider}' not found.`);
          content = content.replace(regex, "");
          fs.writeFileSync(DIRS.global.credentials, content.trimEnd() + "\n", "utf-8");
          delete process.env[provider];
          return UI.success(`Key for '${provider}' removed.`);
        }

        UI.error("Usage:\n  /key list\n  /key set <PROVIDER> <key>\n  /key delete <PROVIDER>");
      },
    });

    // ── /context ──────────────────────────────────────────────────────────────
    this.commands.set("/context", {
      description: "Show current conversation context size.",
      execute: (args: string[], ctx: CommandContext) => {
        const n = ctx.agent.contextLength;
        UI.info(`Context: ${Theme.accent.bold(String(n))} message(s).`);
        if (n > 80) UI.warn("Context is getting large. Consider /reset to free up tokens.");
      },
    });
  }
}
