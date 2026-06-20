#!/usr/bin/env node
import util from "util";
import chalk from "chalk";

// ── Global error handlers ──────────────────────────────────────────────────
process.on("unhandledRejection", (reason: any) => {
  console.error(chalk.red("\n  ✗ UNHANDLED REJECTION:"));
  console.log(util.inspect(reason, { depth: null, colors: true }));
  // Log dosyalarını kapat
  try {
    require("./core/logger.js").closeLogger?.();
  } catch {
    /* yok say */
  }
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  console.error(chalk.red("\n  ✗ UNCAUGHT EXCEPTION:"));
  console.log(util.inspect(err, { depth: null, colors: true }));
  try {
    require("./core/logger.js").closeLogger?.();
  } catch {
    /* yok say */
  }
  process.exit(1);
});
process.on("SIGTERM", () => {
  try {
    require("./core/logger.js").closeLogger?.();
  } catch {
    /* yok say */
  }
  process.exit(0);
});

// ── CLI flags ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.includes("--version") || args.includes("-v")) {
  const { getVersion: gv } = await import("./core/init.js");
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
      "    cowrangler -p <profile>        Run with a named profile",
      "    cowrangler model               Interactive model picker (arrow keys)",
      "    cowrangler gateway setup       Configure Telegram/Discord bot (wizard)",
      "    cowrangler gateway start       Start Telegram/Discord gateway",
      "    cowrangler mcp browse          MCP marketplace — browse & install servers",
      "    cowrangler mcp add             Add an MCP server (interactive wizard)",
      "    cowrangler mcp list            List configured MCP servers",
      "    cowrangler cron list           List scheduled jobs",
      "    cowrangler cron create         Create a scheduled job",
      "    cowrangler cron daemon         Start the cron scheduler daemon",
      "    cowrangler kanban list         Show kanban board (all tasks)",
      "    cowrangler kanban board        Open live web UI (http://localhost:4242)",
      "    cowrangler kanban create       Create a task (--title, --priority, --tags, --assign)",
      "    cowrangler kanban show <id>    Show task details + comments",
      "    cowrangler kanban assign       Assign task to a profile",
      "    cowrangler kanban complete     Mark task done",
      "    cowrangler kanban block        Block a task",
      "    cowrangler kanban unblock      Unblock a task",
      "    cowrangler kanban link         Add blocker → blocked dependency",
      "    cowrangler kanban comment      Add a comment to a task",
      "    cowrangler kanban tail         Show recent board events",
      "    cowrangler kanban stats        Show board statistics",
      "    cowrangler kanban dispatch     Run dispatcher (foreground)",
      "    cowrangler kanban daemon       Manage background dispatcher",
      "    cowrangler profile list        List profiles",
      "    cowrangler profile create      Create a new profile",
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
      "    /plugins     Loaded plugins        /mcp         MCP server status",
      "    /curator     Skill lifecycle       /profile     Profile info",
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
      chalk.dim("  https://github.com/furkangonel/cowrangler"),
      "",
    ].join("\n"),
  );
  process.exit(0);
}

// ── cowrangler setup — interactive provider setup wizard ─────────────
if (args[0] === "setup") {
  const { initEnvironment, loadEnvironmentVariables } =
    await import("./core/init.js");
  initEnvironment();
  loadEnvironmentVariables();
  const { runSetupWizard } = await import("./ui/setup.js");
  await runSetupWizard();
  process.exit(0);
}

// ── cowrangler language — change UI language ──────────────────────────
if (args[0] === "language" || args[0] === "lang") {
  const { initEnvironment, loadEnvironmentVariables } =
    await import("./core/init.js");
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

// ── cowrangler gateway setup — Telegram/Discord kurulum sihirbazı ────
if (args[0] === "gateway" && args[1] === "setup") {
  const { initEnvironment, loadEnvironmentVariables } =
    await import("./core/init.js");
  initEnvironment();
  loadEnvironmentVariables();
  const { runGatewaySetupWizard } = await import("./cli/gateway_wizard.js");
  await runGatewaySetupWizard();
  process.exit(0);
}

// ── cowrangler gateway start ──────────────────────────────────────────
if (args[0] === "gateway" && args[1] === "start") {
  const { initEnvironment, loadEnvironmentVariables } =
    await import("./core/init.js");
  initEnvironment();
  loadEnvironmentVariables();
  const { gatewayMain } = await import("./gateway/run.js");
  await gatewayMain();
  process.exit(0);
}

// ── cowrangler mcp add — interaktif MCP sunucu kurulum sihirbazı ─────
if (args[0] === "mcp" && args[1] === "add") {
  const { initEnvironment, loadEnvironmentVariables } =
    await import("./core/init.js");
  initEnvironment();
  loadEnvironmentVariables();
  const { runMcpAddWizard } = await import("./cli/mcp_wizard.js");
  await runMcpAddWizard();
  process.exit(0);
}

// ── cowrangler mcp browse — MCP marketplace ──────────────────────────
if (args[0] === "mcp" && args[1] === "browse") {
  const { initEnvironment, loadEnvironmentVariables } =
    await import("./core/init.js");
  initEnvironment();
  loadEnvironmentVariables();
  const { runMcpBrowse } = await import("./cli/mcp_browse.js");
  await runMcpBrowse();
  process.exit(0);
}

// ── cowrangler mcp list — MCP sunucu listesi ─────────────────────────
if (args[0] === "mcp" && args[1] === "list") {
  const { initEnvironment, loadEnvironmentVariables } =
    await import("./core/init.js");
  initEnvironment();
  loadEnvironmentVariables();
  const { runMcpAddWizard } = await import("./cli/mcp_wizard.js");
  const yaml = (await import("js-yaml")).default;
  const fs = (await import("fs")).default;
  const { DIRS } = await import("./core/init.js");
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

// ── cowrangler model — interaktif model seçici (standalone) ──────────
if (args[0] === "model") {
  const { initEnvironment, loadEnvironmentVariables } =
    await import("./core/init.js");
  initEnvironment();
  loadEnvironmentVariables();
  const { runModelPicker } = await import("./cli/model_picker_cli.js");
  await runModelPicker();
  process.exit(0);
}

// ── cowrangler cron ───────────────────────────────────────────────────
if (args[0] === "cron") {
  const { initEnvironment, loadEnvironmentVariables } =
    await import("./core/init.js");
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
    const { getConfig } = await import("./core/init.js");
    const { Agent } = await import("./core/agent.js");
    const { LLM } = await import("./core/llm.js");
    // Tool side-effects
    await import("./tools/system_tools.js");
    await import("./tools/git_tools.js");
    await import("./tools/file_tools.js");
    await import("./tools/web_tools.js");
    await import("./tools/skill_tools.js");
    await import("./tools/dev_tools.js");
    await import("./tools/brief_tool.js");
    await import("./tools/computer_use.js");

    await startCronDaemon(async (job) => {
      const config = getConfig();
      const model = job.model ?? config.model;
      const llm = new LLM(model, config.temperature);
      const agent = new Agent(
        llm,
        config.system_prompt,
        config.max_iterations,
        undefined,
        "cron",
      );
      const result = await agent.chat(job.prompt);
      return result.text;
    });
    process.exit(0);
  }

  console.error("  Usage: cowrangler cron [list|create|daemon]");
  process.exit(1);
}

// ── cowrangler kanban ─────────────────────────────────────────────────
if (args[0] === "kanban") {
  const { initEnvironment, loadEnvironmentVariables } =
    await import("./core/init.js");
  initEnvironment();
  loadEnvironmentVariables();

  const verb = args[1];

  // ── board — web UI ────────────────────────────────────────────────────
  if (verb === "board") {
    const portIdx = args.indexOf("--port");
    const port = portIdx >= 0 ? parseInt(args[portIdx + 1], 10) : 4242;
    const noOpen = args.includes("--no-open");
    const { startKanbanBoard } = await import("./kanban/web.js");
    await startKanbanBoard({ port, openBrowser: !noOpen });
    process.exit(0);
  }

  // ── dispatch — foreground dispatcher ─────────────────────────────────
  if (verb === "dispatch") {
    const profileIdx = args.indexOf("--profile");
    const concIdx   = args.indexOf("--concurrency");
    const { runDispatcherForeground } = await import("./kanban/dispatcher.js");
    await runDispatcherForeground({
      profile:       profileIdx >= 0 ? args[profileIdx + 1] : undefined,
      maxConcurrent: concIdx >= 0 ? parseInt(args[concIdx + 1], 10) : undefined,
    });
    process.exit(0);
  }

  // ── daemon — background dispatcher ────────────────────────────────────
  if (verb === "daemon") {
    const daemonVerb = args[2];
    const { isDaemonRunning, stopDaemon, runDispatcherDaemon } =
      await import("./kanban/dispatcher.js");

    if (daemonVerb === "status") {
      console.log(isDaemonRunning() ? "  Daemon: running" : "  Daemon: stopped");
      process.exit(0);
    }
    if (daemonVerb === "stop") {
      const stopped = stopDaemon();
      console.log(stopped ? "  Daemon stopped." : "  Daemon was not running.");
      process.exit(0);
    }
    if (!daemonVerb || daemonVerb === "start") {
      if (isDaemonRunning()) {
        console.log("  Daemon already running.");
        process.exit(0);
      }
      const concIdx = args.indexOf("--concurrency");
      console.log("  Starting kanban daemon...");
      await runDispatcherDaemon({
        maxConcurrent: concIdx >= 0 ? parseInt(args[concIdx + 1], 10) : undefined,
      });
      process.exit(0);
    }
    console.error("  Usage: cowrangler kanban daemon [start|stop|status]");
    process.exit(1);
  }

  // Shared DB for remaining verbs
  const { getKanbanDB } = await import("./kanban/db.js");
  const db = getKanbanDB();

  const STATUS_ICON: Record<string, string> = {
    pending: "⏳", claimed: "🔵", running: "🟡", done: "✅", failed: "❌", blocked: "🚫",
  };
  const PRIORITY_PAD: Record<string, string> = {
    urgent: " [URGENT]", high: " [HIGH]", normal: "", low: " [LOW]",
  };

  // Resolve short task ID (first 8 chars → full UUID)
  const resolveId = (shortId: string): string => {
    if (shortId.length === 36) return shortId;
    const tasks = db.list({ limit: 500 });
    return tasks.find((t) => t.id.startsWith(shortId))?.id ?? shortId;
  };

  // ── list ───────────────────────────────────────────────────────────────
  if (!verb || verb === "list") {
    const statusArg = args[2] as any;
    const tasks = db.list({ status: statusArg ?? undefined });
    if (tasks.length === 0) {
      console.log("  No tasks.");
    } else {
      for (const t of tasks) {
        const who   = t.assigned_to ? `  @${t.assigned_to}` : "";
        const tags  = t.tags.length ? `  [${t.tags.join(",")}]` : "";
        const p     = PRIORITY_PAD[t.priority] ?? "";
        console.log(`  ${STATUS_ICON[t.status] ?? "?"} ${t.id.slice(0, 8)}  ${t.title}${p}${who}${tags}`);
      }
      const s = db.stats();
      console.log(`\n  Pending: ${s.pending}  Running: ${s.running}  Done: ${s.done}  Blocked: ${s.blocked}  Total: ${s.total}`);
    }
    process.exit(0);
  }

  // ── create ─────────────────────────────────────────────────────────────
  if (verb === "create") {
    const titleIdx = args.indexOf("--title");
    if (titleIdx < 0) {
      console.error("  Usage: cowrangler kanban create --title <title> [--description <desc>] [--priority low|normal|high|urgent] [--tags tag1,tag2] [--assign <profile>]");
      process.exit(1);
    }
    const descIdx     = args.indexOf("--description");
    const prioIdx     = args.indexOf("--priority");
    const tagsIdx     = args.indexOf("--tags");
    const assignIdx   = args.indexOf("--assign");
    const task = db.create({
      title:       args[titleIdx + 1],
      description: descIdx   >= 0 ? args[descIdx + 1]   : undefined,
      priority:    prioIdx   >= 0 ? args[prioIdx + 1] as any : undefined,
      tags:        tagsIdx   >= 0 ? args[tagsIdx + 1].split(",").map((t) => t.trim()) : undefined,
      assignTo:    assignIdx >= 0 ? args[assignIdx + 1]  : undefined,
    });
    console.log(`  ✓ Created  ${task.id.slice(0, 8)}  "${task.title}"`);
    process.exit(0);
  }

  // ── show ───────────────────────────────────────────────────────────────
  if (verb === "show") {
    const id = args[2];
    if (!id) { console.error("  Usage: cowrangler kanban show <id>"); process.exit(1); }
    const task = db.get(resolveId(id));
    if (!task) { console.error(`  Task not found: ${id}`); process.exit(1); }
    const comments = db.getComments(task.id);
    const blockers = db.getBlockers(task.id);

    console.log(`\n  ${STATUS_ICON[task.status] ?? "?"} ${task.title}`);
    console.log(`  ID:       ${task.id}`);
    console.log(`  Status:   ${task.status}`);
    console.log(`  Priority: ${task.priority}`);
    if (task.assigned_to) console.log(`  Assigned: @${task.assigned_to}`);
    if (task.tags.length) console.log(`  Tags:     ${task.tags.join(", ")}`);
    if (task.description) console.log(`\n  ${task.description}`);
    if (blockers.length)  console.log(`\n  Blocked by: ${blockers.map((b) => b.id.slice(0, 8) + " " + b.title).join(", ")}`);
    if (task.output)      console.log(`\n  Output:\n${task.output.slice(0, 1000)}`);
    if (task.error)       console.log(`\n  Error:\n${task.error}`);
    if (comments.length) {
      console.log(`\n  Comments (${comments.length}):`);
      for (const c of comments) {
        console.log(`    [${new Date(c.timestamp).toLocaleString()}] @${c.author}: ${c.content.slice(0, 120)}`);
      }
    }
    console.log("");
    process.exit(0);
  }

  // ── assign ─────────────────────────────────────────────────────────────
  if (verb === "assign") {
    const id = args[2]; const who = args[3];
    if (!id || !who) { console.error("  Usage: cowrangler kanban assign <id> <profile>"); process.exit(1); }
    db.assign(resolveId(id), who);
    console.log(`  ✓ Assigned ${id} → @${who}`);
    process.exit(0);
  }

  // ── complete ───────────────────────────────────────────────────────────
  if (verb === "complete" || verb === "done") {
    const id = args[2];
    if (!id) { console.error("  Usage: cowrangler kanban complete <id> [output]"); process.exit(1); }
    const output = args.slice(3).join(" ") || "Manual completion";
    db.markDone(resolveId(id), output);
    console.log(`  ✅ Completed ${id}`);
    process.exit(0);
  }

  // ── fail ───────────────────────────────────────────────────────────────
  if (verb === "fail") {
    const id = args[2];
    if (!id) { console.error("  Usage: cowrangler kanban fail <id> [error]"); process.exit(1); }
    const error = args.slice(3).join(" ") || "Manual failure";
    db.markFailed(resolveId(id), error);
    console.log(`  ❌ Failed ${id}`);
    process.exit(0);
  }

  // ── block ──────────────────────────────────────────────────────────────
  if (verb === "block") {
    const id = args[2];
    if (!id) { console.error("  Usage: cowrangler kanban block <id> [reason]"); process.exit(1); }
    db.block(resolveId(id), args.slice(3).join(" ") || undefined);
    console.log(`  🚫 Blocked ${id}`);
    process.exit(0);
  }

  // ── unblock ────────────────────────────────────────────────────────────
  if (verb === "unblock") {
    const id = args[2];
    if (!id) { console.error("  Usage: cowrangler kanban unblock <id>"); process.exit(1); }
    db.unblock(resolveId(id));
    console.log(`  ⏳ Unblocked ${id} → pending`);
    process.exit(0);
  }

  // ── link ───────────────────────────────────────────────────────────────
  if (verb === "link") {
    const [, , blockerId, blockedId] = args;
    if (!blockerId || !blockedId) { console.error("  Usage: cowrangler kanban link <blocker-id> <blocked-id>"); process.exit(1); }
    db.link(resolveId(blockerId), resolveId(blockedId));
    console.log(`  ✓ Linked: ${blockerId} blocks ${blockedId}`);
    process.exit(0);
  }

  // ── unlink ─────────────────────────────────────────────────────────────
  if (verb === "unlink") {
    const [, , blockerId, blockedId] = args;
    if (!blockerId || !blockedId) { console.error("  Usage: cowrangler kanban unlink <blocker-id> <blocked-id>"); process.exit(1); }
    db.unlink(resolveId(blockerId), resolveId(blockedId));
    console.log(`  ✓ Unlinked: ${blockerId} no longer blocks ${blockedId}`);
    process.exit(0);
  }

  // ── comment ────────────────────────────────────────────────────────────
  if (verb === "comment") {
    const id = args[2];
    if (!id || args.length < 4) { console.error("  Usage: cowrangler kanban comment <id> <text...>"); process.exit(1); }
    const text = args.slice(3).join(" ");
    db.addComment(resolveId(id), "user", text);
    console.log(`  ✓ Comment added to ${id}`);
    process.exit(0);
  }

  // ── stats ──────────────────────────────────────────────────────────────
  if (verb === "stats") {
    const s = db.stats();
    console.log(`  Pending: ${s.pending}  Running: ${s.running}  Done: ${s.done}  Failed: ${s.failed}  Blocked: ${s.blocked}  Total: ${s.total}`);
    process.exit(0);
  }

  // ── tail ───────────────────────────────────────────────────────────────
  if (verb === "tail") {
    const n = parseInt(args[2] ?? "20", 10);
    const events = db.tailEvents({ limit: n });
    if (events.length === 0) { console.log("  No events."); process.exit(0); }
    for (const ev of events) {
      const time = new Date(ev.timestamp).toLocaleTimeString();
      const payload = JSON.parse(ev.payload);
      const detail = Object.entries(payload)
        .filter(([k]) => k !== "title")
        .map(([k, v]) => `${k}=${v}`)
        .join(" ");
      console.log(`  [${time}] ${ev.task_id.slice(0, 8)}  ${ev.event_type}  ${detail}`);
    }
    process.exit(0);
  }

  console.error(`  Unknown verb: ${verb}`);
  console.error("  Usage: cowrangler kanban [list|create|show|assign|complete|fail|block|unblock|link|unlink|comment|stats|tail|board|dispatch|daemon]");
  process.exit(1);
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
    await import("./core/trajectory.js");

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
    await import("./core/init.js");
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

// ── cowrangler profile ────────────────────────────────────────────────
if (args[0] === "profile") {
  const { listProfiles, createProfile, deleteProfile } =
    await import("./core/profile.js");

  if (args[1] === "list") {
    const profiles = listProfiles();
    if (profiles.length === 0) {
      console.log("  No profiles. Use: cowrangler profile create <name>");
    } else {
      for (const p of profiles) {
        console.log(
          `  • ${p.name}  model: ${p.model ?? "default"}  dir: ${p.dir}`,
        );
      }
    }
    process.exit(0);
  }

  if (args[1] === "create" && args[2]) {
    const p = createProfile(args[2], args[3]);
    console.log(`  ✓ Profile '${p.name}' created at ${p.dir}`);
    process.exit(0);
  }

  if (args[1] === "delete" && args[2]) {
    deleteProfile(args[2]);
    console.log(`  ✓ Profile '${args[2]}' deleted`);
    process.exit(0);
  }

  console.error(
    "  Usage: cowrangler profile [list|create <name>|delete <name>]",
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

if (FLAG_PROFILE) {
  const { applyProfileOverride } = await import("./core/profile.js");
  applyProfileOverride(FLAG_PROFILE);
}

// ── Environment & tool registration ───────────────────────────────────────
import {
  initEnvironment,
  getConfig,
  loadEnvironmentVariables,
  getVersion,
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
import "./tools/computer_use.js";

async function main() {
  initEnvironment();
  const configuration = getConfig();
  setWorkspace(PROJECT_ROOT);

  // ── i18n — load locale from config ──────────────────────────────────────
  const { initI18n } = await import("./i18n/index.js");
  initI18n(configuration.language ?? "en");

  // ── Model metadata — bilinmeyen modeller için OpenRouter'dan çek ─────────
  const { prefetchModelMeta } = await import("./core/model_metadata.js");
  await prefetchModelMeta(configuration.model).catch(() => { /* sessizce geç */ });

  // ── Skin motoru — stored choice'ı yükle ─────────────────────────────────
  const { initSkin } = await import("./core/skin.js");
  initSkin();

  // ── Credential pool — ENV'den çoklu anahtar yükle ───────────────────────
  const { getCredentialPool: _initPool } =
    await import("./core/credential_pool.js");
  _initPool(); // Singleton'ı başlat — lazy load yerine startup'ta yükle

  // ── Plugin sistemi ────────────────────────────────────────────────────────
  const { initPlugins } = await import("./core/plugins.js");
  await initPlugins();

  // ── MCP sunucuları ────────────────────────────────────────────────────────
  if (
    configuration.mcp_servers &&
    Object.keys(configuration.mcp_servers).length > 0
  ) {
    try {
      const { getMCPManager } = await import("./core/mcp_client.js");
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
