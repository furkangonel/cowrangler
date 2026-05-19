import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type Messages = Record<string, any>;

let _messages: Messages = {};

const SUPPORTED = ["en", "tr", "fr", "it", "de", "es"] as const;
export type SupportedLocale = (typeof SUPPORTED)[number];

/**
 * initI18n — must be called once at startup, before any t() calls.
 * Loads the JSON message file for the given locale (falls back to 'en').
 */
export function initI18n(locale: string): void {
  const lang = SUPPORTED.includes(locale as SupportedLocale) ? locale : "en";
  const filePath = path.resolve(__dirname, `messages/${lang}.json`);
  try {
    _messages = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    // Fallback to English
    const fallback = path.resolve(__dirname, "messages/en.json");
    try {
      _messages = JSON.parse(fs.readFileSync(fallback, "utf-8"));
    } catch {
      _messages = {};
    }
  }
}

/**
 * t(key, vars?) — translate a dot-notation key with optional variable interpolation.
 *
 * @example
 *   t("status.context_cleared")
 *   t("status.skill_not_found", { id: "my-skill" })
 *   t("spinner.steps", { n: "3" })
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const parts = key.split(".");
  let val: any = _messages;
  for (const part of parts) {
    val = val?.[part];
    if (val === undefined) return key; // Return key as fallback so nothing silently breaks
  }
  let result = String(val);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return result;
}
