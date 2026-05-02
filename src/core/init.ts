import fs from "fs";
import path from "path";
import os from "os";
import yaml from "js-yaml";
import dotenv from "dotenv";

export const PROJECT_ROOT = process.cwd();
export const LOCAL_DIR = path.join(PROJECT_ROOT, ".cowrangler");
export const GLOBAL_DIR = path.join(os.homedir(), ".cowrangler");

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

Your core responsibilities:
1. Help users with coding, file management, research, and automation tasks
2. Use your tools thoughtfully — read files before editing, check status before committing
3. Always explain what you're about to do before doing it (especially destructive actions)
4. For complex tasks, break them into steps and use manage_todo to track progress
5. If a relevant skill (SOP) is available, load it with utilize_skill before starting
6. Respond in the same language the user writes in

Available capabilities: file operations, git, bash execution, web fetching, sub-agents, and more.
Think step-by-step. Be precise. Be genuinely helpful.`;

export function initEnvironment() {
  // ── Global ─────────────────────────────────────────────────────────────────
  fs.mkdirSync(DIRS.global.base, { recursive: true });
  fs.mkdirSync(DIRS.global.skills, { recursive: true });

  if (!fs.existsSync(DIRS.global.config)) {
    const defaultGlobal = {
      model: "openrouter/google/gemini-2.5-flash",
      saved_models: [
        "openrouter/google/gemini-2.5-flash",
        "claude-claude-sonnet-4-5",
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

  // ── Local (per-project) ────────────────────────────────────────────────────
  fs.mkdirSync(DIRS.local.base, { recursive: true });
  fs.mkdirSync(DIRS.local.skills, { recursive: true });

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
