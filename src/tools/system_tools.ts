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
import {
  runInSandbox,
  configureSandbox,
  isSandboxEnabled,
} from "../core/sandbox.js";
import {
  checkPermission,
  riskBadge,
  PermissionMode,
} from "../core/permissions.js";

// ─────────────────────────────────────────────────────────────────────────────
// GET CURRENT TIME
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "get_current_time",
  "Get the current system date and time in ISO 8601 format.",
  z.object({
    timezone: z
      .string()
      .default("UTC")
      .describe("The timezone to return (default: UTC)"),
  }),
  async () =>
    new Date().toISOString().replace("T", " ").substring(0, 19) + " UTC",
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
    const npmVersion = (() => {
      try {
        return execSync("npm --version", { encoding: "utf-8" }).trim();
      } catch {
        return "N/A";
      }
    })();
    const gitVersion = (() => {
      try {
        return execSync("git --version", { encoding: "utf-8" }).trim();
      } catch {
        return "not installed";
      }
    })();

    return JSON.stringify(
      {
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
      },
      null,
      2,
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// WHICH COMMAND
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "which_command",
  "Check if a CLI tool is installed and get its path and version.",
  z.object({
    command: z
      .string()
      .describe("Command name to check, e.g., 'node', 'python3', 'docker'"),
  }),
  async ({ command }: { command: string }) => {
    try {
      const location = execSync(`which ${command}`, {
        encoding: "utf-8",
      }).trim();
      let version = "";
      try {
        version = execSync(`${command} --version 2>&1 | head -1`, {
          encoding: "utf-8",
        }).trim();
      } catch {}
      return `${command}: ${location}${version ? `\nVersion: ${version}` : ""}`;
    } catch {
      return `${command}: not found in PATH`;
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTE BASH — Sandbox entegreli
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "execute_bash",
  `Execute a shell command and return stdout/stderr.

Runs in the project root directory by default. Timeout: 30s (sandbox mode) or 60s (direct mode).

SANDBOX PROTECTION (when enabled):
- Critical patterns (rm -rf /, dd if=, mkfs, fork bombs) are always blocked.
- Dangerous patterns (sudo, recursive rm, force push) are logged and may require confirmation.
- Output is capped at 512KB to prevent runaway commands.
- Working directory is validated to be within allowed paths.

Use execute_bash only when necessary. Prefer purpose-built tools (git_*, file_*) for common operations.`,
  z.object({
    command: z
      .string()
      .describe(
        "Shell command to run. Avoid interactive commands (vim, nano, top). Use non-interactive flags (-y, --no-interaction, --batch).",
      ),
    cwd: z
      .string()
      .optional()
      .describe("Working directory override (default: project root)"),
    timeout: z
      .number()
      .optional()
      .default(30000)
      .describe("Timeout in ms (max: 30000 in sandbox, 60000 direct)"),
    permission_mode: z
      .enum(["default", "plan", "auto", "bypass"])
      .optional()
      .describe("Override permission mode for this call"),
  }),
  async ({
    command,
    cwd,
    timeout,
    permission_mode,
  }: {
    command: string;
    cwd?: string;
    timeout: number;
    permission_mode?: PermissionMode;
  }) => {
    const config = getConfig();
    const effectiveCwd = cwd ?? PROJECT_ROOT;
    const effectivePermMode = (permission_mode ??
      config.permission_mode ??
      "default") as PermissionMode;

    // ── Permission check ────────────────────────────────────────────────────
    const permResult = checkPermission(
      "execute_bash",
      effectivePermMode,
      command,
    );
    if (!permResult.allowed) {
      return `${riskBadge(permResult.riskLevel)} BLOCKED: ${permResult.reason}`;
    }

    // ── Configure sandbox from config ───────────────────────────────────────
    configureSandbox({
      enabled: config.sandbox?.enabled ?? true,
      workspaceRoot: PROJECT_ROOT,
      maxOutputBytes: 512 * 1024,
      maxTimeoutMs: config.sandbox?.max_timeout_ms ?? 30000,
      networkRestricted: config.sandbox?.network_restricted ?? false,
      auditLogPath: config.sandbox?.audit_log
        ? path.join(LOCAL_DIR, "audit.log")
        : undefined,
    });

    // ── Run in sandbox (or directly if sandbox disabled) ───────────────────
    const result = runInSandbox(command, effectiveCwd, timeout);

    if (result.blocked) {
      return result.output;
    }

    // Risky ama izin verilen komutlar için uyarı prefix ekle
    const warningPrefix =
      result.riskLevel === "dangerous"
        ? `${riskBadge("dangerous")} [dangerous command — logged]\n`
        : "";

    return (
      warningPrefix + (result.output || "Command succeeded with no output.")
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// WRITE PLAN — Plan modu: kullanıcı onayına sun, işleme başlama
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "write_plan",
  `Write an implementation plan to .cowrangler/plan.md and present it to the user for approval.

Use this BEFORE starting any non-trivial implementation that involves:
- Multiple files or architectural changes
- Irreversible operations (deletes, migrations, API changes)
- Ambiguous requirements that need clarification

Workflow:
1. Call write_plan with your proposed approach
2. The plan is saved and returned — use send_message to present it to the user
3. STOP and wait for the user to say "go ahead", "proceed", "devam et" or similar
4. Only then start implementation

Never skip the user approval step after writing a plan.`,
  z.object({
    title: z
      .string()
      .describe(
        "Short title for the plan (e.g., 'Add authentication middleware')",
      ),
    summary: z
      .string()
      .describe("1-2 sentence summary of what will be done and why"),
    steps: z
      .array(
        z.object({
          step: z.number().describe("Step number"),
          description: z.string().describe("What will be done in this step"),
          files: z
            .array(z.string())
            .optional()
            .describe("Files that will be created or modified"),
          risk: z
            .enum(["low", "medium", "high"])
            .optional()
            .default("low")
            .describe("Risk level of this step"),
        }),
      )
      .describe("Ordered list of implementation steps"),
    estimated_duration: z
      .string()
      .optional()
      .describe("Rough estimate (e.g., '~5 minutes', '2-3 tool calls')"),
    notes: z
      .string()
      .optional()
      .describe("Any caveats, assumptions, or open questions"),
  }),
  async ({
    title,
    summary,
    steps,
    estimated_duration,
    notes,
  }: {
    title: string;
    summary: string;
    steps: Array<{
      step: number;
      description: string;
      files?: string[];
      risk?: string;
    }>;
    estimated_duration?: string;
    notes?: string;
  }) => {
    const riskEmoji: Record<string, string> = {
      low: "🟢",
      medium: "🟡",
      high: "🔴",
    };
    const lines: string[] = [
      `# Plan: ${title}`,
      ``,
      `**Summary:** ${summary}`,
      estimated_duration ? `**Estimated duration:** ${estimated_duration}` : "",
      ``,
      `## Steps`,
      ``,
    ];

    for (const s of steps) {
      const risk = s.risk ?? "low";
      lines.push(`### Step ${s.step} ${riskEmoji[risk] ?? ""}`);
      lines.push(s.description);
      if (s.files && s.files.length > 0) {
        lines.push(`**Files:** ${s.files.join(", ")}`);
      }
      lines.push("");
    }

    if (notes) {
      lines.push(`## Notes`, ``, notes, ``);
    }

    lines.push(
      `---`,
      `*Awaiting user approval — reply "go ahead" or "devam et" to proceed.*`,
    );

    const planContent = lines.filter((l) => l !== undefined).join("\n");

    // Persist to disk
    try {
      fs.mkdirSync(LOCAL_DIR, { recursive: true });
      fs.writeFileSync(path.join(LOCAL_DIR, "plan.md"), planContent, "utf-8");
    } catch {
      // Non-fatal — plan still returned in-memory
    }

    return (
      `PLAN WRITTEN — present this to the user via send_message and WAIT for approval:\n\n` +
      planContent +
      `\n\nDo NOT proceed with implementation until the user explicitly approves.`
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFY — macOS / Linux sistem bildirimi gönder
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "notify",
  `Send a native desktop notification to the user.

Use proactively when:
- A long-running task finishes (> 30 seconds) — especially if the user might have switched to another app
- An important finding needs immediate attention (critical bug, security issue)
- A task fails and needs user intervention

Do NOT use for every step — only for genuinely important milestones.`,
  z.object({
    title: z.string().default("Cowrangler").describe("Notification title"),
    message: z
      .string()
      .describe("Notification body text (keep under 120 chars)"),
    sound: z
      .boolean()
      .optional()
      .default(true)
      .describe("Play notification sound (default: true)"),
  }),
  async ({
    title,
    message,
    sound = true,
  }: {
    title: string;
    message: string;
    sound?: boolean;
  }) => {
    const platform = os.platform();
    try {
      if (platform === "darwin") {
        const soundPart = sound ? `sound name "Ping"` : "";
        execSync(
          `osascript -e 'display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}" ${soundPart}'`,
          { timeout: 5000 },
        );
        return `Notification sent (macOS): "${title} — ${message}"`;
      } else if (platform === "linux") {
        execSync(
          `notify-send "${title.replace(/"/g, '\\"')}" "${message.replace(/"/g, '\\"')}"`,
          { timeout: 5000 },
        );
        return `Notification sent (Linux): "${title} — ${message}"`;
      } else {
        return `Notifications not supported on ${platform}. Message: ${title} — ${message}`;
      }
    } catch (e: any) {
      return `Failed to send notification: ${e.message}`;
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
    ms: z
      .number()
      .min(100)
      .max(60000)
      .describe("Milliseconds to wait (100–60000)"),
  }),
  async ({ ms }: { ms: number }) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return `Waited ${ms}ms.`;
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// MANAGE TASK — Oturum içi yapılandırılmış görev listesi
// ─────────────────────────────────────────────────────────────────────────────

registerTool(
  "manage_task",
  `Manage the current session's structured task list.

TWO-TIER TASK SYSTEM — choose the right tier:
  manage_task   → SHORT-LIVED tasks scoped to THIS conversation.
                  Use for: implementation steps, sub-goals you'll finish right now.
                  Automatically cleared between sessions.
  manage_kanban → PERSISTENT tasks that survive across sessions.
                  Use for: project-level work, delegation to subagents, user-visible backlogs.

Actions:
  create  — Add a task (required: subject; optional: description, activeForm, blocks, blockedBy)
  start   — Mark a task as in_progress (required: ref — task id or keyword; optional: activeForm)
  done    — Mark a task as completed (required: ref; optional: description — outcome summary)
  block   — Mark a task as blocked (required: ref; optional: blockedBy — task IDs)
  unblock — Move blocked task back to todo (required: ref)
  list    — Show all tasks (optional: filter todo/in_progress/completed/blocked)
  clear   — Remove all completed tasks

RULES:
- Call create (or a list of creates) as your VERY FIRST action before any tool call on multi-step tasks.
- Call start immediately before beginning each task.
- Call done immediately after completing each task — never batch at the end.
- Single-step tasks (1 file, 1 obvious action) may skip manage_task entirely.`,
  z.object({
    action: z
      .enum(["create", "start", "done", "block", "unblock", "list", "clear"])
      .describe("Action to perform"),
    subject: z
      .string()
      .optional()
      .describe("Task title (required for create)"),
    ref: z
      .string()
      .optional()
      .describe("Task reference: ID ('1', '2') or keyword match"),
    description: z
      .string()
      .optional()
      .describe("For done: outcome summary. For block: reason. For create: context."),
    activeForm: z
      .string()
      .optional()
      .describe("Spinner text for UI when active (e.g. 'Running tests...')"),
    blocks: z
      .array(z.string())
      .optional()
      .describe("Task IDs this task blocks"),
    blockedBy: z
      .array(z.string())
      .optional()
      .describe("Task IDs blocking this task"),
    filter: z
      .enum(["todo", "in_progress", "completed", "blocked"])
      .optional()
      .describe("For list: filter by status"),
  }),
  async ({
    action,
    subject,
    ref,
    description,
    activeForm,
    blocks,
    blockedBy,
    filter,
  }: {
    action: string;
    subject?: string;
    ref?: string;
    description?: string;
    activeForm?: string;
    blocks?: string[];
    blockedBy?: string[];
    filter?: "todo" | "in_progress" | "completed" | "blocked";
  }) => {
    const { getTaskManager } = await import("../core/task_manager.js");
    const tm = getTaskManager();

    switch (action) {
      case "create":
        if (!subject) return "ERROR: 'create' requires subject.";
        return tm.create({ subject, description, activeForm, blocks, blockedBy });

      case "start":
        if (!ref) return "ERROR: 'start' requires ref.";
        return tm.start(ref, activeForm);

      case "done":
        if (!ref) return "ERROR: 'done' requires ref.";
        return tm.done(ref, description);

      case "block":
        if (!ref) return "ERROR: 'block' requires ref.";
        return tm.block(ref, blockedBy);

      case "unblock":
        if (!ref) return "ERROR: 'unblock' requires ref.";
        return tm.unblock(ref);

      case "list":
        return tm.list(filter ? [filter] : undefined);

      case "clear":
        return tm.clear();

      default:
        return "ERROR: Unknown action.";
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// MANAGE KANBAN — Kalıcı proje görevi kuyruğu
// ─────────────────────────────────────────────────────────────────────────────

registerTool(
  "manage_kanban",
  `Manage the persistent kanban board — tasks that survive across sessions.

TWO-TIER TASK SYSTEM — choose the right tier:
  manage_kanban → PERSISTENT tasks: project backlogs, delegated subagent work,
                  multi-session initiatives, user-visible task tracking.
  manage_task   → Ephemeral tasks: steps within the current conversation only.

Actions:
  create   — Create a new kanban task (required: title; optional: description, priority low/normal/high/urgent, tags, assign_to)
  list     — List tasks (optional: status pending/running/done/blocked, assign_to, tag, limit)
  show     — Show task details + comments (required: id — full or 8-char prefix)
  assign   — Assign a task to an agent profile (required: id, assign_to)
  done     — Mark task as done with output (required: id, output)
  fail     — Mark task as failed (required: id, error)
  block    — Block a task (required: id; optional: reason)
  unblock  — Move blocked task back to pending (required: id)
  comment  — Add a comment to a task (required: id, content)
  stats    — Board statistics (pending/running/done/blocked counts)`,
  z.object({
    action: z
      .enum(["create", "list", "show", "assign", "done", "fail", "block", "unblock", "comment", "stats"])
      .describe("Action to perform"),
    id: z
      .string()
      .optional()
      .describe("Task ID (full UUID or first 8 characters)"),
    title: z
      .string()
      .optional()
      .describe("Task title (required for create)"),
    description: z
      .string()
      .optional()
      .describe("Task description"),
    priority: z
      .enum(["low", "normal", "high", "urgent"])
      .optional()
      .default("normal")
      .describe("Task priority"),
    tags: z
      .array(z.string())
      .optional()
      .describe("Tags for categorization"),
    assign_to: z
      .string()
      .optional()
      .describe("Agent profile name to assign to"),
    status: z
      .enum(["pending", "running", "done", "failed", "blocked"])
      .optional()
      .describe("Filter by status (for list)"),
    tag: z
      .string()
      .optional()
      .describe("Filter by tag (for list)"),
    limit: z
      .number()
      .optional()
      .default(50)
      .describe("Max tasks to return (default: 50)"),
    output: z
      .string()
      .optional()
      .describe("Task output / result (for done)"),
    error: z
      .string()
      .optional()
      .describe("Error message (for fail)"),
    reason: z
      .string()
      .optional()
      .describe("Reason (for block)"),
    content: z
      .string()
      .optional()
      .describe("Comment content (for comment)"),
  }),
  async ({
    action,
    id,
    title,
    description,
    priority,
    tags,
    assign_to,
    status,
    tag,
    limit,
    output,
    error,
    reason,
    content,
  }: {
    action: string;
    id?: string;
    title?: string;
    description?: string;
    priority?: "low" | "normal" | "high" | "urgent";
    tags?: string[];
    assign_to?: string;
    status?: any;
    tag?: string;
    limit?: number;
    output?: string;
    error?: string;
    reason?: string;
    content?: string;
  }) => {
    const { getKanbanDB } = await import("../kanban/db.js");
    const db = getKanbanDB();

    // Resolve short ID
    const resolveId = (shortId: string): string => {
      if (shortId.length === 36) return shortId; // full UUID
      const tasks = db.list({ limit: 500 });
      const match = tasks.find((t) => t.id.startsWith(shortId));
      return match?.id ?? shortId;
    };

    switch (action) {
      case "create": {
        if (!title) return "ERROR: 'create' requires title.";
        const task = db.create({ title, description, priority, tags, assignTo: assign_to });
        return JSON.stringify({
          created: true,
          id: task.id.slice(0, 8),
          title: task.title,
          status: task.status,
          priority: task.priority,
        }, null, 2);
      }

      case "list": {
        const tasks = db.list({ status, assignedTo: assign_to, tag, limit });
        if (tasks.length === 0) return "No tasks found.";

        const STATUS_ICON: Record<string, string> = {
          pending: "⏳", claimed: "🔵", running: "🟡", done: "✅", failed: "❌", blocked: "🚫",
        };
        const PRIORITY_BADGE: Record<string, string> = {
          urgent: "[URGENT]", high: "[HIGH]", normal: "", low: "[LOW]",
        };

        const lines = tasks.map((t) => {
          const icon = STATUS_ICON[t.status] ?? "?";
          const p = PRIORITY_BADGE[t.priority] ?? "";
          const who = t.assigned_to ? ` @${t.assigned_to}` : "";
          const tags = t.tags.length ? ` [${t.tags.join(",")}]` : "";
          return `  ${icon} ${t.id.slice(0, 8)}  ${t.title}${p ? " " + p : ""}${who}${tags}`;
        });

        const s = db.stats();
        lines.push(`\n  Pending: ${s.pending}  Running: ${s.running}  Done: ${s.done}  Blocked: ${s.blocked}`);
        return lines.join("\n");
      }

      case "show": {
        if (!id) return "ERROR: 'show' requires id.";
        const task = db.get(resolveId(id));
        if (!task) return `ERROR: Task not found: ${id}`;
        const comments = db.getComments(task.id);
        const blockers = db.getBlockers(task.id);
        return JSON.stringify({ ...task, comments, blockers }, null, 2);
      }

      case "assign": {
        if (!id || !assign_to) return "ERROR: 'assign' requires id and assign_to.";
        db.assign(resolveId(id), assign_to);
        return `Assigned ${id} to @${assign_to}`;
      }

      case "done": {
        if (!id) return "ERROR: 'done' requires id.";
        db.markDone(resolveId(id), output ?? "Marked done manually.");
        return `Task ${id} marked done.`;
      }

      case "fail": {
        if (!id) return "ERROR: 'fail' requires id.";
        db.markFailed(resolveId(id), error ?? "Unknown error");
        return `Task ${id} marked failed.`;
      }

      case "block": {
        if (!id) return "ERROR: 'block' requires id.";
        db.block(resolveId(id), reason);
        return `Task ${id} blocked.${reason ? " Reason: " + reason : ""}`;
      }

      case "unblock": {
        if (!id) return "ERROR: 'unblock' requires id.";
        db.unblock(resolveId(id));
        return `Task ${id} unblocked → pending.`;
      }

      case "comment": {
        if (!id || !content) return "ERROR: 'comment' requires id and content.";
        db.addComment(resolveId(id), "agent", content);
        return `Comment added to task ${id}.`;
      }

      case "stats": {
        const s = db.stats();
        return JSON.stringify(s, null, 2);
      }

      default:
        return "ERROR: Unknown action.";
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// SPAWN SUBAGENT — Enterprise grade ile sandbox + permission entegreli
// ─────────────────────────────────────────────────────────────────────────────
const AGENT_TYPES = [
  "explore",
  "plan",
  "code-reviewer",
  "verify",
  "refactor",
  "test-writer",
  "documentation",
  "security-audit",
  "debugger",
  "performance",
  "migration-planner",
] as const;
type AgentType = (typeof AGENT_TYPES)[number];

registerTool(
  "spawn_subagent",
  `Delegate a specialized task to a built-in sub-agent.

Available agents:
- explore           → Read-only codebase investigation (fast, safe, no writes)
- plan              → Architecture design & step-by-step implementation plan
- code-reviewer     → Correctness, security, performance, maintainability review
- verify            → Run tests, lint, type-check after code changes
- refactor          → Safe structural improvements without behavior change
- test-writer       → Write comprehensive unit/integration/e2e tests
- documentation     → JSDoc, TSDoc, README, API docs
- security-audit    → OWASP vulnerability scanning (injection, auth, secrets, deps)
- debugger          → Root cause analysis — finds the bug, proposes minimal fix
- performance       → Bottleneck profiling, N+1 queries, memory leaks, bundle size
- migration-planner → Safe incremental migrations with rollback plans

Each agent runs in its own isolated context with appropriate tool restrictions.
The report is returned to you (the calling agent) for review before acting on it.`,
  z.object({
    agentType: z
      .enum(AGENT_TYPES)
      .describe("The specialized agent type to spawn"),
    taskDescription: z
      .string()
      .describe(
        "Detailed task description. Include: what to do, which files are relevant, " +
          "what constraints apply, and what format the report should be in.",
      ),
    model: z
      .string()
      .optional()
      .describe(
        "Override model for this subagent (default: inherits parent model)",
      ),
  }),
  async ({
    agentType,
    taskDescription,
    model: modelOverride,
  }: {
    agentType: AgentType;
    taskDescription: string;
    model?: string;
  }) => {
    const agentDef = SUB_AGENTS[agentType];
    if (!agentDef) {
      return `ERROR: Unknown agent type '${agentType}'. Available: ${AGENT_TYPES.join(", ")}`;
    }

    const config = getConfig();
    const effectiveModel = modelOverride ?? config.model;
    const maxIter = agentDef.maxIterations ?? 20;

    const subLlm = new LLM(effectiveModel, config.temperature ?? 0.7);
    const subAgent = new Agent(
      subLlm,
      agentDef.systemPrompt,
      maxIter,
      agentDef.allowedTools,
    );

    const startMs = Date.now();
    try {
      const { text: result } = await subAgent.chat(
        `TASK ASSIGNMENT:\n${taskDescription}\n\n` +
          `CONSTRAINTS:\n` +
          `- Read-only mode: ${agentDef.readOnly ? "YES — do not write or execute" : "No"}\n` +
          `- Sandbox mode: ${agentDef.sandboxMode ?? "inherit"}\n` +
          `- Max iterations: ${maxIter}\n\n` +
          `Deliver your findings as a structured markdown report.`,
      );
      const durationS = ((Date.now() - startMs) / 1000).toFixed(1);
      return (
        `┌─── [${agentType.toUpperCase()} AGENT REPORT] ─── ${durationS}s ───\n` +
        result +
        `\n└─── [END OF REPORT] ───`
      );
    } catch (e: any) {
      return `ERROR: Sub-agent '${agentType}' failed after ${((Date.now() - startMs) / 1000).toFixed(1)}s: ${e.message}`;
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// SPAWN SUBAGENT PARALLEL — Birden fazla subagent'ı aynı anda çalıştır
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "spawn_subagent_parallel",
  `Run multiple sub-agents simultaneously using Promise.all — total time equals the slowest agent, not the sum.

Use when tasks are independent and can run concurrently. Examples:
- explore + security-audit + performance all scanning the same codebase at once
- test-writer + documentation generating in parallel after a feature is built
- code-reviewer + verify running alongside each other after a change

Each agent runs in its own isolated context. Results are returned as a combined report
in the order the tasks were specified (not completion order).

Prefer this over sequential spawn_subagent calls whenever the tasks don't depend on each other.`,
  z.object({
    tasks: z
      .array(
        z.object({
          agentType: z.enum(AGENT_TYPES).describe("The specialized agent type"),
          taskDescription: z
            .string()
            .describe(
              "Detailed task description for this agent. Include: what to do, which files are relevant, " +
                "constraints, and expected report format.",
            ),
          model: z
            .string()
            .optional()
            .describe(
              "Override model for this agent (default: inherits parent model)",
            ),
        }),
      )
      .min(2)
      .describe("Array of agent tasks to run in parallel (minimum 2)"),
  }),
  async ({
    tasks,
  }: {
    tasks: Array<{
      agentType: AgentType;
      taskDescription: string;
      model?: string;
    }>;
  }) => {
    const config = getConfig();
    const wallStart = Date.now();

    // Validate all agent types up-front before spawning anything
    for (const t of tasks) {
      if (!SUB_AGENTS[t.agentType]) {
        return `ERROR: Unknown agent type '${t.agentType}'. Available: ${AGENT_TYPES.join(", ")}`;
      }
    }

    // Launch all agents concurrently
    const promises = tasks.map(
      async ({ agentType, taskDescription, model: modelOverride }) => {
        const agentDef = SUB_AGENTS[agentType];
        const effectiveModel = modelOverride ?? config.model;
        const maxIter = agentDef.maxIterations ?? 20;

        const subLlm = new LLM(effectiveModel, config.temperature ?? 0.7);
        const subAgent = new Agent(
          subLlm,
          agentDef.systemPrompt,
          maxIter,
          agentDef.allowedTools,
        );

        const agentStart = Date.now();
        try {
          const { text: result } = await subAgent.chat(
            `TASK ASSIGNMENT:\n${taskDescription}\n\n` +
              `CONSTRAINTS:\n` +
              `- Read-only mode: ${agentDef.readOnly ? "YES — do not write or execute" : "No"}\n` +
              `- Sandbox mode: ${agentDef.sandboxMode ?? "inherit"}\n` +
              `- Max iterations: ${maxIter}\n\n` +
              `Deliver your findings as a structured markdown report.`,
          );
          const durationS = ((Date.now() - agentStart) / 1000).toFixed(1);
          return {
            agentType,
            durationS,
            ok: true,
            report: result,
          };
        } catch (e: any) {
          const durationS = ((Date.now() - agentStart) / 1000).toFixed(1);
          return {
            agentType,
            durationS,
            ok: false,
            report: `Agent failed: ${e.message}`,
          };
        }
      },
    );

    const results = await Promise.all(promises);
    const totalS = ((Date.now() - wallStart) / 1000).toFixed(1);
    const passCount = results.filter((r) => r.ok).length;

    // Build combined report
    const sections = results.map((r, i) => {
      const status = r.ok ? "✓" : "✗";
      return (
        `┌─── [${r.agentType.toUpperCase()} AGENT — ${status} ${r.durationS}s] ───\n` +
        r.report.trim() +
        `\n└─────────────────────────────────────────`
      );
    });

    return (
      `╔══ PARALLEL EXECUTION COMPLETE ══ ${passCount}/${results.length} agents succeeded ══ wall time: ${totalS}s ══╗\n\n` +
      sections.join("\n\n") +
      `\n\n╚══ END PARALLEL REPORT ══╝`
    );
  },
);
