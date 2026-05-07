/**
 * setup.ts — Provider Setup Wizard
 *
 * Two entry points:
 * 1. `cowrangler setup`  — Outside Ink, fully interactive wizard (@clack/prompts)
 * 2. `/setup` in REPL    — Inside Ink, shows command reference via showSetupGuide()
 *
 * For each provider:
 * - Anthropic, OpenAI, Gemini → API key
 * - Vertex AI                 → GCP project ID + region + ADC / service account auth
 * - GitHub Copilot            → gh CLI token or PAT
 * - Groq, OpenRouter          → API key
 */

import {
  intro,
  outro,
  select,
  text,
  confirm,
  note,
  spinner,
  isCancel,
  cancel,
  log,
} from "@clack/prompts";
import fs from "fs";
import { execSync } from "child_process";
import yaml from "js-yaml";
import { DIRS } from "../core/init.js";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Writes an env var to both process.env and credentials.env file. */
function saveKey(name: string, value: string): void {
  process.env[name] = value;
  let content = fs.existsSync(DIRS.global.credentials)
    ? fs.readFileSync(DIRS.global.credentials, "utf-8")
    : "# Co-Wrangler Global API Keys\n";
  const regex = new RegExp(`^${name}=.*`, "m");
  content = regex.test(content)
    ? content.replace(regex, `${name}=${value}`)
    : content.trimEnd() + `\n${name}=${value}\n`;
  fs.writeFileSync(DIRS.global.credentials, content, "utf-8");
}

/** Checks if a CLI tool is available in PATH. */
function hasCLI(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Runs a shell command and returns its output. */
function runCLI(cmd: string): string {
  return execSync(cmd, { encoding: "utf-8" }).trim();
}

/**
 * Saves the selected model to global config.
 * Updates both the active model and saved_models list.
 */
function saveActiveModel(modelName: string): void {
  let cfg: any = {};
  if (fs.existsSync(DIRS.global.config)) {
    cfg =
      (yaml.load(fs.readFileSync(DIRS.global.config, "utf-8")) as any) || {};
  }
  cfg.model = modelName;
  if (!cfg.saved_models) cfg.saved_models = [];
  if (!cfg.saved_models.includes(modelName)) cfg.saved_models.push(modelName);
  fs.writeFileSync(DIRS.global.config, yaml.dump(cfg), "utf-8");
}

// ── Provider setup functions ───────────────────────────────────────────────

async function setupAnthropic(): Promise<string | null> {
  note(
    [
      "For API key: https://console.anthropic.com/account/keys",
      "Supported models: claude-opus-4-5, claude-sonnet-4-5, claude-haiku-4-5",
    ].join("\n"),
    "Anthropic",
  );

  const key = await text({
    message: "Anthropic API key:",
    placeholder: "sk-ant-api03-...",
    validate: (v) => {
      if (!v.trim()) return "API key cannot be empty";
      if (!v.trim().startsWith("sk-ant-"))
        return "Anthropic keys must start with 'sk-ant-'";
    },
  });

  if (isCancel(key)) return null;
  saveKey("ANTHROPIC_API_KEY", (key as string).trim());
  log.success("ANTHROPIC_API_KEY saved.");
  return "claude-sonnet-4-5";
}

async function setupOpenAI(): Promise<string | null> {
  note(
    [
      "For API key: https://platform.openai.com/api-keys",
      "Supported models: gpt-4o, gpt-4o-mini, o1, o3-mini, o4-mini",
    ].join("\n"),
    "OpenAI",
  );

  const key = await text({
    message: "OpenAI API key:",
    placeholder: "sk-...",
    validate: (v) => (!v.trim() ? "API key cannot be empty" : undefined),
  });

  if (isCancel(key)) return null;
  saveKey("OPENAI_API_KEY", (key as string).trim());
  log.success("OPENAI_API_KEY saved.");
  return "gpt-4o";
}

async function setupGemini(): Promise<string | null> {
  note(
    [
      "For API key: https://aistudio.google.com/app/apikey",
      "Supported models: gemini-2.0-flash, gemini-1.5-pro, gemini-1.5-flash",
      "",
      "Note: If you want to use GCP Vertex, select 'Google Vertex AI' instead.",
    ].join("\n"),
    "Google Gemini",
  );

  const key = await text({
    message: "Google Generative AI API key:",
    placeholder: "AIza...",
    validate: (v) => (!v.trim() ? "API key cannot be empty" : undefined),
  });

  if (isCancel(key)) return null;
  saveKey("GOOGLE_GENERATIVE_AI_API_KEY", (key as string).trim());
  log.success("GOOGLE_GENERATIVE_AI_API_KEY saved.");
  return "gemini-2.0-flash";
}

async function setupVertex(): Promise<string | null> {
  note(
    [
      "Vertex AI uses GCP authentication instead of an API key.",
      "Your GCP project and credentials are required.",
      "",
      "Supported models:",
      "  vertex/gemini-2.0-flash     vertex/gemini-1.5-pro",
      "  vertex/publishers/anthropic/models/claude-3-5-sonnet@20241022",
    ].join("\n"),
    "Google Vertex AI",
  );

  // Step 1: Project ID
  const project = await text({
    message: "GCP Project ID:",
    placeholder: "my-gcp-project-123",
    validate: (v) => (!v.trim() ? "Project ID cannot be empty" : undefined),
  });
  if (isCancel(project)) return null;
  saveKey("GOOGLE_VERTEX_PROJECT", (project as string).trim());
  log.success("GOOGLE_VERTEX_PROJECT saved.");

  // Step 2: Region
  const location = await text({
    message: "Location (region):",
    placeholder: "us-central1",
    initialValue: "us-central1",
  });
  if (isCancel(location)) return null;
  const loc = (location as string).trim() || "us-central1";
  saveKey("GOOGLE_VERTEX_LOCATION", loc);
  log.success(`GOOGLE_VERTEX_LOCATION → ${loc}`);

  // Step 3: Authentication
  const gcloudAvailable = hasCLI("gcloud");

  const authMethod = await select({
    message: "Authentication method:",
    options: [
      ...(gcloudAvailable
        ? [
            {
              value: "adc_run",
              label: "Application Default Credentials — run now (recommended)",
              hint: "gcloud auth application-default login — login with Google account in browser",
            },
          ]
        : []),
      {
        value: "service_account",
        label: "Service Account JSON key file",
        hint: "Path to the .json key file downloaded from GCP Console",
      },
      {
        value: "adc_manual",
        label: "ADC — I will install and run gcloud CLI myself",
        hint: "Show installation instructions",
      },
    ],
  });

  if (isCancel(authMethod)) return null;

  if (authMethod === "adc_run") {
    const s = spinner();
    s.start("Opening browser...");
    try {
      s.stop("Opening authorization window (check your browser):");
      execSync("gcloud auth application-default login", { stdio: "inherit" });
      log.success("Application Default Credentials set successfully.");
    } catch {
      log.warn("gcloud command failed. Run manually from the terminal:");
      log.info("  gcloud auth application-default login");
    }
  } else if (authMethod === "service_account") {
    const keyPath = await text({
      message: "Full path to Service Account JSON key file:",
      placeholder: "/Users/username/keys/my-project-sa-key.json",
      validate: (v) => {
        if (!v.trim()) return "File path cannot be empty";
        if (!fs.existsSync(v.trim())) return `File not found: ${v.trim()}`;
      },
    });
    if (isCancel(keyPath)) return null;
    saveKey("GOOGLE_APPLICATION_CREDENTIALS", (keyPath as string).trim());
    log.success("GOOGLE_APPLICATION_CREDENTIALS saved.");
  } else {
    note(
      [
        "1) Install gcloud CLI:",
        "   https://cloud.google.com/sdk/docs/install",
        "",
        "2) Run after installation:",
        "   gcloud auth application-default login",
        "",
        "After installation, run the cowrangler setup command again.",
      ].join("\n"),
      "gcloud CLI Installation Instructions",
    );
  }

  log.success("Vertex AI setup completed.");
  return "vertex/gemini-2.0-flash";
}

async function setupCopilot(): Promise<string | null> {
  note(
    [
      "Requires the token of the account with your GitHub Copilot subscription.",
      "",
      "Supported models (based on subscription):",
      "  copilot/gpt-4o            copilot/gpt-4o-mini",
      "  copilot/claude-3.5-sonnet copilot/claude-3.7-sonnet",
      "  copilot/gemini-2.0-flash  copilot/o3-mini",
    ].join("\n"),
    "GitHub Copilot",
  );

  const ghAvailable = hasCLI("gh");
  let token: string | null = null;

  if (ghAvailable) {
    const useGH = await confirm({
      message:
        "gh CLI detected. Do you want to retrieve the token automatically?",
      initialValue: true,
    });

    if (!isCancel(useGH) && useGH) {
      const s = spinner();
      s.start("Retrieving GitHub token...");
      try {
        const existing = runCLI("gh auth token 2>/dev/null || true");
        if (existing && existing.length > 10) {
          token = existing;
          s.stop("Existing session found — token retrieved.");
        } else {
          s.stop("Starting gh auth login...");
          execSync("gh auth login", { stdio: "inherit" });
          token = runCLI("gh auth token");
        }
        log.success("GitHub token retrieved successfully.");
      } catch {
        s.stop(
          "Failed to retrieve token automatically. Manual input required.",
        );
      }
    }
  }

  if (!token) {
    note(
      [
        "Create a GitHub Personal Access Token (PAT — Classic):",
        "  https://github.com/settings/tokens/new",
        "",
        "Token settings:",
        "  - Token type: Classic",
        "  - Expiration: up to you",
        "  - Scopes: no special scope required (Copilot subscription is enough)",
        "",
        "Paste your generated token below.",
      ].join("\n"),
      "GitHub Personal Access Token",
    );

    const inputToken = await text({
      message: "GitHub token:",
      placeholder: "ghp_... or github_pat_...",
      validate: (v) => {
        if (!v.trim()) return "Token cannot be empty";
        const t = v.trim();
        if (
          !t.startsWith("ghp_") &&
          !t.startsWith("github_pat_") &&
          !t.startsWith("ghu_")
        ) {
          return "Invalid format. Expected ghp_*, github_pat_*, or ghu_*.";
        }
      },
    });

    if (isCancel(inputToken)) return null;
    token = (inputToken as string).trim();
  }

  saveKey("GITHUB_TOKEN", token);
  log.success("GITHUB_TOKEN saved.");
  return "copilot/gpt-4o";
}

async function setupGroq(): Promise<string | null> {
  note(
    [
      "For API key: https://console.groq.com/keys",
      "Supported models: groq/llama-3.3-70b-versatile, groq/mixtral-8x7b-32768",
      "Groq offers high speed on the free tier.",
    ].join("\n"),
    "Groq",
  );

  const key = await text({
    message: "Groq API key:",
    placeholder: "gsk_...",
    validate: (v) => {
      if (!v.trim()) return "API key cannot be empty";
      if (!v.trim().startsWith("gsk_"))
        return "Groq keys must start with 'gsk_'";
    },
  });

  if (isCancel(key)) return null;
  saveKey("GROQ_API_KEY", (key as string).trim());
  log.success("GROQ_API_KEY saved.");
  return "groq/llama-3.3-70b-versatile";
}

async function setupOpenRouter(): Promise<string | null> {
  note(
    [
      "For API key: https://openrouter.ai/keys",
      "200+ models, access with a single API key.",
      "Examples: openrouter/google/gemini-2.5-flash",
      "          openrouter/anthropic/claude-sonnet-4-5",
      "          openrouter/openai/gpt-4o",
    ].join("\n"),
    "OpenRouter",
  );

  const key = await text({
    message: "OpenRouter API key:",
    placeholder: "sk-or-...",
    validate: (v) => {
      if (!v.trim()) return "API key cannot be empty";
      if (!v.trim().startsWith("sk-or-"))
        return "OpenRouter keys must start with 'sk-or-'";
    },
  });

  if (isCancel(key)) return null;
  saveKey("OPENROUTER_API_KEY", (key as string).trim());
  log.success("OPENROUTER_API_KEY saved.");
  return "openrouter/google/gemini-2.5-flash";
}

// ── Main Wizard ────────────────────────────────────────────────────────────

/**
 * Fully interactive setup wizard.
 * Called by cowrangler setup and startup MISSING_KEY error.
 * Writes directly to terminal, outside of Ink.
 *
 * @returns The suggested model name from setup, or null if cancelled
 */
export async function runSetupWizard(): Promise<string | null> {
  console.log();
  intro(" Co-Wrangler — Provider Setup Wizard ");

  const provider = await select({
    message: "Which provider do you want to set up?",
    options: [
      {
        value: "anthropic",
        label: "Anthropic",
        hint: "claude-opus-4-5, claude-sonnet-4-5...",
      },
      {
        value: "openai",
        label: "OpenAI",
        hint: "gpt-4o, o1, o3-mini, o4-mini...",
      },
      {
        value: "gemini",
        label: "Google Gemini (direct API)",
        hint: "gemini-2.0-flash, gemini-1.5-pro...",
      },
      {
        value: "vertex",
        label: "Google Vertex AI",
        hint: "Gemini + Claude via GCP (Not API key, GCP auth)",
      },
      {
        value: "copilot",
        label: "GitHub Copilot",
        hint: "gpt-4o, claude-3.5-sonnet, gemini (Copilot subscription required)",
      },
      {
        value: "groq",
        label: "Groq",
        hint: "groq/llama-3.3-70b-versatile — free, high speed",
      },
      {
        value: "openrouter",
        label: "OpenRouter",
        hint: "200+ models, single API key",
      },
    ],
  });

  if (isCancel(provider)) {
    cancel("Setup cancelled.");
    return null;
  }

  const handlers: Record<string, () => Promise<string | null>> = {
    anthropic: setupAnthropic,
    openai: setupOpenAI,
    gemini: setupGemini,
    vertex: setupVertex,
    copilot: setupCopilot,
    groq: setupGroq,
    openrouter: setupOpenRouter,
  };

  const defaultModel = await handlers[provider as string]();

  if (!defaultModel) {
    cancel("Setup could not be completed.");
    return null;
  }

  // Set as active model?
  const setActive = await confirm({
    message: `Do you want to save ${defaultModel} as the default model?`,
    initialValue: true,
  });

  if (!isCancel(setActive) && setActive) {
    saveActiveModel(defaultModel);
    log.success(`Active model → ${defaultModel}`);
  }

  outro(
    `✓ Setup complete!${!isCancel(setActive) && setActive ? ` Active model: ${defaultModel}` : ""}`,
  );

  return !isCancel(setActive) && setActive ? defaultModel : null;
}

// ── In-REPL Reference Guide ────────────────────────────────────────────────

/**
 * Shows a reference guide of commands to run
 * instead of the interactive prompt when running inside Ink.
 * The /setup REPL command calls this function.
 */
export function showSetupGuide(): void {
  const lines = [
    "  To set up all providers interactively:",
    "    cowrangler setup           (run in terminal, outside of cowrangler)",
    "",
    "  Or set them manually using the following commands:",
    "",
    "  ── Anthropic ────────────────────────────────────────────────────────",
    "    /key set ANTHROPIC_API_KEY sk-ant-...",
    "    Model: claude-sonnet-4-5",
    "",
    "  ── OpenAI ───────────────────────────────────────────────────────────",
    "    /key set OPENAI_API_KEY sk-...",
    "    Model: gpt-4o",
    "",
    "  ── Google Gemini ─────────────────────────────────────────────────────",
    "    /key set GOOGLE_GENERATIVE_AI_API_KEY AIza...",
    "    Model: gemini-2.0-flash",
    "",
    "  ── Google Vertex AI ──────────────────────────────────────────────────",
    "    /key set GOOGLE_VERTEX_PROJECT  <project-id>",
    "    /key set GOOGLE_VERTEX_LOCATION us-central1",
    "    Auth:   gcloud auth application-default login",
    "      or: /key set GOOGLE_APPLICATION_CREDENTIALS /path/to/key.json",
    "    Model:  vertex/gemini-2.0-flash",
    "    Guide: /key set VERTEX",
    "",
    "  ── GitHub Copilot ────────────────────────────────────────────────────",
    "    /key set GITHUB_TOKEN ghp_...  (or: gh auth token)",
    "    Model: copilot/gpt-4o",
    "",
    "  ── Groq ──────────────────────────────────────────────────────────────",
    "    /key set GROQ_API_KEY gsk_...",
    "    Model: groq/llama-3.3-70b-versatile",
    "",
    "  ── OpenRouter ────────────────────────────────────────────────────────",
    "    /key set OPENROUTER_API_KEY sk-or-...",
    "    Model: openrouter/google/gemini-2.5-flash",
    "",
    "  To change the model: /model set <model-name>",
    "  To view saved keys: /key list",
  ];

  // UI.box cannot be used here (Theme import might be circular), using chalk
  const chalk = require("chalk");
  console.log(
    "\n" +
      chalk.hex("#FF4C00").bold("  Co-Wrangler Provider Setup Guide") +
      "\n" +
      lines.map((l) => (l.startsWith("  ──") ? chalk.dim(l) : l)).join("\n") +
      "\n",
  );
}

// ── MISSING_KEY helper ─────────────────────────────────────────────────────

/**
 * Returns a user-friendly message for a MISSING_KEY error code specific to the provider.
 * Used jointly by commands.ts and main.ts.
 */
export function missingKeyHint(missingKey: string): string {
  switch (missingKey) {
    case "GOOGLE_VERTEX_PROJECT":
      return (
        "GCP project ID is required for Vertex AI.\n" +
        "  1) /key set GOOGLE_VERTEX_PROJECT <project-id>\n" +
        "  2) /key set GOOGLE_VERTEX_LOCATION us-central1   (optional)\n" +
        "  3) gcloud auth application-default login         (or service account)\n" +
        "  Guide: /key set VERTEX  |  Interactive wizard: cowrangler setup"
      );
    case "GOOGLE_GENERATIVE_AI_API_KEY":
      return (
        "API key is required for Google Gemini.\n" +
        "  /key set GOOGLE_GENERATIVE_AI_API_KEY AIza...\n" +
        "  Key: https://aistudio.google.com/app/apikey\n" +
        "  To use via Vertex: vertex/gemini-2.0-flash  →  /key set VERTEX"
      );
    case "OPENAI_API_KEY":
      return (
        "API key is required for OpenAI models.\n" +
        "  /key set OPENAI_API_KEY sk-..."
      );
    case "ANTHROPIC_API_KEY":
      return (
        "API key is required for Anthropic models.\n" +
        "  /key set ANTHROPIC_API_KEY sk-ant-..."
      );
    case "GROQ_API_KEY":
      return (
        "API key is required for Groq models.\n" +
        "  /key set GROQ_API_KEY gsk_..."
      );
    case "OPENROUTER_API_KEY":
      return (
        "API key is required for OpenRouter models.\n" +
        "  /key set OPENROUTER_API_KEY sk-or-..."
      );
    case "GITHUB_TOKEN":
      return (
        "Token is required for GitHub Copilot.\n" +
        "  /key set GITHUB_TOKEN ghp_...\n" +
        "  If gh CLI exists: gh auth token  →  /key set GITHUB_TOKEN $(gh auth token)\n" +
        "  To create a token: https://github.com/settings/tokens\n" +
        "  Interactive wizard: cowrangler setup"
      );
    default:
      return `Missing configuration: ${missingKey}\n  /key set ${missingKey} <value>`;
  }
}
