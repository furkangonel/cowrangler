import fs from "fs";
import path from "path";
import { getProjectHistoryFile } from "@cowrangler/core/project_context.js";

/**
 * Lightweight persistence for the REPL command history.
 *
 * History lives in the global per-project store (getProjectHistoryFile), keyed by
 * the project path — so it survives across sessions without polluting the project
 * directory. On first run, any legacy .wrangler_history file in the project root
 * is migrated and removed, so users don't lose prior history.
 */

const LEGACY_HISTORY_FILE = path.resolve(".wrangler_history");
export const MAX_HISTORY = 500;

function historyFile(): string {
  return getProjectHistoryFile();
}

function migrateIfNeeded(): void {
  try {
    const HISTORY_FILE = historyFile();
    if (fs.existsSync(LEGACY_HISTORY_FILE) && !fs.existsSync(HISTORY_FILE)) {
      fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
      fs.copyFileSync(LEGACY_HISTORY_FILE, HISTORY_FILE);
      fs.unlinkSync(LEGACY_HISTORY_FILE);
    }
  } catch {
    // best-effort migration — not critical
  }
}

export function loadHistory(): string[] {
  migrateIfNeeded();
  try {
    const HISTORY_FILE = historyFile();
    if (!fs.existsSync(HISTORY_FILE)) return [];
    return fs
      .readFileSync(HISTORY_FILE, "utf-8")
      .split("\n")
      .filter(Boolean)
      .slice(-MAX_HISTORY);
  } catch {
    return [];
  }
}

export function appendHistory(entry: string, prev: string[]): string[] {
  const trimmed = entry.trim();
  if (!trimmed) return prev;
  // Move the entry to the end if it already exists (deduped tail).
  const next = [...prev.filter((h) => h !== trimmed), trimmed].slice(
    -MAX_HISTORY,
  );
  try {
    const HISTORY_FILE = historyFile();
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    fs.appendFileSync(HISTORY_FILE, trimmed + "\n", "utf-8");
  } catch {
    // best-effort; history persistence failure must not crash the REPL
  }
  return next;
}
