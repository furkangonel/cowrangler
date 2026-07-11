#!/usr/bin/env node
import util from "util";
import chalk from "chalk";

// ── Global error handlers ──────────────────────────────────────────────────
process.on("unhandledRejection", (reason: any) => {
  console.error(chalk.red("\n  ✗ UNHANDLED REJECTION:"));
  console.log(util.inspect(reason, { depth: null, colors: true }));
  // Log dosyalarını kapat
  try {
    require("@cowrangler/core/logger.js").closeLogger?.();
  } catch {
    /* yok say */
  }
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  console.error(chalk.red("\n  ✗ UNCAUGHT EXCEPTION:"));
  console.log(util.inspect(err, { depth: null, colors: true }));
  try {
    require("@cowrangler/core/logger.js").closeLogger?.();
  } catch {
    /* yok say */
  }
  process.exit(1);
});
process.on("SIGTERM", () => {
  try {
    require("@cowrangler/core/logger.js").closeLogger?.();
  } catch {
    /* yok say */
  }
  process.exit(0);
});

// ── CLI flags ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.includes("--version") || args.includes("-v")) {
  const { getVersion: gv } = await import("@cowrangler/core/init.js");
  console.log(`Cowrangler v${gv()}`);
  process.exit(0);
}
if (args.includes("--help") || args.includes("-h")) {
  console.log(
    [
      "",
      chalk.hex("#FF4C00").bold(`  Cowrangler v${getVersion()}`) +
        chalk.dim(" — Enterprise AI Agent for the terminal"),
      "",
      chalk.bold("  Usage:"),
      "    cowrangler                     Start the interactive REPL",
      "    cowrangler setup               Interactive provider setup wizard",
      "    cowrangler model               Interactive model picker (arrow keys)",
      "    cowrangler mcp browse          MCP marketplace — browse & install servers",
      "    cowrangler mcp add             Add an MCP server (interactive wizard)",
      "    cowrangler mcp list            List configured MCP servers",
      "    cowrangler cron list           List scheduled jobs",
      "    cowrangler cron create         Create a scheduled job",
      "    cowrangler cron daemon         Start the cron scheduler daemon",
      "    cowrangler serve               Run the agent as an HTTP service (--port, --token)",
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
      "    /sessions    Session history       /search      Full-text search",
      "    /usage       Token & cost stats    /insights    Analytics dashboard",
      "    /curator     Skill lifecycle       /mcp         MCP server status",
      "    /terse       Token-efficient output",
      "    /plan /act   Plan (read-only)/act  /undo        Revert last file change",
      "    /goal        Autonomous goal mode  /recipe      Run a workflow recipe",
      "    /copy        Copy last response    /checkpoints File change history",
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
      "    Mistral/DeepSeek/xAI/Together/Cerebras/Fireworks (prefix/*) → <PROVIDER>_API_KEY",
      "    Local       (ollama/*, lmstudio/*, local/*) → no key needed",
      "    OpenRouter  (openrouter/* or x/y)    → OPENROUTER_API_KEY",
      "",
      chalk.dim("  https://github.com/furkangonel/cowrangler"),
      "",
    ].join("\n"),
  );
  process.exit(0);
}

// ── cowrangler setup — interactive provider setup wizard ─────────────
if (args[0] === "setup") {
  const { initEnvironment, loadEnvironmentVariables } =
    await import("@cowrangler/core/init.js");
  initEnvironment();
  loadEnvironmentVariables();
  const { runSetupWizard } = await import("./ui/setup.js");
  await runSetupWizard();
  process.exit(0);
}

// ── cowrangler language — change UI language ──────────────────────────
if (args[0] === "language" || args[0] === "lang") {
  const { initEnvironment, loadEnvironmentVariables } =
    await import("@cowrangler/core/init.js");
  initEnvironment();
  loadEnvironmentVariables();
  const { runLanguageWizard } = await import("./ui/setup.js");
  await runLanguageWizard(true);
  process.exit(0);
}

// ── cowrangler update ─────────────────────────────────────────────────
if (args[0] === "update") {
  const { execSync } = await import("child_process");
  const chalk = (await import("chalk")).default;

  console.log(chalk.cyan("\n  co-wrangler update\n"));

  try {
    // Mevcut sürümü göster
    const pkgPath = new URL("../package.json", import.meta.url);
    const pkg = JSON.parse(
      await import("fs").then((fs) =>
        fs.default.readFileSync(pkgPath, "utf-8"),
      ),
    );
    console.log(`  Current: ${chalk.dim(pkg.version)}`);

    // npm'den latest sürümü al
    const latest = execSync("npm view co-wrangler version 2>/dev/null", {
      encoding: "utf-8",
    }).trim();
    if (latest) console.log(`  Latest : ${chalk.green(latest)}`);

    if (latest && pkg.version === latest) {
      console.log(chalk.green("\n  ✓ Already up to date!\n"));
      process.exit(0);
    }

    console.log(chalk.cyan("\n  Updating via npm...\n"));
    execSync("npm install -g co-wrangler@latest", { stdio: "inherit" });
    console.log(
      chalk.green(
        "\n  ✓ Update complete! Restart cowrangler to use the new version.\n",
      ),
    );
  } catch (err: any) {
    console.error(
      chalk.red("\n  ✗ Update failed:"),
      err.message ?? String(err),
    );
    console.log(chalk.dim("  Try: npm install -g co-wrangler@latest\n"));
    process.exit(1);
  }
  process.exit(0);
}

// ── cowrangler mcp add — interaktif MCP sunucu kurulum sihirbazı ─────
if (args[0] === "mcp" && args[1] === "add") {
  const { initEnvironment, loadEnvironmentVariables } =
    await import("@cowrangler/core/init.js");
  initEnvironment();
  loadEnvironmentVariables();
  const { runMcpAddWizard } = await import("./cli/mcp_wizard.js");
  await runMcpAddWizard();
  process.exit(0);
}

// ── cowrangler mcp browse — MCP marketplace ──────────────────────────
if (args[0] === "mcp" && args[1] === "browse") {
  const { initEnvironment, loadEnvironmentVariables } =
    await import("@cowrangler/core/init.js");
  initEnvironment();
  loadEnvironmentVariables();
  const { runMcpBrowse } = await import("./cli/mcp_browse.js");
  await runMcpBrowse();
  process.exit(0);
}

// ── cowrangler mcp list — MCP sunucu listesi ─────────────────────────
if (args[0] === "mcp" && args[1] === "list") {
  const { initEnvironment, loadEnvironmentVariables } =
    await import("@cowrangler/core/init.js");
  initEnvironment();
  loadEnvironmentVariables();
  const { runMcpAddWizard } = await import("./cli/mcp_wizard.js");
  const yaml = (await import("js-yaml")).default;
  const fs = (await import("fs")).default;
  const { DIRS } = await import("@cowrangler/core/init.js");
  let cfg: any = {};
  if (fs.existsSync(DIRS.global.config)) {
    cfg =
      (yaml.load(fs.readFileSync(DIRS.global.config, "utf-8")) as any) || {};
  }
  const servers = cfg.mcp_servers || {};
  const names = Object.keys(servers);
  if (names.length === 0) {
    console.log(
      chalk.dim("  No MCP servers configured. Run: cowrangler mcp add"),
    );
  } else {
    console.log(chalk.bold("\n  Configured MCP Servers\n"));
    for (const name of names) {
      const s = servers[name];
      const transport = s.command
        ? `stdio  (${s.command})`
        : s.transport === "sse"
          ? "SSE"
          : `HTTP (${s.url})`;
      console.log(
        `  ${chalk.hex("#FF4C00").bold("◆")} ${chalk.bold(name.padEnd(20))} ${chalk.dim(transport)}`,
      );
    }
    console.log();
  }
  process.exit(0);
}

// ── cowrangler plugins ────────────────────────────────────────────────
if (args[0] === "plugins" || args[0] === "plugin") {
  const { initEnvironment, loadEnvironmentVariables } =
    await import("@cowrangler/core/init.js");
  initEnvironment();
  loadEnvironmentVariables();
  const { PluginManager } = await import("@cowrangler/core/plugins.js");
  const manager = PluginManager.getInstance();

  if (args[1] === "list") {
    const list = manager.getAvailablePlugins();
    if (list.length === 0) {
      console.log(chalk.dim("  No plugins installed."));
    } else {
      console.log(chalk.bold("\n  Installed Plugins\n"));
      for (const p of list) {
        const src = p.source === "local" ? "LOCAL" : "GLOBAL";
        const srcCol = p.source === "local" ? chalk.cyan(src) : chalk.magenta(src);
        console.log(
          `  ${chalk.green("◆")} ${chalk.bold(p.name)} (${p.id}) v${p.version} [${srcCol}]\n    ${chalk.dim(p.description)}\n    ${chalk.dim(p.dir)}\n`
        );
      }
    }
    process.exit(0);
  } else if (args[1] === "add") {
    const source = args[2];
    if (!source) {
      console.log(chalk.red("  Usage: cowrangler plugins add <git-url | folder-path | zip-file-path> [--local]"));
      process.exit(1);
    }
    // Plugin'ler varsayılan olarak GLOBAL kurulur (~/.cowrangler/plugins).
    // Proje dizinine kurmak isteyen nadir durum için `--local` opt-out.
    const isLocal = args.includes("--local");
    console.log(chalk.cyan(`\n  Installing plugin from "${source}" (${isLocal ? "project-local" : "global"})...`));
    const res = await manager.installPlugin(source, { global: !isLocal });
    if (res.ok) {
      console.log(chalk.green(`  ✓ Plugin "${res.id}" successfully installed!`));
      process.exit(0);
    } else {
      console.log(chalk.red(`  ✗ Installation failed: ${res.error}`));
      process.exit(1);
    }
  } else if (args[1] === "remove" || args[1] === "uninstall") {
    const id = args[2];
    if (!id) {
      console.log(chalk.red("  Usage: cowrangler plugins remove <plugin-id>"));
      process.exit(1);
    }
    const res = manager.uninstallPlugin(id);
    if (res.ok) {
      console.log(chalk.green(`  ✓ Plugin "${id}" successfully removed.`));
      process.exit(0);
    } else {
      console.log(chalk.red(`  ✗ Removal failed: ${res.error}`));
      process.exit(1);
    }
  } else if (args[1] === "run") {
    const id = args[2];
    const actionId = args[3];
    if (!id) {
      console.log(chalk.red("  Usage: cowrangler plugins run <plugin-id> [action-id]"));
      process.exit(1);
    }
    // Load plugins so their actions (e.g. login) are registered.
    await manager.initializeAll();
    const actions = manager.getPluginActionMetas(id);
    if (actions.length === 0) {
      console.log(chalk.yellow(`  Plugin "${id}" exposes no runnable actions.`));
      process.exit(0);
    }
    if (!actionId) {
      console.log(chalk.bold(`\n  Actions for "${id}":\n`));
      for (const a of actions) {
        console.log(`    ${chalk.green(a.id)}  ${chalk.dim("—")} ${a.title}${a.description ? chalk.dim(`\n      ${a.description}`) : ""}`);
      }
      console.log(chalk.dim(`\n  Run with: cowrangler plugins run ${id} <action-id>\n`));
      process.exit(0);
    }
    // Host context: open URLs in the system browser, stream logs to stdout.
    const { exec } = await import("node:child_process");
    const openUrl = (url: string) => {
      const cmd = process.platform === "darwin" ? "open"
        : process.platform === "win32" ? "start \"\""
        : "xdg-open";
      exec(`${cmd} "${url}"`);
      console.log(chalk.dim(`  ↗ Opened: ${url}`));
    };
    const res = await manager.runAction(id, actionId, {
      openUrl,
      log: (m: string) => console.log(`  ${chalk.dim(m)}`),
    });
    if (res.ok) {
      console.log(chalk.green(`  ✓ ${res.message || "Done."}`));
      process.exit(0);
    } else {
      console.log(chalk.red(`  ✗ ${res.message || "Action failed."}`));
      process.exit(1);
    }
  } else {
    console.log(
      [
        chalk.bold("  Plugin Commands:"),
        "    cowrangler plugins list                 List installed plugins",
        "    cowrangler plugins add <src> [--global] Install a plugin from folder, zip, or git",
        "    cowrangler plugins remove <id>          Remove an installed plugin",
        "    cowrangler plugins run <id> [action]    Run a plugin action (e.g. sign-in)",
        "",
      ].join("\n"),
    );
    process.exit(0);
  }
}

// ── cowrangler model — interaktif model seçici (standalone) ──────────
if (args[0] === "model") {
  const { initEnvironment, loadEnvironmentVariables } =
    await import("@cowrangler/core/init.js");
  initEnvironment();
  loadEnvironmentVariables();
  // Load plugins so their contributed models appear in the picker.
  try {
    const { PluginManager } = await import("@cowrangler/core/plugins.js");
    await PluginManager.getInstance().initializeAll();
  } catch { /* plugins optional */ }
  const { runModelPicker } = await import("./cli/model_picker_cli.js");
  await runModelPicker();
  process.exit(0);
}

// ── cowrangler cron ───────────────────────────────────────────────────
if (args[0] === "cron") {
  const { initEnvironment, loadEnvironmentVariables } =
    await import("@cowrangler/core/init.js");
  initEnvironment();
  loadEnvironmentVariables();
  const { getCronJobStore } = await import("./cron/jobs.js");
  const store = getCronJobStore();

  if (args[1] === "list") {
    const jobs = store.list();
    if (jobs.length === 0) {
      console.log("  No scheduled jobs.");
    } else {
      for (const j of jobs) {
        const status = j.enabled ? "✓" : "✗";
        const next = new Date(j.next_run).toLocaleString();
        console.log(
          `  ${status} [${j.id.slice(0, 8)}] ${j.name} — ${j.schedule} → next: ${next}`,
        );
      }
    }
    process.exit(0);
  }

  if (args[1] === "create") {
    // cowrangler cron create --name <name> --schedule <s> --prompt <p>
    const nameIdx = args.indexOf("--name");
    const schedIdx = args.indexOf("--schedule");
    const promptIdx = args.indexOf("--prompt");
    if (nameIdx < 0 || schedIdx < 0 || promptIdx < 0) {
      console.error(
        "  Usage: cowrangler cron create --name <name> --schedule <schedule> --prompt <prompt>",
      );
      process.exit(1);
    }
    const job = store.create({
      name: args[nameIdx + 1],
      schedule: args[schedIdx + 1],
      prompt: args.slice(promptIdx + 1).join(" "),
    });
    console.log(`  ✓ Created job '${job.name}' (${job.id})`);
    process.exit(0);
  }

  if (args[1] === "daemon") {
    const { startCronDaemon } = await import("./cron/scheduler.js");
    const { getConfig } = await import("@cowrangler/core/init.js");
    const { Agent } = await import("@cowrangler/core/agent.js");
    const { LLM } = await import("@cowrangler/core/llm.js");
    // Tool side-effects
    await import("@cowrangler/core/tools/system_tools.js");
    await import("@cowrangler/core/tools/git_tools.js");
    await import("@cowrangler/core/tools/file_tools.js");
    await import("@cowrangler/core/tools/web_tools.js");
    await import("@cowrangler/core/tools/skill_tools.js");
    await import("@cowrangler/core/tools/dev_tools.js");
    await import("@cowrangler/core/tools/brief_tool.js");
    await import("@cowrangler/core/tools/computer_use.js");

    const { getCronJobStore } = await import("./cron/jobs.js");
    const { execSync } = await import("child_process");
    const { setWorkspace } = await import("@cowrangler/core/tools/file_tools.js");
    await startCronDaemon(async (job) => {
      const config = getConfig();
      const store = getCronJobStore();

      // provider override — model'e prefix ekle (model provider'ı içermiyorsa)
      let model = job.model ?? config.model;
      if (job.provider && !model.includes("/")) model = `${job.provider}/${model}`;

      // workdir override
      if (job.workdir) { try { setWorkspace(job.workdir); } catch { /* yok say */ } }

      let prompt = job.prompt;

      // context_from — başka bir job'ın son çıktısını bağlama aktar
      if (job.context_from) {
        const src = store.get(job.context_from);
        if (src?.last_output) prompt = `[Context from job "${src.name}"]\n${src.last_output}\n\n---\n\n${prompt}`;
      }

      // script — ön-veri toplama; çıktısı prompt'a enjekte edilir
      if (job.script) {
        try {
          const out = execSync(job.script, { encoding: "utf-8", timeout: 60_000, cwd: job.workdir ?? process.cwd() });
          prompt = `[Script output]\n${out}\n\n---\n\n${prompt}`;
        } catch (e: any) {
          prompt = `[Script failed: ${e?.message ?? String(e)}]\n\n---\n\n${prompt}`;
        }
      }

      // skills — SOP olarak kullanılacak skill'leri belirt
      if (job.skills?.length) prompt = `Follow these skills as SOPs where relevant: ${job.skills.join(", ")}.\n\n${prompt}`;

      const llm = new LLM(model, config.temperature);
      const agent = new Agent(
        llm,
        config.system_prompt,
        config.max_iterations,
        undefined,
        "cron",
      );
      const result = await agent.chat(prompt);
      return result.text;
    });
    process.exit(0);
  }

  console.error("  Usage: cowrangler cron [list|create|daemon]");
  process.exit(1);
}

// ── cowrangler serve — ajanı HTTP servisi olarak aç ──────────────────
if (args[0] === "serve") {
  const { initEnvironment, loadEnvironmentVariables } =
    await import("@cowrangler/core/init.js");
  initEnvironment();
  loadEnvironmentVariables();
  await import("@cowrangler/core/tools/builtin.js"); // araçları kaydet
  const portIdx = args.indexOf("--port");
  const tokenIdx = args.indexOf("--token");
  const { startServer } = await import("@cowrangler/core/serve.js");
  await startServer({
    port: portIdx >= 0 ? parseInt(args[portIdx + 1], 10) : undefined,
    token: tokenIdx >= 0 ? args[tokenIdx + 1] : undefined,
  });
  process.exit(0);
}

// ── cowrangler lsp ────────────────────────────────────────────────────
if (args[0] === "lsp") {
  const { startLSPServer } = await import("./lsp/server.js");
  await startLSPServer();
  // Server runs forever (event loop kept alive by stdin)
}

// ── cowrangler replay ─────────────────────────────────────────────────
if (args[0] === "replay") {
  const file = args[1];
  if (!file) {
    console.error(
      "  Usage: cowrangler replay <trajectory-file.json> [--inspect] [--assert] [--verbose] [--turns 0,1,2]",
    );
    process.exit(1);
  }

  const inspect = args.includes("--inspect");
  const doAssert = args.includes("--assert");
  const verbose = args.includes("--verbose");
  const turnsIdx = args.indexOf("--turns");
  const turns =
    turnsIdx >= 0 && args[turnsIdx + 1]
      ? args[turnsIdx + 1].split(",").map(Number)
      : undefined;

  const { loadTrajectory, replayTrajectory, runAssertions } =
    await import("@cowrangler/core/trajectory.js");

  const traj = loadTrajectory(file);

  // ── inspect modu ───────────────────────────────────────────────────
  if (inspect) {
    const m = traj.meta;
    const durationSec = ((m.endedAt - m.startedAt) / 1000).toFixed(1);
    console.log(`\n  Trajectory: ${file}`);
    console.log(`  ─────────────────────────────────────────────────`);
    console.log(`  Model    : ${m.model}`);
    console.log(`  Platform : ${m.platform}`);
    console.log(`  Started  : ${new Date(m.startedAt).toISOString()}`);
    console.log(`  Duration : ${durationSec}s`);
    console.log(`  Turns    : ${m.totalTurns}`);
    console.log(`  Tokens   : ${m.totalTokens.toLocaleString()}`);
    if (traj.assertions?.length) {
      console.log(`  Assertions: ${traj.assertions.length}`);
    }
    console.log();
    for (const t of traj.turns) {
      const toolSummary =
        t.toolCalls.length > 0
          ? `  [${t.toolCalls.map((c) => c.name).join(", ")}]`
          : "";
      console.log(
        `  Turn ${t.index}: ${t.userMessage.slice(0, 80)}...${toolSummary}`,
      );
      console.log(`           → ${t.assistantResponse.slice(0, 120)}...`);
      console.log(`           tokens:${t.tokenCount} time:${t.durationMs}ms`);
    }
    process.exit(0);
  }

  // ── replay modu ────────────────────────────────────────────────────
  console.log(
    `\n  Replaying: ${file}  (${traj.meta.totalTurns} turns, model: ${traj.meta.model})\n`,
  );

  const { initEnvironment, loadEnvironmentVariables } =
    await import("@cowrangler/core/init.js");
  initEnvironment();
  loadEnvironmentVariables();

  const results = await replayTrajectory({ file, turns, verbose });

  console.log(`\n  Replay complete: ${results.length} turn(s)`);

  // ── assertion modu ─────────────────────────────────────────────────
  if (doAssert) {
    const assertResults = runAssertions(traj);
    if (assertResults.length === 0) {
      console.log("  No assertions defined in trajectory file.");
    } else {
      let failed = 0;
      console.log("\n  Assertions:");
      for (const r of assertResults) {
        const icon = r.passed ? "✓" : "✗";
        console.log(
          `  ${icon} ${r.description}${r.reason ? ` (${r.reason})` : ""}`,
        );
        if (!r.passed) failed++;
      }
      process.exit(failed > 0 ? 1 : 0);
    }
  }

  process.exit(0);
}

// ── cowrangler batch ──────────────────────────────────────────────────
if (args[0] === "batch") {
  if (args[1] === "run") {
    const fileIdx = args.indexOf("--file");
    if (fileIdx < 0 || !args[fileIdx + 1]) {
      console.error(
        "  Usage: cowrangler batch run --file tasks.jsonl [--output results.jsonl] [--concurrency 3] [--retries 1] [--verbose]",
      );
      process.exit(1);
    }

    const outputIdx = args.indexOf("--output");
    const concurrencyIdx = args.indexOf("--concurrency");
    const retriesIdx = args.indexOf("--retries");

    const { runBatch } = await import("./batch/runner.js");
    const summary = await runBatch({
      file: args[fileIdx + 1],
      outputFile: outputIdx >= 0 ? args[outputIdx + 1] : undefined,
      concurrency:
        concurrencyIdx >= 0 ? parseInt(args[concurrencyIdx + 1] ?? "3", 10) : 3,
      maxRetries:
        retriesIdx >= 0 ? parseInt(args[retriesIdx + 1] ?? "1", 10) : 1,
      verbose: args.includes("--verbose"),
    });

    // Özet çıktısı
    const totalSec = (summary.totalDurationMs / 1000).toFixed(1);
    const successRate =
      summary.total > 0
        ? Math.round((summary.succeeded / summary.total) * 100)
        : 0;
    console.log(`\n  ┌─ Batch Run Complete ─────────────────────────────`);
    console.log(`  │  Total tasks  : ${summary.total}`);
    console.log(`  │  Succeeded    : ${summary.succeeded}  (${successRate}%)`);
    console.log(`  │  Failed       : ${summary.failed}`);
    if (summary.skipped > 0)
      console.log(`  │  Skipped      : ${summary.skipped}`);
    console.log(`  │  Total tokens : ${summary.totalTokens.toLocaleString()}`);
    console.log(`  │  Wall time    : ${totalSec}s`);
    console.log(`  └──────────────────────────────────────────────────`);

    process.exit(summary.failed > 0 ? 1 : 0);
  }

  console.error(
    "  Usage: cowrangler batch run --file tasks.jsonl [--output results.jsonl] [--concurrency 3] [--retries 1] [--verbose]",
  );
  process.exit(1);
}

// ── Flag parsing ──────────────────────────────────────────────────────────
const FLAG_BRIEF = args.includes("--brief");
const FLAG_VERBOSE = args.includes("--verbose");
const FLAG_NO_SANDBOX = args.includes("--no-sandbox");
const FLAG_PERMISSION_IDX = args.indexOf("--permission");
const FLAG_PERMISSION_MODE: string | null =
  FLAG_PERMISSION_IDX >= 0 ? (args[FLAG_PERMISSION_IDX + 1] ?? null) : null;

// ── Profil override — tüm import'lardan önce ────────────────────────────────
const FLAG_PROFILE_IDX = args.findIndex((a) => a === "-p" || a === "--profile");
const FLAG_PROFILE: string | null =
  FLAG_PROFILE_IDX >= 0
    ? (args[FLAG_PROFILE_IDX + 1] ?? null)
    : (process.env.COWRANGLER_PROFILE ?? null);


// ── Environment & tool registration ───────────────────────────────────────
import {
  initEnvironment,
  getConfig,
  loadEnvironmentVariables,
  getVersion,
  PROJECT_ROOT,
} from "@cowrangler/core/init.js";

loadEnvironmentVariables();

import path from "path";
import { Agent } from "@cowrangler/core/agent.js";
import { LLM } from "@cowrangler/core/llm.js";
import { runCLI } from "./ui/cli.js";
import { setWorkspace } from "@cowrangler/core/tools/file_tools.js";
import { configureSandbox } from "@cowrangler/core/sandbox.js";

// Import side-effect registrations (including BriefTool)
import "@cowrangler/core/tools/system_tools.js";
import "@cowrangler/core/tools/git_tools.js";
import "@cowrangler/core/tools/file_tools.js";
import "@cowrangler/core/tools/web_tools.js";
import "@cowrangler/core/tools/skill_tools.js";
import "@cowrangler/core/tools/dev_tools.js";
import "@cowrangler/core/tools/brief_tool.js";
import "@cowrangler/core/tools/computer_use.js";
import "@cowrangler/core/tools/mcp_status_tool.js";

async function main() {
  initEnvironment();
  const configuration = getConfig();
  setWorkspace(PROJECT_ROOT);

  // ── Load custom plugins ───────────────────────────────────────────────
  try {
    const { PluginManager } = await import("@cowrangler/core/plugins.js");
    await PluginManager.getInstance().initializeAll();
  } catch (err: any) {
    console.error(chalk.yellow(`  ⚠ Plugin initialization warning: ${err.message}`));
  }

  // ── i18n — load locale from config ──────────────────────────────────────
  const { initI18n } = await import("@cowrangler/core/i18n/index.js");
  initI18n(configuration.language ?? "en");

  // ── Model metadata — bilinmeyen modeller için OpenRouter'dan çek ─────────
  const { prefetchModelMeta } = await import("@cowrangler/core/model_metadata.js");
  await prefetchModelMeta(configuration.model).catch(() => { /* sessizce geç */ });

  // ── Abonelik OAuth — bağlı sağlayıcıların token'larını env'e enjekte et ──

  // ── Terse (token-verimli çıktı) modu — config.terse'ten oku ─────────────
  if ((configuration as any).terse === true) process.env.COWRANGLER_TERSE = "1";

  // ── Uzun-dönem hafıza — yerel recall sağlayıcısı (config.memory.recall) ──
  if ((configuration as any).memory?.recall !== false) {
    const { initDefaultMemory } = await import("@cowrangler/core/memory_provider.js");
    await initDefaultMemory(PROJECT_ROOT).catch(() => { /* sessizce geç */ });
  }

  // ── Skin motoru — stored choice'ı yükle ─────────────────────────────────
  const { initSkin } = await import("@cowrangler/core/skin.js");
  initSkin();

  // ── Credential pool — ENV'den çoklu anahtar yükle ───────────────────────
  const { getCredentialPool: _initPool } =
    await import("@cowrangler/core/credential_pool.js");
  _initPool(); // Singleton'ı başlat — lazy load yerine startup'ta yükle

  // ── MCP sunucuları ────────────────────────────────────────────────────────
  if (
    configuration.mcp_servers &&
    Object.keys(configuration.mcp_servers).length > 0
  ) {
    try {
      const { getMCPManager } = await import("@cowrangler/core/mcp_client.js");
      await getMCPManager().init(configuration.mcp_servers);
    } catch (err: any) {
      console.error(chalk.yellow(`  ⚠ MCP init warning: ${err.message}`));
    }
  }

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
        chalk.dim("  Supported prefixes: claude-*, gpt-*, gemini-*, vertex/*, copilot/*, groq/*,"),
      );
      console.log(
        chalk.dim(
          "    mistral/*, deepseek/*, xai/*, together/*, cerebras/*, fireworks/*,",
        ),
      );
      console.log(
        chalk.dim(
          "    ollama/*, lmstudio/*, local/*, openrouter/*, provider/model",
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
