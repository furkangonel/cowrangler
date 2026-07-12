import { z } from "zod";
import { registerTool, TOOL_SCHEMAS } from "./registry.js";

/**
 * Birleşik keşif aracı: `explore`.
 *
 * Neden: agent, kod tabanında "bir şeyleri uzun uzun ararken" read_file /
 * search_in_files / glob_files / list_files / repo_map arasında tek tek geziniyor.
 * Bunların hepsi aynı kapsam — "projeyi keşfet". Beş ayrı şema yerine tek `explore`
 * aracı sunuyoruz; model tek bir zihinsel modelle çalışır, tool-seçim yükü ve şema
 * tokenı düşer. Uygulamalar ÇOĞALTILMAZ — mevcut araçların execute'ına yönlendirir.
 *
 * NOT: yalnız SALT-OKUNUR aileler birleştirildi. Mutasyon (git_commit, write_file
 * vb.) facade'a alınmadı; permission kontrolü araç-adına göre yapıldığı için
 * mutasyonları facade ardına gizlemek onay akışını atlatabilirdi.
 */

const DISPATCH: Record<string, { tool: string; map: (a: any) => any }> = {
  // Tek dosya oku (aralık opsiyonel). read_file'ın turlar-arası önbelleği için
  // agent sarmalayıcısı `explore{action:read}`'i ayrıca tanır.
  read:   { tool: "read_file",       map: (a) => ({ path: a.path, start_line: a.start_line, end_line: a.end_line }) },
  // İçerikte anahtar/regex ara.
  search: { tool: "search_in_files", map: (a) => ({ keyword: a.query, subdir: a.path, file_pattern: a.file_pattern, case_sensitive: a.case_sensitive, max_results: a.max_results }) },
  // İsim kalıbıyla dosya bul.
  glob:   { tool: "glob_files",      map: (a) => ({ pattern: a.pattern, cwd: a.path }) },
  // Dizin içeriğini listele.
  list:   { tool: "list_files",      map: (a) => ({ path: a.path ?? "." }) },
  // Proje yapısının derli toplu haritası.
  tree:   { tool: "repo_map",        map: (a) => ({ path: a.path }) },
};

export function registerFacades(): void {
  registerTool(
    "explore",
    "Explore the codebase — one tool for all read-only discovery. Prefer this over hunting " +
      "with separate tools. Actions:\n" +
      "- read: read a file (optional start_line/end_line for a slice)\n" +
      "- search: grep a keyword/regex across files (query=..., optional path, file_pattern)\n" +
      "- glob: find files by name pattern (pattern=..., optional path)\n" +
      "- list: list a directory (path=...)\n" +
      "- tree: compact map of the project structure\n" +
      "Batch independent explore calls in a single step when you can.",
    z.object({
      action: z.enum(["read", "search", "glob", "list", "tree"]),
      path: z.string().optional().describe("File or directory path (read/list/tree/search root)"),
      query: z.string().optional().describe("search: keyword or regex"),
      pattern: z.string().optional().describe("glob: filename pattern, e.g. **/*.ts"),
      file_pattern: z.string().optional().describe("search: restrict to extension, e.g. .ts"),
      case_sensitive: z.boolean().optional().describe("search: case sensitivity"),
      max_results: z.number().optional().describe("search: max matches"),
      start_line: z.number().optional().describe("read: first line (1-indexed)"),
      end_line: z.number().optional().describe("read: last line (inclusive)"),
    }),
    async (args: any, options: any) => {
      const d = DISPATCH[args?.action];
      if (!d) return { result: `ERROR: unknown explore action '${args?.action}'. Use read|search|glob|list|tree.` };
      const target = TOOL_SCHEMAS[d.tool];
      if (!target || typeof target.execute !== "function") {
        return { result: `ERROR: underlying tool '${d.tool}' is not available.` };
      }
      return await target.execute(d.map(args), options);
    },
  );
}
