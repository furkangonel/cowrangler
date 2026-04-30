import { z } from "zod";
import { execSync } from "child_process";
import { registerTool } from "./registry.js";

function runGit(command: string): string {
  try {
    return execSync(command, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    });
  } catch (e: any) {
    return `Git komutu başarısız oldu. Repo olmayabilir veya komut hatalı.\nDetay: ${e.message}`;
  }
}

registerTool(
  "git_status",
  "Mevcut Git reposunun durumunu (değişen dosyalar, branch vb.) gösterir.",
  z.object({}),
  async () => runGit("git status --short"),
);

registerTool(
  "git_diff",
  "Mevcut git değişikliklerini (diff) detaylı olarak getirir.",
  z.object({
    staged: z
      .boolean()
      .optional()
      .describe(
        "Sadece stage edilmiş (git add yapılmış) değişiklikleri göster",
      ),
  }),
  async ({ staged }: { staged?: boolean }) => {
    const cmd = staged ? "git diff --staged" : "git diff";
    const diff = runGit(cmd);
    return diff.trim() ? diff : "Değişiklik yok.";
  },
);
