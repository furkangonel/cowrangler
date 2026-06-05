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
  getVersion,
} from "../core/init.js";
import { t } from "../i18n/index.js";
import { missingKeyHint, showSetupGuide } from "./setup.js";
import { SUB_AGENTS } from "../core/subagents.js";
import { getSandboxConfig, configureSandbox } from "../core/sandbox.js";
import { PermissionMode } from "../core/permissions.js";
import {
  getCredentialPool,
  reloadCredentialPool,
} from "../core/credential_pool.js";

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
    UI.error(t("commands.unknown", { cmd: cmdName }));
    return false;
  }

  private _registerCoreCommands() {
    // ── /help ─────────────────────────────────────────────────────────────────
    this.commands.set("/help", {
      get description() { return t("commands.help_desc"); },
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
      get description() { return t("commands.exit_desc"); },
      execute: () => {
        UI.warn(t("ui.session_terminated"));
        process.exit(0);
      },
    });

    // ── /reset ────────────────────────────────────────────────────────────────
    this.commands.set("/reset", {
      get description() { return t("commands.reset_desc"); },
      execute: (args: string[], ctx: CommandContext) => {
        ctx.agent.reset();
        UI.success(t("status.context_cleared"));
      },
    });

    // ── /status ───────────────────────────────────────────────────────────────
    this.commands.set("/status", {
      get description() { return t("commands.status_desc"); },
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
        UI.box(lines.join("\n"), t("status.session_status_title"));
      },
    });

    // ── /version ──────────────────────────────────────────────────────────────
    this.commands.set("/version", {
      get description() { return t("commands.version_desc"); },
      execute: () => {
        UI.info(`Co-Wrangler v${getVersion()}`);
      },
    });

    // ── /tools ────────────────────────────────────────────────────────────────
    this.commands.set("/tools", {
      get description() { return t("commands.tools_desc"); },
      execute: () => {
        const entries = Object.entries(TOOL_SCHEMAS).sort(([a], [b]) =>
          a.localeCompare(b),
        );
        const lines: string[] = [
          `  ${Theme.dim(t("status.tools_loaded", { n: String(entries.length) }))}\n`,
        ];
        entries.forEach(([name, schema]) =>
          lines.push(
            `  ${Theme.success(`• ${name.padEnd(22)}`)} ${Theme.dim(schema.description.split("\n")[0].slice(0, 58))}`,
          ),
        );
        UI.box(lines.join("\n"), t("status.available_tools_title"));
      },
    });

    // ── /skills ───────────────────────────────────────────────────────────────
    this.commands.set("/skills", {
      get description() { return t("commands.skills_desc"); },
      execute: (args: string[], ctx: CommandContext) => {
        const skills = ctx.skillManager.getAvailableSkills();
        if (!skills.length) {
          return UI.warn(t("status.no_skills"));
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
        UI.box(lines.join("\n"), t("status.skills_loaded_count", { n: String(skills.length) }));
      },
    });

    // ── /skill ────────────────────────────────────────────────────────────────
    this.commands.set("/skill", {
      get description() { return t("commands.skill_desc"); },
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

    // ── /language ─────────────────────────────────────────────────────────────
    this.commands.set("/language", {
      description: "Change the interface language (tr, en, fr, de, it, es).",
      execute: async (args: string[]) => {
        const LANGS: Record<string, string> = {
          en: "English", tr: "Türkçe", fr: "Français",
          de: "Deutsch", it: "Italiano", es: "Español",
        };
        // cowrangler /language tr  — direct set
        if (args[0] && LANGS[args[0]]) {
          const { saveLanguage } = await import("./setup.js");
          const { initI18n } = await import("../i18n/index.js");
          saveLanguage(args[0]);
          initI18n(args[0]);
          UI.success(`Language switched to ${LANGS[args[0]]}. Restart for full effect.`);
          return;
        }
        // /language with no arg — show picker hint (wizard needs terminal outside Ink)
        const options = Object.entries(LANGS)
          .map(([code, label]) => `    ${Theme.accent(code.padEnd(4))} ${Theme.dim(label)}`)
          .join("\n");
        UI.box(
          `  To change language run outside Co-Wrangler:\n\n    cowrangler language\n\n  Or set directly: /language <code>\n\n${options}`,
          "Interface Language",
        );
      },
    });

    // ── /model ────────────────────────────────────────────────────────────────
    this.commands.set("/model", {
      description:
        "/model → interactive picker  |  /model [list|current|add|set] — live switch without restart",
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

        // ── /key pool — credential pool yönetimi ─────────────────────────
        if (action === "pool") {
          const subAction = args[1]; // list | add | remove | reload

          if (!subAction || subAction === "list") {
            const pool = getCredentialPool();
            const statuses = pool.getStatus();
            if (statuses.length === 0) {
              return UI.info(
                "No credential pools configured.\n" +
                  "Add pool keys with: /key pool add <provider> <key>",
              );
            }
            const lines: string[] = [];
            for (const s of statuses) {
              const providerLine = `${Theme.accent.bold(s.provider.padEnd(14))} ${Theme.dim(`${s.total} key(s)`)} — ${Theme.success(`${s.healthy} healthy`)}${s.rateLimited > 0 ? Theme.fail(`, ${s.rateLimited} rate-limited`) : ""}`;
              lines.push(providerLine);
              for (const k of s.keys) {
                const now = Date.now();
                const statusIcon =
                  k.status === "healthy"
                    ? Theme.success("●")
                    : k.status === "rate_limited"
                      ? Theme.fail("●")
                      : Theme.main("●");
                const cooldownStr =
                  k.rateLimitedUntil && k.rateLimitedUntil > now
                    ? Theme.dim(
                        ` (ready in ${Math.ceil((k.rateLimitedUntil - now) / 1000)}s)`,
                      )
                    : "";
                const usageStr = Theme.dim(`uses:${k.useCount} errs:${k.errorCount}`);
                lines.push(
                  `  ${statusIcon} ${Theme.main(k.masked.padEnd(28))} ${usageStr}${cooldownStr}`,
                );
              }
            }
            return UI.box(lines.join("\n"), "Credential Pool");
          }

          if (subAction === "add" && args[2] && args[3]) {
            const provider = args[2].toLowerCase();
            const key = args[3];
            const pool = getCredentialPool();
            pool.addKey(provider, key);
            return UI.success(
              `Key added to pool for ${Theme.accent.bold(provider)} (${pool.keyCount(provider)} total).`,
            );
          }

          if (subAction === "remove" && args[2] && args[3]) {
            const provider = args[2].toLowerCase();
            const key = args[3];
            const pool = getCredentialPool();
            const removed = pool.removeKey(provider, key);
            if (removed) {
              return UI.success(`Key removed from ${Theme.accent.bold(provider)} pool.`);
            }
            return UI.warn(`Key not found in ${provider} pool.`);
          }

          if (subAction === "reload") {
            reloadCredentialPool();
            return UI.success("Credential pool reloaded from environment.");
          }

          return UI.error(
            "Usage:\n" +
              "  /key pool                       ← list all pool keys\n" +
              "  /key pool add <provider> <key>  ← add key to pool\n" +
              "  /key pool remove <provider> <key>\n" +
              "  /key pool reload                ← reload from ENV",
          );
        }

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
            "  /key delete <KEY_NAME>\n" +
            "  /key pool                ← manage credential pool (multi-key rotation)",
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

    // ── /sessions ─────────────────────────────────────────────────────────────
    this.commands.set("/sessions", {
      description: "List recent conversation sessions from the session database.",
      execute: async (args: string[], ctx: CommandContext) => {
        try {
          const { getSessionDB } = await import("../core/session_db.js");
          const db = getSessionDB();
          const limit = args[0] ? parseInt(args[0]) : 10;
          const sessions = db.listSessions({ limit });
          if (!sessions.length) return UI.info("No sessions recorded yet.");

          const lines = [`  ${Theme.dim(`${sessions.length} most recent sessions`)}\n`];
          for (const s of sessions) {
            const date = new Date(s.started_at).toLocaleString();
            const tokens = s.input_tokens + s.output_tokens;
            const title = s.title ?? "(untitled)";
            const model = s.model.split("/").pop() ?? s.model;
            lines.push(
              `  ${Theme.accent(s.id.slice(0, 8))}  ${Theme.dim(date)}`,
            );
            lines.push(
              `    ${Theme.success(model.padEnd(24))} ${Theme.dim(`${tokens.toLocaleString()} tokens · ${s.message_count} msgs`)}`,
            );
            lines.push(`    ${Theme.dim(title)}\n`);
          }
          UI.box(lines.join("\n"), "Session History");
        } catch (e: any) {
          UI.error(`Session DB error: ${e.message}`);
        }
      },
    });

    // ── /search ───────────────────────────────────────────────────────────────
    this.commands.set("/search", {
      description: "Full-text search across all session history. /search <query>",
      execute: async (args: string[], ctx: CommandContext) => {
        const query = args.join(" ").trim();
        if (!query) return UI.warn("Usage: /search <query>");

        try {
          const { getSessionDB } = await import("../core/session_db.js");
          const db = getSessionDB();
          const results = db.searchSessions(query, { limit: 15 });

          if (!results.length) {
            return UI.info(`No results found for: "${query}"`);
          }

          const lines = [`  ${Theme.dim(`${results.length} results for "${query}"`)}\n`];
          for (const r of results) {
            const date = new Date(r.timestamp).toLocaleString();
            const sessionInfo = r.session_title ?? r.session_id.slice(0, 8);
            lines.push(
              `  ${Theme.accent(`[${r.role}]`)} ${Theme.dim(date)} — ${Theme.main(sessionInfo)}`,
            );
            lines.push(`    ${Theme.dim(r.content_snippet.replace(/\n/g, " ").slice(0, 100))}\n`);
          }
          UI.box(lines.join("\n"), "Search Results");
        } catch (e: any) {
          UI.error(`Search error: ${e.message}`);
        }
      },
    });

    // ── /usage ────────────────────────────────────────────────────────────────
    this.commands.set("/usage", {
      description: "Show current session's token and cost summary.",
      execute: async (args: string[], ctx: CommandContext) => {
        try {
          const { getInsightsEngine } = await import("../core/insights.js");
          const { estimateCost } = await import("../core/model_metadata.js");
          const engine = getInsightsEngine();
          const snap = ctx.agent.getContextSnapshot();

          const costUsd = estimateCost(
            ctx.agent.llm.model,
            snap.sessionInputTokens,
            snap.sessionOutputTokens,
          );

          const summary = {
            sessionId: ctx.agent.currentSessionId ?? "current",
            model: ctx.agent.llm.model,
            inputTokens: snap.sessionInputTokens,
            outputTokens: snap.sessionOutputTokens,
            totalTokens: snap.sessionTotalTokens,
            toolCallCount: 0,
            estimatedCostUsd: costUsd,
            durationMs: snap.sessionDurationMs,
            compressionCount: snap.compressionCount,
          };

          console.log("\n" + engine.formatUsageSummary(summary));
        } catch (e: any) {
          UI.error(`Usage error: ${e.message}`);
        }
      },
    });

    // ── /insights ─────────────────────────────────────────────────────────────
    this.commands.set("/insights", {
      description: "Show usage analytics dashboard. /insights [days]",
      execute: async (args: string[], ctx: CommandContext) => {
        try {
          const { getInsightsEngine } = await import("../core/insights.js");
          const engine = getInsightsEngine();
          const days = args[0] ? parseInt(args[0]) : 7;
          const dashboard = engine.getDashboard(days);
          console.log("\n" + engine.formatDashboard(dashboard));
        } catch (e: any) {
          UI.error(`Insights error: ${e.message}`);
        }
      },
    });

    // ── /plugins ──────────────────────────────────────────────────────────────
    this.commands.set("/plugins", {
      description: "List loaded plugins and their status.",
      execute: async () => {
        try {
          const { getPluginManager } = await import("../core/plugins.js");
          const pm = getPluginManager();
          const plugins = pm.getPlugins();

          if (!plugins.length) {
            return UI.info(
              `No plugins loaded. Add to ~/.cowrangler/plugins/ or .cowrangler/plugins/\n  ${Theme.dim(pm.summary())}`,
            );
          }

          const lines = [`  ${Theme.dim(pm.summary())}\n`];
          for (const p of plugins) {
            const icon = p.active ? Theme.success("✓") : Theme.fail("✗");
            lines.push(
              `  ${icon} ${Theme.accent.bold(p.name.padEnd(20))} ${Theme.dim(`[${p.source}]`)}`,
            );
            if (p.error) lines.push(`    ${Theme.fail(p.error)}`);
          }
          UI.box(lines.join("\n"), "Plugins");
        } catch (e: any) {
          UI.error(`Plugin error: ${e.message}`);
        }
      },
    });

    // ── /mcp ──────────────────────────────────────────────────────────────────
    this.commands.set("/mcp", {
      description: "List connected MCP servers and their tools.",
      execute: async () => {
        try {
          const { getMCPManager } = await import("../core/mcp_client.js");
          const manager = getMCPManager();
          const statuses = manager.getStatuses();

          if (!statuses.length) {
            return UI.info(
              "No MCP servers configured.\n  Add mcp_servers to ~/.cowrangler/config.yaml",
            );
          }

          const lines = [`  ${Theme.dim(manager.summary())}\n`];
          for (const s of statuses) {
            const icon = s.connected ? Theme.success("✓") : Theme.fail("✗");
            lines.push(
              `  ${icon} ${Theme.accent.bold(s.name.padEnd(20))} ${Theme.dim(`[${s.type}]`)} ${Theme.main(`${s.toolCount} tools`)}`,
            );
            if (s.error) lines.push(`    ${Theme.fail(s.error)}`);
          }
          UI.box(lines.join("\n"), "MCP Servers");
        } catch (e: any) {
          UI.error(`MCP error: ${e.message}`);
        }
      },
    });

    // ── /curator ──────────────────────────────────────────────────────────────
    this.commands.set("/curator", {
      description: "Skill lifecycle management. /curator [status|archive <id>|restore <id>|pin <id>]",
      execute: async (args: string[], ctx: CommandContext) => {
        try {
          const { getCurator } = await import("../core/curator.js");
          const curator = getCurator();
          const action = args[0]?.toLowerCase() ?? "status";

          if (action === "status") {
            const report = curator.getStatus();
            const lines = [
              `  ${Theme.dim("Active:   ")} ${Theme.accent(String(report.active_count))}`,
              `  ${Theme.dim("Pinned:   ")} ${Theme.main(String(report.pinned_count))}`,
              `  ${Theme.dim("Archived: ")} ${Theme.dim(String(report.archived_count))}`,
            ];
            if (report.stale_candidates.length > 0) {
              lines.push(
                `\n  ${Theme.main("Stale candidates (agent-created, rarely used):")}`,
              );
              report.stale_candidates.forEach((id) =>
                lines.push(`    ${Theme.dim("• ")}${Theme.accent(id)}`),
              );
              lines.push(
                `\n  ${Theme.dim("Run ")}${Theme.accent("/curator archive <id>")}${Theme.dim(" to archive.")}`,
              );
            }
            UI.box(lines.join("\n"), "Skill Curator");

          } else if (action === "archive" && args[1]) {
            const ok = curator.archiveSkill(args[1]);
            ok ? UI.success(`Archived skill: ${args[1]}`) : UI.error(`Skill '${args[1]}' not found`);

          } else if (action === "restore" && args[1]) {
            const ok = curator.restoreSkill(args[1]);
            ok ? UI.success(`Restored skill: ${args[1]}`) : UI.error(`Skill '${args[1]}' not found in archive`);

          } else if (action === "pin" && args[1]) {
            curator.pinSkill(args[1]);
            UI.success(`Pinned skill: ${args[1]} (exempt from auto-archiving)`);

          } else if (action === "unpin" && args[1]) {
            curator.unpinSkill(args[1]);
            UI.success(`Unpinned skill: ${args[1]}`);

          } else {
            UI.info("Usage: /curator [status|archive <id>|restore <id>|pin <id>|unpin <id>]");
          }
        } catch (e: any) {
          UI.error(`Curator error: ${e.message}`);
        }
      },
    });

    // ── /profile ──────────────────────────────────────────────────────────────
    this.commands.set("/profile", {
      description: "Show active profile. cowrangler -p <name> to switch.",
      execute: async () => {
        const { getActiveProfile, listProfiles } = await import("../core/profile.js");
        const active = getActiveProfile();
        const profiles = listProfiles();

        const lines = [
          `  ${Theme.dim("Active: ")} ${active ? Theme.accent.bold(active) : Theme.dim("(default)")}`,
          ``,
          `  ${Theme.dim(`${profiles.length} profile(s) available:`)}`,
        ];
        for (const p of profiles) {
          const marker = p.name === active ? Theme.success("▶") : Theme.dim("•");
          lines.push(`  ${marker} ${Theme.accent(p.name)} ${Theme.dim(`model: ${p.model ?? "default"}`)}`);
        }
        if (!profiles.length) {
          lines.push(`  ${Theme.dim("None. Use: cowrangler profile create <name>")}`);
        }
        lines.push(
          `\n  ${Theme.dim("Switch with: ")}${Theme.accent("cowrangler -p <name>")}`,
        );
        UI.box(lines.join("\n"), "Profiles");
      },
    });

    // ── /skin ─────────────────────────────────────────────────────────────────
    this.commands.set("/skin", {
      description: "Switch visual skin. /skin [name] — list or apply. Built-in: default, mono, slate, matrix",
      execute: async (args: string[]) => {
        const { loadSkin, listSkins, getActiveSkinName, getActiveSkin } = await import("../core/skin.js");

        const name = args[0];

        // Listeleme modu
        if (!name) {
          const active = getActiveSkinName();
          const all = listSkins();
          const skin = getActiveSkin();
          const lines = [
            `  ${Theme.dim("Active: ")} ${Theme.accent.bold(active)} ${Theme.dim(skin.description ? `— ${skin.description}` : "")}`,
            ``,
            `  ${Theme.dim("Available skins:")}`,
          ];
          for (const s of all) {
            const marker = s === active ? Theme.success("▶") : Theme.dim("•");
            lines.push(`  ${marker} ${Theme.accent(s)}`);
          }
          lines.push(
            ``,
            `  ${Theme.dim("Custom skins: ")}${Theme.dim("~/.cowrangler/skins/<name>.yaml")}`,
            `  ${Theme.dim("Apply: ")}${Theme.accent("/skin <name>")}`,
          );
          UI.box(lines.join("\n"), "Skins");
          return;
        }

        // Uygula
        const result = loadSkin(name);
        if (result.ok) {
          const skin = getActiveSkin();
          UI.success(`Skin '${name}' applied${skin.description ? ` — ${skin.description}` : ""}. Restart for full effect.`);
        } else {
          UI.error(result.error ?? "Unknown error");
        }
      },
    });

    // ── /logs ─────────────────────────────────────────────────────────────────
    this.commands.set("/logs", {
      description: "Show recent log entries. /logs [agent|errors|gateway|cron] [lines]",
      execute: async (args: string[]) => {
        const { getLogger } = await import("../core/logger.js");
        const validChannels = ["agent", "errors", "gateway", "cron", "kanban"] as const;
        type Chan = typeof validChannels[number];

        const channelArg = args[0] as Chan | undefined;
        const linesArg   = parseInt(args[1] ?? args[0] ?? "30", 10);
        const channel: Chan = validChannels.includes(channelArg as Chan) ? channelArg as Chan : "agent";
        const lines = isNaN(linesArg) || linesArg <= 0 ? 30 : Math.min(linesArg, 500);

        const log = getLogger();
        const entries = log.tail(channel, lines);

        if (!entries.length) {
          UI.info(`No entries in ${channel}.log yet.`);
          return;
        }

        // Renklendirme: ERROR → kırmızı, WARN → sarı, INFO → normal, DEBUG → dim
        const coloured = entries.map((line) => {
          if (line.includes("[ERROR]")) return Theme.fail(line);
          if (line.includes("[WARN ]")) return Theme.main(line);
          if (line.includes("[DEBUG]")) return Theme.dim(line);
          return Theme.dim(line.slice(0, 32)) + line.slice(32);
        });

        const stats = log.stats();
        const size  = stats[channel]?.sizeBytes ?? 0;
        const header = `${channel}.log — ${entries.length} entries (${(size / 1024).toFixed(1)} KB)`;
        UI.box(coloured.join("\n"), header);
      },
    });

    // ── /trajectory ───────────────────────────────────────────────────────────
    this.commands.set("/trajectory", {
      description: "Record conversation trajectory: /trajectory [start|stop|status]",
      execute: async (args: string[], ctx: CommandContext) => {
        const { TrajectoryRecorder } = await import("../core/trajectory.js");
        const action = args[0] ?? "status";

        if (action === "start") {
          if (ctx.agent.trajectoryRecorder) {
            return UI.warn("Trajectory recording already active.");
          }
          ctx.agent.trajectoryRecorder = new TrajectoryRecorder(
            null,
            ctx.agent.llm.model,
            "cli",
          );
          return UI.success("Trajectory recording started.");
        }

        if (action === "stop") {
          if (!ctx.agent.trajectoryRecorder) {
            return UI.warn("No active trajectory recording.");
          }
          const recorder = ctx.agent.trajectoryRecorder;
          const savedPath = args[1] ? recorder.save(args[1]) : recorder.save();
          ctx.agent.trajectoryRecorder = null;
          return UI.success(
            `Trajectory saved: ${Theme.accent(savedPath)} (${recorder.turnCount} turn(s))`,
          );
        }

        if (action === "status") {
          if (!ctx.agent.trajectoryRecorder) {
            return UI.info("No active trajectory recording. Use /trajectory start to begin.");
          }
          return UI.info(
            `Recording active — ${ctx.agent.trajectoryRecorder.turnCount} turn(s) so far.`,
          );
        }

        UI.error(
          "Usage:\n" +
            "  /trajectory start          ← begin recording\n" +
            "  /trajectory stop [file]    ← save to file (default: ~/.cowrangler/trajectories/)\n" +
            "  /trajectory status         ← show recording status",
        );
      },
    });

    // ── /todo ─────────────────────────────────────────────────────────────────
    this.commands.set("/todo", {
      description: "Show the agent's active session task list (.cowrangler/tasks.json)",
      execute: () => {
        const tasksPath = DIRS.local.tasks;
        if (!fs.existsSync(tasksPath)) {
          return UI.info("No active task list. The agent creates one automatically for multi-step tasks.");
        }
        try {
          const raw = fs.readFileSync(tasksPath, "utf-8").trim();
          if (!raw) return UI.info("Task list is empty.");
          const store = JSON.parse(raw);
          const tasks: any[] = store.tasks ?? [];
          if (tasks.length === 0) return UI.info("Task list is empty.");
          const STATUS_ICON: Record<string, string> = { todo: "○", in_progress: "◉", done: "✓", blocked: "✗" };
          const lines = tasks.map((t: any) => {
            const icon = STATUS_ICON[t.status] ?? "?";
            const dim = t.status === "done";
            const line = `  ${icon}  ${t.index}. ${t.title}${t.priority === "high" ? " [HIGH]" : ""}`;
            return dim ? Theme.dim(line) : (t.status === "in_progress" ? Theme.accent(line) : Theme.main(line));
          });
          const active = tasks.filter((t: any) => ["todo","in_progress"].includes(t.status)).length;
          lines.push("", Theme.dim(`  Active: ${active}  Total: ${tasks.length}`));
          UI.box(lines.join("\n"), "Session Tasks");
        } catch {
          return UI.info("Could not read task list.");
        }
      },
    });
  }
}
