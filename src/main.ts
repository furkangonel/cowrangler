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

// Artık standart dotenv yerine kendi özel loader'ımızı kullanıyoruz
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

  const llm = new LLM(configuration.model, configuration.temperature);
  const agent = new Agent(
    llm,
    configuration.system_prompt || "You are Naut.",
    configuration.max_iterations,
  );

  if (!process.env.OPENROUTER_API_KEY) {
    console.log(
      chalk.yellow(
        `\n  ⚠ UYARI: OPENROUTER_API_KEY bulunamadı!\n  Sistemi kullanmaya başlamadan önce terminale '/key OPENROUTER_API_KEY anahtariniz' yazarak global sisteme kaydedin.\n`,
      ),
    );
  }

  await runCLI(agent);
}

main().catch((err) => {
  console.error(chalk.red("\n MAIN ERROR:"));
  console.log(util.inspect(err, { depth: null, colors: true }));
  process.exit(1);
});
