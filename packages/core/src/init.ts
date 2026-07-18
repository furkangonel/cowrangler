import fs from "fs";
import path from "path";
import os from "os";
import yaml from "js-yaml";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Single source of truth for the app version — reads from package.json.
 *  Compiled file lives at packages/core/dist/init.js, so the package.json is
 *  one level up (../package.json), not two. */
export function getVersion(): string {
  for (const rel of ["../package.json", "../../package.json"]) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, rel), "utf-8"));
      if (pkg?.version) return pkg.version;
    } catch { /* try next */ }
  }
  return "0.0.0";
}

export const PROJECT_ROOT = process.cwd();
export const LOCAL_DIR = path.join(PROJECT_ROOT, ".cowrangler");
export const GLOBAL_DIR = path.join(os.homedir(), ".cowrangler");

export const COWRNGLR_MD = path.join(PROJECT_ROOT, "COWRNGLR.md");

export const DIRS = {
  // PROJE-YAZIMI veri yalnızca. Üretilen/oturum verisi (tasks, plans, history,
  // audit.log, recall) ve plugin'ler projeye YAZILMAZ — global proje deposuna
  // ve ~/.cowrangler/plugins'e gider (bkz. project_context.ts / plugins.ts).
  local: {
    base: LOCAL_DIR,
    skills: path.join(LOCAL_DIR, "skills"),
    agents: path.join(LOCAL_DIR, "agents"), // Custom agent tanımları
    config: path.join(LOCAL_DIR, "config.yaml"),
    memory: path.join(LOCAL_DIR, "memory"),
  },
  global: {
    base: GLOBAL_DIR,
    skills: path.join(GLOBAL_DIR, "skills"),
    agents: path.join(GLOBAL_DIR, "agents"), // Global custom agents
    config: path.join(GLOBAL_DIR, "config.yaml"),
    credentials: path.join(GLOBAL_DIR, "credentials.env"),
    memory: path.join(GLOBAL_DIR, "memory.md"),
    plugins: path.join(GLOBAL_DIR, "plugins"),
  },
};

import { getSystemPrompt } from "./prompts/index.js";
import { getProjectMemoryDir, getProjectStoreDir } from "./project_context.js";

/**
 * initEnvironment — "lazy" init model, like Claude Code.
 *
 * Only GLOBAL infra is created here (needed for model/key config). NOTHING is
 * written into the project on startup — no `.cowrangler/` dir, no skills/agents
 * skeleton. Project-scoped files are created strictly on demand:
 *   - project config      → `/config set --local` (settings)
 *   - project memory       → ensureLocalMemory() (first `/memory` write or `/init`)
 *   - project skills/agents → only when the user authors one
 * Generated/session data never touches the project; it lives in the global
 * per-project store (see project_context.ts). This keeps every working project
 * root pristine.
 */
export function initEnvironment() {
  // ── Global (always — needed for model + credential config) ─────────────────
  fs.mkdirSync(DIRS.global.base, { recursive: true });
  fs.mkdirSync(DIRS.global.skills, { recursive: true });
  fs.mkdirSync(DIRS.global.plugins, { recursive: true });

  if (!fs.existsSync(DIRS.global.config)) {
    const defaultGlobal = {
      model: "openrouter/google/gemini-2.5-flash",
      saved_models: [
        "openrouter/google/gemini-2.5-flash",
        "openrouter/anthropic/claude-sonnet-4-6",
      ],
      // system_prompt is intentionally NOT stored in config.yaml.
      // It is sourced dynamically from getSystemPrompt() based on context.
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
        provider: "auto",
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
    };
    fs.writeFileSync(DIRS.global.config, yaml.dump(defaultGlobal), "utf-8");
  }

  if (!fs.existsSync(DIRS.global.credentials)) {
    fs.writeFileSync(
      DIRS.global.credentials,
      [
        "# Cowrangler Global API Keys",
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

  fs.mkdirSync(DIRS.global.agents, { recursive: true });

  // NOTE: Intentionally no project-level directory creation here. The project
  // root stays untouched until the user authors a project skill/agent/memory.
  // Skill/agent discovery and history persistence tolerate missing project dirs.
}

/**
 * ensureLocalMemory — called lazily when memory is first written.
 * Creates memory/project.md only when needed, not on every startup.
 * Uses the ACTIVE workdir (getProjectMemoryDir), so on desktop the file lands in
 * the real project — not in the app's process.cwd().
 */
export function ensureLocalMemory(): void {
  const memDir = getProjectMemoryDir();
  fs.mkdirSync(memDir, { recursive: true });
  const projectMem = path.join(memDir, "project.md");
  if (!fs.existsSync(projectMem)) {
    fs.writeFileSync(
      projectMem,
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
 * Task files live in the global per-project store; TaskManager creates the
 * per-session dir itself. This just ensures the base exists for the active workdir.
 */
export function ensureTaskStore(): void {
  fs.mkdirSync(getProjectStoreDir(), { recursive: true });
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
    if (raw) {
      config = {
        ...config,
        ...raw,
        // Project-scoped servers override same-name global entries, but must
        // not hide unrelated global/manual connectors from the live manager.
        mcp_servers: {
          ...(config.mcp_servers ?? {}),
          ...(raw.mcp_servers ?? {}),
        },
      };
    }
  }

  // Ensure defaults
  config.model = config.model || "openrouter/google/gemini-2.5-flash";
  // Always use the dynamic system prompt generator so updates take effect immediately.
  // Users who want to customise the prompt should set `custom_system_prompt` in their
  // config.yaml — that value is appended after the default, never replacing it.
  config.system_prompt = config.custom_system_prompt
    ? getSystemPrompt("cli") +
      "\n\n---\n\n## USER CUSTOMIZATIONS\n\n" +
      config.custom_system_prompt
    : getSystemPrompt("cli");
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
    provider: "auto",
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
  return config;
}

/**
 * Global config.yaml'a tek bir değeri yazar. Nokta-yollu anahtarları destekler
 * (örn: "context.keep_recent", "thinking.enabled"). Değer tipi otomatik
 * çıkarılır: "true"/"false" → boolean, sayısal → number, "null" → null,
 * aksi halde string. `/config set` komutu tarafından kullanılır.
 */
export function setConfigValue(dottedKey: string, rawValue: string): void {
  initEnvironment();
  let raw: any = {};
  if (fs.existsSync(DIRS.global.config)) {
    raw =
      (yaml.load(fs.readFileSync(DIRS.global.config, "utf-8")) as any) ?? {};
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
