/**
 * git.ipc — Desktop Code arayüzü için git IPC katmanı (WP-4).
 *
 * Tüm işlemler `core/git.ts` çekirdeğini kullanır (agent tarafı git_tools ile
 * paylaşılan tek runGit). Renderer, aktif projenin `workdir`'ini geçirir; bu
 * sayede git komutları doğru depoda çalışır (getProjectWorkdir singleton'ına
 * bağımlı kalmadan). workdir verilmezse çekirdek getProjectWorkdir()'e düşer.
 *
 * Güvenlik: push / force / PR açma geri-alınamaz-dış-etkili işlemlerdir. Bu
 * katman yalnızca çalıştırır; onay akışı renderer (GitPanel) tarafında zorlanır
 * (WP-7 ile tutarlı — Auto mode'da bile onay istenir).
 */

import { IpcMain } from "electron";
import * as git from "@cowrangler/core/git.js";

/** Renderer'dan gelen workdir'i normalize et (boşsa çekirdek default'una bırak). */
function wd(workdir?: string): string | undefined {
  return workdir && workdir.trim() ? workdir : undefined;
}

export function registerGitIPC(ipcMain: IpcMain): void {
  ipcMain.handle("git:isRepo", async (_e, workdir?: string) => {
    return git.isGitRepo(wd(workdir));
  });

  ipcMain.handle("git:status", async (_e, workdir?: string) => {
    return git.status(wd(workdir));
  });

  ipcMain.handle(
    "git:diff",
    async (_e, opts: { staged?: boolean; file?: string } = {}, workdir?: string) => {
      return git.diff(opts, wd(workdir));
    },
  );

  ipcMain.handle(
    "git:diffStat",
    async (_e, opts: { staged?: boolean } = {}, workdir?: string) => {
      return git.diffStat(opts, wd(workdir));
    },
  );

  ipcMain.handle("git:stage", async (_e, files: string[], workdir?: string) => {
    return git.stage(files, wd(workdir));
  });

  ipcMain.handle("git:unstage", async (_e, files: string[], workdir?: string) => {
    return git.unstage(files, wd(workdir));
  });

  ipcMain.handle(
    "git:commit",
    async (_e, message: string, opts: { all?: boolean } = {}, workdir?: string) => {
      return git.commit(message, opts, wd(workdir));
    },
  );

  ipcMain.handle("git:branchList", async (_e, workdir?: string) => {
    return git.branchList(wd(workdir));
  });

  ipcMain.handle("git:branchCreate", async (_e, name: string, workdir?: string) => {
    return git.branchCreate(name, wd(workdir));
  });

  ipcMain.handle("git:checkout", async (_e, name: string, workdir?: string) => {
    return git.checkout(name, wd(workdir));
  });

  // Geri-alınamaz / dış-etkili — onay renderer'da zorlanır.
  ipcMain.handle(
    "git:push",
    async (_e, opts: { force?: boolean; setUpstream?: boolean } = {}, workdir?: string) => {
      return git.push(opts, wd(workdir));
    },
  );

  ipcMain.handle("git:log", async (_e, opts: { limit?: number } = {}, workdir?: string) => {
    return git.log(opts, wd(workdir));
  });

  // GitHub compare (PR aç) URL'i döner — renderer tarayıcıda açar. Sadece URL
  // üretir, PR OLUŞTURMAZ; kullanıcı GitHub'da tamamlar (güvenli, dış-etkisiz).
  ipcMain.handle("git:prUrl", async (_e, workdir?: string): Promise<string | null> => {
    return git.githubCompareUrl(wd(workdir));
  });

  // ── AI commit mesajı önerisi ────────────────────────────────────────────────
  // Staged diff'i modele verip Conventional Commits başlığı ürettirir.
  ipcMain.handle(
    "git:suggestCommitMessage",
    async (_e, model: string, workdir?: string): Promise<{ ok: boolean; message?: string; error?: string }> => {
      try {
        const dir = wd(workdir);
        let staged = git.diff({ staged: true }, dir);
        // Staged yoksa unstaged'a düş — kullanıcı henüz stage etmemiş olabilir.
        if (!staged || staged.startsWith("Git error")) staged = "";
        const body = staged || git.diff({ staged: false }, dir);
        if (!body || body.startsWith("Git error") || !body.trim()) {
          return { ok: false, error: "No changes to describe." };
        }
        // Aşırı büyük diff'i kırp (token tasarrufu).
        const clipped = body.length > 12_000 ? body.slice(0, 12_000) + "\n…(truncated)" : body;

        const { LLM } = await import("@cowrangler/core/llm.js");
        const { generateText } = await import("ai");
        const llm = new LLM(model);
        const result = await generateText({
          model: llm.getModel(),
          system:
            "You write git commit messages. Given a diff, produce ONE Conventional Commits " +
            "subject line (e.g. 'feat: ...', 'fix: ...', 'refactor: ...'). Max 72 chars, " +
            "imperative mood, no trailing period, no body, no quotes. Reply with the line only.",
          messages: [{ role: "user", content: `Diff:\n\n${clipped}` }],
          maxTokens: 60,
        });
        const message = result.text.trim().split("\n")[0].replace(/^["'`]|["'`]$/g, "").trim();
        if (!message) return { ok: false, error: "Model returned empty message." };
        return { ok: true, message };
      } catch (e: any) {
        return { ok: false, error: e?.message ?? String(e) };
      }
    },
  );
}
