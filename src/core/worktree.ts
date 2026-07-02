/**
 * worktree — paralel/izole çalışma için git worktree yardımcıları.
 *
 * Alt-ajanların ana çalışma ağacını kirletmeden ayrı bir worktree'de çalışması
 * için kullanılır. Worktree'ler `.cowrangler/worktrees/<name>` altında oluşur.
 */

import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function isGitRepo(root: string): boolean {
  try { git(["rev-parse", "--is-inside-work-tree"], root); return true; } catch { return false; }
}

export interface WorktreeInfo { name: string; path: string; branch: string; }

/** Yeni bir worktree + branch oluşturur. Var olan branch'ten dallanır. */
export function createWorktree(root: string, name: string, fromRef = "HEAD"): WorktreeInfo {
  if (!isGitRepo(root)) throw new Error("Not a git repository — worktrees require git.");
  const safe = name.replace(/[^A-Za-z0-9._-]/g, "-");
  const branch = `cowrangler/${safe}`;
  const dir = path.join(root, ".cowrangler", "worktrees", safe);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  if (fs.existsSync(dir)) return { name: safe, path: dir, branch };
  // Branch varsa checkout et, yoksa oluştur
  try { git(["worktree", "add", "-b", branch, dir, fromRef], root); }
  catch { git(["worktree", "add", dir, branch], root); }
  return { name: safe, path: dir, branch };
}

export function listWorktrees(root: string): WorktreeInfo[] {
  if (!isGitRepo(root)) return [];
  const out = git(["worktree", "list", "--porcelain"], root);
  const items: WorktreeInfo[] = [];
  let cur: Partial<WorktreeInfo> = {};
  for (const line of out.split("\n")) {
    if (line.startsWith("worktree ")) cur.path = line.slice(9);
    else if (line.startsWith("branch ")) cur.branch = line.slice(7).replace("refs/heads/", "");
    else if (line.trim() === "") { if (cur.path) items.push({ name: path.basename(cur.path), path: cur.path, branch: cur.branch ?? "" }); cur = {}; }
  }
  if (cur.path) items.push({ name: path.basename(cur.path), path: cur.path, branch: cur.branch ?? "" });
  return items;
}

/** Worktree'yi kaldırır (varsayılan: değişiklikler commit'lenmemişse zorlamaz). */
export function removeWorktree(root: string, name: string, force = false): void {
  const safe = name.replace(/[^A-Za-z0-9._-]/g, "-");
  const dir = path.join(root, ".cowrangler", "worktrees", safe);
  git(["worktree", "remove", ...(force ? ["--force"] : []), dir], root);
}
