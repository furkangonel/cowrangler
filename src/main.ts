#!/usr/bin/env node
import util from "util";
import chalk from "chalk";

process.on("unhandledRejection", (reason: any) => {
  console.error(chalk.red("\n UNHANDLED REJECTION:"));
  console.log(util.inspect(reason, { depth: null, colors: true }));
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error(chalk.red("\n UNCAUGHT EXCEPTION:"));
  console.log(util.inspect(err, { depth: null, colors: true }));
  process.exit(1);
});

// Using our custom environment loader instead of standard dotenv
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

  // Smart Key and Model Check
  try {
    llm = new LLM(configuration.model, configuration.temperature);
  } catch (e: any) {
    if (e.message.startsWith("MISSING_KEY:")) {
      const missingKey = e.message.split(":")[1];
      console.log(chalk.red(`\n  🚨 ACCESS DENIED: Missing API Key!`));
      console.log(
        chalk.yellow(
          `  The selected model (${configuration.model}) requires a valid ${missingKey}.`,
        ),
      );
      console.log(
        chalk.dim(
          `  SOLUTION: Type '/key set ${missingKey} <your_key>' in the CLI to securely save it.\n`,
        ),
      );
      process.exit(1);
    }

    if (e.message.startsWith("UNSUPPORTED_MODEL:")) {
      console.log(chalk.red(`\n  🚨 ERROR: Unrecognized model format!`));
      console.log(
        chalk.yellow(
          `  '${configuration.model}' does not match any supported provider prefixes.`,
        ),
      );
      console.log(
        chalk.dim(
          `  Supported prefixes: openrouter/*, gpt-*, claude-*, gemini-*, groq/*\n`,
        ),
      );
      process.exit(1);
    }

    throw e; // Throw if it is an unknown error
  }

  const agent = new Agent(
    llm,
    configuration.system_prompt || "You are Co-Wrangler.",
    configuration.max_iterations,
  );

  await runCLI(agent);
}

main().catch((err) => {
  console.error(chalk.red("\n MAIN ERROR:"));
  console.log(util.inspect(err, { depth: null, colors: true }));
  process.exit(1);
});
