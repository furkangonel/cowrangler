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
  console.log("Co-Wrangler v1.2.0");
  process.exit(0);
}
if (args.includes("--help") || args.includes("-h")) {
  console.log([
    "",
    chalk.hex("#FF4C00").bold("  Co-Wrangler v1.2.0") + chalk.dim(" — Enterprise AI Agent for the terminal"),
    "",
    chalk.bold("  Usage:"),
    "    cowrangler                      Start the interactive REPL",
    "    cowrangler --brief              Start in brief view (clean, tool-free output)",
    "    cowrangler --verbose            Start in transcript view (full debug output)",
    "    cowrangler --no-sandbox         Disable sandbox protection (not recommended)",
    "    cowrangler --permission <mode>  Set permission mode (default/plan/auto/bypass)",
    "    cowrangler --version            Print version",
    "    cowrangler --help               Show this help",
    "",
    chalk.bold("  In-session commands:"),
    "    /help        All commands          /skills      List skills (SOPs)",
    "    /model       Switch AI model       /key         Manage API keys",
    "    /tools       List capabilities     /status      Session info",
    "    /memory      Project memory        /reset       Clear context",
    "    /agents      List sub-agents       /mode        Switch view mode",
    "    /sandbox     Sandbox settings      /permissions Permission mode",
    "    /init        AI project scan       /context     Context size",
    "",
    chalk.bold("  View modes (Ctrl+O cycles):"),
    "    brief       → Tool'lar gizlenir, sadece agent mesajları görünür",
    "    default     → Tool'lar ⎿ prefix ile gösterilir (varsayılan)",
    "    transcript  → Ham tool çağrıları + tüm detaylar",
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
    "    Anthropic (claude-*), OpenAI (gpt-*), Google (gemini-*),",
    "    OpenRouter (openrouter/*), Groq (groq/*)",
    "",
    chalk.dim("  https://github.com/furkangonel/co-wrangler"),
    "",
  ].join("\n"));
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

// Import side-effect registrations (BriefTool dahil)
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

  // ── Sandbox konfigürasyonu ─────────────────────────────────────────────
  const sandboxEnabled = !FLAG_NO_SANDBOX && (configuration.sandbox?.enabled ?? true);
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
      console.log("\n" + chalk.red(`  ✗ Missing API key: ${missingKey}`));
      console.log(chalk.yellow(`  The selected model (${configuration.model}) requires this key.`));
      console.log(chalk.dim(`  Fix: start cowrangler anyway with a model that works,`));
      console.log(chalk.dim(`       then run: /key set ${missingKey} <your_key>`));
      console.log(chalk.dim(`       or add it to: ~/.cowrangler/credentials.env\n`));
      process.exit(1);
    }
    if (e.message.startsWith("UNSUPPORTED_MODEL:")) {
      console.log("\n" + chalk.red(`  ✗ Unrecognized model: ${configuration.model}`));
      console.log(chalk.dim(`  Supported prefixes: claude-*, gpt-*, gemini-*, openrouter/*, groq/*`));
      console.log(chalk.dim(`  Edit ~/.cowrangler/config.yaml to set a valid model.\n`));
      process.exit(1);
    }
    throw e;
  }

  const agent = new Agent(
    llm,
    configuration.system_prompt,
    configuration.max_iterations,
  );

  // ── CLI flag'lerinden view mode ve permission mode ayarla ──────────────
  if (FLAG_BRIEF) {
    agent.viewMode = "brief";
  } else if (FLAG_VERBOSE) {
    agent.viewMode = "transcript";
  } else {
    agent.viewMode = (configuration.view_mode ?? "default") as "brief" | "default" | "transcript";
  }

  // Permission mode log
  const permMode = FLAG_PERMISSION_MODE ?? configuration.permission_mode ?? "default";
  if (permMode === "bypass") {
    console.log(chalk.hex("#FF9500")("\n  ⚠ bypass mode aktif — güvenlik kontrolleri devre dışı\n"));
  }

  await runCLI(agent);
}

main().catch((err) => {
  console.error(chalk.red("\n  ✗ STARTUP ERROR:"));
  console.log(util.inspect(err, { depth: null, colors: true }));
  process.exit(1);
});
