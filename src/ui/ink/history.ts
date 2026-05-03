import fs from "fs";
import path from "path";

/**
 * Lightweight persistence for the REPL command history.
 *
 * The legacy REPL appended every submission to `.wrangler_history` in the
 * project root and capped it at MAX_HISTORY entries. We keep that exact
 * behaviour so users don't lose their existing history file.
 */

const HISTORY_FILE = path.resolve(".wrangler_history");
export const MAX_HISTORY = 500;

export function loadHistory(): string[] {
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
    fs.appendFileSync(HISTORY_FILE, trimmed + "\n", "utf-8");
  } catch {
    // best-effort; history persistence failure must not crash the REPL
  }
  return next;
}
