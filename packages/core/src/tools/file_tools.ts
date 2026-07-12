import { z } from "zod";
import fs from "fs/promises";
import { existsSync, mkdirSync, statSync } from "fs";
import path from "path";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import ExcelJS from "exceljs";
import fg from "fast-glob";
import { registerTool } from "./registry.js";
import { beforeMutation, setCheckpointBase } from "../checkpoints.js";
import { protectUntrustedContent } from "../context_security.js";
import { truncateToolOutput, MAX_OUTPUT_LINES } from "./truncate.js";

/** Tek satır char tavanı — minified/tek-satır dosyalar byte'ı patlatmasın. */
const MAX_LINE_CHARS = 2000;
function clampLine(line: string): string {
  return line.length > MAX_LINE_CHARS
    ? line.slice(0, MAX_LINE_CHARS) + " …(line truncated)"
    : line;
}

let _WORKSPACE = path.resolve("./workspace");

export function setWorkspace(workspacePath: string) {
  _WORKSPACE = path.resolve(workspacePath);
  if (!existsSync(_WORKSPACE)) mkdirSync(_WORKSPACE, { recursive: true });
  setCheckpointBase(_WORKSPACE);
}

function _safePath(relativePath: string): string {
  // Allow absolute paths (e.g., from the user's system) and relative ones
  return path.isAbsolute(relativePath)
    ? path.resolve(relativePath)
    : path.resolve(_WORKSPACE, relativePath);
}

function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[a-zA-Z0-9_-]*\n?/g, "").replace(/```/g, ""))
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "- ")
    .replace(/^\s*\d+\.\s+/gm, (match) => match.trimEnd() + " ")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

function protectFileReadResult(content: string, relPath: string): string {
  // Önce buda (diske taşır + önizleme), sonra injection tarayıcısıyla sarmala.
  // Böylece docx/pdf/xlsx/pptx/rtf/html/plain — tüm okuma yolları tek noktada
  // token-güvenli hale gelir.
  return protectUntrustedContent(
    truncateToolOutput(content, { label: `read_file ${relPath}` }),
    `file ${relPath}`,
  );
}

function wrapText(line: string, font: any, fontSize: number, maxWidth: number): string[] {
  if (!line.trim()) return [""];
  const words = line.split(/\s+/);
  const wrapped: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) wrapped.push(current);
    current = word;
  }

  if (current) wrapped.push(current);
  return wrapped;
}

async function writeMarkdownPdf(target: string, markdown: string): Promise<void> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontSize = 11;
  const lineHeight = 15;
  const margin = 54;
  const pageWidth = 612;
  const pageHeight = 792;
  const maxWidth = pageWidth - margin * 2;
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const lines = markdownToPlainText(markdown).split(/\r?\n/);
  for (const line of lines) {
    for (const wrapped of wrapText(line, font, fontSize, maxWidth)) {
      if (y < margin) {
        page = pdf.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      page.drawText(wrapped, {
        x: margin,
        y,
        size: fontSize,
        font,
        color: rgb(0.08, 0.08, 0.08),
      });
      y -= lineHeight;
    }
  }

  await fs.writeFile(target, await pdf.save());
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST FILES
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "list_files",
  "List files and directories in the workspace. Returns a recursive tree with sizes.",
  z.object({
    subdir: z.string().optional().default(".").describe("Relative path (default: workspace root)"),
    depth: z.number().optional().default(3).describe("Max recursion depth (default: 3)"),
  }),
  async ({ subdir, depth }: { subdir: string; depth: number }) => {
    try {
      const target = _safePath(subdir);
      if (!existsSync(target)) return `'${subdir}' not found.`;
      if (statSync(target).isFile()) return `'${subdir}' is a file, not a directory.`;

      const entries: string[] = [];
      async function scan(dir: string, currentDepth: number) {
        if (currentDepth > depth) return;
        const items = await fs.readdir(dir, { withFileTypes: true });
        items.sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        });
        for (const item of items) {
          if (item.name === "node_modules" || item.name === ".git") continue;
          const fullPath = path.join(dir, item.name);
          const relPath = path.relative(_WORKSPACE, fullPath);
          const indent = "  ".repeat(currentDepth - 1);
          if (item.isDirectory()) {
            entries.push(`${indent}📁 ${relPath}/`);
            await scan(fullPath, currentDepth + 1);
          } else {
            const stat = await fs.stat(fullPath);
            const size = stat.size < 1024
              ? `${stat.size}B`
              : stat.size < 1048576
              ? `${(stat.size / 1024).toFixed(1)}KB`
              : `${(stat.size / 1048576).toFixed(1)}MB`;
            entries.push(`${indent}📄 ${relPath} (${size})`);
          }
        }
      }
      await scan(target, 1);
      return entries.length ? entries.join("\n") : `'${subdir}' is empty.`;
    } catch (e: any) {
      return `ERROR: ${e.message}`;
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GLOB FILES — powered by fast-glob for real pattern support
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "glob_files",
  "Find files matching a glob pattern. Supports full glob syntax: **, ?, [], {}, negation (!). Examples: '**/*.ts', 'src/**/*.test.*', '!**/node_modules/**'.",
  z.object({
    pattern: z.string().describe("Glob pattern, e.g., '**/*.ts' or 'src/**/*.{ts,tsx}'"),
    cwd: z.string().optional().describe("Root directory for the search (default: workspace root)"),
    ignore: z.array(z.string()).optional().describe("Additional ignore patterns (node_modules, .git, dist are always ignored)"),
  }),
  async ({ pattern, cwd, ignore = [] }: { pattern: string; cwd?: string; ignore?: string[] }) => {
    try {
      const baseDir = cwd ? _safePath(cwd) : _WORKSPACE;
      // Ağır build/dependency dizinlerini traversal dışı bırak. Yalnız
      // node_modules/.git/dist yetmiyor: web projelerinde .next/out/build/coverage
      // gibi dizinler `**/*.css` benzeri geniş kalıpları dakikalarca yürütüyor.
      const DEFAULT_IGNORE = [
        "**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**",
        "**/out/**", "**/.next/**", "**/.nuxt/**", "**/coverage/**",
        "**/.cache/**", "**/vendor/**", "**/release/**", "**/.venv/**",
        "**/__pycache__/**",
      ];
      const matches = await fg(pattern, {
        cwd: baseDir,
        ignore: [...DEFAULT_IGNORE, ...ignore],
        dot: false,
        onlyFiles: true,
        unique: true,
        suppressErrors: true,
      });
      if (matches.length === 0) return `No files matched '${pattern}'.`;
      // Sonuç tavanı — devasa eşleşmeler modele bir çuval dosya yollamasın.
      const MAX_GLOB = 500;
      const sorted = matches.sort();
      const shown = sorted.slice(0, MAX_GLOB);
      const header = `Found ${matches.length} file(s)${matches.length > MAX_GLOB ? ` (showing first ${MAX_GLOB} — narrow your pattern)` : ""}:\n`;
      return header + shown.join("\n");
    } catch (e: any) {
      return `ERROR: ${e.message}`;
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// FILE INFO
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "file_info",
  "Get metadata about a file or directory: size, modification time, line count.",
  z.object({ path: z.string() }),
  async ({ path: relPath }: { path: string }) => {
    try {
      const target = _safePath(relPath);
      if (!existsSync(target)) return `Not found: ${relPath}`;
      const stat = await fs.stat(target);
      const isFile = stat.isFile();
      let lines = 0;
      if (isFile) {
        try {
          const content = await fs.readFile(target, "utf-8");
          lines = content.split("\n").length;
        } catch {}
      }
      return JSON.stringify({
        path: relPath,
        type: stat.isDirectory() ? "directory" : "file",
        size_bytes: stat.size,
        size_human: stat.size < 1024 ? `${stat.size}B` : stat.size < 1048576 ? `${(stat.size / 1024).toFixed(1)}KB` : `${(stat.size / 1048576).toFixed(1)}MB`,
        lines: isFile ? lines : null,
        modified: stat.mtime.toISOString(),
        created: stat.birthtime.toISOString(),
      }, null, 2);
    } catch (e: any) {
      return `ERROR: ${e.message}`;
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// READ FILE
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "read_file",
  "Read a file and return its content. Supports plain text/code, .docx, .pdf, .xlsx, .pptx, .rtf, .html, .csv. Optionally specify line range.",
  z.object({
    path: z.string(),
    start_line: z.number().optional().describe("First line to read (1-indexed)"),
    end_line: z.number().optional().describe("Last line to read (inclusive)"),
  }),
  async ({ path: relPath, start_line, end_line }: { path: string; start_line?: number; end_line?: number }) => {
    try {
      const target = _safePath(relPath);
      if (!existsSync(target)) return `File not found: ${relPath}`;

      const ext = path.extname(target).toLowerCase();
      if (ext === ".docx") {
        const result = await mammoth.extractRawText({ path: target });
        return protectFileReadResult(result.value, relPath);
      }
      if (ext === ".pdf") {
        const dataBuffer = await fs.readFile(target);
        const data = await pdfParse(dataBuffer);
        return protectFileReadResult(data.text, relPath);
      }
      if (ext === ".xlsx") {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(target);
        const text = workbook.worksheets.map((sheet) => {
          const rows: string[] = [];
          sheet.eachRow((row) => {
            const values = Array.isArray(row.values) ? row.values.slice(1) : [];
            rows.push(values.map((value) => {
              if (value == null) return "";
              if (typeof value === "object" && "text" in value) return String((value as any).text);
              if (typeof value === "object" && "result" in value) return String((value as any).result ?? "");
              return String(value);
            }).join(","));
          });
          return `=== Sheet: ${sheet.name} ===\n${rows.join("\n")}`;
        }).join("\n\n");
        return protectFileReadResult(text, relPath);
      }
      if (ext === ".xls") {
        return "ERROR reading file: legacy .xls files are not supported. Please convert the workbook to .xlsx.";
      }
      if (ext === ".pptx") {
        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(await fs.readFile(target));
        const slides = Object.keys(zip.files)
          .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
          .sort((a, b) => {
            const na = parseInt(a.match(/slide(\d+)\.xml$/)![1], 10);
            const nb = parseInt(b.match(/slide(\d+)\.xml$/)![1], 10);
            return na - nb;
          });
        const out: string[] = [];
        for (let i = 0; i < slides.length; i++) {
          const xml = await zip.files[slides[i]].async("string");
          const texts = Array.from(xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)).map((m) => m[1]);
          out.push(`=== Slide ${i + 1} ===\n${texts.join("\n")}`);
        }
        return protectFileReadResult(out.join("\n\n"), relPath);
      }
      if (ext === ".rtf") {
        const rtf = await fs.readFile(target, "utf-8");
        const text = rtf
          .replace(/\\'[0-9a-fA-F]{2}/g, " ")
          .replace(/\\[a-zA-Z]+-?\d* ?/g, "")
          .replace(/[{}]/g, "")
          .replace(/[ \t]{2,}/g, " ")
          .trim();
        return protectFileReadResult(text, relPath);
      }
      if (ext === ".html" || ext === ".htm") {
        const html = await fs.readFile(target, "utf-8");
        const { load } = await import("cheerio");
        const $ = load(html);
        $("script, style, noscript").remove();
        const text = ($("body").text() || $.root().text()).replace(/\n{3,}/g, "\n\n").trim();
        return protectFileReadResult(text, relPath);
      }

      const raw = await fs.readFile(target, "utf-8");
      const lines = raw.split("\n");
      if (start_line !== undefined || end_line !== undefined) {
        const from = (start_line ?? 1) - 1;
        const to = end_line ?? lines.length;
        return protectFileReadResult(
          lines.slice(from, to).map((l, i) => `${from + i + 1}: ${clampLine(l)}`).join("\n"),
          relPath,
        );
      }
      // P1: aralık verilmediyse TÜM dosyayı raw döndürme. Numaralı, satır-başı
      // clamp'li içerik üret; protectFileReadResult ilk MAX_OUTPUT_LINES satırı
      // gösterir, gerisini diske taşır. Model belirli aralığı start/end ile okur.
      const numbered = lines.map((l, i) => `${i + 1}: ${clampLine(l)}`).join("\n");
      const hint =
        lines.length > MAX_OUTPUT_LINES
          ? `[file has ${lines.length} lines; showing a window — use start_line/end_line to read more]\n`
          : "";
      return protectFileReadResult(hint + numbered, relPath);
    } catch (e: any) {
      return `ERROR reading file: ${e.message}`;
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// WRITE FILE
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "write_file",
  "Write content to a file (creates or overwrites). Parent directories are created automatically.",
  z.object({ path: z.string(), content: z.string() }),
  async ({ path: relPath, content }: { path: string; content: string }) => {
    try {
      const target = _safePath(relPath);
      beforeMutation(target, `write_file ${relPath}`);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content, "utf-8");
      return `OK: Written ${content.length} chars (${content.split("\n").length} lines) → ${relPath}`;
    } catch (e: any) {
      return `ERROR writing file: ${e.message}`;
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// APPEND TO FILE
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "append_to_file",
  "Append content to the end of a file (creates it if it doesn't exist).",
  z.object({
    path: z.string(),
    content: z.string(),
    newline: z.boolean().optional().default(true).describe("Insert newline before appended content (default: true)"),
  }),
  async ({ path: relPath, content, newline }: { path: string; content: string; newline: boolean }) => {
    try {
      const target = _safePath(relPath);
      beforeMutation(target, `append_to_file ${relPath}`);
      await fs.mkdir(path.dirname(target), { recursive: true });
      const prefix = newline && existsSync(target) ? "\n" : "";
      await fs.appendFile(target, prefix + content, "utf-8");
      return `OK: Appended ${content.length} chars to ${relPath}`;
    } catch (e: any) {
      return `ERROR: ${e.message}`;
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// EDIT FILE (str_replace)
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "edit_file",
  "Replace an exact string in a file with new content. The old_text must appear exactly once.",
  z.object({
    path: z.string(),
    old_text: z.string().describe("Exact text to replace (must be unique in the file)"),
    new_text: z.string().describe("Replacement text"),
  }),
  async ({ path: relPath, old_text, new_text }: { path: string; old_text: string; new_text: string }) => {
    try {
      const target = _safePath(relPath);
      if (!existsSync(target)) return `File not found: ${relPath}`;
      let content = await fs.readFile(target, "utf-8");
      const count = content.split(old_text).length - 1;
      if (count === 0) return `ERROR: old_text not found in file. Check your text carefully.`;
      if (count > 1) return `ERROR: old_text appears ${count} times — provide more context to make it unique.`;
      beforeMutation(target, `edit_file ${relPath}`);
      content = content.replace(old_text, new_text);
      await fs.writeFile(target, content, "utf-8");
      return `OK: ${relPath} updated.`;
    } catch (e: any) {
      return `ERROR: ${e.message}`;
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// APPLY PATCH — çoklu search/replace hunk'ı tek çağrıda (edit-format)
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "apply_patch",
  "Apply multiple search/replace edits to a single file in one call. Each hunk's old_text must appear exactly once. More efficient than repeated edit_file calls for multi-spot changes.",
  z.object({
    path: z.string(),
    hunks: z.array(z.object({
      old_text: z.string().describe("Exact text to replace (unique in file)"),
      new_text: z.string().describe("Replacement text"),
    })).describe("Ordered list of edits to apply"),
  }),
  async ({ path: relPath, hunks }: { path: string; hunks: { old_text: string; new_text: string }[] }) => {
    try {
      const target = _safePath(relPath);
      if (!existsSync(target)) return `File not found: ${relPath}`;
      let content = await fs.readFile(target, "utf-8");
      const applied: string[] = [];
      for (let i = 0; i < hunks.length; i++) {
        const { old_text, new_text } = hunks[i];
        const count = content.split(old_text).length - 1;
        if (count === 0) return `ERROR: hunk #${i + 1} old_text not found (applied ${applied.length} of ${hunks.length}; file unchanged).`;
        if (count > 1) return `ERROR: hunk #${i + 1} old_text appears ${count} times — add more context (file unchanged).`;
        content = content.replace(old_text, new_text);
        applied.push(`#${i + 1}`);
      }
      beforeMutation(target, `apply_patch ${relPath}`);
      await fs.writeFile(target, content, "utf-8");
      return `OK: ${relPath} — applied ${hunks.length} hunk(s).`;
    } catch (e: any) {
      return `ERROR: ${e.message}`;
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// COPY FILE
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "copy_file",
  "Copy a file to a new location.",
  z.object({
    source: z.string(),
    destination: z.string(),
    overwrite: z.boolean().optional().default(false),
  }),
  async ({ source, destination, overwrite }: { source: string; destination: string; overwrite: boolean }) => {
    try {
      const src = _safePath(source);
      const dst = _safePath(destination);
      if (!existsSync(src)) return `ERROR: Source not found: ${source}`;
      if (existsSync(dst) && !overwrite) return `ERROR: Destination exists. Set overwrite: true to replace.`;
      await fs.mkdir(path.dirname(dst), { recursive: true });
      await fs.copyFile(src, dst);
      return `OK: '${source}' → '${destination}'`;
    } catch (e: any) {
      return `ERROR: ${e.message}`;
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// MOVE / RENAME
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "move_item",
  "Move or rename a file or directory.",
  z.object({ source: z.string(), destination: z.string() }),
  async ({ source, destination }: { source: string; destination: string }) => {
    try {
      const src = _safePath(source);
      const dst = _safePath(destination);
      if (!existsSync(src)) return `ERROR: Source not found: ${source}`;
      if (!statSync(src).isDirectory()) { beforeMutation(src, `move ${source}`); beforeMutation(dst, `move ${destination}`); }
      await fs.mkdir(path.dirname(dst), { recursive: true });
      await fs.rename(src, dst);
      return `OK: '${source}' → '${destination}'`;
    } catch (e: any) {
      return `ERROR: ${e.message}`;
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE FILE
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "delete_file",
  "Permanently delete a file. Requires confirm: true.",
  z.object({
    path: z.string(),
    confirm: z.boolean().describe("Must be true to confirm deletion"),
  }),
  async ({ path: relPath, confirm }: { path: string; confirm: boolean }) => {
    if (!confirm) return "Aborted: set confirm: true to delete.";
    try {
      const target = _safePath(relPath);
      if (!existsSync(target)) return `Not found: ${relPath}`;
      if ((await fs.stat(target)).isDirectory()) return `ERROR: '${relPath}' is a directory. Use delete_folder.`;
      beforeMutation(target, `delete_file ${relPath}`);
      await fs.unlink(target);
      return `OK: Deleted '${relPath}'`;
    } catch (e: any) {
      return `ERROR: ${e.message}`;
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE FOLDER
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "delete_folder",
  "Recursively delete a directory and all its contents. Requires confirm: true.",
  z.object({
    path: z.string(),
    confirm: z.boolean().describe("Must be true to confirm deletion"),
  }),
  async ({ path: relPath, confirm }: { path: string; confirm: boolean }) => {
    if (!confirm) return "Aborted: set confirm: true to delete.";
    try {
      const target = _safePath(relPath);
      if (!existsSync(target)) return `Not found: ${relPath}`;
      await fs.rm(target, { recursive: true, force: true });
      return `OK: '${relPath}' and all contents deleted.`;
    } catch (e: any) {
      return `ERROR: ${e.message}`;
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// CREATE FOLDER
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "create_folder",
  "Create a new directory (including any necessary parent directories).",
  z.object({ path: z.string() }),
  async ({ path: relPath }: { path: string }) => {
    try {
      const target = _safePath(relPath);
      if (existsSync(target)) return `Note: '${relPath}' already exists.`;
      await fs.mkdir(target, { recursive: true });
      return `OK: '${relPath}' created.`;
    } catch (e: any) {
      return `ERROR: ${e.message}`;
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH IN FILES
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "search_in_files",
  "Search for a keyword or pattern across files in the workspace. Returns matching lines.",
  z.object({
    keyword: z.string().describe("Search term or regex"),
    subdir: z.string().optional().default("."),
    file_pattern: z.string().optional().describe("Filter by extension, e.g., '.ts'"),
    case_sensitive: z.boolean().optional().default(false),
    max_results: z.number().optional().default(50),
  }),
  async ({ keyword, subdir, file_pattern, case_sensitive, max_results }: {
    keyword: string; subdir: string; file_pattern?: string;
    case_sensitive: boolean; max_results: number;
  }) => {
    try {
      const target = _safePath(subdir);
      const results: string[] = [];
      const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".py", ".rb", ".go", ".rs",
        ".java", ".md", ".txt", ".json", ".yaml", ".yml", ".toml", ".sh", ".css", ".html", ".vue"];
      let searchRegex: RegExp;
      try {
        searchRegex = new RegExp(keyword, case_sensitive ? "g" : "gi");
      } catch {
        searchRegex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), case_sensitive ? "g" : "gi");
      }

      async function scan(dir: string) {
        if (results.length >= max_results) return;
        try {
          const items = await fs.readdir(dir, { withFileTypes: true });
          for (const item of items) {
            if (results.length >= max_results) break;
            if (["node_modules", ".git", "dist", ".cowrangler"].includes(item.name)) continue;
            const fullPath = path.join(dir, item.name);
            if (item.isDirectory()) {
              await scan(fullPath);
            } else {
              const ext = path.extname(fullPath).toLowerCase();
              if (file_pattern) { if (!fullPath.endsWith(file_pattern)) continue; }
              else if (!extensions.includes(ext)) continue;
              const content = await fs.readFile(fullPath, "utf-8");
              const lines = content.split("\n");
              lines.forEach((line, i) => {
                searchRegex.lastIndex = 0;
                if (results.length < max_results && searchRegex.test(line)) {
                  results.push(`${path.relative(_WORKSPACE, fullPath)}:${i + 1}  ${line.trim()}`);
                }
              });
            }
          }
        } catch {}
      }

      await scan(target);
      if (!results.length) return `No matches found for '${keyword}'.`;
      const header = `Found ${results.length} match(es)${results.length >= max_results ? " (limit reached)" : ""}:\n`;
      return truncateToolOutput(header + results.map((r) => clampLine(r)).join("\n"), {
        label: `search ${keyword}`,
      });
    } catch (e: any) {
      return `ERROR: ${e.message}`;
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// CREATE PDF
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "create_pdf",
  "Convert Markdown content to a PDF file.",
  z.object({ path: z.string(), markdown_content: z.string() }),
  async ({ path: relPath, markdown_content }: { path: string; markdown_content: string }) => {
    try {
      if (!relPath.toLowerCase().endsWith(".pdf")) relPath += ".pdf";
      const target = _safePath(relPath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await writeMarkdownPdf(target, markdown_content);
      return `OK: PDF created at ${relPath}`;
    } catch (e: any) {
      return `ERROR creating PDF: ${e.message}`;
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// NOTEBOOK EDIT — Jupyter .ipynb hücre okuma ve düzenleme
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "notebook_edit",
  `Read or edit a Jupyter notebook (.ipynb) file at the cell level.

Actions:
- read        → Return all cells (index, type, source, first line of output)
- edit_cell   → Replace source of a specific cell (0-based cell_number)
- insert_cell → Insert a new cell at position (0-based cell_number)
- delete_cell → Delete the cell at position (0-based cell_number)
- run_info    → Return cell types and execution counts`,
  z.object({
    notebook_path: z.string().describe("Absolute or workspace-relative path to the .ipynb file"),
    action: z.enum(["read", "edit_cell", "insert_cell", "delete_cell", "run_info"]),
    cell_number: z.number().optional().describe("0-based cell index"),
    source: z.string().optional().describe("New cell source (required for edit_cell, insert_cell)"),
    cell_type: z.enum(["code", "markdown"]).optional().default("code"),
  }),
  async ({
    notebook_path,
    action,
    cell_number,
    source,
    cell_type = "code",
  }: {
    notebook_path: string;
    action: string;
    cell_number?: number;
    source?: string;
    cell_type?: string;
  }) => {
    const target = _safePath(notebook_path);
    try {
      if (!target.endsWith(".ipynb")) return `ERROR: File must be a .ipynb notebook.`;

      let nb: any;
      try {
        nb = JSON.parse(await fs.readFile(target, "utf-8"));
      } catch (e: any) {
        return `ERROR reading notebook: ${e.message}`;
      }
      const cells: any[] = nb.cells ?? [];

      if (action === "read") {
        if (!cells.length) return "Notebook has no cells.";
        const lines = cells.map((c: any, i: number) => {
          const src = (c.source ?? []).join("").slice(0, 200).replace(/\n/g, "↵");
          const outSnippet = c.outputs?.length
            ? `\n    → output: ${JSON.stringify(c.outputs[0]).slice(0, 100)}`
            : "";
          return `[${i}] ${c.cell_type}  ${src}${outSnippet}`;
        });
        return `Notebook: ${notebook_path} (${cells.length} cells)\n\n${lines.join("\n")}`;
      }

      if (action === "run_info") {
        return cells
          .map((c: any, i: number) => `[${i}] ${c.cell_type}  exec_count=${c.execution_count ?? "-"}`)
          .join("\n");
      }

      if (cell_number === undefined) return `ERROR: cell_number required for '${action}'.`;

      if (action === "edit_cell") {
        if (source === undefined) return `ERROR: source required for edit_cell.`;
        if (cell_number < 0 || cell_number >= cells.length)
          return `ERROR: cell_number ${cell_number} out of range (0–${cells.length - 1}).`;
        cells[cell_number].source = source.split("\n").map((l, i, a) => (i < a.length - 1 ? l + "\n" : l));
        nb.cells = cells;
        await fs.writeFile(target, JSON.stringify(nb, null, 1), "utf-8");
        return `OK: Cell ${cell_number} updated.`;
      }

      if (action === "insert_cell") {
        if (source === undefined) return `ERROR: source required for insert_cell.`;
        const newCell: any = {
          cell_type,
          metadata: {},
          source: source.split("\n").map((l, i, a) => (i < a.length - 1 ? l + "\n" : l)),
          ...(cell_type === "code" ? { outputs: [], execution_count: null } : {}),
        };
        cells.splice(cell_number, 0, newCell);
        nb.cells = cells;
        await fs.writeFile(target, JSON.stringify(nb, null, 1), "utf-8");
        return `OK: New ${cell_type} cell inserted at position ${cell_number}.`;
      }

      if (action === "delete_cell") {
        if (cell_number < 0 || cell_number >= cells.length)
          return `ERROR: cell_number ${cell_number} out of range (0–${cells.length - 1}).`;
        cells.splice(cell_number, 1);
        nb.cells = cells;
        await fs.writeFile(target, JSON.stringify(nb, null, 1), "utf-8");
        return `OK: Cell ${cell_number} deleted. ${cells.length} cells remain.`;
      }

      return `ERROR: Unknown action '${action}'.`;
    } catch (e: any) {
      return `ERROR: ${e.message}`;
    }
  },
);
