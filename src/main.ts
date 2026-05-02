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
  console.log("Co-Wrangler v1.1.0");
  process.exit(0);
}
if (args.includes("--help") || args.includes("-h")) {
  console.log([
    "",
    chalk.hex("#FF4C00").bold("  Co-Wrangler v1.1.0") + chalk.dim(" — Personal AI Agent for the terminal"),
    "",
    chalk.bold("  Usage:"),
    "    cowrangler              Start the interactive REPL",
    "    cowrangler --version    Print version",
    "    cowrangler --help       Show this help",
    "",
    chalk.bold("  In-session commands:"),
    "    /help      All commands          /skills    List skills (SOPs)",
    "    /model     Switch AI model       /key       Manage API keys",
    "    /tools     List capabilities     /status    Session info",
    "    /memory    Project memory        /reset     Clear context",
    "",
    chalk.bold("  Configuration:"),
    `    Global config: ~/.cowrangler/config.yaml`,
    `    Global keys:   ~/.cowrangler/credentials.env`,
    `    Project config: .cowrangler/config.yaml`,
    `    Project memory: .cowrangler/memory.md`,
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

// ── Environment & tool registration ───────────────────────────────────────
import {
  initEnvironment,
  getConfig,
  loadEnvironmentVariables,
  PROJECT_ROOT,
} from "./core/init.js";

loadEnvironmentVariables();

import { Agent } from "./core/agent.js";
import { LLM } from "./core/llm.js";
import { runCLI } from "./ui/cli.js";
import { setWorkspace } from "./tools/file_tools.js";

// Import side-effect registrations
import "./tools/system_tools.js";
import "./tools/git_tools.js";
import "./tools/file_tools.js";
import "./tools/web_tools.js";
import "./tools/skill_tools.js";
import "./tools/dev_tools.js";

async function main() {
  initEnvironment();
  const configuration = getConfig();
  setWorkspace(PROJECT_ROOT);

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

  await runCLI(agent);
}

main().catch((err) => {
  console.error(chalk.red("\n  ✗ STARTUP ERROR:"));
  console.log(util.inspect(err, { depth: null, colors: true }));
  process.exit(1);
});
