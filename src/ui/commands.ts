import fs from "fs";
import yaml from "js-yaml";
import { Agent } from "../core/agent.js";
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
  private commands = new Map<string, any>();

  constructor() {
    this.registerCoreCommands();
  }

  public getCommandNames(): string[] {
    return Array.from(this.commands.keys());
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
    return false;
  }

  private registerCoreCommands() {
    this.commands.set("/exit", {
      description: "Safely exit the workspace.",
      execute: () => {
        UI.warn("Terminating session...");
        process.exit(0);
      },
    });

    this.commands.set("/reset", {
      description: "Clear the agent's conversation history and memory.",
      execute: (args: string[], ctx: CommandContext) => {
        ctx.agent.reset();
        UI.success("Context flushed successfully.");
      },
    });

    this.commands.set("/tools", {
      description: "List all available system tools (Capabilities).",
      execute: () => {
        const tools = Object.entries(TOOL_SCHEMAS).map(
          ([n, s]) =>
            `  ${Theme.success(`• ${n.padEnd(20)}`)} ${Theme.dim(`→ ${s.description.split("\n")[0]}`)}`,
        );
        UI.box(tools.join("\n"), "System Capabilities");
      },
    });

    this.commands.set("/skills", {
      description:
        "List all loaded Standard Operating Procedures (SOP/Skills).",
      execute: (args: string[], ctx: CommandContext) => {
        const skills = ctx.skillManager.getAvailableSkills();
        if (skills.length === 0) return UI.info("No skills (SOPs) loaded yet.");

        const content = skills
          .map(
            (s) =>
              `  ${Theme.success(`• ${s.id.padEnd(20)}`)} ${Theme.dim(`→ ${s.description} [${s.source}]`)}`,
          )
          .join("\n");

        const usageTip = `\n\n${Theme.main("💡 How to use:")}\n${Theme.dim("• Run immediately:  ")} ${Theme.accent("/skill <id> <your task>")}\n${Theme.dim("• Stage for later:  ")} ${Theme.accent("/skill <id>")} ${Theme.dim("(Press Enter)")}\n${Theme.dim("• Autocomplete:     ")} ${Theme.accent("Type /sk and press TAB")}`;

        UI.box(content + usageTip, "Loaded Skills (SOPs)");
      },
    });

    this.commands.set("/skill", {
      description: "Force the agent to use a specific skill for the task.",
      execute: async (args: string[], ctx: CommandContext) => {
        if (args.length === 0) {
          return UI.error("Usage: /skill <skill_id> <task>");
        }

        const rawId = args[0].replace(/^\/+/, "");
        const remainder = args.slice(1).join(" ");
        const available = ctx.skillManager
          .getAvailableSkills()
          .map((s) => s.id);

        if (!available.includes(rawId)) {
          return UI.error(
            `Skill '${rawId}' not found. Type /skills to see the list.`,
          );
        }

        if (!remainder) {
          console.log(
            `\n  ${Theme.main("⚡ SKILL STAGED:")} ${Theme.accent.bold(rawId)}\n  ${Theme.dim("This SOP will be strictly enforced on your next prompt.")}\n`,
          );
        } else {
          console.log(
            `\n  ${Theme.success("✓ SOP ENFORCED:")} ${Theme.accent.bold(rawId)}\n  ${Theme.dim("Executing task with specialized skill context...")}\n`,
          );
          const directive = `${remainder}\n\n[SYSTEM DIRECTIVE: Utilize the 'utilize_skill' tool to read '${rawId}' before starting the task.]`;
          await ctx.executeAgentDirective(directive);
        }
      },
    });

    this.commands.set("/model", {
      description: "Manage AI engine (/model add|list|set)",
      execute: (args: string[], ctx: CommandContext) => {
        const action = args[0];

        // Read global settings for registered models
        let globalConfig: any = {};
        if (fs.existsSync(DIRS.global.config)) {
          globalConfig =
            yaml.load(fs.readFileSync(DIRS.global.config, "utf-8")) || {};
        }
        if (!globalConfig.saved_models) globalConfig.saved_models = [];

        // 1. LIST MODELS
        if (action === "list") {
          if (globalConfig.saved_models.length === 0) {
            return UI.warn(
              "No models are currently set. Use '/model add <name>' to add one.",
            );
          }
          const listText = globalConfig.saved_models
            .map((m: string) => `  ${Theme.success(`• ${m}`)}`)
            .join("\n");
          return UI.box(listText, "Registered AI Models");
        }

        // 2. ADD NEW MODEL
        if (action === "add" && args[1]) {
          const newModel = args[1];
          if (globalConfig.saved_models.includes(newModel)) {
            return UI.info(`Model '${newModel}' is already registered.`);
          }
          globalConfig.saved_models.push(newModel);
          fs.writeFileSync(DIRS.global.config, yaml.dump(globalConfig));
          return UI.success(`Model '${newModel}' added to registry.`);
        }

        // 3. SET ACTIVE MODEL
        if (action === "set" && args[1]) {
          const targetModel = args[1];
          const scope = args[2] === "global" ? "global" : "local"; // Default to local

          if (!globalConfig.saved_models.includes(targetModel)) {
            return UI.error(
              `Model '${targetModel}' not found in registry. First use: /model add ${targetModel}`,
            );
          }

          if (scope === "global") {
            globalConfig.model = targetModel;
            fs.writeFileSync(DIRS.global.config, yaml.dump(globalConfig));
            UI.success(`Global default engine switched to: ${targetModel}`);
          } else {
            let localConfig: any = {};
            if (fs.existsSync(DIRS.local.config)) {
              localConfig =
                yaml.load(fs.readFileSync(DIRS.local.config, "utf-8")) || {};
            }
            localConfig.model = targetModel;
            fs.writeFileSync(DIRS.local.config, yaml.dump(localConfig));
            UI.success(`Local project engine switched to: ${targetModel}`);
          }
          ctx.agent.llm.model = targetModel;
          return;
        }

        UI.error(
          "Usage:\n  /model list\n  /model add <model_name>\n  /model set <model_name> [global|local]",
        );
      },
    });

    this.commands.set("/key", {
      description: "Manage global API keys (/key set|list)",
      execute: (args: string[], ctx: CommandContext) => {
        const action = args[0];

        // 1. LIST KEYS (Safely masked)
        if (action === "list") {
          if (!fs.existsSync(DIRS.global.credentials)) {
            return UI.warn(
              "No global API keys found. ~/.cowrangler/credentials.env is empty.",
            );
          }

          const envContent = fs.readFileSync(DIRS.global.credentials, "utf-8");
          const keys = envContent
            .split("\n")
            .filter((line) => line.includes("="));

          if (keys.length === 0)
            return UI.info("No API keys are currently set.");

          let listText = `${Theme.main("Global Vault (~/.cowrangler/credentials.env):")}\n`;
          keys.forEach((line) => {
            const [provider, key] = line.split("=");
            // Mask the key for security (show only first 6 and last 4)
            const maskedKey =
              key.length > 10
                ? `${key.substring(0, 6)}••••••••••••${key.substring(key.length - 4)}`
                : "••••••••";
            listText += `  ${Theme.success(`• ${provider.padEnd(25)}`)} ${Theme.dim(`→ ${maskedKey}`)}\n`;
          });

          return UI.box(listText.trim(), "Credential Vault");
        }

        // 2. SET/UPDATE KEY
        if (action === "set") {
          if (args.length < 3)
            return UI.error("Usage: /key set <PROVIDER_NAME> <YOUR_KEY>");

          const provider = args[1].toUpperCase();
          const key = args[2];

          // Save to current session environment
          process.env[provider] = key;

          // Update or append to the credentials file
          let envContent = fs.existsSync(DIRS.global.credentials)
            ? fs.readFileSync(DIRS.global.credentials, "utf-8")
            : "";

          const regex = new RegExp(`^${provider}=.*`, "m");
          if (regex.test(envContent)) {
            envContent = envContent.replace(regex, `${provider}=${key}`);
          } else {
            envContent += `\n${provider}=${key}`;
          }

          fs.writeFileSync(
            DIRS.global.credentials,
            envContent.trim() + "\n",
            "utf-8",
          );
          return UI.success(`API Key securely saved for ${provider}!`);
        }

        UI.error("Usage:\n  /key list\n  /key set <PROVIDER_NAME> <YOUR_KEY>");
      },
    });

    this.commands.set("/help", {
      description: "Display this help menu and command list.",
      execute: () => {
        const helpText = Array.from(this.commands.entries())
          .map(([cmd, data]) => {
            return `  ${Theme.accent.bold(cmd.padEnd(20))} ${Theme.dim(`→ ${data.description}`)}`;
          })
          .join("\n");
        UI.box(helpText, "Co-Wrangler User Manual");
      },
    });
  }
}
