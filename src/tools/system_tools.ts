import { z } from "zod";
import os from "os";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { registerTool } from "./registry.js";
import { SUB_AGENTS } from "../core/subagents.js";
import { Agent } from "../core/agent.js";
import { LLM } from "../core/llm.js";
import { getConfig } from "../core/init.js";
import { PROJECT_ROOT, LOCAL_DIR } from "../core/init.js";

// ─────────────────────────────────────────────────────────────────────────────
// GET CURRENT TIME
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "get_current_time",
  "Get the current system date and time in ISO 8601 format.",
  z.object({}),
  async () => new Date().toISOString().replace("T", " ").substring(0, 19) + " UTC",
);

// ─────────────────────────────────────────────────────────────────────────────
// GET SYSTEM INFO
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "get_system_info",
  "Get information about the current system: OS, Node.js version, CPU, memory, working directory.",
  z.object({}),
  async () => {
    const nodeVersion = process.version;
    const npmVersion = (() => { try { return execSync("npm --version", { encoding: "utf-8" }).trim(); } catch { return "N/A"; } })();
    const gitVersion = (() => { try { return execSync("git --version", { encoding: "utf-8" }).trim(); } catch { return "not installed"; } })();

    return JSON.stringify({
      os: {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        hostname: os.hostname(),
      },
      memory: {
        total_gb: (os.totalmem() / 1024 / 1024 / 1024).toFixed(2),
        free_gb: (os.freemem() / 1024 / 1024 / 1024).toFixed(2),
        used_percent: Math.round((1 - os.freemem() / os.totalmem()) * 100),
      },
      cpu: {
        model: os.cpus()[0]?.model ?? "unknown",
        cores: os.cpus().length,
        load_avg: os.loadavg().map((n) => n.toFixed(2)),
      },
      runtime: {
        node: nodeVersion,
        npm: npmVersion,
        git: gitVersion,
      },
      cwd: process.cwd(),
      home: os.homedir(),
    }, null, 2);
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// WHICH COMMAND
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "which_command",
  "Check if a CLI tool is installed and get its path and version.",
  z.object({
    command: z.string().describe("Command name to check, e.g., 'node', 'python3', 'docker'"),
  }),
  async ({ command }: { command: string }) => {
    try {
      const location = execSync(`which ${command}`, { encoding: "utf-8" }).trim();
      let version = "";
      try {
        version = execSync(`${command} --version 2>&1 | head -1`, { encoding: "utf-8" }).trim();
      } catch {}
      return `${command}: ${location}${version ? `\nVersion: ${version}` : ""}`;
    } catch {
      return `${command}: not found in PATH`;
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTE BASH
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "execute_bash",
  "Execute a shell command and return stdout/stderr. Runs in the project root directory. Timeout: 60s.",
  z.object({
    command: z.string().describe("Shell command to run (avoid interactive commands like vim, nano)"),
    cwd: z.string().optional().describe("Working directory override (default: project root)"),
    timeout: z.number().optional().default(60000).describe("Timeout in ms (max: 60000)"),
  }),
  async ({ command, cwd, timeout }: { command: string; cwd?: string; timeout: number }) => {
    try {
      const output = execSync(command, {
        cwd: cwd ?? PROJECT_ROOT,
        encoding: "utf-8",
        timeout: Math.min(timeout, 60000),
        stdio: ["ignore", "pipe", "pipe"],
      });
      return output.trim() || "Command succeeded with no output.";
    } catch (e: any) {
      const stdout = e.stdout?.toString().trim() || "";
      const stderr = e.stderr?.toString().trim() || "";
      return `COMMAND FAILED:\n${stdout ? `stdout: ${stdout}\n` : ""}${stderr ? `stderr: ${stderr}` : e.message}`;
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// SLEEP
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "sleep",
  "Pause execution for a specified number of milliseconds. Useful for waiting on async operations.",
  z.object({
    ms: z.number().min(100).max(60000).describe("Milliseconds to wait (100–60000)"),
  }),
  async ({ ms }: { ms: number }) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return `Waited ${ms}ms.`;
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// TODO / TASK MANAGER
// ─────────────────────────────────────────────────────────────────────────────
const TODO_FILE = path.join(LOCAL_DIR, "AGENT_TODO.md");

registerTool(
  "manage_todo",
  `Manage the agent's in-session task list (markdown checklist format).

Actions:
- read       → return the current todo list
- update     → overwrite the entire list with new content (requires: content)
- mark_done  → mark a specific item as [x] done (requires: item — partial text match or 1-based index as string)
- append     → add a new pending item to the bottom of the list (requires: content — the task text)

Always use mark_done immediately after completing each item. Never batch-mark at the end.`,
  z.object({
    action: z.enum(["read", "update", "mark_done", "append"]).describe(
      "read | update (overwrite) | mark_done (check off item) | append (add item)"
    ),
    content: z.string().optional().describe(
      "For update: full markdown content. For append: task description text."
    ),
    item: z.string().optional().describe(
      "For mark_done: partial text match of the item, OR a 1-based index (e.g. '1', '2')."
    ),
  }),
  async ({ action, content, item }: { action: string; content?: string; item?: string }) => {
    try {
      // ── read ────────────────────────────────────────────────────────────────
      if (action === "read") {
        return fs.existsSync(TODO_FILE)
          ? fs.readFileSync(TODO_FILE, "utf-8")
          : "No active TODO list.";
      }

      // ── update ──────────────────────────────────────────────────────────────
      if (action === "update") {
        if (!content) return "ERROR: 'update' requires content.";
        fs.writeFileSync(TODO_FILE, content, "utf-8");
        return "TODO list updated.";
      }

      // ── append ──────────────────────────────────────────────────────────────
      if (action === "append") {
        if (!content) return "ERROR: 'append' requires content.";
        const existing = fs.existsSync(TODO_FILE)
          ? fs.readFileSync(TODO_FILE, "utf-8")
          : "# Active Agent Tasks\n";
        const newItem = `- [ ] ${content.replace(/^-\s*\[.\]\s*/, "")}`;
        fs.writeFileSync(TODO_FILE, existing.trimEnd() + "\n" + newItem + "\n", "utf-8");
        return `Appended: ${newItem}`;
      }

      // ── mark_done ───────────────────────────────────────────────────────────
      if (action === "mark_done") {
        if (!item) return "ERROR: 'mark_done' requires item (text or 1-based index).";
        if (!fs.existsSync(TODO_FILE)) return "ERROR: No todo file found.";

        const raw = fs.readFileSync(TODO_FILE, "utf-8");
        const lines = raw.split("\n");

        // Determine if item is a numeric index
        const idx = /^\d+$/.test(item.trim()) ? parseInt(item.trim(), 10) : -1;

        let matched = false;
        let checklistCount = 0; // counts only checklist lines (- [ ] or - [x])

        const updated = lines.map((line) => {
          const isCheckbox = /^\s*-\s*\[.\]/.test(line);
          if (isCheckbox) checklistCount++;

          if (matched) return line;

          if (idx > 0) {
            // Index match — match the Nth checklist item (1-based)
            if (isCheckbox && checklistCount === idx) {
              matched = true;
              return line.replace(/\[.\]/, "[x]");
            }
          } else {
            // Text match
            if (isCheckbox && line.toLowerCase().includes(item.toLowerCase())) {
              matched = true;
              return line.replace(/\[.\]/, "[x]");
            }
          }
          return line;
        });

        if (!matched) {
          return `ERROR: No matching todo item found for: "${item}". Current list:\n${raw}`;
        }

        fs.writeFileSync(TODO_FILE, updated.join("\n"), "utf-8");
        return `Marked done: "${item}"`;
      }

      return "ERROR: Unknown action.";
    } catch (e: any) {
      return `ERROR: ${e.message}`;
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// SPAWN SUBAGENT
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "spawn_subagent",
  `Delegate a specialized task to a sub-agent. Available types: ${Object.keys(SUB_AGENTS).join(", ")}.
Each agent has a specific role: explore (read-only search), plan (architecture), code-reviewer (review), verify (test & validate), refactor (improve structure), test-writer (write tests), documentation (docs), security-audit (security scan), debugger (root cause analysis).`,
  z.object({
    agentType: z
      .enum(["explore", "plan", "code-reviewer", "verify", "refactor", "test-writer", "documentation", "security-audit", "debugger"])
      .describe("The type of sub-agent to spawn"),
    taskDescription: z
      .string()
      .describe("Detailed task description for the sub-agent"),
  }),
  async ({ agentType, taskDescription }: { agentType: string; taskDescription: string }) => {
    const agentDef = SUB_AGENTS[agentType];
    if (!agentDef) return `ERROR: Unknown agent type '${agentType}'. Available: ${Object.keys(SUB_AGENTS).join(", ")}`;

    const config = getConfig();
    const subLlm = new LLM(config.model, config.temperature ?? 0.7);
    const subAgent = new Agent(subLlm, agentDef.systemPrompt, 15, agentDef.allowedTools);

    try {
      const result = await subAgent.chat(`TASK:\n${taskDescription}`);
      return `─── [${agentType.toUpperCase()} AGENT REPORT] ───\n${result}\n─── [END OF REPORT] ───`;
    } catch (e: any) {
      return `ERROR: Sub-agent '${agentType}' failed: ${e.message}`;
    }
  },
);
