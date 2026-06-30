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
    memory: path.join(LOCAL_DIR, "memory"),
    tasks: path.join(LOCAL_DIR, "tasks"),
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

import { getSystemPrompt } from "./prompts/index.js";

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

  // ── Local directory skeleton (dirs only — no files unless user asks) ────────
  // The .cowrangler/ dir and skills/ subdir are created so that skill discovery
  // and history persistence work without errors. No .md files are written here.
  fs.mkdirSync(DIRS.global.agents, { recursive: true });

  try {
    fs.mkdirSync(DIRS.local.base, { recursive: true });
    fs.mkdirSync(DIRS.local.skills, { recursive: true });
    fs.mkdirSync(DIRS.local.agents, { recursive: true });
  } catch (err: any) {
    // Desktop uygulamasında (macOS release) process.cwd() kök dizin (/) olabileceği için
    // EACCES hatası verebilir. Masaüstü uygulaması yerel (local) dizinler yerine
    // ProjectContext üzerinden kendi çalışma dizinlerini oluşturur, bu yüzden bu adımı
    // sessizce geçebiliriz. CLI ise normal şekilde klasörleri oluşturur.
  }
}

/**
 * ensureLocalMemory — called lazily when memory is first written.
 * Creates memory.md only when needed, not on every startup.
 */
export function ensureLocalMemory(): void {
  fs.mkdirSync(DIRS.local.memory, { recursive: true });
  const projectMem = path.join(DIRS.local.memory, "project.md");
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
