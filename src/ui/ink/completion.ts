import fs from "fs";
import path from "path";
import { CompletionItem, CompletionMode } from "./types.js";
import { CommandRouter } from "../commands.js";
import { SkillManager } from "../../core/skills.js";

export const MAX_MENU_ITEMS = 8;

/**
 * Build the static (non-file) completion pool: every registered slash
 * command plus a "/skill <id>" shortcut for each loaded skill. The pool
 * is recomputed on demand because skills can be added/removed mid-session
 * (e.g. via /skill commands or by dropping a SKILL.md on disk).
 */
export function buildStaticPool(
  router: CommandRouter,
  skillManager: SkillManager,
): CompletionItem[] {
  const items: CompletionItem[] = [];

  for (const [name, desc] of router.getCommandDescriptions().entries()) {
    items.push({ value: name, label: name, description: desc, kind: "command" });
  }

  for (const id of skillManager.listSkillIds()) {
    items.push({
      value: `/skill ${id}`,
      label: `/skill ${id}`,
      description: `Run ${id} SOP`,
      kind: "skill",
    });
  }

  return items.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * File completions for `@` triggers. We resolve the directory portion of
 * the query, list its entries, and surface up to 20 matches. Hidden files
 * are excluded to keep the menu tidy.
 */
export function fileItems(query: string): CompletionItem[] {
  try {
    const base = process.cwd();
    const lastSlash = query.lastIndexOf("/");
    const dir = lastSlash >= 0 ? query.slice(0, lastSlash + 1) : "";
    const partial = lastSlash >= 0 ? query.slice(lastSlash + 1) : query;
    const targetDir = path.resolve(base, dir || ".");
    const entries = fs.readdirSync(targetDir, { withFileTypes: true });

    return entries
      .filter((e) => e.name.startsWith(partial) && !e.name.startsWith("."))
      .slice(0, 20)
      .map((e) => {
        const isDir = e.isDirectory();
        const rel = dir + e.name + (isDir ? "/" : "");
        return {
          value: rel,
          label: rel,
          description: isDir ? "directory" : "file",
          kind: "file" as const,
        };
      });
  } catch {
    return [];
  }
}

/**
 * Decide which completion mode the current input is in based on the most
 * recent trigger character at a word boundary.
 */
export function detectMode(input: string): CompletionMode {
  // "@" anywhere on a word boundary -> file completion.
  const atIdx = input.lastIndexOf("@");
  if (atIdx !== -1 && (atIdx === 0 || input[atIdx - 1] === " ")) {
    return { mode: "file", query: input.slice(atIdx + 1), atIdx };
  }

  // "/" at a word boundary -> command/skill completion.
  const slashIdx = input.lastIndexOf("/");
  if (slashIdx !== -1 && (slashIdx === 0 || input[slashIdx - 1] === " ")) {
    return { mode: "command", query: input.slice(slashIdx) };
  }

  return { mode: "none" };
}

/**
 * Filter the appropriate pool for the current mode and return the visible
 * slice (capped at MAX_MENU_ITEMS).
 */
export function filterForMode(
  mode: CompletionMode,
  staticPool: CompletionItem[],
): CompletionItem[] {
  if (mode.mode === "none") return [];

  if (mode.mode === "file") {
    return fileItems(mode.query).slice(0, MAX_MENU_ITEMS);
  }

  const q = mode.query.toLowerCase();
  return staticPool
    .filter((item) => item.label.toLowerCase().startsWith(q))
    .slice(0, MAX_MENU_ITEMS);
}

/**
 * Apply the selected completion to the current input and return the new
 * input + cursor position.
 */
export function applyCompletion(
  input: string,
  mode: CompletionMode,
  chosen: CompletionItem,
): { input: string; cursor: number } {
  if (mode.mode === "command") {
    const slashIdx = input.lastIndexOf("/");
    const next = input.slice(0, slashIdx) + chosen.value;
    return { input: next, cursor: next.length };
  }
  if (mode.mode === "file") {
    const next = input.slice(0, mode.atIdx + 1) + chosen.value;
    return { input: next, cursor: next.length };
  }
  return { input, cursor: input.length };
}
