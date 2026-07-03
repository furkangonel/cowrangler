/**
 * model_picker_cli — cowrangler model (standalone)
 *
 * Ana TUI başlamadan önce interaktif model seçici açar.
 * Seçim yapıldığında ~/.cowrangler/config.yaml'a kaydeder.
 *
 * Bu modül Ink kullanamaz (ana TUI henüz çalışmıyor), bu yüzden
 * saf readline + ANSI escape kodları ile basit bir liste gösterir.
 */

import readline from "readline";
import fs from "fs";
import yaml from "js-yaml";
import chalk from "chalk";
import { DIRS } from "../core/init.js";

const DEFAULT_MODELS = [
  { model: "claude-sonnet-5",                  provider: "Anthropic",   envKey: "ANTHROPIC_API_KEY" },
  { model: "claude-opus-4-8",                  provider: "Anthropic",   envKey: "ANTHROPIC_API_KEY" },
  { model: "claude-sonnet-4-6",                provider: "Anthropic",   envKey: "ANTHROPIC_API_KEY" },
  { model: "claude-haiku-4-5",                 provider: "Anthropic",   envKey: "ANTHROPIC_API_KEY" },
  { model: "gpt-5.5",                          provider: "OpenAI",      envKey: "OPENAI_API_KEY" },
  { model: "gpt-5.4",                          provider: "OpenAI",      envKey: "OPENAI_API_KEY" },
  { model: "openai/o3",                        provider: "OpenAI",      envKey: "OPENAI_API_KEY" },
  { model: "gemini-3.5-flash",                 provider: "Google",      envKey: "GOOGLE_GENERATIVE_AI_API_KEY" },
  { model: "gemini-3.1-pro",                   provider: "Google",      envKey: "GOOGLE_GENERATIVE_AI_API_KEY" },
  { model: "groq/llama-3.3-70b-versatile",     provider: "Groq",        envKey: "GROQ_API_KEY" },
  { model: "openrouter/anthropic/claude-sonnet-5", provider: "OpenRouter", envKey: "OPENROUTER_API_KEY" },
  { model: "openrouter/google/gemini-3.5-flash",   provider: "OpenRouter", envKey: "OPENROUTER_API_KEY" },
];

function loadConfig(): any {
  try {
    if (fs.existsSync(DIRS.global.config)) {
      return (yaml.load(fs.readFileSync(DIRS.global.config, "utf-8")) as any) || {};
    }
  } catch {}
  return {};
}

function saveConfig(cfg: any): void {
  fs.mkdirSync(DIRS.global.base, { recursive: true });
  fs.writeFileSync(DIRS.global.config, yaml.dump(cfg));
}

function hasKey(envKey: string): boolean {
  return !!process.env[envKey];
}

function printList(models: typeof DEFAULT_MODELS, selected: number, current: string, filter: string): void {
  // Ekranı temizle ve başa dön
  process.stdout.write("\x1b[2J\x1b[H");

  console.log(chalk.hex("#FF4C00").bold("\n  ◆ Cowrangler — Model Seç\n"));
  console.log(chalk.dim("  ↑↓ gezin  ·  Enter seç  ·  Ctrl+C iptal  ·  Harf yaz: filtrele\n"));

  if (filter) {
    console.log(`  Filtre: ${chalk.yellow(filter)}\n`);
  }

  const displayed = filter
    ? models.filter(
        (m) =>
          m.model.toLowerCase().includes(filter.toLowerCase()) ||
          m.provider.toLowerCase().includes(filter.toLowerCase()),
      )
    : models;

  if (displayed.length === 0) {
    console.log(chalk.dim("  Eşleşen model yok.\n"));
    return;
  }

  displayed.forEach((entry, i) => {
    const isSelected = i === selected;
    const isCurrent = entry.model === current;
    const keyOk = hasKey(entry.envKey);
    const keyIcon = keyOk ? chalk.green("✓") : chalk.dim("○");

    const prefix = isSelected ? chalk.hex("#FF4C00").bold(" ▶ ") : "   ";
    const modelStr = isSelected
      ? chalk.hex("#FF4C00").bold(entry.model)
      : isCurrent
      ? chalk.green(entry.model)
      : chalk.dim(entry.model);
    const providerStr = chalk.dim(entry.provider.padEnd(12));
    const currentMark = isCurrent ? chalk.green(" ← aktif") : "";

    console.log(`${prefix}${keyIcon} ${modelStr}  ${providerStr}${currentMark}`);
  });

  console.log(chalk.dim("\n  ✓ = API key mevcut  ○ = API key eksik\n"));
}

export async function runModelPicker(): Promise<void> {
  const cfg = loadConfig();
  const current: string = cfg.model || "";

  // Saved models varsa onları kullan, yoksa default listesi
  const savedModels: string[] = Array.isArray(cfg.saved_models) && cfg.saved_models.length > 0
    ? cfg.saved_models
    : [];

  const baseList = savedModels.length > 0
    ? savedModels.map((m) => {
        const found = DEFAULT_MODELS.find((d) => d.model === m);
        return found || { model: m, provider: "Custom", envKey: "" };
      })
    : DEFAULT_MODELS;

  let selected = Math.max(0, baseList.findIndex((m) => m.model === current));
  let filter = "";

  // TTY kontrolü
  if (!process.stdin.isTTY) {
    console.error(chalk.red("\n  ✗ Bu komut interaktif terminal gerektirir.\n"));
    return;
  }

  // raw mode
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  printList(baseList, selected, current, filter);

  const filtered = () =>
    filter
      ? baseList.filter(
          (m) =>
            m.model.toLowerCase().includes(filter.toLowerCase()) ||
            m.provider.toLowerCase().includes(filter.toLowerCase()),
        )
      : baseList;

  return new Promise((resolve) => {
    process.stdin.on("keypress", (str, key) => {
      const list = filtered();

      if (key.ctrl && key.name === "c") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write("\x1b[2J\x1b[H");
        console.log(chalk.dim("\n  İptal edildi.\n"));
        resolve();
        return;
      }

      if (key.name === "return") {
        const chosen = list[selected];
        if (!chosen) { resolve(); return; }

        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write("\x1b[2J\x1b[H");

        // Config'e kaydet
        cfg.model = chosen.model;
        if (!Array.isArray(cfg.saved_models)) cfg.saved_models = [];
        if (!cfg.saved_models.includes(chosen.model)) cfg.saved_models.push(chosen.model);
        saveConfig(cfg);

        console.log(chalk.green(`\n  ✓ Model seçildi: ${chalk.bold(chosen.model)}\n`));
        if (!hasKey(chosen.envKey) && chosen.envKey) {
          console.log(chalk.yellow(`  ⚠ ${chosen.envKey} ortam değişkeni eksik.`));
          console.log(chalk.dim(`  ~/.cowrangler/credentials.env dosyasına ekle:\n`));
          console.log(chalk.dim(`    ${chosen.envKey}=sk-your-key-here\n`));
        }
        resolve();
        return;
      }

      if (key.name === "up") {
        selected = Math.max(0, selected - 1);
        printList(baseList, selected, current, filter);
        return;
      }
      if (key.name === "down") {
        selected = Math.min(list.length - 1, selected + 1);
        printList(baseList, selected, current, filter);
        return;
      }
      if (key.name === "backspace") {
        filter = filter.slice(0, -1);
        selected = 0;
        printList(baseList, selected, current, filter);
        return;
      }

      if (str && !key.ctrl && !key.meta && str.length === 1) {
        filter += str;
        selected = 0;
        printList(baseList, selected, current, filter);
      }
    });
  });
}
