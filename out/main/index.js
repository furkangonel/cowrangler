import { dialog, shell, app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";
import yaml from "js-yaml";
import "dotenv";
import { generateText } from "ai";
import { z } from "zod";
import Database from "better-sqlite3";
import crypto from "crypto";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createVertex } from "@ai-sdk/google-vertex";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = process.cwd();
const LOCAL_DIR = path.join(PROJECT_ROOT, ".cowrangler");
const GLOBAL_DIR$4 = path.join(os.homedir(), ".cowrangler");
const COWRNGLR_MD = path.join(PROJECT_ROOT, "COWRNGLR.md");
const DIRS = {
  local: {
    base: LOCAL_DIR,
    skills: path.join(LOCAL_DIR, "skills"),
    agents: path.join(LOCAL_DIR, "agents"),
    // Custom agent tanımları
    config: path.join(LOCAL_DIR, "config.yaml"),
    memory: path.join(LOCAL_DIR, "memory.md"),
    todo: path.join(LOCAL_DIR, "AGENT_TODO.md"),
    auditLog: path.join(LOCAL_DIR, "audit.log")
    // Sandbox audit log
  },
  global: {
    base: GLOBAL_DIR$4,
    skills: path.join(GLOBAL_DIR$4, "skills"),
    agents: path.join(GLOBAL_DIR$4, "agents"),
    // Global custom agents
    config: path.join(GLOBAL_DIR$4, "config.yaml"),
    credentials: path.join(GLOBAL_DIR$4, "credentials.env")
  }
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

### 3. TODO discipline — MANDATORY for any non-trivial task
If a task requires 3 or more steps, touches more than one file, OR takes more than a few seconds:
1. Call manage_todo(action="update") as your VERY FIRST action — before reading any file, before any tool call.
2. Mark each item done with manage_todo(action="mark_done") IMMEDIATELY after completing it — not at the end.
3. Never batch-mark. Never skip. No task leaves the TODO in an unfinished state.

Single-step tasks (one file, one obvious action) may skip the TODO. Everything else: TODO first.

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
Available capabilities: file I/O, git, bash, web_search, fetch_webpage, http_request, spawn_subagent, spawn_subagent_parallel, write_plan, notify, notebook_edit, skills, manage_todo, send_message.
Think step-by-step. Be transparent. Deliver results.`;
function initEnvironment() {
  fs.mkdirSync(DIRS.global.base, { recursive: true });
  fs.mkdirSync(DIRS.global.skills, { recursive: true });
  if (!fs.existsSync(DIRS.global.config)) {
    const defaultGlobal = {
      model: "openrouter/google/gemini-2.5-flash",
      saved_models: [
        "openrouter/google/gemini-2.5-flash",
        "claude-sonnet-4-5",
        "claude-opus-4-5",
        "gpt-4o",
        "gpt-4o-mini",
        "openrouter/anthropic/claude-sonnet-4-5"
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
        max_timeout_ms: 3e4,
        network_restricted: false,
        audit_log: false
      },
      // İzin modu: default | plan | auto | bypass
      permission_mode: "default"
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
        ""
      ].join("\n"),
      "utf-8"
    );
  }
  fs.mkdirSync(DIRS.local.base, { recursive: true });
  fs.mkdirSync(DIRS.local.skills, { recursive: true });
  fs.mkdirSync(DIRS.local.agents, { recursive: true });
  fs.mkdirSync(DIRS.global.agents, { recursive: true });
}
function getConfig() {
  initEnvironment();
  let config = {};
  if (fs.existsSync(DIRS.global.config)) {
    const raw = yaml.load(fs.readFileSync(DIRS.global.config, "utf-8"));
    if (raw) config = { ...config, ...raw };
  }
  if (fs.existsSync(DIRS.local.config)) {
    const raw = yaml.load(fs.readFileSync(DIRS.local.config, "utf-8"));
    if (raw) config = { ...config, ...raw };
  }
  config.model = config.model || "openrouter/google/gemini-2.5-flash";
  config.system_prompt = config.custom_system_prompt ? DEFAULT_SYSTEM_PROMPT + "\n\n---\n\n## USER CUSTOMIZATIONS\n\n" + config.custom_system_prompt : DEFAULT_SYSTEM_PROMPT;
  config.temperature = config.temperature ?? 0.7;
  config.max_iterations = config.max_iterations ?? 25;
  config.view_mode = config.view_mode ?? "default";
  config.permission_mode = config.permission_mode ?? "default";
  config.language = config.language ?? "en";
  config.sandbox = {
    enabled: true,
    max_timeout_ms: 3e4,
    network_restricted: false,
    audit_log: false,
    ...config.sandbox ?? {}
  };
  return config;
}
const __dirname$2 = path.dirname(fileURLToPath(import.meta.url));
const BUNDLED_SKILLS_DIR = path.resolve(__dirname$2, "../bundled_skills");
class SkillManager {
  _parseFrontmatter(content) {
    if (!content.startsWith("---")) return { metadata: {}, body: content };
    const parts = content.split("---");
    if (parts.length >= 3) {
      try {
        const metadata = yaml.load(parts[1]) || {};
        const body = parts.slice(2).join("---").trim();
        return { metadata, body };
      } catch {
        return { metadata: {}, body: content };
      }
    }
    return { metadata: {}, body: content };
  }
  loadSkillsFromDir(dirPath, source) {
    const map = /* @__PURE__ */ new Map();
    if (!fs.existsSync(dirPath)) return map;
    const items = fs.readdirSync(dirPath);
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      try {
        if (!fs.statSync(itemPath).isDirectory()) continue;
        const skillFile = path.join(itemPath, "SKILL.md");
        if (fs.existsSync(skillFile)) {
          const content = fs.readFileSync(skillFile, "utf-8");
          const { metadata, body } = this._parseFrontmatter(content);
          const id = item;
          const name = metadata.name || id;
          const description = metadata.description || "No description.";
          map.set(id, { id, name, description, source, content: body });
        } else {
          const subItems = fs.readdirSync(itemPath);
          for (const subItem of subItems) {
            const subSkillPath = path.join(itemPath, subItem);
            try {
              if (!fs.statSync(subSkillPath).isDirectory()) continue;
              const subSkillFile = path.join(subSkillPath, "SKILL.md");
              if (!fs.existsSync(subSkillFile)) continue;
              const content = fs.readFileSync(subSkillFile, "utf-8");
              const { metadata, body } = this._parseFrontmatter(content);
              const id = subItem;
              const name = metadata.name || id;
              const description = metadata.description || "No description.";
              map.set(id, { id, name, description, source, content: body });
            } catch {
            }
          }
        }
      } catch {
      }
    }
    return map;
  }
  /**
   * Returns all available skills, merged in priority order:
   * bundled (lowest) → global → local (highest)
   * Higher-priority skills override lower-priority ones with the same ID.
   */
  getAvailableSkills() {
    const merged = /* @__PURE__ */ new Map();
    const bundledSkills = this.loadSkillsFromDir(BUNDLED_SKILLS_DIR, "bundled");
    bundledSkills.forEach((val, key) => merged.set(key, val));
    const globalSkills = this.loadSkillsFromDir(DIRS.global.skills, "global");
    globalSkills.forEach((val, key) => merged.set(key, val));
    const localSkills = this.loadSkillsFromDir(DIRS.local.skills, "local");
    localSkills.forEach((val, key) => merged.set(key, val));
    return Array.from(merged.values()).sort((a, b) => a.id.localeCompare(b.id));
  }
  readSkill(skillId) {
    const skills = this.getAvailableSkills();
    const target = skills.find((s) => s.id === skillId);
    if (!target) return `ERROR: Skill '${skillId}' not found. Use /skills to list available skills.`;
    return [
      `---`,
      `id: ${target.id}`,
      `name: ${target.name}`,
      `description: ${target.description}`,
      `source: ${target.source}`,
      `---`,
      ``,
      target.content
    ].join("\n");
  }
  listSkillIds() {
    return this.getAvailableSkills().map((s) => s.id);
  }
}
const TOOL_SCHEMAS = {};
function wrapExecute(execute) {
  return async (...args) => {
    const raw = await execute(...args);
    if (typeof raw === "object" && raw !== null) return raw;
    return { result: String(raw) };
  };
}
function registerTool(name, description, parameters, execute) {
  TOOL_SCHEMAS[name] = {
    description,
    parameters,
    execute: wrapExecute(execute)
  };
}
class BriefBuffer {
  _queue = [];
  push(msg) {
    this._queue.push(msg);
  }
  getAll() {
    return this._queue;
  }
  getLast() {
    return this._queue[this._queue.length - 1];
  }
  clear() {
    this._queue.length = 0;
  }
}
function createSendMessageTool(buffer) {
  return {
    description: `Send a structured message to the user. Use this tool to communicate results,
status updates, or important findings.

Status types:
- "normal"    → Reply to what the user just asked. Use after completing a task.
- "proactive" → Surface something the user hasn't asked for but needs to know NOW:
                task completion while they were away, a blocker you hit, a security
                finding, or any unsolicited but important status update.

Best practices:
- Always call this at the end of every agent turn with a clear summary
- Use markdown formatting in the message for readability
- Attach relevant files (logs, diffs, screenshots) via the attachments field
- Prefer "proactive" when the agent took autonomous action or found something critical`,
    parameters: z.object({
      message: z.string().describe(
        "The message for the user. Supports markdown formatting. Be concise but complete."
      ),
      status: z.enum(["normal", "proactive"]).default("normal").describe(
        'Use "proactive" when surfacing something the user did not ask for. Use "normal" when replying to what they just said.'
      ),
      attachments: z.array(z.string()).optional().describe(
        "Optional file paths (absolute or relative to cwd) to attach. Use for screenshots, diffs, logs, or any file the user should see alongside your message."
      )
    }),
    execute: async ({
      message,
      status,
      attachments
    }) => {
      const brief = {
        message,
        status,
        attachments: attachments ?? [],
        sentAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      buffer.push(brief);
      return `[MESSAGE_SENT:${status}] Message delivered to user at ${brief.sentAt}`;
    }
  };
}
const MODEL_REGISTRY = {
  // ── Anthropic ────────────────────────────────────────────────────────────
  "claude-opus-4-6": {
    contextWindow: 2e5,
    maxOutputTokens: 32e3,
    inputPricePerMToken: 15,
    outputPricePerMToken: 75,
    supportsThinking: true,
    supportsVision: true,
    supportsCaching: true,
    provider: "anthropic",
    displayName: "Claude Opus 4.6"
  },
  "claude-sonnet-4-6": {
    contextWindow: 2e5,
    maxOutputTokens: 16e3,
    inputPricePerMToken: 3,
    outputPricePerMToken: 15,
    supportsThinking: true,
    supportsVision: true,
    supportsCaching: true,
    provider: "anthropic",
    displayName: "Claude Sonnet 4.6"
  },
  "claude-sonnet-4-5": {
    contextWindow: 2e5,
    maxOutputTokens: 16e3,
    inputPricePerMToken: 3,
    outputPricePerMToken: 15,
    supportsThinking: false,
    supportsVision: true,
    supportsCaching: true,
    provider: "anthropic",
    displayName: "Claude Sonnet 4.5"
  },
  "claude-haiku-4-5": {
    contextWindow: 2e5,
    maxOutputTokens: 8e3,
    inputPricePerMToken: 0.25,
    outputPricePerMToken: 1.25,
    supportsThinking: false,
    supportsVision: true,
    supportsCaching: true,
    provider: "anthropic",
    displayName: "Claude Haiku 4.5"
  },
  "claude-opus-4-5": {
    contextWindow: 2e5,
    maxOutputTokens: 32e3,
    inputPricePerMToken: 15,
    outputPricePerMToken: 75,
    supportsThinking: true,
    supportsVision: true,
    supportsCaching: true,
    provider: "anthropic",
    displayName: "Claude Opus 4.5"
  },
  // ── OpenAI ───────────────────────────────────────────────────────────────
  "gpt-4o": {
    contextWindow: 128e3,
    maxOutputTokens: 16384,
    inputPricePerMToken: 2.5,
    outputPricePerMToken: 10,
    supportsThinking: false,
    supportsVision: true,
    supportsCaching: true,
    provider: "openai",
    displayName: "GPT-4o"
  },
  "gpt-4o-mini": {
    contextWindow: 128e3,
    maxOutputTokens: 16384,
    inputPricePerMToken: 0.15,
    outputPricePerMToken: 0.6,
    supportsThinking: false,
    supportsVision: true,
    supportsCaching: true,
    provider: "openai",
    displayName: "GPT-4o mini"
  },
  "o3": {
    contextWindow: 2e5,
    maxOutputTokens: 1e5,
    inputPricePerMToken: 10,
    outputPricePerMToken: 40,
    supportsThinking: true,
    supportsVision: true,
    supportsCaching: false,
    provider: "openai",
    displayName: "o3"
  },
  "o4-mini": {
    contextWindow: 2e5,
    maxOutputTokens: 1e5,
    inputPricePerMToken: 1.1,
    outputPricePerMToken: 4.4,
    supportsThinking: true,
    supportsVision: true,
    supportsCaching: false,
    provider: "openai",
    displayName: "o4-mini"
  },
  // ── Google Gemini ─────────────────────────────────────────────────────────
  "gemini-2.5-pro": {
    contextWindow: 1e6,
    maxOutputTokens: 65536,
    inputPricePerMToken: 1.25,
    outputPricePerMToken: 10,
    supportsThinking: true,
    supportsVision: true,
    supportsCaching: true,
    provider: "google",
    displayName: "Gemini 2.5 Pro"
  },
  "gemini-2.5-flash": {
    contextWindow: 1e6,
    maxOutputTokens: 65536,
    inputPricePerMToken: 0.075,
    outputPricePerMToken: 0.3,
    supportsThinking: true,
    supportsVision: true,
    supportsCaching: true,
    provider: "google",
    displayName: "Gemini 2.5 Flash"
  },
  "gemini-2.0-flash": {
    contextWindow: 1e6,
    maxOutputTokens: 8192,
    inputPricePerMToken: 0.1,
    outputPricePerMToken: 0.4,
    supportsThinking: false,
    supportsVision: true,
    supportsCaching: false,
    provider: "google",
    displayName: "Gemini 2.0 Flash"
  },
  // ── Groq ─────────────────────────────────────────────────────────────────
  "groq/llama-3.3-70b-versatile": {
    contextWindow: 128e3,
    maxOutputTokens: 32768,
    inputPricePerMToken: 0.59,
    outputPricePerMToken: 0.79,
    supportsThinking: false,
    supportsVision: false,
    supportsCaching: false,
    provider: "groq",
    displayName: "Llama 3.3 70B"
  },
  "groq/llama-3.1-8b-instant": {
    contextWindow: 128e3,
    maxOutputTokens: 8192,
    inputPricePerMToken: 0.05,
    outputPricePerMToken: 0.08,
    supportsThinking: false,
    supportsVision: false,
    supportsCaching: false,
    provider: "groq",
    displayName: "Llama 3.1 8B"
  }
};
function normalizeModelKey(model) {
  return model.replace(/^openrouter\//, "").replace(/^google\//, "gemini-").replace(/^anthropic\//, "");
}
function getModelMeta(model) {
  if (MODEL_REGISTRY[model]) return MODEL_REGISTRY[model];
  const normalized = normalizeModelKey(model);
  if (MODEL_REGISTRY[normalized]) return MODEL_REGISTRY[normalized];
  for (const [key, meta] of Object.entries(MODEL_REGISTRY)) {
    if (model.includes(key) || key.includes(normalized)) return meta;
  }
  return null;
}
function getContextWindow(model) {
  return getModelMeta(model)?.contextWindow ?? 128e3;
}
function modelSupportsThinking(model) {
  return getModelMeta(model)?.supportsThinking ?? false;
}
path.join(os.homedir(), ".cowrangler", "cache", "model_meta.json");
class ContextEngine {
}
const COMPRESS_THRESHOLD = 0.85;
const COMPRESS_KEEP_RECENT = 8;
const TOOL_RESULT_MAX_CHARS = 2e3;
const SUMMARY_MAX_TOKENS = 800;
class DefaultContextEngine extends ContextEngine {
  model;
  sessionInputTokens = 0;
  sessionOutputTokens = 0;
  sessionCacheReadTokens = 0;
  sessionCacheWriteTokens = 0;
  contextTokens = 0;
  compressionCount = 0;
  lastRoundDurationMs = 0;
  sessionStartMs;
  thresholdRatio;
  constructor(model, thresholdRatio = COMPRESS_THRESHOLD) {
    super();
    this.model = model;
    this.thresholdRatio = thresholdRatio;
    this.sessionStartMs = Date.now();
  }
  updateFromResponse(usage) {
    this.sessionInputTokens += usage.inputTokens;
    this.sessionOutputTokens += usage.outputTokens;
    this.sessionCacheReadTokens += usage.cacheReadTokens ?? 0;
    this.sessionCacheWriteTokens += usage.cacheWriteTokens ?? 0;
    this.contextTokens = usage.inputTokens;
  }
  setLastRoundDuration(ms) {
    this.lastRoundDurationMs = ms;
  }
  shouldCompress(estimatedContextTokens) {
    const windowSize = getContextWindow(this.model);
    const ratio = estimatedContextTokens / windowSize;
    return ratio >= this.thresholdRatio;
  }
  async compress(messages, llm, systemPrompt) {
    if (messages.length <= COMPRESS_KEEP_RECENT) return messages;
    const pruned = this._pruneToolResults(messages);
    const toSummarize = pruned.slice(0, pruned.length - COMPRESS_KEEP_RECENT);
    const recent = pruned.slice(pruned.length - COMPRESS_KEEP_RECENT);
    if (toSummarize.length === 0) return messages;
    try {
      const summaryText = await this._generateSummary(toSummarize, llm);
      const summaryMessage = {
        role: "user",
        content: `[CONVERSATION SUMMARY — ${toSummarize.length} earlier messages compressed]

` + summaryText
      };
      this.compressionCount++;
      return [summaryMessage, ...recent];
    } catch {
      this.compressionCount++;
      return recent;
    }
  }
  _pruneToolResults(messages) {
    return messages.map((msg) => {
      if (msg.role === "tool") {
        const toolMsg = msg;
        const content = Array.isArray(toolMsg.content) ? toolMsg.content : [
          {
            type: "tool-result",
            toolCallId: "",
            result: String(toolMsg.content)
          }
        ];
        const pruned = content.map((c) => {
          if (c.type === "tool-result") {
            const resultStr = typeof c.result === "string" ? c.result : JSON.stringify(c.result);
            if (resultStr.length > TOOL_RESULT_MAX_CHARS) {
              return {
                ...c,
                result: resultStr.slice(0, TOOL_RESULT_MAX_CHARS) + `
... [${resultStr.length - TOOL_RESULT_MAX_CHARS} chars pruned]`
              };
            }
          }
          return c;
        });
        return { ...msg, content: pruned };
      }
      return msg;
    });
  }
  async _generateSummary(messages, llm) {
    const condensed = messages.map((m) => {
      const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      return `[${m.role.toUpperCase()}]: ${content.slice(0, 300)}`;
    }).join("\n\n");
    const result = await generateText({
      model: llm.getModel(),
      system: "You are a conversation summarizer. Produce a concise factual summary of the conversation history. Preserve: decisions made, files changed, errors encountered, completed tasks, and any pending work. Omit pleasantries. Reply in plain prose, no headers.",
      messages: [
        {
          role: "user",
          content: `Summarize this conversation history:

${condensed}`
        }
      ],
      maxTokens: SUMMARY_MAX_TOKENS
    });
    return result.text;
  }
  getSnapshot() {
    const windowSize = getContextWindow(this.model);
    const usagePercent = Math.min(100, this.contextTokens / windowSize * 100);
    return {
      sessionInputTokens: this.sessionInputTokens,
      sessionOutputTokens: this.sessionOutputTokens,
      sessionTotalTokens: this.sessionInputTokens + this.sessionOutputTokens,
      contextTokens: this.contextTokens,
      contextWindowSize: windowSize,
      contextUsagePercent: usagePercent,
      compressionCount: this.compressionCount,
      lastRoundDurationMs: this.lastRoundDurationMs,
      sessionDurationMs: Date.now() - this.sessionStartMs,
      cacheReadTokens: this.sessionCacheReadTokens,
      cacheWriteTokens: this.sessionCacheWriteTokens
    };
  }
  getContextStyle() {
    const { contextUsagePercent } = this.getSnapshot();
    if (contextUsagePercent >= 95) return "critical";
    if (contextUsagePercent >= 85) return "warning";
    return "normal";
  }
  get cacheStats() {
    return {
      readTokens: this.sessionCacheReadTokens,
      writeTokens: this.sessionCacheWriteTokens
    };
  }
  reset() {
    this.sessionInputTokens = 0;
    this.sessionOutputTokens = 0;
    this.sessionCacheReadTokens = 0;
    this.sessionCacheWriteTokens = 0;
    this.contextTokens = 0;
    this.compressionCount = 0;
    this.lastRoundDurationMs = 0;
    this.sessionStartMs = Date.now();
  }
}
const WAL_INCOMPAT_MARKERS = ["/afs/", "/.nfs", "/smb/", "/Volumes/"];
class SessionDB {
  db;
  dbPath;
  constructor(dbPath) {
    this.dbPath = dbPath ?? path.join(DIRS.global.base, "sessions.db");
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    this.db = new Database(this.dbPath);
    this._configure();
    this._migrate();
  }
  // ── Konfigürasyon ───────────────────────────────────────────────────────────
  _configure() {
    const useWAL = !WAL_INCOMPAT_MARKERS.some((m) => this.dbPath.includes(m));
    if (useWAL) {
      try {
        this.db.pragma("journal_mode = WAL");
      } catch {
        this.db.pragma("journal_mode = DELETE");
      }
    } else {
      this.db.pragma("journal_mode = DELETE");
    }
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("cache_size = -64000");
    this.db.pragma("temp_store = MEMORY");
  }
  // ── Schema Migration ────────────────────────────────────────────────────────
  _migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id                TEXT PRIMARY KEY,
        source            TEXT NOT NULL DEFAULT 'cli',
        model             TEXT NOT NULL DEFAULT '',
        started_at        INTEGER NOT NULL,
        ended_at          INTEGER,
        message_count     INTEGER NOT NULL DEFAULT 0,
        tool_call_count   INTEGER NOT NULL DEFAULT 0,
        input_tokens      INTEGER NOT NULL DEFAULT 0,
        output_tokens     INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cache_write_tokens INTEGER NOT NULL DEFAULT 0,
        billing_provider  TEXT NOT NULL DEFAULT '',
        billing_mode      TEXT NOT NULL DEFAULT 'per_token',
        estimated_cost_usd REAL NOT NULL DEFAULT 0.0,
        parent_session_id TEXT REFERENCES sessions(id),
        title             TEXT,
        workdir           TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_source ON sessions(source);
      CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_session_id);
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id           TEXT PRIMARY KEY,
        session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        role         TEXT NOT NULL,
        content      TEXT NOT NULL DEFAULT '',
        tool_name    TEXT,
        tool_call_id TEXT,
        token_count  INTEGER NOT NULL DEFAULT 0,
        timestamp    INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role);
    `);
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        content,
        role,
        session_id UNINDEXED,
        message_id UNINDEXED,
        tokenize = 'unicode61'
      );

      CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
        INSERT INTO messages_fts(content, role, session_id, message_id)
        VALUES (new.content, new.role, new.session_id, new.id);
      END;

      CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
        DELETE FROM messages_fts WHERE message_id = old.id;
      END;

      CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE OF content ON messages BEGIN
        DELETE FROM messages_fts WHERE message_id = old.id;
        INSERT INTO messages_fts(content, role, session_id, message_id)
        VALUES (new.content, new.role, new.session_id, new.id);
      END;
    `);
  }
  // ── Session CRUD ────────────────────────────────────────────────────────────
  createSession(opts) {
    const id = crypto.randomUUID();
    const now = Date.now();
    this.db.prepare(
      `INSERT INTO sessions (id, source, model, started_at, parent_session_id, title, workdir)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      opts.source ?? "cli",
      opts.model,
      now,
      opts.parentSessionId ?? null,
      opts.title ?? null,
      opts.workdir ?? process.cwd()
    );
    return id;
  }
  updateSession(sessionId, updates) {
    const sets = Object.keys(updates).map((k) => `${k} = ?`).join(", ");
    const values = Object.values(updates);
    this.db.prepare(`UPDATE sessions SET ${sets} WHERE id = ?`).run(...values, sessionId);
  }
  closeSession(sessionId, stats) {
    const msg = this.db.prepare(`SELECT COUNT(*) as cnt FROM messages WHERE session_id = ?`).get(sessionId);
    this.updateSession(sessionId, {
      ended_at: Date.now(),
      message_count: msg.cnt,
      tool_call_count: stats.tool_call_count,
      input_tokens: stats.input_tokens,
      output_tokens: stats.output_tokens,
      cache_read_tokens: stats.cache_read_tokens ?? 0,
      cache_write_tokens: stats.cache_write_tokens ?? 0,
      estimated_cost_usd: stats.estimated_cost_usd ?? 0,
      ...stats.title ? { title: stats.title } : {}
    });
  }
  getSession(sessionId) {
    return this.db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId) ?? null;
  }
  listSessions(opts = {}) {
    let query = `
      SELECT id, source, model, started_at, ended_at, message_count, tool_call_count,
             input_tokens, output_tokens, estimated_cost_usd, title
      FROM sessions
      WHERE 1=1
    `;
    const params = [];
    if (opts.source) {
      query += ` AND source = ?`;
      params.push(opts.source);
    }
    if (opts.since) {
      query += ` AND started_at >= ?`;
      params.push(opts.since);
    }
    query += ` ORDER BY started_at DESC LIMIT ? OFFSET ?`;
    params.push(opts.limit ?? 20, opts.offset ?? 0);
    return this.db.prepare(query).all(...params);
  }
  // ── Message CRUD ────────────────────────────────────────────────────────────
  appendMessage(opts) {
    const id = crypto.randomUUID();
    const now = Date.now();
    this.db.prepare(
      `INSERT INTO messages (id, session_id, role, content, tool_name, tool_call_id, token_count, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      opts.sessionId,
      opts.role,
      opts.content,
      opts.toolName ?? null,
      opts.toolCallId ?? null,
      opts.tokenCount ?? 0,
      now
    );
    this.db.prepare(
      `UPDATE sessions SET message_count = message_count + 1 WHERE id = ?`
    ).run(opts.sessionId);
    return id;
  }
  getMessages(sessionId, opts = {}) {
    return this.db.prepare(
      `SELECT * FROM messages WHERE session_id = ?
         ORDER BY timestamp ASC LIMIT ? OFFSET ?`
    ).all(sessionId, opts.limit ?? 1e3, opts.offset ?? 0);
  }
  // ── FTS5 Arama ──────────────────────────────────────────────────────────────
  searchSessions(query, opts = {}) {
    const safeQuery = query.replace(/['"]/g, " ").trim();
    if (!safeQuery) return [];
    let sql = `
      SELECT
        m.session_id,
        m.id as message_id,
        m.role,
        SUBSTR(m.content, 1, 200) as content_snippet,
        m.timestamp,
        s.title as session_title,
        s.model as session_model,
        fts.rank
      FROM messages_fts fts
      JOIN messages m ON m.id = fts.message_id
      JOIN sessions s ON s.id = m.session_id
      WHERE messages_fts MATCH ?
    `;
    const params = [safeQuery];
    if (opts.sessionId) {
      sql += ` AND m.session_id = ?`;
      params.push(opts.sessionId);
    }
    sql += ` ORDER BY rank LIMIT ?`;
    params.push(opts.limit ?? 20);
    try {
      return this.db.prepare(sql).all(...params);
    } catch {
      return [];
    }
  }
  // ── İstatistikler ────────────────────────────────────────────────────────────
  getStats(since) {
    const sinceMs = since ?? 0;
    const totals = this.db.prepare(
      `SELECT
          COUNT(*) as total_sessions,
          SUM(message_count) as total_messages,
          SUM(input_tokens) as total_input_tokens,
          SUM(output_tokens) as total_output_tokens,
          SUM(estimated_cost_usd) as total_cost_usd
        FROM sessions WHERE started_at >= ?`
    ).get(sinceMs);
    const byModel = this.db.prepare(
      `SELECT model,
          COUNT(*) as sessions,
          SUM(input_tokens + output_tokens) as tokens,
          SUM(estimated_cost_usd) as cost
        FROM sessions WHERE started_at >= ?
        GROUP BY model ORDER BY sessions DESC`
    ).all(sinceMs);
    const bySource = this.db.prepare(
      `SELECT source, COUNT(*) as cnt FROM sessions WHERE started_at >= ? GROUP BY source`
    ).all(sinceMs);
    return {
      total_sessions: totals.total_sessions ?? 0,
      total_messages: totals.total_messages ?? 0,
      total_input_tokens: totals.total_input_tokens ?? 0,
      total_output_tokens: totals.total_output_tokens ?? 0,
      total_cost_usd: totals.total_cost_usd ?? 0,
      by_model: Object.fromEntries(
        byModel.map((r) => [
          r.model,
          { sessions: r.sessions, tokens: r.tokens, cost: r.cost }
        ])
      ),
      by_source: Object.fromEntries(
        bySource.map((r) => [r.source, r.cnt])
      )
    };
  }
  // ── Yardımcı ────────────────────────────────────────────────────────────────
  close() {
    this.db.close();
  }
  get path() {
    return this.dbPath;
  }
}
let _instance$1 = null;
function getSessionDB() {
  if (!_instance$1) {
    _instance$1 = new SessionDB();
  }
  return _instance$1;
}
class PluginManager {
  hooks = /* @__PURE__ */ new Map();
  plugins = [];
  cliCommands = [];
  loaded = false;
  constructor() {
    const events = [
      "pre_tool_call",
      "post_tool_call",
      "pre_llm_call",
      "post_llm_call",
      "on_session_start",
      "on_session_end"
    ];
    for (const e of events) this.hooks.set(e, []);
  }
  // ── Plugin Discovery ────────────────────────────────────────────────────────
  async loadAll() {
    if (this.loaded) return;
    this.loaded = true;
    await this._loadFromDir(DIRS.global.base, "global");
    await this._loadFromDir(DIRS.local.base, "local");
  }
  async _loadFromDir(baseDir, source) {
    const pluginsDir = path.join(baseDir, "plugins");
    if (!fs.existsSync(pluginsDir)) return;
    let entries;
    try {
      entries = fs.readdirSync(pluginsDir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const pluginDir = path.join(pluginsDir, entry);
      if (!fs.statSync(pluginDir).isDirectory()) continue;
      const entryFiles = ["index.js", "index.mjs"];
      let entryFile = null;
      for (const f of entryFiles) {
        if (fs.existsSync(path.join(pluginDir, f))) {
          entryFile = path.join(pluginDir, f);
          break;
        }
      }
      if (!entryFile) continue;
      const registration = {
        name: entry,
        dir: pluginDir,
        source,
        active: false
      };
      try {
        const ctx = this._createContext(entry, pluginDir);
        const module = await import(`file://${entryFile}`);
        if (typeof module.register === "function") {
          await module.register(ctx);
          registration.active = true;
        } else {
          registration.error = "No 'register' export found";
        }
      } catch (err) {
        registration.error = err.message ?? String(err);
      }
      this.plugins.push(registration);
    }
  }
  _createContext(pluginName, pluginDir) {
    const self = this;
    return {
      pluginName,
      pluginDir,
      registerHook(event, fn) {
        const list = self.hooks.get(event) ?? [];
        list.push(fn);
        self.hooks.set(event, list);
      },
      registerTool(name, description, parameters, execute) {
        registerTool(name, description, parameters, execute);
      },
      registerCliCommand(name, description, handler) {
        self.cliCommands.push({ name, description, handler, pluginName });
      }
    };
  }
  // ── Hook Emitter ─────────────────────────────────────────────────────────────
  /** Senkron emit — hata fırlatsa bile diğer hook'lar çalışır */
  emit(event, data) {
    const fns = this.hooks.get(event) ?? [];
    for (const fn of fns) {
      try {
        fn(data);
      } catch (err) {
        console.error(`[plugin:${event}] hook error:`, err);
      }
    }
  }
  /** Async emit — await ile beklenir, sıralı çalışır */
  async emitAsync(event, data) {
    const fns = this.hooks.get(event) ?? [];
    for (const fn of fns) {
      try {
        await fn(data);
      } catch (err) {
        console.error(`[plugin:${event}] async hook error:`, err);
      }
    }
  }
  // ── CLI Command Routing ───────────────────────────────────────────────────────
  getCliCommands() {
    return [...this.cliCommands];
  }
  async runCliCommand(name, args) {
    const cmd = this.cliCommands.find((c) => c.name === name);
    if (!cmd) return false;
    await cmd.handler(args);
    return true;
  }
  // ── Status ───────────────────────────────────────────────────────────────────
  getPlugins() {
    return [...this.plugins];
  }
  summary() {
    const active = this.plugins.filter((p) => p.active).length;
    const total = this.plugins.length;
    const hooks = [...this.hooks.values()].reduce((s, a) => s + a.length, 0);
    return `${active}/${total} plugins active, ${hooks} hooks registered, ${this.cliCommands.length} CLI commands`;
  }
}
let _instance = null;
function getPluginManager() {
  if (!_instance) {
    _instance = new PluginManager();
  }
  return _instance;
}
const LEVEL_PRIORITY = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_BACKUPS = 5;
class RotatingFile {
  constructor(filePath) {
    this.filePath = filePath;
    this._open();
  }
  fd = null;
  currentBytes = 0;
  write(line) {
    const buf = Buffer.from(line + "\n", "utf-8");
    if (this.currentBytes + buf.length > MAX_FILE_BYTES) {
      this._rotate();
    }
    try {
      if (this.fd === null) this._open();
      fs.writeSync(this.fd, buf);
      this.currentBytes += buf.length;
    } catch {
    }
  }
  _open() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      this.fd = fs.openSync(this.filePath, "a");
      const stat = fs.fstatSync(this.fd);
      this.currentBytes = stat.size;
    } catch {
      this.fd = null;
    }
  }
  _rotate() {
    if (this.fd !== null) {
      try {
        fs.closeSync(this.fd);
      } catch {
      }
      this.fd = null;
    }
    for (let i = MAX_BACKUPS - 1; i >= 1; i--) {
      const from = `${this.filePath}.${i}`;
      const to = `${this.filePath}.${i + 1}`;
      try {
        if (fs.existsSync(from)) fs.renameSync(from, to);
      } catch {
      }
    }
    try {
      if (fs.existsSync(this.filePath)) {
        fs.renameSync(this.filePath, `${this.filePath}.1`);
      }
    } catch {
    }
    this.currentBytes = 0;
    this._open();
  }
  close() {
    if (this.fd !== null) {
      try {
        fs.closeSync(this.fd);
      } catch {
      }
      this.fd = null;
    }
  }
}
class Logger {
  files = /* @__PURE__ */ new Map();
  minLevel;
  logsDir;
  consoleEnabled;
  constructor() {
    const level = (process.env.COWRANGLER_LOG_LEVEL ?? "info").toLowerCase();
    this.minLevel = LEVEL_PRIORITY[level] ?? LEVEL_PRIORITY.info;
    const home = process.env.COWRANGLER_HOME ?? path.join(os.homedir(), ".cowrangler");
    this.logsDir = path.join(home, "logs");
    this.consoleEnabled = this.minLevel === LEVEL_PRIORITY.debug;
  }
  // ── Public API ────────────────────────────────────────────────────────────
  debug(channel, message, ctx) {
    this._log("debug", channel, message, ctx);
  }
  info(channel, message, ctx) {
    this._log("info", channel, message, ctx);
  }
  warn(channel, message, ctx) {
    this._log("warn", channel, message, ctx);
  }
  error(channel, message, err, ctx) {
    const errorCtx = { ...ctx };
    if (err instanceof Error) {
      errorCtx.error = err.message;
      if (err.stack) errorCtx.stack = err.stack.split("\n").slice(0, 5).join(" | ");
    } else if (err !== void 0) {
      errorCtx.error = String(err);
    }
    this._log("error", channel, message, errorCtx);
    if (channel !== "errors") {
      this._log("error", "errors", `[${channel}] ${message}`, errorCtx);
    }
  }
  /**
   * Belirli bir kanalın son N satırını döndürür (cowrangler logs komutu için).
   */
  tail(channel, lines = 50) {
    const filePath = path.join(this.logsDir, `${channel}.log`);
    if (!fs.existsSync(filePath)) return [];
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const all = content.trimEnd().split("\n");
      return all.slice(-lines);
    } catch {
      return [];
    }
  }
  /**
   * Log dosyalarının boyutlarını döndürür (doctor/status için).
   */
  stats() {
    const channels = ["agent", "errors", "gateway", "cron", "kanban"];
    const result = {};
    for (const ch of channels) {
      const filePath = path.join(this.logsDir, `${ch}.log`);
      try {
        const stat = fs.statSync(filePath);
        result[ch] = { sizeBytes: stat.size, exists: true };
      } catch {
        result[ch] = { sizeBytes: 0, exists: false };
      }
    }
    return result;
  }
  close() {
    for (const file of this.files.values()) file.close();
    this.files.clear();
  }
  // ── Internal ──────────────────────────────────────────────────────────────
  _log(level, channel, message, ctx) {
    if (LEVEL_PRIORITY[level] < this.minLevel) return;
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    const lvl = level.toUpperCase().padEnd(5);
    const ctxStr = ctx && Object.keys(ctx).length > 0 ? " " + JSON.stringify(ctx) : "";
    const line = `[${ts}] [${lvl}] [${channel}] ${message}${ctxStr}`;
    const file = this._getFile(channel);
    file.write(line);
    if (this.consoleEnabled) {
      process.stderr.write(line + "\n");
    }
  }
  _getFile(channel) {
    let file = this.files.get(channel);
    if (!file) {
      const filePath = path.join(this.logsDir, `${channel}.log`);
      file = new RotatingFile(filePath);
      this.files.set(channel, file);
    }
    return file;
  }
}
let _logger = null;
function getLogger() {
  if (!_logger) _logger = new Logger();
  return _logger;
}
const PROVIDER_ENV_VARS = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  groq: "GROQ_API_KEY",
  mistral: "MISTRAL_API_KEY",
  cohere: "COHERE_API_KEY",
  github: "GITHUB_TOKEN",
  xai: "XAI_API_KEY",
  perplexity: "PERPLEXITY_API_KEY"
};
const RATE_LIMIT_COOLDOWN_MS = 6e4;
const ERROR_COOLDOWN_MS = 3e4;
const DEGRADED_THRESHOLD = 3;
class CredentialPool {
  /** provider adı → anahtar listesi */
  pools = /* @__PURE__ */ new Map();
  constructor() {
    this.loadFromEnv();
  }
  // ── Yükleme ────────────────────────────────────────────────────────────────
  /**
   * ENV değişkenlerinden pool'u yükle.
   *
   * Format:
   *   ANTHROPIC_API_KEY=sk-ant-primary        ← primary anahtar
   *   ANTHROPIC_API_KEY_POOL=sk-1,sk-2,sk-3   ← havuz anahtarları (virgülle ayrılmış)
   */
  loadFromEnv() {
    this.pools.clear();
    for (const [provider, envVar] of Object.entries(PROVIDER_ENV_VARS)) {
      const keys = [];
      const primary = process.env[envVar];
      if (primary?.trim()) keys.push(primary.trim());
      const poolVar = `${envVar}_POOL`;
      const poolVal = process.env[poolVar];
      if (poolVal?.trim()) {
        const poolKeys = poolVal.split(",").map((k) => k.trim()).filter(Boolean);
        for (const k of poolKeys) {
          if (!keys.includes(k)) keys.push(k);
        }
      }
      if (keys.length > 0) {
        const entries = keys.map((key) => ({
          key,
          provider,
          useCount: 0,
          lastUsedAt: 0,
          rateLimitedUntil: 0,
          errorCount: 0,
          totalErrors: 0
        }));
        this.pools.set(provider, entries);
      }
    }
    getLogger().info(
      "agent",
      `CredentialPool loaded: ${this.pools.size} provider(s)`,
      {
        providers: Array.from(this.pools.entries()).map(([p, keys]) => ({
          provider: p,
          keyCount: keys.length
        }))
      }
    );
  }
  // ── Anahtar Seçimi ─────────────────────────────────────────────────────────
  /**
   * Verilen provider için en uygun anahtarı döndür.
   *
   * Strateji: Least-used (en az kullanılan) sağlıklı anahtar.
   * Tüm anahtarlar rate limit'te ise en erken kurtulacak olanı döndür.
   * Provider bilinmiyorsa veya hiç anahtar yoksa null döner.
   */
  getKey(provider) {
    const normalised = this._normaliseProvider(provider);
    const pool = this.pools.get(normalised);
    if (!pool || pool.length === 0) return null;
    const now = Date.now();
    const healthy = pool.filter((e) => e.rateLimitedUntil <= now);
    if (healthy.length > 0) {
      const chosen = healthy.reduce(
        (best, e) => e.useCount < best.useCount ? e : best
      );
      chosen.useCount++;
      chosen.lastUsedAt = now;
      return chosen.key;
    }
    const soonest = pool.reduce(
      (best, e) => e.rateLimitedUntil < best.rateLimitedUntil ? e : best
    );
    getLogger().warn(
      "agent",
      `All keys rate-limited for provider '${normalised}', using soonest recovery (${Math.ceil((soonest.rateLimitedUntil - now) / 1e3)}s)`
    );
    soonest.useCount++;
    soonest.lastUsedAt = now;
    return soonest.key;
  }
  /**
   * Belirli bir anahtarı döndür (provider'ın ilk anahtarını).
   * Kullanıcının açıkça bir anahtar belirttiği durumlar için.
   */
  getPrimaryKey(provider) {
    const normalised = this._normaliseProvider(provider);
    const pool = this.pools.get(normalised);
    if (!pool || pool.length === 0) return null;
    return pool[0].key;
  }
  // ── Sağlık Bildirimleri ─────────────────────────────────────────────────────
  /** Bir anahtarı rate limited olarak işaretle */
  markRateLimited(provider, key, cooldownMs = RATE_LIMIT_COOLDOWN_MS) {
    const entry = this._findEntry(provider, key);
    if (!entry) return;
    entry.rateLimitedUntil = Date.now() + cooldownMs;
    entry.errorCount++;
    entry.totalErrors++;
    getLogger().warn(
      "agent",
      `Key rate-limited: ${this._maskKey(key)} (${provider}) — cooldown ${cooldownMs / 1e3}s`
    );
  }
  /** Geçici hata (5xx, network) — kısa cooldown */
  markError(provider, key) {
    const entry = this._findEntry(provider, key);
    if (!entry) return;
    entry.errorCount++;
    entry.totalErrors++;
    if (entry.errorCount >= DEGRADED_THRESHOLD) {
      entry.rateLimitedUntil = Date.now() + ERROR_COOLDOWN_MS;
      getLogger().warn(
        "agent",
        `Key degraded after ${entry.errorCount} errors: ${this._maskKey(key)} (${provider})`
      );
    }
  }
  /** Başarılı istek — hata sayacını sıfırla */
  markSuccess(provider, key) {
    const entry = this._findEntry(provider, key);
    if (!entry) return;
    entry.errorCount = 0;
    entry.rateLimitedUntil = 0;
  }
  // ── Havuz Yönetimi ──────────────────────────────────────────────────────────
  /**
   * Pool'a yeni anahtar ekle (ve credentials.env'e kaydet).
   */
  addKey(provider, key) {
    const normalised = this._normaliseProvider(provider);
    if (!this.pools.has(normalised)) {
      this.pools.set(normalised, []);
    }
    const pool = this.pools.get(normalised);
    if (pool.some((e) => e.key === key)) {
      getLogger().info("agent", `Key already in pool for ${normalised}`);
      return;
    }
    pool.push({
      key,
      provider: normalised,
      useCount: 0,
      lastUsedAt: 0,
      rateLimitedUntil: 0,
      errorCount: 0,
      totalErrors: 0
    });
    this._persistPool(normalised);
    getLogger().info(
      "agent",
      `Key added to pool: ${normalised} (${pool.length} total)`
    );
  }
  /**
   * Pool'dan anahtar kaldır (ve credentials.env'i güncelle).
   */
  removeKey(provider, key) {
    const normalised = this._normaliseProvider(provider);
    const pool = this.pools.get(normalised);
    if (!pool) return false;
    const idx = pool.findIndex((e) => e.key === key);
    if (idx === -1) return false;
    pool.splice(idx, 1);
    this._persistPool(normalised);
    getLogger().info(
      "agent",
      `Key removed from pool: ${normalised} (${pool.length} remaining)`
    );
    return true;
  }
  // ── Durum Sorgulama ─────────────────────────────────────────────────────────
  /** Tüm provider'ların havuz durumunu döndür */
  getStatus() {
    const now = Date.now();
    return Array.from(this.pools.entries()).map(([provider, keys]) => {
      const healthy = keys.filter((e) => e.rateLimitedUntil <= now);
      const rateLimited = keys.filter((e) => e.rateLimitedUntil > now);
      return {
        provider,
        total: keys.length,
        healthy: healthy.length,
        rateLimited: rateLimited.length,
        keys: keys.map((e) => ({
          masked: this._maskKey(e.key),
          useCount: e.useCount,
          errorCount: e.errorCount,
          status: e.rateLimitedUntil > now ? "rate_limited" : e.errorCount >= DEGRADED_THRESHOLD ? "degraded" : "healthy",
          rateLimitedUntil: e.rateLimitedUntil > now ? e.rateLimitedUntil : void 0,
          lastUsedAt: e.lastUsedAt
        }))
      };
    });
  }
  /** Provider'ın havuzundaki toplam anahtar sayısı */
  keyCount(provider) {
    const pool = this.pools.get(this._normaliseProvider(provider));
    return pool?.length ?? 0;
  }
  /** Provider için pool var mı? (birden fazla anahtar varsa true) */
  hasPool(provider) {
    return this.keyCount(provider) > 1;
  }
  // ── Özel Yardımcılar ────────────────────────────────────────────────────────
  _normaliseProvider(provider) {
    return provider.split("/")[0].toLowerCase();
  }
  _findEntry(provider, key) {
    const pool = this.pools.get(this._normaliseProvider(provider));
    return pool?.find((e) => e.key === key);
  }
  _maskKey(key) {
    if (key.length <= 10) return "••••••••";
    return `${key.slice(0, 6)}${"•".repeat(8)}${key.slice(-4)}`;
  }
  /**
   * Provider'ın pool anahtarlarını credentials.env dosyasına yaz.
   * Format: PROVIDER_API_KEY_POOL=key1,key2,key3
   */
  _persistPool(provider) {
    const pool = this.pools.get(provider);
    if (!pool || pool.length === 0) return;
    const envVar = PROVIDER_ENV_VARS[provider];
    if (!envVar) return;
    const poolKeys = pool.slice(1).map((e) => e.key);
    const poolVar = `${envVar}_POOL`;
    const poolVal = poolKeys.join(",");
    if (!fs.existsSync(DIRS.global.credentials)) return;
    let content = fs.readFileSync(DIRS.global.credentials, "utf-8");
    if (poolKeys.length === 0) {
      content = content.replace(new RegExp(`^${poolVar}=.*
?`, "m"), "");
    } else {
      const regex = new RegExp(`^${poolVar}=.*`, "m");
      content = regex.test(content) ? content.replace(regex, `${poolVar}=${poolVal}`) : content.trimEnd() + `
${poolVar}=${poolVal}
`;
    }
    fs.writeFileSync(DIRS.global.credentials, content, "utf-8");
  }
}
const PROVIDER_TO_ENV = PROVIDER_ENV_VARS;
function providerFromModel(model) {
  if (model.startsWith("claude-")) return "anthropic";
  if (model.startsWith("gpt-") || model.startsWith("o1-") || model.startsWith("o3-") || model.startsWith("o4-"))
    return "openai";
  if (model.startsWith("gemini-")) return "google";
  if (model.startsWith("vertex/")) return null;
  if (model.startsWith("copilot/")) return "github";
  if (model.startsWith("groq/")) return "groq";
  if (model.startsWith("openrouter/") || model.includes("/"))
    return "openrouter";
  return null;
}
let _pool = null;
function getCredentialPool() {
  if (!_pool) {
    _pool = new CredentialPool();
  }
  return _pool;
}
function rotateCredentialPoolKey(model) {
  const pool = getCredentialPool();
  const provider = providerFromModel(model);
  if (!provider) return false;
  const envVar = PROVIDER_TO_ENV[provider];
  if (!envVar) return false;
  const currentKey = process.env[envVar];
  if (!currentKey) return false;
  if (!pool.hasPool(provider)) return false;
  pool.markRateLimited(provider, currentKey);
  const nextKey = pool.getKey(provider);
  if (!nextKey || nextKey === currentKey) return false;
  process.env[envVar] = nextKey;
  const masked = nextKey.length > 10 ? `${nextKey.slice(0, 6)}${"•".repeat(8)}${nextKey.slice(-4)}` : "••••••••";
  getLogger().info("agent", `Credential rotated: ${provider} → ${masked}`);
  return true;
}
function _supportsThinking(model) {
  return modelSupportsThinking(model);
}
const RETRYABLE_CODES = /* @__PURE__ */ new Set([429, 500, 503]);
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1e3;
function isRetryable(error) {
  if (!error || typeof error !== "object") return false;
  const e = error;
  const code = e.statusCode ?? e.status ?? e.code;
  if (typeof code === "number" && RETRYABLE_CODES.has(code)) return true;
  const msg = (e.message ?? "").toLowerCase();
  return msg.includes("rate limit") || msg.includes("too many requests") || msg.includes("service unavailable");
}
class Agent {
  llm;
  maxIterations;
  /** CLI görünüm modu — /mode komutu veya Ctrl+O ile değiştirilir */
  viewMode = "default";
  /** Per-instance brief message buffer */
  briefBuffer;
  /** Context engine — token tabanlı sıkıştırma + istatistikler */
  contextEngine;
  /** Session DB kimliği — null ise kayıt yapılmaz */
  sessionId = null;
  sessionToolCallCount = 0;
  skillManager;
  originalPrompt;
  baseSystemPrompt;
  messages = [];
  allowedTools;
  /** Interrupt flag — /stop veya Ctrl+C */
  _interruptRequested = false;
  /** Trajectory recorder — null ise kayıt yapılmaz */
  trajectoryRecorder = null;
  constructor(llm, systemPrompt, maxIterations = 25, allowedTools, sessionSource = "cli") {
    this.llm = llm;
    this.maxIterations = maxIterations;
    this.allowedTools = allowedTools;
    this.skillManager = new SkillManager();
    this.originalPrompt = systemPrompt;
    this.baseSystemPrompt = this._buildSystemPrompt(systemPrompt);
    this.briefBuffer = new BriefBuffer();
    this.contextEngine = new DefaultContextEngine(llm.model);
    this._startSession(sessionSource);
    getPluginManager().emit("on_session_start", this.sessionId);
  }
  _startSession(source) {
    try {
      const db = getSessionDB();
      this.sessionId = db.createSession({
        source,
        model: this.llm.model,
        workdir: process.cwd()
      });
    } catch {
      this.sessionId = null;
    }
  }
  _buildSystemPrompt(basePrompt) {
    let finalPrompt = basePrompt;
    if (fs.existsSync(COWRNGLR_MD)) {
      const cowrnglrContent = fs.readFileSync(COWRNGLR_MD, "utf-8").trim();
      if (cowrnglrContent) {
        finalPrompt += `

[COWRNGLR.md — PROJECT CONTEXT]
This file was generated by /init and may have been manually edited. Treat it as the authoritative source of truth for this project:
---
${cowrnglrContent}
---`;
      }
    }
    if (fs.existsSync(DIRS.local.memory)) {
      const memoryContent = fs.readFileSync(DIRS.local.memory, "utf-8").trim();
      if (memoryContent) {
        finalPrompt += `

[PROJECT MEMORY]
The following contains authoritative facts about the project. Always respect these:
---
${memoryContent}
---`;
      }
    }
    const skills = this.skillManager.getAvailableSkills();
    if (skills.length > 0) {
      const skillsText = skills.map((s) => `- **${s.id}**: ${s.description}`).join("\n");
      finalPrompt += `

[AVAILABLE SKILLS]
You have the following Standard Operating Procedures (SOPs). When a user request matches one, load it with \`utilize_skill\` before starting:
${skillsText}`;
    }
    return finalPrompt;
  }
  getTools() {
    let base;
    if (!this.allowedTools || this.allowedTools.includes("*")) {
      base = { ...TOOL_SCHEMAS };
    } else {
      base = {};
      for (const [key, value] of Object.entries(TOOL_SCHEMAS)) {
        if (this.allowedTools.includes(key)) base[key] = value;
      }
    }
    base["send_message"] = createSendMessageTool(this.briefBuffer);
    return base;
  }
  setModel(newLlm) {
    this.llm = newLlm;
    this.contextEngine = new DefaultContextEngine(newLlm.model);
  }
  refreshSystemPrompt() {
    this.baseSystemPrompt = this._buildSystemPrompt(this.originalPrompt);
  }
  requestInterrupt() {
    this._interruptRequested = true;
  }
  clearInterrupt() {
    this._interruptRequested = false;
  }
  /**
   * Ana chat döngüsü.
   *
   * Callbacks:
   *   onToolCall(name, args)  — araç çağrıldığında
   *   onStepText(text)        — model ara metin ürettiğinde
   *
   * Returns: AgentChatResult
   */
  async chat(userMessage, onToolCall, onStepText) {
    const roundStart = Date.now();
    this._interruptRequested = false;
    const log = getLogger();
    log.info("agent", "Chat round started", {
      model: this.llm.model,
      messageCount: this.messages.length,
      userMessageLength: userMessage.length
    });
    const plugins = getPluginManager();
    await plugins.emitAsync("pre_llm_call", { messages: this.messages, model: this.llm.model });
    const snap = this.contextEngine.getSnapshot();
    if (this.contextEngine.shouldCompress(snap.contextTokens)) {
      this.messages = await this.contextEngine.compress(
        this.messages,
        this.llm,
        this.baseSystemPrompt
      );
    }
    this.messages.push({ role: "user", content: userMessage });
    if (this.sessionId) {
      try {
        getSessionDB().appendMessage({
          sessionId: this.sessionId,
          role: "user",
          content: userMessage
        });
      } catch {
      }
    }
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTokens = 0;
    let totalCacheReadTokens = 0;
    let totalCacheWriteTokens = 0;
    let finalText = "";
    let responseMessages = [];
    let roundToolCallCount = 0;
    try {
      let lastError;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (this._interruptRequested) break;
        if (attempt > 0) {
          await new Promise(
            (r) => setTimeout(r, BASE_BACKOFF_MS * Math.pow(2, attempt - 1))
          );
        }
        try {
          let stepInputTokens = 0;
          let stepOutputTokens = 0;
          let stepCacheReadTokens = 0;
          let stepCacheWriteTokens = 0;
          const isAnthropic = this.llm.model.startsWith("claude-");
          const thinkingEnabled = isAnthropic && process.env.COWRANGLER_THINKING === "1" && _supportsThinking(this.llm.model);
          const thinkingBudget = parseInt(
            process.env.COWRANGLER_THINKING_BUDGET ?? "8000",
            10
          );
          const systemMessage = isAnthropic ? {
            role: "system",
            content: this.baseSystemPrompt,
            providerOptions: {
              anthropic: { cacheControl: { type: "ephemeral" } }
            }
          } : null;
          const messagesWithSystem = systemMessage ? [systemMessage, ...this.messages.filter((m) => m.role !== "system")] : this.messages.filter((m) => m.role !== "system");
          const callOptions = {
            model: this.llm.getModel(),
            ...isAnthropic ? {} : { system: this.baseSystemPrompt },
            messages: messagesWithSystem,
            tools: this.getTools(),
            maxSteps: this.maxIterations,
            ...thinkingEnabled ? {
              providerOptions: {
                anthropic: {
                  thinking: { type: "enabled", budgetTokens: thinkingBudget }
                }
              }
            } : {},
            onStepFinish: async ({ text, toolCalls, usage, providerMetadata }) => {
              if (this._interruptRequested) return;
              if (text?.trim() && onStepText) {
                onStepText(text.trim());
              }
              if (toolCalls && toolCalls.length > 0) {
                for (const call of toolCalls) {
                  roundToolCallCount++;
                  await plugins.emitAsync("pre_tool_call", {
                    toolName: call.toolName,
                    args: call.args
                  });
                  if (onToolCall) {
                    onToolCall(call.toolName, call.args);
                  }
                }
              }
              if (usage) {
                stepInputTokens += usage.promptTokens ?? 0;
                stepOutputTokens += usage.completionTokens ?? 0;
                await plugins.emitAsync("post_llm_call", { usage });
              }
              if (providerMetadata?.anthropic?.usage) {
                const au = providerMetadata.anthropic.usage;
                stepCacheReadTokens += au.cacheReadInputTokens ?? 0;
                stepCacheWriteTokens += au.cacheCreationInputTokens ?? 0;
              }
            }
          };
          const result = await generateText(callOptions);
          finalText = result.text;
          totalInputTokens = stepInputTokens > 0 ? stepInputTokens : result.usage?.promptTokens ?? 0;
          totalOutputTokens = stepOutputTokens > 0 ? stepOutputTokens : result.usage?.completionTokens ?? 0;
          totalTokens = totalInputTokens + totalOutputTokens;
          if (result.providerMetadata?.anthropic) {
            const au = result.providerMetadata.anthropic.usage;
            if (au) {
              stepCacheReadTokens += au.cacheReadInputTokens ?? 0;
              stepCacheWriteTokens += au.cacheCreationInputTokens ?? 0;
            }
          }
          responseMessages = result.response.messages;
          lastError = void 0;
          totalCacheReadTokens += stepCacheReadTokens;
          totalCacheWriteTokens += stepCacheWriteTokens;
          break;
        } catch (err) {
          lastError = err;
          const e = err;
          const statusCode = e?.statusCode ?? e?.status ?? e?.code;
          const isRateLimit = statusCode === 429 || (e?.message ?? "").toLowerCase().includes("rate limit") || (e?.message ?? "").toLowerCase().includes("too many requests");
          if (isRateLimit && rotateCredentialPoolKey(this.llm.model)) {
            getLogger().info(
              "agent",
              "Rate limit hit — rotated to next credential pool key"
            );
            continue;
          }
          if (attempt < MAX_RETRIES && isRetryable(err)) continue;
          throw err;
        }
      }
      if (responseMessages.length === 0 && lastError) throw lastError;
      for (const msg of responseMessages) {
        this.messages.push(msg);
      }
      const durationMs = Date.now() - roundStart;
      this.contextEngine.updateFromResponse({
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cacheReadTokens: totalCacheReadTokens,
        cacheWriteTokens: totalCacheWriteTokens
      });
      this.contextEngine.setLastRoundDuration(durationMs);
      this.sessionToolCallCount += roundToolCallCount;
      if (this.sessionId) {
        try {
          const db = getSessionDB();
          db.appendMessage({
            sessionId: this.sessionId,
            role: "assistant",
            content: finalText,
            tokenCount: totalOutputTokens
          });
          db.updateSession(this.sessionId, {
            input_tokens: this.contextEngine.getSnapshot().sessionInputTokens,
            output_tokens: this.contextEngine.getSnapshot().sessionOutputTokens,
            tool_call_count: this.sessionToolCallCount
          });
        } catch {
        }
      }
      if (roundToolCallCount > 0) {
        await plugins.emitAsync("post_tool_call", {
          count: roundToolCallCount
        });
      }
      const durationMs2 = Date.now() - roundStart;
      log.info("agent", "Chat round completed", {
        model: this.llm.model,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cacheReadTokens: totalCacheReadTokens,
        cacheWriteTokens: totalCacheWriteTokens,
        toolCalls: roundToolCallCount,
        durationMs: durationMs2
      });
      if (this.trajectoryRecorder) {
        this.trajectoryRecorder.recordTurn({
          userMessage,
          assistantResponse: finalText,
          toolCalls: [],
          // tool call isimlerini onStepFinish'ten almak için geliştirilecek
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          tokenCount: totalTokens,
          durationMs: durationMs2
        });
      }
      return {
        text: finalText,
        tokenCount: totalTokens,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        toolCallCount: roundToolCallCount,
        durationMs: durationMs2
      };
    } catch (error) {
      const e = error;
      getLogger().error("agent", "Chat round failed", {
        model: this.llm.model,
        error: e?.message ?? String(error),
        status: e?.statusCode ?? e?.status ?? e?.code,
        responseBody: e?.responseBody ?? e?.data ?? void 0,
        url: e?.url ?? void 0
      });
      this.messages.pop();
      throw error;
    }
  }
  /** Context snapshot — status bar için */
  getContextSnapshot() {
    return this.contextEngine.getSnapshot();
  }
  /** Kısa model adı — status bar için */
  get modelShortName() {
    return this.llm.model.replace("openrouter/", "").replace("google/", "").replace("anthropic/", "").split("/").pop()?.replace("claude-", "")?.replace("gemini-", "gem-") ?? this.llm.model;
  }
  reset() {
    if (this.sessionId) {
      try {
        const snap = this.contextEngine.getSnapshot();
        getSessionDB().closeSession(this.sessionId, {
          input_tokens: snap.sessionInputTokens,
          output_tokens: snap.sessionOutputTokens,
          tool_call_count: this.sessionToolCallCount
        });
        getPluginManager().emit("on_session_end", this.sessionId);
      } catch {
      }
    }
    this.messages = [];
    this.briefBuffer.clear();
    this.contextEngine.reset();
    this.sessionToolCallCount = 0;
    this.baseSystemPrompt = this._buildSystemPrompt(this.originalPrompt);
    this._startSession("cli");
  }
  /** Oturum kimliği */
  get currentSessionId() {
    return this.sessionId;
  }
  get contextLength() {
    return this.messages.length;
  }
}
class LLM {
  model;
  constructor(model, temperature = 0.7) {
    this.model = model;
    this._validateRequiredVars(model);
  }
  /**
   * Sadece env var eksikliğini kontrol eder, SDK nesnesi oluşturmaz.
   * MISSING_KEY hatası fırlatılırsa /model set anında kullanıcıya bildirilir.
   */
  _validateRequiredVars(modelName) {
    if (modelName.startsWith("anthropic/")) {
      if (!process.env.ANTHROPIC_API_KEY)
        throw new Error("MISSING_KEY:ANTHROPIC_API_KEY");
      return;
    }
    if (modelName.startsWith("openai/")) {
      if (!process.env.OPENAI_API_KEY)
        throw new Error("MISSING_KEY:OPENAI_API_KEY");
      return;
    }
    if (modelName.startsWith("google/")) {
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY)
        throw new Error("MISSING_KEY:GOOGLE_GENERATIVE_AI_API_KEY");
      return;
    }
    if (modelName.startsWith("gpt-") || modelName.startsWith("o1-") || modelName.startsWith("o3-") || modelName.startsWith("o4-")) {
      if (!process.env.OPENAI_API_KEY)
        throw new Error("MISSING_KEY:OPENAI_API_KEY");
    } else if (modelName.startsWith("claude-")) {
      if (!process.env.ANTHROPIC_API_KEY)
        throw new Error("MISSING_KEY:ANTHROPIC_API_KEY");
    } else if (modelName.startsWith("gemini-")) {
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY)
        throw new Error("MISSING_KEY:GOOGLE_GENERATIVE_AI_API_KEY");
    } else if (modelName.startsWith("vertex/")) {
      if (!process.env.GOOGLE_VERTEX_PROJECT)
        throw new Error("MISSING_KEY:GOOGLE_VERTEX_PROJECT");
    } else if (modelName.startsWith("copilot/")) {
      if (!process.env.GITHUB_TOKEN)
        throw new Error("MISSING_KEY:GITHUB_TOKEN");
    } else if (modelName.startsWith("groq/")) {
      if (!process.env.GROQ_API_KEY)
        throw new Error("MISSING_KEY:GROQ_API_KEY");
    } else if (modelName.startsWith("openrouter/") || modelName.includes("/")) {
      if (!process.env.OPENROUTER_API_KEY)
        throw new Error("MISSING_KEY:OPENROUTER_API_KEY");
    } else if (!modelName.includes("/")) {
      throw new Error(`UNSUPPORTED_MODEL:${modelName}`);
    }
  }
  /**
   * Her çağrıda mevcut env var'larını okuyarak sağlayıcı nesnesi oluşturur.
   * Lazy + fresh: /key set sonrası bir sonraki mesajda otomatik yansır.
   */
  resolveProvider(modelName) {
    if (modelName.startsWith("anthropic/")) {
      if (!process.env.ANTHROPIC_API_KEY)
        throw new Error("MISSING_KEY:ANTHROPIC_API_KEY");
      const anthropic = createAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });
      return anthropic(modelName.slice("anthropic/".length));
    }
    if (modelName.startsWith("openai/")) {
      if (!process.env.OPENAI_API_KEY)
        throw new Error("MISSING_KEY:OPENAI_API_KEY");
      const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
      return openai(modelName.slice("openai/".length));
    }
    if (modelName.startsWith("google/")) {
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY)
        throw new Error("MISSING_KEY:GOOGLE_GENERATIVE_AI_API_KEY");
      const google = createGoogleGenerativeAI({
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY
      });
      return google(modelName.slice("google/".length));
    }
    if (modelName.startsWith("gpt-") || modelName.startsWith("o1-") || modelName.startsWith("o3-") || modelName.startsWith("o4-")) {
      if (!process.env.OPENAI_API_KEY)
        throw new Error("MISSING_KEY:OPENAI_API_KEY");
      const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
      return openai(modelName);
    }
    if (modelName.startsWith("claude-")) {
      if (!process.env.ANTHROPIC_API_KEY)
        throw new Error("MISSING_KEY:ANTHROPIC_API_KEY");
      const anthropic = createAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });
      return anthropic(modelName);
    }
    if (modelName.startsWith("gemini-")) {
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY)
        throw new Error("MISSING_KEY:GOOGLE_GENERATIVE_AI_API_KEY");
      const google = createGoogleGenerativeAI({
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY
      });
      return google(modelName);
    }
    if (modelName.startsWith("vertex/")) {
      const project = process.env.GOOGLE_VERTEX_PROJECT;
      const location = process.env.GOOGLE_VERTEX_LOCATION ?? "us-central1";
      if (!project) throw new Error("MISSING_KEY:GOOGLE_VERTEX_PROJECT");
      const googleAuthOptions = process.env.GOOGLE_APPLICATION_CREDENTIALS ? { keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS } : void 0;
      const vertex = createVertex({
        project,
        location,
        ...googleAuthOptions ? { googleAuthOptions } : {}
      });
      return vertex(modelName.slice("vertex/".length));
    }
    if (modelName.startsWith("copilot/")) {
      if (!process.env.GITHUB_TOKEN)
        throw new Error("MISSING_KEY:GITHUB_TOKEN");
      const copilot = createOpenAI({
        apiKey: process.env.GITHUB_TOKEN,
        baseURL: "https://models.inference.ai.azure.com"
      });
      return copilot(modelName.slice("copilot/".length));
    }
    if (modelName.startsWith("groq/")) {
      if (!process.env.GROQ_API_KEY)
        throw new Error("MISSING_KEY:GROQ_API_KEY");
      const groq = createOpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: "https://api.groq.com/openai/v1"
      });
      return groq(modelName.replace("groq/", ""));
    }
    if (modelName.startsWith("openrouter/") || modelName.includes("/")) {
      if (!process.env.OPENROUTER_API_KEY)
        throw new Error("MISSING_KEY:OPENROUTER_API_KEY");
      const openrouter = createOpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: "https://openrouter.ai/api/v1",
        headers: {
          "HTTP-Referer": "https://cowrangler.com",
          "X-Title": "Co-Wrangler"
        }
      });
      const cleanModelName = modelName.replace("openrouter/", "");
      return openrouter(cleanModelName);
    }
    throw new Error(`UNSUPPORTED_MODEL:${modelName}`);
  }
  /**
  * Ajanın generateText metodunda doğrudan kullanacağı nesne.
  * Her çağrıda env var'larını taze okur — /key set sonrası otomatik yansır.
  */
  getModel() {
    return this.resolveProvider(this.model);
  }
}
const GLOBAL_DIR$3 = path.join(os.homedir(), ".cowrangler");
const TODO_FILE = path.join(GLOBAL_DIR$3, "AGENT_TODO.md");
class AgentManager {
  agents = /* @__PURE__ */ new Map();
  workdirs = /* @__PURE__ */ new Map();
  todoWatchers = /* @__PURE__ */ new Map();
  /**
   * Proje için Agent instance'ı döndürür veya oluşturur.
   * model parametresi geçilirse override eder.
   */
  getOrCreate(projectId, config, workdir) {
    if (!this.agents.has(projectId)) {
      const llm = new LLM(config.model);
      const agent = new Agent(llm, config.systemPrompt, 25, void 0, "desktop");
      this.agents.set(projectId, agent);
      if (workdir) this.workdirs.set(projectId, workdir);
    }
    return this.agents.get(projectId);
  }
  /** Agent'ı yeniden oluştur (model/instructions değişti) */
  recreate(projectId, config, workdir) {
    this.destroy(projectId);
    return this.getOrCreate(projectId, config, workdir);
  }
  get(projectId) {
    return this.agents.get(projectId) ?? null;
  }
  interrupt(projectId) {
    this.agents.get(projectId)?.requestInterrupt();
  }
  destroy(projectId) {
    this.agents.delete(projectId);
    this.workdirs.delete(projectId);
    const w = this.todoWatchers.get(projectId);
    if (w) {
      w.close();
      this.todoWatchers.delete(projectId);
    }
  }
  destroyAll() {
    for (const id of this.agents.keys()) this.destroy(id);
  }
  getWorkdir(projectId) {
    return this.workdirs.get(projectId) ?? null;
  }
  /** TODO dosyasını parse ederek TaskProgress[] döndürür. */
  static parseTodo(content) {
    const lines = content.split("\n");
    const tasks = [];
    let idx = 0;
    for (const line of lines) {
      const checkedMatch = line.match(/^\s*-\s*\[x\]\s*(.+)/i);
      const uncheckedMatch = line.match(/^\s*-\s*\[ \]\s*(.+)/);
      const inProgressMatch = line.match(/^\s*-\s*\[~\]\s*(.+)/);
      if (checkedMatch) {
        tasks.push({ id: String(idx++), text: checkedMatch[1].trim(), status: "completed" });
      } else if (inProgressMatch) {
        tasks.push({ id: String(idx++), text: inProgressMatch[1].trim(), status: "in_progress" });
      } else if (uncheckedMatch) {
        tasks.push({ id: String(idx++), text: uncheckedMatch[1].trim(), status: "pending" });
      }
    }
    return tasks;
  }
  /** Global TODO dosyasını oku ve parse et. */
  static readTodo() {
    if (!fs.existsSync(TODO_FILE)) return [];
    try {
      const content = fs.readFileSync(TODO_FILE, "utf-8");
      return AgentManager.parseTodo(content);
    } catch {
      return [];
    }
  }
  /** TODO dosyasını izle — değişince callback çağır. */
  watchTodo(projectId, onChange) {
    if (this.todoWatchers.has(projectId)) return;
    if (!fs.existsSync(TODO_FILE)) fs.writeFileSync(TODO_FILE, "", "utf-8");
    let debounce = null;
    try {
      const watcher = fs.watch(TODO_FILE, () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          onChange(AgentManager.readTodo());
        }, 100);
      });
      this.todoWatchers.set(projectId, watcher);
    } catch {
    }
  }
  stopWatchTodo(projectId) {
    const w = this.todoWatchers.get(projectId);
    if (w) {
      w.close();
      this.todoWatchers.delete(projectId);
    }
  }
}
const agentManager = new AgentManager();
const DB_PATH = path.join(os.homedir(), ".cowrangler", "projects.db");
class ProjectDB {
  db;
  constructor(dbPath = DB_PATH) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this._migrate();
  }
  _migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        workdir TEXT,
        icon TEXT NOT NULL DEFAULT '📁',
        color TEXT NOT NULL DEFAULT '#e05c2a',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS project_folders (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        folder_path TEXT NOT NULL,
        label TEXT,
        added_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project_instructions (
        project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        content TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project_sessions (
        project_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
        PRIMARY KEY (project_id, session_id)
      );

      CREATE INDEX IF NOT EXISTS idx_project_sessions_project ON project_sessions(project_id);
    `);
  }
  // ── Projects ──────────────────────────────────────────────────────────────
  create(input) {
    const id = crypto.randomUUID();
    const now = Date.now();
    const record = {
      id,
      name: input.name,
      description: input.description ?? null,
      workdir: input.workdir ?? null,
      icon: input.icon ?? "📁",
      color: input.color ?? "#e05c2a",
      created_at: now,
      updated_at: now,
      pinned: 0,
      archived: 0
    };
    this.db.prepare(`
      INSERT INTO projects (id, name, description, workdir, icon, color, created_at, updated_at, pinned, archived)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.name,
      record.description,
      record.workdir,
      record.icon,
      record.color,
      record.created_at,
      record.updated_at,
      record.pinned,
      record.archived
    );
    return record;
  }
  get(id) {
    return this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id) ?? null;
  }
  list(includeArchived = false) {
    const rows = this.db.prepare(`
      SELECT
        p.*,
        pi.content as instructions,
        (SELECT COUNT(*) FROM project_folders WHERE project_id = p.id) as folder_count,
        (SELECT COUNT(*) FROM project_sessions WHERE project_id = p.id) as session_count,
        (SELECT MAX(ps.created_at) FROM project_sessions ps WHERE ps.project_id = p.id) as last_session_at
      FROM projects p
      LEFT JOIN project_instructions pi ON pi.project_id = p.id
      WHERE p.archived = ${includeArchived ? "1" : "0"}
      ORDER BY p.pinned DESC, p.updated_at DESC
    `).all();
    return rows;
  }
  update(id, data) {
    const fields = Object.keys(data).map((k) => `${k} = ?`).join(", ");
    const values = Object.values(data);
    this.db.prepare(`UPDATE projects SET ${fields}, updated_at = ? WHERE id = ?`).run(...values, Date.now(), id);
  }
  delete(id) {
    this.db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  }
  // ── Instructions ──────────────────────────────────────────────────────────
  getInstructions(projectId) {
    const row = this.db.prepare("SELECT content FROM project_instructions WHERE project_id = ?").get(projectId);
    return row?.content ?? "";
  }
  setInstructions(projectId, content) {
    this.db.prepare(`
      INSERT INTO project_instructions (project_id, content, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
    `).run(projectId, content, Date.now());
  }
  // ── Folders ───────────────────────────────────────────────────────────────
  getFolders(projectId) {
    return this.db.prepare("SELECT * FROM project_folders WHERE project_id = ? ORDER BY added_at ASC").all(projectId);
  }
  addFolder(projectId, folderPath, label) {
    const id = crypto.randomUUID();
    const now = Date.now();
    this.db.prepare(`
      INSERT OR IGNORE INTO project_folders (id, project_id, folder_path, label, added_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, projectId, folderPath, label ?? null, now);
    return { id, project_id: projectId, folder_path: folderPath, label: label ?? null, added_at: now };
  }
  removeFolder(projectId, folderPath) {
    this.db.prepare("DELETE FROM project_folders WHERE project_id = ? AND folder_path = ?").run(projectId, folderPath);
  }
  // ── Sessions ──────────────────────────────────────────────────────────────
  linkSession(projectId, sessionId) {
    this.db.prepare(`
      INSERT OR IGNORE INTO project_sessions (project_id, session_id, created_at) VALUES (?, ?, ?)
    `).run(projectId, sessionId, Date.now());
    this.db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(Date.now(), projectId);
  }
  getSessionIds(projectId) {
    const rows = this.db.prepare(
      "SELECT session_id FROM project_sessions WHERE project_id = ? ORDER BY created_at DESC"
    ).all(projectId);
    return rows.map((r) => r.session_id);
  }
  unlinkSession(projectId, sessionId) {
    this.db.prepare("DELETE FROM project_sessions WHERE project_id = ? AND session_id = ?").run(projectId, sessionId);
  }
}
let _projectDB = null;
function getProjectDB() {
  if (!_projectDB) _projectDB = new ProjectDB();
  return _projectDB;
}
path.join(os.homedir(), ".cowrangler");
function buildSystemPrompt(basePrompt, instructions) {
  let prompt = basePrompt;
  if (instructions?.trim()) {
    prompt += `

---

## PROJECT INSTRUCTIONS

${instructions}`;
  }
  return prompt;
}
function getDefaultSystemPrompt() {
  return `You are Co-Wrangler — a powerful, enterprise-grade AI agent.

You operate like a senior engineer: methodical, transparent, and accountable.

## CORE BEHAVIOR RULES

### 1. Reason before acting
Before every non-trivial tool call, write one sentence explaining WHY.

### 2. Read before write (ALWAYS)
- Always use read_file before edit_file or write_file.
- Always use git_status before git_commit.

### 3. TODO discipline — MANDATORY for multi-step tasks
If a task requires 3 or more steps:
1. Call manage_todo(action="update") as your VERY FIRST action.
2. Mark each item done with manage_todo(action="mark_done") IMMEDIATELY after completing it.

### 4. Use send_message to communicate
After completing your work, ALWAYS call send_message to deliver your final response.

### 5. Skills — use them
Check available skills and load relevant ones with utilize_skill.`;
}
function registerAgentIPC(ipcMain2, win) {
  ipcMain2.handle("agent:chat", async (event, projectId, sessionId, message) => {
    const sender = event.sender;
    const projectDB = getProjectDB();
    const project = projectDB.get(projectId);
    const instructions = projectDB.getInstructions(projectId);
    const config = getConfig();
    const model = config.model || "openrouter/google/gemini-2.5-flash";
    const systemPrompt = buildSystemPrompt(getDefaultSystemPrompt(), instructions);
    let agent;
    try {
      agent = agentManager.getOrCreate(projectId, { model, systemPrompt }, project?.workdir ?? void 0);
    } catch (err) {
      sender.send("agent:error", err.message);
      return;
    }
    if (project?.workdir) {
      try {
        process.chdir(project.workdir);
      } catch {
      }
    }
    agentManager.watchTodo(projectId, (tasks) => {
      sender.send("agent:progress", tasks);
    });
    const onToolCall = (name, args) => {
      sender.send("agent:toolCall", {
        name,
        args,
        status: "start",
        timestamp: Date.now()
      });
    };
    const onStepText = (text) => {
      sender.send("agent:stepText", text);
    };
    try {
      const result = await agent.chat(message, onToolCall, onStepText);
      const currentSessionId = agent.currentSessionId;
      if (currentSessionId) {
        projectDB.linkSession(projectId, currentSessionId);
      }
      sender.send("agent:done", {
        text: result.text,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        toolCallCount: result.toolCallCount,
        durationMs: result.durationMs,
        sessionId: currentSessionId
      });
    } catch (err) {
      sender.send("agent:error", err.message || String(err));
    }
  });
  ipcMain2.handle("agent:interrupt", async (_, projectId) => {
    agentManager.interrupt(projectId);
    return { ok: true };
  });
  ipcMain2.handle("agent:contextSnapshot", async (_, projectId) => {
    const agent = agentManager.get(projectId);
    if (!agent) return null;
    const snap = agent.getContextSnapshot();
    return {
      ...snap,
      model: agent.llm.model,
      maxContextTokens: snap.contextWindowSize
    };
  });
  ipcMain2.handle("agent:newSession", async (_, projectId) => {
    agentManager.destroy(projectId);
    return { ok: true };
  });
}
function registerProjectsIPC(ipcMain2) {
  const db = getProjectDB();
  ipcMain2.handle("projects:list", async () => db.list());
  ipcMain2.handle("projects:get", async (_, id) => db.get(id));
  ipcMain2.handle("projects:create", async (_, input) => {
    return db.create(input);
  });
  ipcMain2.handle("projects:update", async (_, id, data) => {
    db.update(id, data);
    return db.get(id);
  });
  ipcMain2.handle("projects:delete", async (_, id) => {
    db.delete(id);
    return { ok: true };
  });
  ipcMain2.handle("projects:addFolder", async (_, id, folderPath) => {
    return db.addFolder(id, folderPath);
  });
  ipcMain2.handle("projects:removeFolder", async (_, id, folderPath) => {
    db.removeFolder(id, folderPath);
    return { ok: true };
  });
  ipcMain2.handle("projects:getFolders", async (_, id) => {
    return db.getFolders(id);
  });
  ipcMain2.handle("projects:getInstructions", async (_, id) => {
    return db.getInstructions(id);
  });
  ipcMain2.handle("projects:setInstructions", async (_, id, content) => {
    db.setInstructions(id, content);
    return { ok: true };
  });
  ipcMain2.handle("projects:outputs", async (_, id) => {
    const project = db.get(id);
    if (!project?.workdir) return [];
    const outputExts = [".md", ".pdf", ".docx", ".xlsx", ".pptx", ".txt", ".json", ".csv", ".png", ".jpg", ".jpeg"];
    const outputs = [];
    const cowranglerDir = path.join(project.workdir, ".cowrangler");
    try {
      if (fs.existsSync(cowranglerDir)) {
        const files = fs.readdirSync(cowranglerDir);
        for (const f of files) {
          const ext = path.extname(f).toLowerCase();
          if (outputExts.includes(ext)) {
            const filePath = path.join(cowranglerDir, f);
            const stat = fs.statSync(filePath);
            outputs.push({ name: f, path: filePath, ext, mtime: stat.mtimeMs });
          }
        }
      }
      const rootFiles = fs.readdirSync(project.workdir);
      for (const f of rootFiles) {
        const ext = path.extname(f).toLowerCase();
        if ([".md", ".txt"].includes(ext) && !f.startsWith(".")) {
          const filePath = path.join(project.workdir, f);
          const stat = fs.statSync(filePath);
          outputs.push({ name: f, path: filePath, ext, mtime: stat.mtimeMs });
        }
      }
    } catch {
    }
    return outputs.sort((a, b) => b.mtime - a.mtime).slice(0, 20);
  });
}
function registerSessionsIPC(ipcMain2) {
  const projectDB = getProjectDB();
  ipcMain2.handle("sessions:list", async (_, projectId) => {
    const sessionDB = getSessionDB();
    const sessionIds = projectDB.getSessionIds(projectId);
    if (!sessionIds.length) return [];
    const sessions = sessionIds.map((id) => sessionDB.getSession(id)).filter(Boolean).sort((a, b) => b.started_at - a.started_at);
    return sessions;
  });
  ipcMain2.handle("sessions:get", async (_, sessionId) => {
    const sessionDB = getSessionDB();
    return sessionDB.getSession(sessionId);
  });
  ipcMain2.handle("sessions:messages", async (_, sessionId) => {
    const sessionDB = getSessionDB();
    return sessionDB.getMessages(sessionId);
  });
  ipcMain2.handle("sessions:search", async (_, query, projectId) => {
    const sessionDB = getSessionDB();
    const opts = { limit: 30 };
    const results = sessionDB.searchSessions(query, opts);
    if (!projectId) return results;
    const sessionIds = new Set(projectDB.getSessionIds(projectId));
    return results.filter((r) => sessionIds.has(r.session_id));
  });
  ipcMain2.handle("sessions:delete", async (_, projectId, sessionId) => {
    projectDB.unlinkSession(projectId, sessionId);
    return { ok: true };
  });
  ipcMain2.handle("sessions:rename", async (_, sessionId, title) => {
    const sessionDB = getSessionDB();
    sessionDB.updateSession(sessionId, { title });
    return { ok: true };
  });
}
const GLOBAL_DIR$2 = path.join(os.homedir(), ".cowrangler");
const CONFIG_FILE$1 = path.join(GLOBAL_DIR$2, "config.yaml");
const CREDENTIALS_FILE = path.join(GLOBAL_DIR$2, "credentials.env");
const PROVIDERS = [
  { id: "anthropic", label: "Anthropic", envKey: "ANTHROPIC_API_KEY", prefix: "sk-ant-" },
  { id: "openai", label: "OpenAI", envKey: "OPENAI_API_KEY", prefix: "sk-" },
  { id: "google", label: "Google AI", envKey: "GOOGLE_GENERATIVE_AI_API_KEY", prefix: "AIza" },
  { id: "openrouter", label: "OpenRouter", envKey: "OPENROUTER_API_KEY", prefix: "sk-or-" },
  { id: "groq", label: "Groq", envKey: "GROQ_API_KEY", prefix: "gsk_" },
  { id: "github", label: "GitHub Copilot", envKey: "GITHUB_TOKEN", prefix: "ghp_" }
];
const AVAILABLE_MODELS = [
  { provider: "anthropic", id: "anthropic/claude-opus-4-6", label: "Claude Opus 4.6", contextK: 200 },
  { provider: "anthropic", id: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6", contextK: 200 },
  { provider: "anthropic", id: "anthropic/claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", contextK: 200 },
  { provider: "openai", id: "openai/gpt-4o", label: "GPT-4o", contextK: 128 },
  { provider: "openai", id: "openai/gpt-4o-mini", label: "GPT-4o mini", contextK: 128 },
  { provider: "openai", id: "openai/o3", label: "o3", contextK: 200 },
  { provider: "google", id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", contextK: 1e3 },
  { provider: "google", id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", contextK: 1e3 },
  { provider: "openrouter", id: "openrouter/google/gemini-2.5-flash", label: "Gemini 2.5 Flash (OpenRouter)", contextK: 1e3 },
  { provider: "openrouter", id: "openrouter/anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6 (OpenRouter)", contextK: 200 },
  { provider: "openrouter", id: "openrouter/openai/gpt-4o", label: "GPT-4o (OpenRouter)", contextK: 128 },
  { provider: "groq", id: "groq/llama-3.3-70b-versatile", label: "Llama 3.3 70B", contextK: 128 },
  { provider: "groq", id: "groq/moonshotai/kimi-k2-instruct", label: "Kimi K2", contextK: 128 }
];
function readCredentials() {
  const creds = {};
  if (!fs.existsSync(CREDENTIALS_FILE)) return creds;
  const lines = fs.readFileSync(CREDENTIALS_FILE, "utf-8").split("\n");
  for (const line of lines) {
    const [key, ...rest] = line.trim().split("=");
    if (key && rest.length) creds[key.trim()] = rest.join("=").trim();
  }
  return creds;
}
function writeCredential(envKey, value) {
  fs.mkdirSync(GLOBAL_DIR$2, { recursive: true });
  let content = fs.existsSync(CREDENTIALS_FILE) ? fs.readFileSync(CREDENTIALS_FILE, "utf-8") : "";
  const lines = content.split("\n").filter((l) => !l.startsWith(`${envKey}=`));
  if (value.trim()) lines.push(`${envKey}=${value.trim()}`);
  fs.writeFileSync(CREDENTIALS_FILE, lines.filter(Boolean).join("\n") + "\n", "utf-8");
  if (value.trim()) {
    process.env[envKey] = value.trim();
  } else {
    delete process.env[envKey];
  }
}
function maskKey(key) {
  if (!key || key.length < 8) return "••••••••";
  return key.slice(0, 6) + "••••••••" + key.slice(-4);
}
function registerSettingsIPC(ipcMain2) {
  ipcMain2.handle("settings:get", async () => {
    try {
      return getConfig();
    } catch {
      return {};
    }
  });
  ipcMain2.handle("settings:set", async (_, key, value) => {
    fs.mkdirSync(GLOBAL_DIR$2, { recursive: true });
    let config = {};
    if (fs.existsSync(CONFIG_FILE$1)) {
      try {
        config = yaml.load(fs.readFileSync(CONFIG_FILE$1, "utf-8")) || {};
      } catch {
      }
    }
    config[key] = value;
    fs.writeFileSync(CONFIG_FILE$1, yaml.dump(config), "utf-8");
    return { ok: true };
  });
  ipcMain2.handle("settings:apiKeys", async () => {
    const creds = readCredentials();
    return PROVIDERS.map((p) => ({
      ...p,
      value: maskKey(creds[p.envKey] || process.env[p.envKey] || ""),
      set: !!(creds[p.envKey] || process.env[p.envKey])
    }));
  });
  ipcMain2.handle("settings:setApiKey", async (_, provider, key) => {
    const p = PROVIDERS.find((p2) => p2.id === provider);
    if (!p) return { ok: false, error: "Unknown provider" };
    writeCredential(p.envKey, key);
    return { ok: true };
  });
  ipcMain2.handle("settings:removeApiKey", async (_, provider) => {
    const p = PROVIDERS.find((p2) => p2.id === provider);
    if (!p) return { ok: false };
    writeCredential(p.envKey, "");
    return { ok: true };
  });
  ipcMain2.handle("settings:models", async () => {
    const creds = readCredentials();
    return AVAILABLE_MODELS.map((m) => {
      const p = PROVIDERS.find((pr) => pr.id === m.provider);
      const hasKey = p ? !!(creds[p.envKey] || process.env[p.envKey]) : false;
      return { ...m, available: hasKey };
    });
  });
}
function registerSkillsIPC(ipcMain2) {
  const skillManager = new SkillManager();
  ipcMain2.handle("skills:list", async () => {
    return skillManager.getAvailableSkills();
  });
  ipcMain2.handle("skills:content", async (_, skillId) => {
    const skills = skillManager.getAvailableSkills();
    const found = skills.find((s) => s.id === skillId);
    return found?.content ?? null;
  });
  ipcMain2.handle("skills:toggle", async (_, skillId, active) => {
    return { ok: true, skillId, active };
  });
}
const GLOBAL_DIR$1 = path.join(os.homedir(), ".cowrangler");
const CONFIG_FILE = path.join(GLOBAL_DIR$1, "config.yaml");
function readConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return {};
    return yaml.load(fs.readFileSync(CONFIG_FILE, "utf-8")) || {};
  } catch {
    return {};
  }
}
function writeConfig(config) {
  fs.mkdirSync(GLOBAL_DIR$1, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, yaml.dump(config), "utf-8");
}
function registerMCPIPC(ipcMain2) {
  ipcMain2.handle("mcp:list", async () => {
    const config = readConfig();
    const servers = config.mcp_servers || {};
    return Object.entries(servers).map(([name, cfg]) => ({
      name,
      type: cfg.url ? cfg.transport === "sse" ? "sse" : "http" : "stdio",
      command: cfg.command,
      args: cfg.args,
      url: cfg.url,
      timeout: cfg.timeout || 120,
      status: "unknown"
      // Gerçek durum bağlanınca bilinir
    }));
  });
  ipcMain2.handle("mcp:add", async (_, serverConfig) => {
    const config = readConfig();
    if (!config.mcp_servers) config.mcp_servers = {};
    const { name, type, command, args, url, headers, env, timeout } = serverConfig;
    if (type === "stdio") {
      config.mcp_servers[name] = {
        command,
        args: args || [],
        ...env ? { env } : {},
        timeout: timeout || 120
      };
    } else {
      config.mcp_servers[name] = {
        url,
        ...headers ? { headers } : {},
        ...type === "sse" ? { transport: "sse" } : {},
        timeout: timeout || 120
      };
    }
    writeConfig(config);
    return { ok: true };
  });
  ipcMain2.handle("mcp:remove", async (_, name) => {
    const config = readConfig();
    if (config.mcp_servers) {
      delete config.mcp_servers[name];
      writeConfig(config);
    }
    return { ok: true };
  });
  ipcMain2.handle("mcp:test", async (_, name) => {
    const config = readConfig();
    const server = config.mcp_servers?.[name];
    if (!server) return { ok: false, error: "Server not found" };
    return { ok: true, message: "Configuration looks valid" };
  });
}
const GLOBAL_DIR = path.join(os.homedir(), ".cowrangler");
const GLOBAL_MEMORY_FILE = path.join(GLOBAL_DIR, "memory.md");
path.join(GLOBAL_DIR, "AGENT_TODO.md");
function registerMemoryIPC(ipcMain2) {
  ipcMain2.handle("memory:readGlobal", async () => {
    try {
      if (!fs.existsSync(GLOBAL_MEMORY_FILE)) return "";
      return fs.readFileSync(GLOBAL_MEMORY_FILE, "utf-8");
    } catch {
      return "";
    }
  });
  ipcMain2.handle("memory:writeGlobal", async (_, content) => {
    fs.mkdirSync(GLOBAL_DIR, { recursive: true });
    fs.writeFileSync(GLOBAL_MEMORY_FILE, content, "utf-8");
    return { ok: true };
  });
  ipcMain2.handle("memory:readProject", async (_, projectId) => {
    const db = getProjectDB();
    const project = db.get(projectId);
    if (!project?.workdir) return "";
    const memFile = path.join(project.workdir, ".cowrangler", "memory.md");
    try {
      if (!fs.existsSync(memFile)) return "";
      return fs.readFileSync(memFile, "utf-8");
    } catch {
      return "";
    }
  });
  ipcMain2.handle("memory:writeProject", async (_, projectId, content) => {
    const db = getProjectDB();
    const project = db.get(projectId);
    if (!project?.workdir) return { ok: false, error: "No workdir" };
    const memDir = path.join(project.workdir, ".cowrangler");
    fs.mkdirSync(memDir, { recursive: true });
    fs.writeFileSync(path.join(memDir, "memory.md"), content, "utf-8");
    return { ok: true };
  });
  ipcMain2.handle("memory:readTodo", async () => {
    return AgentManager.readTodo();
  });
}
const IGNORED_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  ".next",
  "__pycache__",
  ".venv",
  "venv",
  "dist",
  "build",
  "out",
  ".nyc_output",
  "coverage",
  ".turbo",
  ".cache",
  "tmp",
  "temp",
  ".DS_Store"
]);
function readTree(dirPath, depth = 2, currentDepth = 0) {
  if (currentDepth >= depth) return [];
  if (!fs.existsSync(dirPath)) return [];
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
  const nodes = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".cowrangler") continue;
    if (IGNORED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const children = readTree(fullPath, depth, currentDepth + 1);
      nodes.push({ name: entry.name, path: fullPath, type: "directory", children });
    } else {
      try {
        const stat = fs.statSync(fullPath);
        nodes.push({
          name: entry.name,
          path: fullPath,
          type: "file",
          size: stat.size,
          mtime: stat.mtimeMs
        });
      } catch {
        nodes.push({ name: entry.name, path: fullPath, type: "file" });
      }
    }
  }
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
function registerFSIPC(ipcMain2) {
  ipcMain2.handle("fs:pickFolder", async (event) => {
    const win = event.sender.getOwnerBrowserWindow?.() ?? null;
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory", "createDirectory"],
      title: "Çalışma klasörü seç"
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });
  ipcMain2.handle("fs:pickFile", async (event) => {
    const win = event.sender.getOwnerBrowserWindow?.() ?? null;
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      title: "Dosya seç"
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });
  ipcMain2.handle("fs:fileTree", async (_, dirPath, depth = 2) => {
    return readTree(dirPath, Math.min(depth, 4));
  });
  ipcMain2.handle("fs:readFile", async (_, filePath) => {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > 5 * 1024 * 1024) return { error: "File too large (>5MB)" };
      return { content: fs.readFileSync(filePath, "utf-8") };
    } catch (err) {
      return { error: err.message };
    }
  });
  ipcMain2.handle("fs:openInFinder", async (_, filePath) => {
    shell.showItemInFolder(filePath);
    return { ok: true };
  });
  ipcMain2.handle("fs:openExternal", async (_, url) => {
    shell.openExternal(url);
    return { ok: true };
  });
}
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
let mainWindow = null;
function createWindow() {
  try {
    initEnvironment();
  } catch {
  }
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    backgroundColor: "#0f0f0f",
    vibrancy: void 0,
    show: false,
    webPreferences: {
      preload: path.join(__dirname$1, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true
    }
  });
  registerAgentIPC(ipcMain);
  registerProjectsIPC(ipcMain);
  registerSessionsIPC(ipcMain);
  registerSettingsIPC(ipcMain);
  registerSkillsIPC(ipcMain);
  registerMCPIPC(ipcMain);
  registerMemoryIPC(ipcMain);
  registerFSIPC(ipcMain);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    if (process.env.NODE_ENV === "development") {
      mainWindow?.webContents.openDevTools({ mode: "detach" });
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  if (process.env.NODE_ENV === "development" || !app.isPackaged) {
    const devPort = process.env.VITE_DEV_SERVER_URL;
    if (devPort) {
      mainWindow.loadURL(devPort);
    } else {
      mainWindow.loadURL("http://localhost:5173");
    }
  } else {
    mainWindow.loadFile(path.join(__dirname$1, "../renderer/index.html"));
  }
}
app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  agentManager.destroyAll();
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on("before-quit", () => {
  agentManager.destroyAll();
});
app.on("web-contents-created", (_, contents) => {
  contents.on("will-navigate", (event, url) => {
    if (!url.startsWith("http://localhost") && !url.startsWith("file://")) {
      event.preventDefault();
    }
  });
});
