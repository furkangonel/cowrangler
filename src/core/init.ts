import fs from "fs";
import path from "path";
import os from "os";
import yaml from "js-yaml";
import dotenv from "dotenv";

export const PROJECT_ROOT = process.cwd();
export const LOCAL_DIR = path.join(PROJECT_ROOT, ".cowrangler");
export const GLOBAL_DIR = path.join(os.homedir(), ".cowrangler");

export const COWRNGLR_MD = path.join(PROJECT_ROOT, "COWRNGLR.md");

export const DIRS = {
  local: {
    base: LOCAL_DIR,
    skills: path.join(LOCAL_DIR, "skills"),
    config: path.join(LOCAL_DIR, "config.yaml"),
    memory: path.join(LOCAL_DIR, "memory.md"),
    todo: path.join(LOCAL_DIR, "AGENT_TODO.md"),
  },
  global: {
    base: GLOBAL_DIR,
    skills: path.join(GLOBAL_DIR, "skills"),
    config: path.join(GLOBAL_DIR, "config.yaml"),
    credentials: path.join(GLOBAL_DIR, "credentials.env"),
  },
};

const DEFAULT_SYSTEM_PROMPT = `You are Co-Wrangler — a powerful, reliable AI agent running in the terminal.

## Core Behavior Rules

### 1. Reason before acting (CRITICAL)
Before every non-trivial tool call, write a short sentence explaining WHY you're doing it.
- BAD:  "I'll edit src/agent.ts now."
- GOOD: "src/agent.ts uses the old callback signature — updating it to pass step text."
State the root cause or goal, not just the action.

### 2. Todo discipline (CRITICAL)
- For multi-step tasks: start with manage_todo to read existing items or create a checklist.
- Mark each item done with manage_todo(action="mark_done") IMMEDIATELY after finishing it — not at the end.
- When the user provides a manual todo list: work through it item by item, and mark each one done right after completing it.
- Never finish a conversation with unchecked items you have already completed.

### 3. Completion summary (CRITICAL)
When you have finished all steps (no more tool calls needed), ALWAYS end your final response with:

**Tamamlandı:**
- ✓ What you did (one line each)
- ✓ ...

Do NOT end mid-sentence or with a forward-looking statement ("I will now…"). If the task is complete, say so.

### 4. Read before write
Always read a file before editing it. Check git status before committing.

### 5. Skills
If a relevant skill (SOP) is available, load it with utilize_skill before starting.

### 6. Language
Respond in the same language the user writes in.

---
Available capabilities: file operations, git, bash execution, web fetching, sub-agents, and more.
Think step-by-step. Be precise. Be genuinely helpful.`;

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
        "claude-sonnet-4-5",
        "gpt-4o",
      ],
      system_prompt: DEFAULT_SYSTEM_PROMPT,
      temperature: 0.7,
      max_iterations: 20,
      theme: "auto",
    };
    fs.writeFileSync(DIRS.global.config, yaml.dump(defaultGlobal), "utf-8");
  }

  if (!fs.existsSync(DIRS.global.credentials)) {
    fs.writeFileSync(
      DIRS.global.credentials,
      [
        "# Co-Wrangler Global API Keys",
        "# Format: PROVIDER_KEY_NAME=your_key_here",
        "# Set keys with: /key set <PROVIDER> <key>",
        "#",
        "# ANTHROPIC_API_KEY=sk-ant-...",
        "# OPENAI_API_KEY=sk-...",
        "# OPENROUTER_API_KEY=sk-or-...",
        "# GOOGLE_GENERATIVE_AI_API_KEY=...",
        "# GROQ_API_KEY=gsk_...",
        "",
      ].join("\n"),
      "utf-8"
    );
  }

  // ── Local directory skeleton (dirs only — no files unless user asks) ────────
  // The .cowrangler/ dir and skills/ subdir are created so that skill discovery
  // and history persistence work without errors. No .md files are written here.
  fs.mkdirSync(DIRS.local.base, { recursive: true });
  fs.mkdirSync(DIRS.local.skills, { recursive: true });
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
      "utf-8"
    );
  }
}

/**
 * ensureAgentTodo — called lazily when the agent first writes a todo.
 */
export function ensureAgentTodo(): void {
  fs.mkdirSync(DIRS.local.base, { recursive: true });
  if (!fs.existsSync(DIRS.local.todo)) {
    fs.writeFileSync(
      DIRS.local.todo,
      "# Active Agent Tasks\n- [ ] (agent will populate this)\n",
      "utf-8"
    );
  }
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
  config.system_prompt = config.system_prompt || DEFAULT_SYSTEM_PROMPT;
  config.temperature = config.temperature ?? 0.7;
  config.max_iterations = config.max_iterations ?? 20;
  return config;
}
