import { z } from "zod";
import { registerTool } from "./registry.js";
import { getProjectWorkdir } from "../core/project_context.js";
// Tek çekirdek git çalıştırıcı (WP-4) — desktop IPC ile paylaşılır, kod tekrarı yok.
// runGit aktif proje dizininde (getProjectWorkdir) çalışır; desktop'ta
// process.cwd() Electron başlatma dizini olduğu için bu kritik.
import { runGit } from "../core/git.js";

// ── STATUS ────────────────────────────────────────────────────────────────────
registerTool(
  "git_status",
  "Show the current Git repository status: modified files, staged changes, and current branch.",
  z.object({}),
  async () => {
    const branch = runGit("git rev-parse --abbrev-ref HEAD");
    const status = runGit("git status --short");
    const aheadRaw = runGit("git rev-list --count @{u}..HEAD");
    const ahead = /^\d+$/.test(aheadRaw) ? aheadRaw : "0";
    return [
      `Branch: ${branch}`,
      ahead !== "0" ? `Ahead by ${ahead} commit(s)` : null,
      status ? `\nChanges:\n${status}` : "\nWorking tree clean.",
    ]
      .filter(Boolean)
      .join("\n");
  },
);

// ── DIFF ─────────────────────────────────────────────────────────────────────
registerTool(
  "git_diff",
  "Show current unstaged or staged Git changes.",
  z.object({
    staged: z
      .boolean()
      .optional()
      .describe("Show only staged (git add'd) changes"),
    file: z.string().optional().describe("Limit diff to a specific file"),
  }),
  async ({ staged, file }: { staged?: boolean; file?: string }) => {
    const base = staged ? "git diff --staged" : "git diff";
    const cmd = file ? `${base} -- "${file}"` : base;
    return runGit(cmd) || "No changes.";
  },
);

// ── LOG ───────────────────────────────────────────────────────────────────────
registerTool(
  "git_log",
  "Show recent Git commit history.",
  z.object({
    limit: z
      .number()
      .optional()
      .default(10)
      .describe("Number of commits to show (default: 10)"),
    oneline: z
      .boolean()
      .optional()
      .default(false)
      .describe("Compact one-line format"),
    author: z.string().optional().describe("Filter by author name or email"),
    file: z
      .string()
      .optional()
      .describe("Show only commits touching a specific file"),
  }),
  async ({
    limit,
    oneline,
    author,
    file,
  }: {
    limit: number;
    oneline: boolean;
    author?: string;
    file?: string;
  }) => {
    const format = oneline ? "--oneline" : `--pretty=format:"%h  %an  %ar  %s"`;
    const authorFlag = author ? `--author="${author}"` : "";
    const fileFlag = file ? `-- "${file}"` : "";
    return (
      runGit(
        `git log -${limit} ${format} ${authorFlag} ${fileFlag}`
          .replace(/\s+/g, " ")
          .trim(),
      ) || "No commits."
    );
  },
);

// ── ADD (STAGE) ───────────────────────────────────────────────────────────────
registerTool(
  "git_add",
  "Stage files for commit (git add). Use ['.'] to stage all changes.",
  z.object({
    files: z.array(z.string()).describe("List of files to stage."),
  }),
  async ({ files }: { files: string[] }) => {
    const targets = files.map((f) => `"${f}"`).join(" ");
    return runGit(`git add ${targets}`) || `OK: Staged.`;
  },
);

// ── COMMIT ────────────────────────────────────────────────────────────────────
registerTool(
  "git_commit",
  "Create a Git commit with a message.",
  z.object({
    message: z
      .string()
      .describe(
        "Commit message (use conventional commits: feat:, fix:, chore:, etc.)",
      ),
    all: z
      .boolean()
      .optional()
      .default(false)
      .describe("Stage all tracked modified files first (-a flag)"),
  }),
  async ({ message, all }: { message: string; all: boolean }) => {
    return runGit(
      `git commit ${all ? "-a" : ""} -m "${message.replace(/"/g, '\\"')}"`,
    );
  },
);

// ── BRANCH ────────────────────────────────────────────────────────────────────
registerTool(
  "git_branch",
  "List, create, switch, or delete Git branches.",
  z.object({
    action: z.enum(["list", "create", "switch", "delete"]),
    name: z
      .string()
      .optional()
      .describe("Branch name (required for create/switch/delete)"),
    force: z
      .boolean()
      .optional()
      .default(false)
      .describe("Force delete (unmerged branches)"),
  }),
  async ({
    action,
    name,
    force,
  }: {
    action: string;
    name?: string;
    force: boolean;
  }) => {
    switch (action) {
      case "list": {
        const local = runGit("git branch --list");
        const remote = runGit("git branch -r");
        return `Local:\n${local || "(none)"}\n\nRemote:\n${remote || "(none)"}`;
      }
      case "create":
        if (!name) return "ERROR: Branch name required.";
        return runGit(`git checkout -b "${name}"`);
      case "switch":
        if (!name) return "ERROR: Branch name required.";
        return runGit(`git checkout "${name}"`);
      case "delete":
        if (!name) return "ERROR: Branch name required.";
        return runGit(`git branch ${force ? "-D" : "-d"} "${name}"`);
      default:
        return "ERROR: Unknown action.";
    }
  },
);

// ── STASH ─────────────────────────────────────────────────────────────────────
registerTool(
  "git_stash",
  "Stash or restore uncommitted changes.",
  z.object({
    action: z.enum(["push", "pop", "list", "drop"]),
    message: z.string().optional(),
    index: z.number().optional().default(0),
  }),
  async ({
    action,
    message,
    index,
  }: {
    action: string;
    message?: string;
    index: number;
  }) => {
    switch (action) {
      case "push":
        return runGit(`git stash push${message ? ` -m "${message}"` : ""}`);
      case "pop":
        return runGit(`git stash pop stash@{${index}}`);
      case "list":
        return runGit("git stash list") || "No stashes.";
      case "drop":
        return runGit(`git stash drop stash@{${index}}`);
      default:
        return "ERROR: Unknown action.";
    }
  },
);

// ── CHECKOUT FILE ─────────────────────────────────────────────────────────────
registerTool(
  "git_checkout_file",
  "Discard changes in a specific file and restore it to HEAD state.",
  z.object({
    file: z.string(),
    confirm: z
      .boolean()
      .describe("Must be true — this discards unsaved changes permanently"),
  }),
  async ({ file, confirm }: { file: string; confirm: boolean }) => {
    if (!confirm) return "Aborted: set confirm: true to discard changes.";
    return runGit(`git checkout -- "${file}"`);
  },
);

// ── WORKTREE ────────────────────────────────────────────────────────────────
registerTool(
  "git_worktree",
  "Manage git worktrees for isolated/parallel work under .cowrangler/worktrees/. Actions: create (new branch+worktree), list, remove.",
  z.object({
    action: z.enum(["create", "list", "remove"]),
    name: z.string().optional().describe("Worktree name (for create/remove)"),
    from: z.string().optional().describe("Base ref for create (default: HEAD)"),
    force: z.boolean().optional().describe("Force remove even with uncommitted changes"),
  }),
  async ({ action, name, from, force }: { action: string; name?: string; from?: string; force?: boolean }) => {
    try {
      const wt = await import("../core/worktree.js");
      const root = getProjectWorkdir();
      if (action === "list") {
        const list = wt.listWorktrees(root);
        return list.length ? list.map((w) => `${w.name}  ${w.branch}  ${w.path}`).join("\n") : "No worktrees.";
      }
      if (action === "create") {
        if (!name) return "ERROR: 'create' requires name.";
        const w = wt.createWorktree(root, name, from ?? "HEAD");
        return `OK: worktree '${w.name}' -> ${w.path} (branch ${w.branch})`;
      }
      if (action === "remove") {
        if (!name) return "ERROR: 'remove' requires name.";
        wt.removeWorktree(root, name, !!force);
        return `OK: removed worktree '${name}'`;
      }
      return `ERROR: unknown action '${action}'`;
    } catch (e: any) {
      return `ERROR: ${e?.message ?? String(e)}`;
    }
  },
);
