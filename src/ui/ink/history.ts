import fs from "fs";
import path from "path";
import { DIRS } from "../../core/init.js";

/**
 * Lightweight persistence for the REPL command history.
 *
 * History lives at .cowrangler/history (inside the project's .cowrangler dir).
 * On first run, any existing legacy .wrangler_history file in the project root
 * is automatically migrated and then removed, so users don't lose prior history.
 */

const HISTORY_FILE = path.join(DIRS.local.base, "history");
const LEGACY_HISTORY_FILE = path.resolve(".wrangler_history");
export const MAX_HISTORY = 500;

function migrateIfNeeded(): void {
  try {
    if (fs.existsSync(LEGACY_HISTORY_FILE) && !fs.existsSync(HISTORY_FILE)) {
      fs.mkdirSync(DIRS.local.base, { recursive: true });
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
    fs.mkdirSync(DIRS.local.base, { recursive: true });
    fs.appendFileSync(HISTORY_FILE, trimmed + "\n", "utf-8");
  } catch {
    // best-effort; history persistence failure must not crash the REPL
  }
  return next;
}
