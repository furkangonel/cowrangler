import fs from "fs";
import path from "path";
import os from "os";
import yaml from "js-yaml";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Single source of truth for the app version — reads from package.json. */
export function getVersion(): string {
  try {
    const pkgPath = path.resolve(__dirname, "../../package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export const PROJECT_ROOT = process.cwd();
export const LOCAL_DIR = path.join(PROJECT_ROOT, ".cowrangler");
export const GLOBAL_DIR = path.join(os.homedir(), ".cowrangler");

export const COWRNGLR_MD = path.join(PROJECT_ROOT, "COWRNGLR.md");

export const DIRS = {
  local: {
    base: LOCAL_DIR,
    skills: path.join(LOCAL_DIR, "skills"),
    agents: path.join(LOCAL_DIR, "agents"), // Custom agent tanımları
    config: path.join(LOCAL_DIR, "config.yaml"),
    memory: path.join(LOCAL_DIR, "memory.md"),
    tasks: path.join(LOCAL_DIR, "tasks.json"),
    auditLog: path.join(LOCAL_DIR, "audit.log"), // Sandbox audit log
  },
  global: {
    base: GLOBAL_DIR,
    skills: path.join(GLOBAL_DIR, "skills"),
    agents: path.join(GLOBAL_DIR, "agents"), // Global custom agents
    config: path.join(GLOBAL_DIR, "config.yaml"),
    credentials: path.join(GLOBAL_DIR, "credentials.env"),
  },
};

const DEFAULT_SYSTEM_PROMPT = `You are Co-Wrangler — a powerful, enterprise-grade AI agent running in the terminal.

You operate like a senior engineer: methodical, transparent, and accountable. Every action you take is observable and reversible wherever possible.

---

## CORE BEHAVIOR RULES (NON-NEGOTIABLE)

### 1. Reason before acting
Before every non-trivial tool call, write one sentence explaining WHY.
- ✗ BAD:  "I'll edit src/agent.ts now."
- ✓ GOOD: "src/agent.ts uses the old callback signature — I need to update it before the new tool works."
State the root cause or goal, not just the action. This creates an audit trail.

### 2. Read before write (ALWAYS)
- Always use read_file before edit_file or write_file.
- Always use git_status before git_commit.
- Never assume a file's content — check it.

### 3. Task discipline — MANDATORY for any non-trivial task

**TWO-TIER SYSTEM — always pick the right tier:**

  manage_task   → SESSION tasks: steps within THIS conversation, ephemeral, gone next session.
  manage_kanban → KANBAN tasks: persistent project work, delegation to subagents, user-visible backlogs.

Session task rules (manage_task):
1. For any task requiring 3+ steps or touching 2+ files: call manage_task(action="create") for EACH step as your VERY FIRST action — before any file read or tool call.
2. Call manage_task(action="start", ref="1") immediately before beginning each step.
3. Call manage_task(action="done", ref="1") immediately after completing each step — NEVER batch at the end.
4. Single-step tasks (one file, one obvious action) may skip manage_task entirely.

Kanban task rules (manage_kanban):
- Create a kanban task when: the work should persist after this session, OR you are spawning a subagent to handle it, OR the user wants to track it as a project-level item.
- Use manage_kanban(action="stats") to check board state before proposing new work.
- Dispatched subagents claim kanban tasks automatically — do not mark them done manually unless specifically asked.

### 4. Use send_message to communicate with the user
After completing your work, ALWAYS call send_message to deliver your final response.
- status: "normal"    → direct reply to what the user asked
- status: "proactive" → autonomous finding, unsolicited update, critical blocker found

The send_message output is the primary communication channel. Make it clear and complete.

### 5. Skills — use them
If a relevant skill (SOP) is listed in [AVAILABLE SKILLS], call utilize_skill BEFORE starting work.
Skills encode proven best practices for debugging, testing, refactoring, documentation, and more.

### 6. Subagents — delegate wisely
For large or specialized tasks, use spawn_subagent to delegate:
- explore          → read-only codebase investigation (fast, safe)
- plan             → architecture & implementation planning
- code-reviewer    → correctness, security, performance review
- verify           → run tests, lint, type-check after changes
- debugger         → root cause analysis for reported bugs
- refactor         → safe structural improvements without behavior change
- test-writer      → comprehensive test coverage (unit + integration)
- documentation    → JSDoc, TSDoc, README, API docs
- security-audit   → OWASP vulnerability scanning
- performance      → profiling, bottleneck identification
- migration-planner → safe incremental migrations with rollback plans

For INDEPENDENT parallel tasks, prefer spawn_subagent_parallel — total time equals the slowest agent, not the sum.

### 7. Planning — use write_plan for non-trivial work
Before implementing anything that touches multiple files, has irreversible steps, or involves architectural decisions:
1. Call write_plan with title, summary, and ordered steps
2. Present the plan to the user with send_message
3. WAIT for explicit user approval ("go ahead", "proceed", "looks good")
4. Only then start implementation

Skip write_plan only for trivial single-file edits or direct user instructions that already specify exactly what to do.

### 8. Proactive notifications — use notify
After any task that takes more than ~30 seconds, call notify so the user knows it's done — especially if they might have switched apps. Keep notifications brief and informative.

### 9. Web research
For up-to-date information, use web_search first to discover relevant pages, then fetch_webpage to read specific content. Always cite your sources.

### 10. Language & tone
- Always respond in user language, regardless of the language the user writes in.
- Be direct, precise, and actionable. Avoid filler phrases like "Certainly!" or "Of course!".
- When uncertain about something, say so explicitly rather than guessing.
- Never apologize excessively — acknowledge mistakes once and fix them.

### 11. Safety and reversibility
- Never run commands that could cause irreversible data loss without explicit confirmation.
- Prefer reversible operations: commit before refactor, backup before delete.
- If a requested action looks dangerous, explain the specific risk before proceeding.
- Respect the active permission mode (default/plan/auto/bypass) shown in your context.

### 12. Narrative discipline — NO CODE IN MESSAGES
When writing or editing files, NEVER reproduce the file content in your narrative or in send_message.
The code is already in the file — repeating it wastes tokens and pollutes the trace.

- ✗ BAD:  "Writing the following to registry.ts: [full code block with wrapExecute...]"
- ✓ GOOD: "Wrapping execute in registry.ts to fix the Vertex struct format issue."

In send_message and narratives: reference the file path and what changed — not the code itself.
The only exception is short inline snippets (≤3 lines) needed to explain a specific decision.

### 13. Structured output discipline
When reporting what was done to the user (via send_message), state:
- Which file(s) were changed and why
- How to verify it works (test command or expected output)
Do NOT include diffs or full code blocks in send_message — those belong in the files.

---

## COMPLETION FORMAT

When all steps are done, end with this exact format:

**Done:**
- ✓ [action taken — one line each]
- ✓ ...

Then call send_message(status="normal") with the same summary.

---
Available capabilities: file I/O, git, bash, web_search, fetch_webpage, http_request, spawn_subagent, spawn_subagent_parallel, write_plan, notify, notebook_edit, skills, manage_task, manage_kanban, send_message.
Think step-by-step. Be transparent. Deliver results.`;

/**
 * initEnvironment — "lazy" init model, like Claude Code.
 *
 * Only global infra is created on every startup (needed for model/key config).
 * Project-level files (.cowrangler/memory.md, AGENT_TODO.md) are NOT created
 * automatically — they are created on demand by /init, /memory write, etc.
 * This keeps the project root clean for users who never ask for those features.
 */
export function initEnvironment() {
  // ── Global (always — needed for model + credential config) ─────────────────
  fs.mkdirSync(DIRS.global.base, { recursive: true });
  fs.mkdirSync(DIRS.global.skills, { recursive: true });

  if (!fs.existsSync(DIRS.global.config)) {
    const defaultGlobal = {
      model: "openrouter/google/gemini-2.5-flash",
      saved_models: [
        "openrouter/google/gemini-2.5-flash",
        "claude-opus-4-6",
        "claude-sonnet-4-6",
        "claude-haiku-4-5",
        "gpt-4o",
        "o4-mini",
        "openrouter/anthropic/claude-sonnet-4-6",
      ],
      // system_prompt is intentionally NOT stored in config.yaml.
      // It is always sourced from the in-code DEFAULT_SYSTEM_PROMPT so that
      // updates take effect immediately without manual config migration.
      // To add custom instructions, set `custom_system_prompt` in config.yaml.
      temperature: 0.7,
      max_iterations: 25,
      theme: "auto",
      // CLI görünüm modu: brief | default | transcript
      view_mode: "default",
      // Sandbox güvenlik: enabled = pattern-based protection aktif
      sandbox: {
        enabled: true,
        max_timeout_ms: 30000,
        network_restricted: false,
        audit_log: false,
      },
      // İzin modu: default | plan | auto | bypass
      permission_mode: "default",
      // Extended thinking (reasoning) — model destekliyorsa açılır.
      thinking: {
        enabled: false,
        budget_tokens: 8000,
      },
      // Bağlam yönetimi — token tabanlı sıkıştırma.
      // summary_model: özet için ucuz yardımcı model (null = ana model).
      context: {
        compress_threshold: 0.85,
        keep_recent: 8,
        summary_model: null,
      },
      // Kanban dispatcher ayarları.
      kanban: {
        max_concurrent: 3,
        tick_ms: 10000,
        reclaim_timeout_ms: 600000,
        fail_backoff_ms: 30000,
      },
    };
    fs.writeFileSync(DIRS.global.config, yaml.dump(defaultGlobal), "utf-8");
  }

  if (!fs.existsSync(DIRS.global.credentials)) {
    fs.writeFileSync(
      DIRS.global.credentials,
      [
        "# Co-Wrangler Global API Keys",
        "# Format: KEY_NAME=value",
        "# Set with: /key set <KEY_NAME> <value>   |   Delete with: /key delete <KEY_NAME>",
        "#",
        "# ── Anthropic (claude-*) ──────────────────────────────────────────────────",
        "# ANTHROPIC_API_KEY=sk-ant-...",
        "#",
        "# ── OpenAI (gpt-*, o1-*, o3-*, o4-*) ────────────────────────────────────",
        "# OPENAI_API_KEY=sk-...",
        "#",
        "# ── Google Gemini direct API (gemini-*) ──────────────────────────────────",
        "# GOOGLE_GENERATIVE_AI_API_KEY=AIza...",
        "#",
        "# ── Google Vertex AI (vertex/gemini-*, vertex/publishers/...) ───────────",
        "# Vertex, API key değil GCP kimlik doğrulama kullanır.",
        "# Adım 1 — Proje kimliğinizi ayarlayın:",
        "# GOOGLE_VERTEX_PROJECT=my-gcp-project-id",
        "#",
        "# Adım 2 — Bölgeyi ayarlayın (varsayılan: us-central1):",
        "# GOOGLE_VERTEX_LOCATION=us-central1",
        "#",
        "# Adım 3 — Kimlik doğrulama (ikisinden birini seçin):",
        "#   a) Application Default Credentials (önerilen — sadece bu komutu çalıştırın):",
        "#      gcloud auth application-default login",
        "#   b) Service Account JSON key dosyası:",
        "# GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json",
        "#",
        "# ── GitHub Copilot (copilot/*) ──────────────────────────────────────────",
        "# GitHub Copilot aboneliği olan hesabın token'ı ile çalışır.",
        "# Token alma seçenekleri:",
        "#   a) gh CLI: gh auth token  →  GITHUB_TOKEN=$(gh auth token)",
        "#   b) PAT oluştur: https://github.com/settings/tokens (Classic, scope gereksiz)",
        "# GITHUB_TOKEN=ghp_...",
        "#",
        "# ── Groq (groq/*) ────────────────────────────────────────────────────────",
        "# GROQ_API_KEY=gsk_...",
        "#",
        "# ── OpenRouter (openrouter/* veya provider/model) ────────────────────────",
        "# OPENROUTER_API_KEY=sk-or-...",
        "",
      ].join("\n"),
      "utf-8",
    );
  }

  // ── Local directory skeleton (dirs only — no files unless user asks) ────────
  // The .cowrangler/ dir and skills/ subdir are created so that skill discovery
  // and history persistence work without errors. No .md files are written here.
  fs.mkdirSync(DIRS.local.base, { recursive: true });
  fs.mkdirSync(DIRS.local.skills, { recursive: true });
  fs.mkdirSync(DIRS.local.agents, { recursive: true });
  fs.mkdirSync(DIRS.global.agents, { recursive: true });
}

/**
 * ensureLocalMemory — called lazily when memory is first written.
 * Creates memory.md only when needed, not on every startup.
 */
export function ensureLocalMemory(): void {
  fs.mkdirSync(DIRS.local.base, { recursive: true });
  if (!fs.existsSync(DIRS.local.memory)) {
    fs.writeFileSync(
      DIRS.local.memory,
      [
        "# Project Memory",
        "",
        "Add project-specific context here. The agent reads this on every startup.",
        "Include: tech stack, architecture decisions, conventions, known constraints.",
        "",
        "## Tech Stack",
        "",
        "## Architecture Notes",
        "",
        "## Conventions & Rules",
        "",
      ].join("\n"),
      "utf-8",
    );
  }
}

/**
 * ensureTaskStore — called lazily when the task manager first writes.
 * tasks.json is created by TaskManager itself; this just ensures the dir exists.
 */
export function ensureTaskStore(): void {
  fs.mkdirSync(DIRS.local.base, { recursive: true });
}

export function loadEnvironmentVariables() {
  if (fs.existsSync(DIRS.global.credentials)) {
    dotenv.config({ path: DIRS.global.credentials });
  }
  const localEnv = path.join(PROJECT_ROOT, ".env");
  if (fs.existsSync(localEnv)) {
    dotenv.config({ path: localEnv, override: true });
  }
}

export function getConfig() {
  initEnvironment();
  let config: any = {};

  if (fs.existsSync(DIRS.global.config)) {
    const raw = yaml.load(fs.readFileSync(DIRS.global.config, "utf-8")) as any;
    if (raw) config = { ...config, ...raw };
  }
  if (fs.existsSync(DIRS.local.config)) {
    const raw = yaml.load(fs.readFileSync(DIRS.local.config, "utf-8")) as any;
    if (raw) config = { ...config, ...raw };
  }

  // Ensure defaults
  config.model = config.model || "openrouter/google/gemini-2.5-flash";
  // Always use the in-code DEFAULT_SYSTEM_PROMPT so updates take effect immediately.
  // Users who want to customise the prompt should set `custom_system_prompt` in their
  // config.yaml — that value is appended after the default, never replacing it.
  config.system_prompt = config.custom_system_prompt
    ? DEFAULT_SYSTEM_PROMPT +
      "\n\n---\n\n## USER CUSTOMIZATIONS\n\n" +
      config.custom_system_prompt
    : DEFAULT_SYSTEM_PROMPT;
  config.temperature = config.temperature ?? 0.7;
  config.max_iterations = config.max_iterations ?? 25;
  config.view_mode = config.view_mode ?? "default";
  config.permission_mode = config.permission_mode ?? "default";
  config.language = config.language ?? "en";
  config.sandbox = {
    enabled: true,
    max_timeout_ms: 30000,
    network_restricted: false,
    audit_log: false,
    ...(config.sandbox ?? {}),
  };
  config.thinking = {
    enabled: false,
    budget_tokens: 8000,
    ...(config.thinking ?? {}),
  };
  config.context = {
    compress_threshold: 0.85,
    keep_recent: 8,
    summary_model: null,
    ...(config.context ?? {}),
  };
  config.kanban = {
    max_concurrent: 3,
    tick_ms: 10000,
    reclaim_timeout_ms: 600000,
    fail_backoff_ms: 30000,
    ...(config.kanban ?? {}),
  };
  return config;
}

/**
 * Global config.yaml'a tek bir değeri yazar. Nokta-yollu anahtarları destekler
 * (örn: "kanban.max_concurrent", "thinking.enabled"). Değer tipi otomatik
 * çıkarılır: "true"/"false" → boolean, sayısal → number, "null" → null,
 * aksi halde string. `/config set` komutu tarafından kullanılır.
 */
export function setConfigValue(dottedKey: string, rawValue: string): void {
  initEnvironment();
  let raw: any = {};
  if (fs.existsSync(DIRS.global.config)) {
    raw = (yaml.load(fs.readFileSync(DIRS.global.config, "utf-8")) as any) ?? {};
  }

  // Değer tipini çıkar
  let value: any = rawValue;
  if (rawValue === "true") value = true;
  else if (rawValue === "false") value = false;
  else if (rawValue === "null") value = null;
  else if (/^-?\d+(\.\d+)?$/.test(rawValue.trim())) value = Number(rawValue);

  // Nokta-yolu boyunca in
  const parts = dottedKey.split(".");
  let node = raw;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof node[parts[i]] !== "object" || node[parts[i]] === null) {
      node[parts[i]] = {};
    }
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;

  fs.writeFileSync(DIRS.global.config, yaml.dump(raw), "utf-8");
}
