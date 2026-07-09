/**
 * git — Tek çekirdek git katmanı (WP-4).
 *
 * Hem agent tarafı (`tools/git_tools.ts`) hem desktop IPC (`electron/ipc/git.ipc.ts`)
 * bu modülü paylaşır — kod tekrarı olmaz. `core/` kuralı gereği burada react/ink/
 * electron import EDİLMEZ; yalnızca `child_process` + `getProjectWorkdir()`.
 *
 * İki katman:
 *   runGit(cmd)   → git_tools ile geriye-dönük uyumlu string-tabanlı çalıştırıcı.
 *   tryGit(args)  → yapılandırılmış (ok/stdout/stderr) çalıştırıcı; kullanıcı
 *                   girdisini (branch adı, commit mesajı, dosya yolu) shell'e
 *                   sokmadan execFile ile geçirir → enjeksiyon riski yok.
 */

import { execSync, execFileSync } from "child_process";
import { getProjectWorkdir } from "./project_context.js";

// ── Düşük seviye çalıştırıcılar ───────────────────────────────────────────────

/**
 * Bir git komut STRING'ini aktif proje (veya verilen) dizininde çalıştırır.
 * git_tools.ts ile geriye-dönük uyumlu: hata durumunda "Git error: ..." döner.
 */
export function runGit(command: string, cwd: string = getProjectWorkdir()): string {
  try {
    return execSync(command, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (e: any) {
    const stderr = e.stderr?.toString().trim() || "";
    const stdout = e.stdout?.toString().trim() || "";
    return `Git error: ${stderr || stdout || e.message}`;
  }
}

export interface GitRun {
  ok: boolean;
  stdout: string;
  stderr: string;
}

/**
 * git'i argüman DİZİSİYLE (shell yok) çalıştırır. Kullanıcı kaynaklı değerler
 * (branch adı, commit mesajı, dosya yolları) güvenle geçer.
 */
export function tryGit(args: string[], cwd: string = getProjectWorkdir()): GitRun {
  try {
    const stdout = execFileSync("git", args, {
      cwd,
      encoding: "utf-8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { ok: true, stdout: stdout.trim(), stderr: "" };
  } catch (e: any) {
    return {
      ok: false,
      stdout: (e.stdout?.toString() ?? "").trim(),
      stderr: (e.stderr?.toString() ?? e.message ?? "").trim(),
    };
  }
}

// ── Yapılandırılmış yüksek seviye API (IPC / panel için) ─────────────────────

export interface GitFileEntry {
  path: string;
  /** Porcelain index (staged) durum karakteri. */
  index: string;
  /** Porcelain worktree (unstaged) durum karakteri. */
  worktree: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}

export interface GitStatus {
  repo: boolean;
  branch: string;
  ahead: number;
  behind: number;
  upstream: string | null;
  files: GitFileEntry[];
  clean: boolean;
  additions?: number;
  deletions?: number;
}

export interface GitBranchInfo {
  current: string;
  local: string[];
  remote: string[];
}

export interface GitLogEntry {
  hash: string;
  author: string;
  relative: string;
  subject: string;
}

/** Verilen dizin bir git çalışma ağacı mı? */
export function isGitRepo(cwd: string = getProjectWorkdir()): boolean {
  const r = tryGit(["rev-parse", "--is-inside-work-tree"], cwd);
  return r.ok && r.stdout === "true";
}

function hasHead(cwd: string = getProjectWorkdir()): boolean {
  return tryGit(["rev-parse", "--verify", "HEAD"], cwd).ok;
}

function currentBranchName(cwd: string = getProjectWorkdir()): string {
  const branch = tryGit(["branch", "--show-current"], cwd);
  if (branch.ok && branch.stdout) return branch.stdout;
  const symbolic = tryGit(["symbolic-ref", "--short", "HEAD"], cwd);
  if (symbolic.ok && symbolic.stdout) return symbolic.stdout;
  return "HEAD";
}

/** `git status --porcelain` çıktısındaki tek satırı çözümle. */
function parseStatusLine(line: string): GitFileEntry | null {
  // Biçim: "XY <path>" — X=index, Y=worktree. Yeniden adlandırmada "orig -> new".
  if (line.length < 3) return null;
  const index = line[0];
  const worktree = line[1];
  let file = line.slice(3);
  const arrow = file.indexOf(" -> ");
  if (arrow !== -1) file = file.slice(arrow + 4);
  const untracked = index === "?" && worktree === "?";
  return {
    path: file,
    index,
    worktree,
    staged: !untracked && index !== " " && index !== "?",
    unstaged: untracked || (worktree !== " " && worktree !== "?"),
    untracked,
  };
}

/** Depo durumu: branch, ahead/behind, değişen dosyalar. */
export function status(cwd: string = getProjectWorkdir()): GitStatus {
  if (!isGitRepo(cwd)) {
    return { repo: false, branch: "", ahead: 0, behind: 0, upstream: null, files: [], clean: true };
  }
  const branch = currentBranchName(cwd);
  const headExists = hasHead(cwd);
  const upstreamRun = headExists
    ? tryGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], cwd)
    : { ok: false, stdout: "", stderr: "" };
  const upstream = upstreamRun.ok ? upstreamRun.stdout : null;

  let ahead = 0;
  let behind = 0;
  if (upstream) {
    // "<behind>\t<ahead>" — left=upstream, right=HEAD.
    const counts = tryGit(["rev-list", "--left-right", "--count", "@{u}...HEAD"], cwd);
    if (counts.ok) {
      const [b, a] = counts.stdout.split(/\s+/);
      behind = Number(b) || 0;
      ahead = Number(a) || 0;
    }
  }

  const porcelain = tryGit(["status", "--porcelain"], cwd);
  const files = porcelain.ok
    ? porcelain.stdout.split("\n").map(parseStatusLine).filter((f): f is GitFileEntry => f !== null)
    : [];

  let additions = 0;
  let deletions = 0;

  if (files.length > 0 && headExists) {
    // Unstaged diff stat
    const unstagedNumstat = tryGit(["diff", "--numstat"], cwd);
    if (unstagedNumstat.ok && unstagedNumstat.stdout) {
      for (const line of unstagedNumstat.stdout.split("\n")) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          const add = parseInt(parts[0], 10);
          const del = parseInt(parts[1], 10);
          if (!isNaN(add)) additions += add;
          if (!isNaN(del)) deletions += del;
        }
      }
    }

    // Staged diff stat
    const stagedNumstat = tryGit(["diff", "--numstat", "--staged"], cwd);
    if (stagedNumstat.ok && stagedNumstat.stdout) {
      for (const line of stagedNumstat.stdout.split("\n")) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          const add = parseInt(parts[0], 10);
          const del = parseInt(parts[1], 10);
          if (!isNaN(add)) additions += add;
          if (!isNaN(del)) deletions += del;
        }
      }
    }
  }

  return {
    repo: true,
    branch,
    ahead,
    behind,
    upstream,
    files,
    clean: files.length === 0,
    additions,
    deletions,
  };
}

/** Diff çıktısı (staged veya unstaged, opsiyonel tek dosya). */
export function diff(
  opts: { staged?: boolean; file?: string } = {},
  cwd: string = getProjectWorkdir(),
): string {
  const args = ["diff"];
  if (opts.staged) args.push("--staged");
  if (opts.file) args.push("--", opts.file);
  const r = tryGit(args, cwd);
  return r.ok ? r.stdout : `Git error: ${r.stderr}`;
}

/** Diff istatistiği (git diff --stat). */
export function diffStat(
  opts: { staged?: boolean } = {},
  cwd: string = getProjectWorkdir(),
): string {
  const args = ["diff", "--stat"];
  if (opts.staged) args.push("--staged");
  const r = tryGit(args, cwd);
  return r.ok ? r.stdout : `Git error: ${r.stderr}`;
}

/** Dosyaları stage'e al. `["."]` → tümü. */
export function stage(files: string[], cwd: string = getProjectWorkdir()): GitRun {
  if (!files.length) return { ok: false, stdout: "", stderr: "No files given." };
  return tryGit(["add", "--", ...files], cwd);
}

/** Dosyaları stage'den çıkar (index'i HEAD'e geri al). */
export function unstage(files: string[], cwd: string = getProjectWorkdir()): GitRun {
  if (!files.length) return { ok: false, stdout: "", stderr: "No files given." };
  if (!hasHead(cwd)) {
    return tryGit(["rm", "--cached", "-q", "--", ...files], cwd);
  }
  return tryGit(["reset", "-q", "HEAD", "--", ...files], cwd);
}

/** Commit oluştur. `all` → izlenen değişiklikleri de ekle (-a). */
export function commit(
  message: string,
  opts: { all?: boolean } = {},
  cwd: string = getProjectWorkdir(),
): GitRun {
  if (!message.trim()) return { ok: false, stdout: "", stderr: "Empty commit message." };
  const args = ["commit"];
  if (opts.all) args.push("-a");
  args.push("-m", message);
  return tryGit(args, cwd);
}

/** Branch listesi + aktif branch. */
export function branchList(cwd: string = getProjectWorkdir()): GitBranchInfo {
  const current = isGitRepo(cwd) ? currentBranchName(cwd) : "";
  const local = tryGit(["branch", "--format=%(refname:short)"], cwd);
  const remote = tryGit(["branch", "-r", "--format=%(refname:short)"], cwd);
  const localBranches = local.ok ? local.stdout.split("\n").filter(Boolean) : [];
  if (current && current !== "HEAD" && !localBranches.includes(current)) {
    localBranches.unshift(current);
  }
  return {
    current,
    local: localBranches,
    remote: remote.ok ? remote.stdout.split("\n").filter(Boolean) : [],
  };
}

/** Yeni branch oluştur ve geç. */
export function branchCreate(name: string, cwd: string = getProjectWorkdir()): GitRun {
  if (!name.trim()) return { ok: false, stdout: "", stderr: "Empty branch name." };
  return tryGit(["checkout", "-b", name], cwd);
}

/** Var olan branch'e geç. */
export function checkout(name: string, cwd: string = getProjectWorkdir()): GitRun {
  if (!name.trim()) return { ok: false, stdout: "", stderr: "Empty branch name." };
  return tryGit(["checkout", name], cwd);
}

/**
 * Push. `force` → güvenli force (`--force-with-lease`). Upstream yoksa
 * `--set-upstream origin <branch>` ile ilk push yapılır.
 */
export function push(
  opts: { force?: boolean; setUpstream?: boolean; branch?: string } = {},
  cwd: string = getProjectWorkdir(),
): GitRun {
  const args = ["push"];
  if (opts.force) args.push("--force-with-lease");
  if (opts.setUpstream) {
    args.push("--set-upstream", "origin", opts.branch || status(cwd).branch);
  }
  return tryGit(args, cwd);
}

/**
 * origin remote'undan GitHub "compare" (PR aç) URL'i türetir.
 * Hem `git@github.com:owner/repo.git` hem `https://github.com/owner/repo(.git)`
 * biçimlerini destekler. GitHub remote yoksa null döner (PR aç kapalı kalır).
 */
export function githubCompareUrl(cwd: string = getProjectWorkdir()): string | null {
  if (!hasHead(cwd)) return null;
  const remote = tryGit(["config", "--get", "remote.origin.url"], cwd);
  if (!remote.ok || !remote.stdout) return null;
  const url = remote.stdout;
  let slug: string | null = null;
  const ssh = url.match(/git@github\.com:(.+?)(?:\.git)?$/);
  const https = url.match(/https?:\/\/github\.com\/(.+?)(?:\.git)?$/);
  if (ssh) slug = ssh[1];
  else if (https) slug = https[1];
  if (!slug) return null;
  const branch = tryGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd).stdout;
  if (!branch || branch === "HEAD") return null;
  return `https://github.com/${slug}/compare/${encodeURIComponent(branch)}?expand=1`;
}

/** Son commit'ler. */
export function log(
  opts: { limit?: number } = {},
  cwd: string = getProjectWorkdir(),
): GitLogEntry[] {
  const limit = opts.limit ?? 20;
  // Birim ayırıcı (\x1f) alanları, satır ayırıcı (\x1e) commit'leri böler.
  const fmt = "%h\x1f%an\x1f%ar\x1f%s\x1e";
  const r = tryGit(["log", `-${limit}`, `--pretty=format:${fmt}`], cwd);
  if (!r.ok) return [];
  return r.stdout
    .split("\x1e")
    .map((chunk) => chunk.replace(/^\n/, ""))
    .filter(Boolean)
    .map((chunk) => {
      const [hash, author, relative, subject] = chunk.split("\x1f");
      return { hash, author, relative, subject };
    });
}
