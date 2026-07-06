/**
 * repo_map — hafif repo haritası (tree-sitter'sız, sezgisel).
 *
 * Kaynak dosyaları tarar, import/referans grafiğini çıkarır ve en "önemli"
 * dosyaları (kaç yerden referans aldığı + boyutu) sıralar. Her dosya için
 * üst-düzey export/tanım isimlerini regex ile özetler. Ajanın büyük kod
 * tabanında ilk turda "nereye bakacağını" bilmesini sağlar.
 */

import { z } from "zod";
import fs from "fs";
import path from "path";
import { registerTool } from "./registry.js";

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "out", "release", "build", ".next",
  "coverage", ".cache", "vendor", "__pycache__", ".venv", "venv",
]);
const CODE_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs",
  ".java", ".rb", ".php", ".c", ".h", ".cpp", ".cs", ".swift", ".kt",
]);

function walk(root: string, maxFiles: number): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length && out.length < maxFiles * 4) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.name.startsWith(".") && e.name !== ".") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) stack.push(full); }
      else if (CODE_EXT.has(path.extname(e.name))) out.push(full);
    }
  }
  return out;
}

/** Üst düzey export / tanım isimlerini çıkar (dil-bağımsız sezgi). */
function extractSymbols(content: string): string[] {
  const names = new Set<string>();
  const patterns = [
    /export\s+(?:async\s+)?(?:default\s+)?(?:function|class|const|interface|type|enum)\s+([A-Za-z0-9_]+)/g,
    /^(?:async\s+)?def\s+([A-Za-z0-9_]+)/gm,
    /^(?:public|private|protected)?\s*(?:func|fn)\s+([A-Za-z0-9_]+)/gm,
    /^(?:type|struct|class)\s+([A-Za-z0-9_]+)/gm,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) && names.size < 12) names.add(m[1]);
  }
  return [...names];
}

registerTool(
  "repo_map",
  "Build a lightweight map of the repository: the most-referenced source files ranked by importance, each with its top exported symbols. Use this FIRST when exploring an unfamiliar or large codebase to know where to look.",
  z.object({
    root: z.string().optional().describe("Directory to map (default: current workspace)"),
    limit: z.number().optional().default(30).describe("Max files to list (default: 30)"),
  }),
  async ({ root, limit = 30 }: { root?: string; limit?: number }) => {
    try {
      const base = path.resolve(root ?? ".");
      const files = walk(base, limit);
      if (files.length === 0) return "No source files found.";

      const basenames = new Map<string, string[]>(); // basename(no ext) → files
      for (const f of files) {
        const key = path.basename(f).replace(/\.[^.]+$/, "");
        basenames.set(key, [...(basenames.get(key) ?? []), f]);
      }

      const refs = new Map<string, number>();
      const symbols = new Map<string, string[]>();
      const sizes = new Map<string, number>();
      for (const f of files) {
        let content = "";
        try { content = fs.readFileSync(f, "utf-8"); } catch { continue; }
        sizes.set(f, content.length);
        symbols.set(f, extractSymbols(content));
        // basit import referansı: import/require içinde geçen dosya adları
        const importLines = content.match(/(?:import|require|from)\s+.*/g) ?? [];
        for (const line of importLines) {
          for (const [key, targets] of basenames) {
            if (key.length >= 3 && line.includes(key)) {
              for (const t of targets) if (t !== f) refs.set(t, (refs.get(t) ?? 0) + 1);
            }
          }
        }
      }

      const scored = files
        .map((f) => ({ f, score: (refs.get(f) ?? 0) * 10 + Math.min((sizes.get(f) ?? 0) / 500, 30) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      const lines = [`Repo map — ${files.length} source files, top ${scored.length} by importance:`, ""];
      for (const { f } of scored) {
        const rel = path.relative(base, f) || path.basename(f);
        const r = refs.get(f) ?? 0;
        const syms = symbols.get(f) ?? [];
        lines.push(`${rel}${r ? `  (referenced ${r}×)` : ""}`);
        if (syms.length) lines.push(`    ${syms.join(", ")}`);
      }
      return lines.join("\n");
    } catch (e: any) {
      return `ERROR building repo map: ${e?.message ?? String(e)}`;
    }
  },
);
