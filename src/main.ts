#!/usr/bin/env node
import util from "util";
import chalk from "chalk";

// ── Global error handlers ──────────────────────────────────────────────────
process.on("unhandledRejection", (reason: any) => {
  console.error(chalk.red("\n  ✗ UNHANDLED REJECTION:"));
  console.log(util.inspect(reason, { depth: null, colors: true }));
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  console.error(chalk.red("\n  ✗ UNCAUGHT EXCEPTION:"));
  console.log(util.inspect(err, { depth: null, colors: true }));
  process.exit(1);
});

// ── CLI flags ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.includes("--version") || args.includes("-v")) {
  console.log("Co-Wrangler v1.1.1");
  process.exit(0);
}
if (args.includes("--help") || args.includes("-h")) {
  console.log(
    [
      "",
      chalk.hex("#FF4C00").bold("  Co-Wrangler v1.2.0") +
        chalk.dim(" — Enterprise AI Agent for the terminal"),
      "",
      chalk.bold("  Usage:"),
      "    cowrangler                     Start the interactive REPL",
      "    cowrangler setup               Interactive provider setup wizard",
      "    cowrangler --brief             Start in brief view (clean, tool-free output)",
      "    cowrangler --verbose           Start in transcript view (full debug output)",
      "    cowrangler --no-sandbox        Disable sandbox protection (not recommended)",
      "    cowrangler --permission <mode> Set permission mode (default/plan/auto/bypass)",
      "    cowrangler --version           Print version",
      "    cowrangler --help              Show this help",
      "",
      chalk.bold("  First time? Run the setup wizard:"),
      "    cowrangler setup",
      "",
      chalk.bold("  In-session commands:"),
      "    /help        All commands          /skills      List skills (SOPs)",
      "    /model       Switch AI model       /key         Manage API keys",
      "    /setup       Provider guide        /status      Session info",
      "    /tools       List capabilities     /reset       Clear context",
      "    /memory      Project memory        /mode        Switch view mode",
      "    /agents      List sub-agents       /permissions Permission mode",
      "    /sandbox     Sandbox settings      /context     Context size",
      "    /init        AI project scan",
      "",
      chalk.bold("  View modes (Ctrl+O cycles):"),
      "    brief       → Tools are hidden, only agent messages are shown",
      "    default     → Tools are shown with ⎿ prefix (default)",
      "    transcript  → Raw tool calls + full details",
      "",
      chalk.bold("  Built-in sub-agents:"),
      "    explore, plan, code-reviewer, verify, refactor,",
      "    test-writer, documentation, security-audit, debugger,",
      "    performance, migration-planner",
      "",
      chalk.bold("  Configuration:"),
      `    Global config:  ~/.cowrangler/config.yaml`,
      `    Global keys:    ~/.cowrangler/credentials.env`,
      `    Project config: .cowrangler/config.yaml`,
      `    Project memory: .cowrangler/memory.md`,
      `    Custom agents:  .cowrangler/agents/  or  ~/.cowrangler/agents/`,
      `    Custom skills:  .cowrangler/skills/  or  ~/.cowrangler/skills/`,
      "",
      chalk.bold("  Supported providers:"),
      "    Anthropic   (claude-*)               → ANTHROPIC_API_KEY",
      "    OpenAI      (gpt-*, o1-*, o3-*)      → OPENAI_API_KEY",
      "    Google      (gemini-*)               → GOOGLE_GENERATIVE_AI_API_KEY",
      "    Vertex AI   (vertex/*)               → GCP Project + gcloud auth",
      "    GitHub Copilot (copilot/*)           → GITHUB_TOKEN",
      "    Groq        (groq/*)                 → GROQ_API_KEY",
      "    OpenRouter  (openrouter/* or x/y)    → OPENROUTER_API_KEY",
      "",
      chalk.dim("  https://github.com/furkangonel/co-wrangler"),
      "",
    ].join("\n"),
  );
  process.exit(0);
}

// ── cowrangler setup — interactive provider setup wizard ─────────────
if (args[0] === "setup") {
  // Env loading required (init + credentials) but REPL is not started
  const { initEnvironment, loadEnvironmentVariables } =
    await import("./core/init.js");
  initEnvironment();
  loadEnvironmentVariables();
  const { runSetupWizard } = await import("./ui/setup.js");
  await runSetupWizard();
  process.exit(0);
}

// ── Flag parsing ──────────────────────────────────────────────────────────
const FLAG_BRIEF = args.includes("--brief");
const FLAG_VERBOSE = args.includes("--verbose");
const FLAG_NO_SANDBOX = args.includes("--no-sandbox");
const FLAG_PERMISSION_IDX = args.indexOf("--permission");
const FLAG_PERMISSION_MODE: string | null =
  FLAG_PERMISSION_IDX >= 0 ? (args[FLAG_PERMISSION_IDX + 1] ?? null) : null;

// ── Environment & tool registration ───────────────────────────────────────
import {
  initEnvironment,
  getConfig,
  loadEnvironmentVariables,
  PROJECT_ROOT,
} from "./core/init.js";

loadEnvironmentVariables();

import path from "path";
import { Agent } from "./core/agent.js";
import { LLM } from "./core/llm.js";
import { runCLI } from "./ui/cli.js";
import { setWorkspace } from "./tools/file_tools.js";
import { configureSandbox } from "./core/sandbox.js";

// Import side-effect registrations (including BriefTool)
import "./tools/system_tools.js";
import "./tools/git_tools.js";
import "./tools/file_tools.js";
import "./tools/web_tools.js";
import "./tools/skill_tools.js";
import "./tools/dev_tools.js";
import "./tools/brief_tool.js";

async function main() {
  initEnvironment();
  const configuration = getConfig();
  setWorkspace(PROJECT_ROOT);

  // ── Sandbox configuration ──────────────────────────────────────────────
  const sandboxEnabled =
    !FLAG_NO_SANDBOX && (configuration.sandbox?.enabled ?? true);
  configureSandbox({
    enabled: sandboxEnabled,
    workspaceRoot: PROJECT_ROOT,
    maxOutputBytes: 512 * 1024,
    maxTimeoutMs: configuration.sandbox?.max_timeout_ms ?? 30000,
    networkRestricted: configuration.sandbox?.network_restricted ?? false,
    auditLogPath: configuration.sandbox?.audit_log
      ? path.join(PROJECT_ROOT, ".cowrangler", "audit.log")
      : undefined,
  });

  let llm: LLM;

  try {
    llm = new LLM(configuration.model, configuration.temperature);
  } catch (e: any) {
    if (e.message.startsWith("MISSING_KEY:")) {
      const missingKey = e.message.split(":")[1];
      const { missingKeyHint, runSetupWizard } = await import("./ui/setup.js");
      console.log("\n" + chalk.red(`  ✗ Missing configuration: ${missingKey}`));
      console.log(
        chalk.yellow(
          `  Selected model (${configuration.model}) requires this configuration.\n`,
        ),
      );
      console.log(
        chalk.dim(
          missingKeyHint(missingKey)
            .split("\n")
            .map((l) => "  " + l)
            .join("\n"),
        ),
      );
      console.log();

      // Offer to start interactive wizard
      const { confirm, isCancel } = await import("@clack/prompts");
      const doSetup = await confirm({
        message: "Do you want to start the setup wizard now?",
        initialValue: true,
      });

      if (!isCancel(doSetup) && doSetup) {
        const newModel = await runSetupWizard();
        if (newModel) {
          // Setup complete — env is now updated, retry
          llm = new LLM(newModel, configuration.temperature);
          configuration.model = newModel;
        } else {
          process.exit(0);
        }
      } else {
        console.log(
          chalk.dim(
            "\n  Exiting. Run \`cowrangler setup\` when you are ready.\n",
          ),
        );
        process.exit(1);
      }
    } else if (e.message.startsWith("UNSUPPORTED_MODEL:")) {
      console.log(
        "\n" + chalk.red(`  ✗ Unrecognized model: ${configuration.model}`),
      );
      console.log(
        chalk.dim("  Supported prefixes: claude-*, gpt-*, gemini-*, vertex/*,"),
      );
      console.log(
        chalk.dim(
          "                        copilot/*, groq/*, openrouter/*, provider/model",
        ),
      );
      console.log(
        chalk.dim(
          "  To fix: edit ~/.cowrangler/config.yaml or run cowrangler setup\n",
        ),
      );
      process.exit(1);
    } else {
      throw e;
    }
  }

  const agent = new Agent(
    llm,
    configuration.system_prompt,
    configuration.max_iterations,
  );

  // ── Set view mode and permission mode from CLI flags ──────────────
  if (FLAG_BRIEF) {
    agent.viewMode = "brief";
  } else if (FLAG_VERBOSE) {
    agent.viewMode = "transcript";
  } else {
    agent.viewMode = (configuration.view_mode ?? "default") as
      | "brief"
      | "default"
      | "transcript";
  }

  // Permission mode log
  const permMode =
    FLAG_PERMISSION_MODE ?? configuration.permission_mode ?? "default";
  if (permMode === "bypass") {
    console.log(
      chalk.hex("#FF9500")(
        "\n  ⚠ bypass mode active — security checks are disabled\n",
      ),
    );
  }

  await runCLI(agent);
}

main().catch((err) => {
  console.error(chalk.red("\n  ✗ STARTUP ERROR:"));
  console.log(util.inspect(err, { depth: null, colors: true }));
  process.exit(1);
});
