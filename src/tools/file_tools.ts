import { z } from "zod";
import fs from "fs/promises";
import { existsSync, mkdirSync, statSync } from "fs";
import path from "path";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import xlsx from "xlsx";
import markdownpdf from "markdown-pdf";
import { registerTool } from "./registry.js";

let _WORKSPACE = path.resolve("./workspace");

export function setWorkspace(workspacePath: string) {
  _WORKSPACE = path.resolve(workspacePath);
  if (!existsSync(_WORKSPACE)) mkdirSync(_WORKSPACE, { recursive: true });
}

function _safePath(relativePath: string): string {
  const target = path.resolve(_WORKSPACE, relativePath);
  if (!target.startsWith(_WORKSPACE)) {
    throw new Error(`Workspace dışına erişim yasak: ${relativePath}`);
  }
  return target;
}

// Araç Kayıtları
registerTool(
  "list_files",
  "Workspace içindeki dosya ve klasörleri listele.",
  z.object({ subdir: z.string().optional().default(".") }),
  async ({ subdir }: { subdir: string }) => {
    try {
      const target = _safePath(subdir);
      if (!existsSync(target)) return `'${subdir}' bulunamadı.`;

      const stat = statSync(target);
      if (stat.isFile()) return `'${subdir}' bir dosya, klasör değil.`;

      // Recursive scan (Basit versiyon)
      const entries: string[] = [];
      async function scan(dir: string) {
        const items = await fs.readdir(dir, { withFileTypes: true });
        for (const item of items) {
          const fullPath = path.join(dir, item.name);
          const relPath = path.relative(_WORKSPACE, fullPath);
          if (item.isDirectory()) {
            entries.push(`📁 ${relPath}/`);
            await scan(fullPath);
          } else {
            const size = (await fs.stat(fullPath)).size / 1024;
            entries.push(`📄 ${relPath} (${size.toFixed(1)} KB)`);
          }
        }
      }

      await scan(target);
      return entries.length ? entries.join("\n") : `'${subdir}' klasörü boş.`;
    } catch (e: any) {
      return `HATA: ${e.message}`;
    }
  },
);

registerTool(
  "read_file",
  "Bir dosyayı oku ve içeriğini döndür. Desteklenen formatlar: metin, .docx, .pdf, .xlsx",
  z.object({ path: z.string() }),
  async ({ path: relPath }: { path: string }) => {
    try {
      const target = _safePath(relPath);
      if (!existsSync(target)) return `Dosya bulunamadı: ${relPath}`;

      const ext = path.extname(target).toLowerCase();

      if (ext === ".docx") {
        const result = await mammoth.extractRawText({ path: target });
        return result.value;
      }
      if (ext === ".pdf") {
        const dataBuffer = await fs.readFile(target);
        const data = await pdfParse(dataBuffer);
        return data.text;
      }
      if (ext === ".xlsx") {
        const workbook = xlsx.readFile(target);
        const sheets = workbook.SheetNames.map((name) => {
          const ws = workbook.Sheets[name];
          return `=== Sayfa: ${name} ===\n${xlsx.utils.sheet_to_csv(ws)}`;
        });
        return sheets.join("\n\n");
      }

      return await fs.readFile(target, "utf-8");
    } catch (e: any) {
      return `HATA okunamadı: ${e.message}`;
    }
  },
);

registerTool(
  "write_file",
  "Bir dosyaya içerik yaz (varsa üzerine yazar, yoksa oluşturur).",
  z.object({ path: z.string(), content: z.string() }),
  async ({ path: relPath, content }: { path: string; content: string }) => {
    try {
      const target = _safePath(relPath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content, "utf-8");
      return `OK: ${relPath} yazıldı (${content.length} karakter).`;
    } catch (e: any) {
      return `HATA yazılamadı: ${e.message}`;
    }
  },
);

registerTool(
  "edit_file",
  "Bir dosyadaki belirli bir metni başka bir metinle değiştir (str_replace).",
  z.object({ path: z.string(), old_text: z.string(), new_text: z.string() }),
  async ({
    path: relPath,
    old_text,
    new_text,
  }: {
    path: string;
    old_text: string;
    new_text: string;
  }) => {
    try {
      const target = _safePath(relPath);
      if (!existsSync(target)) return `Dosya bulunamadı: ${relPath}`;
      let content = await fs.readFile(target, "utf-8");

      const count = content.split(old_text).length - 1;
      if (count === 0) return `HATA: 'old_text' dosyada bulunamadı.`;
      if (count > 1)
        return `HATA: 'old_text' ${count} kez geçiyor. Benzersiz olmalı.`;

      content = content.replace(old_text, new_text);
      await fs.writeFile(target, content, "utf-8");
      return `OK: ${relPath} güncellendi.`;
    } catch (e: any) {
      return `HATA: ${e.message}`;
    }
  },
);

registerTool(
  "create_folder",
  "Workspace içinde yeni bir klasör oluşturur.",
  z.object({ path: z.string() }),
  async ({ path: relPath }: { path: string }) => {
    try {
      const target = _safePath(relPath);
      if (existsSync(target)) return `Bilgi: '${relPath}' zaten mevcut.`;
      await fs.mkdir(target, { recursive: true });
      return `OK: '${relPath}' başarıyla oluşturuldu.`;
    } catch (e: any) {
      return `HATA: ${e.message}`;
    }
  },
);

registerTool(
  "move_item",
  "Dosya veya klasörleri taşır veya adını değiştirir.",
  z.object({ source: z.string(), destination: z.string() }),
  async ({ source, destination }: { source: string; destination: string }) => {
    try {
      const src = _safePath(source);
      const dst = _safePath(destination);
      if (!existsSync(src)) return `HATA: Kaynak bulunamadı: ${source}`;
      await fs.mkdir(path.dirname(dst), { recursive: true });
      await fs.rename(src, dst);
      return `OK: '${source}', '${destination}' konumuna taşındı.`;
    } catch (e: any) {
      return `HATA: ${e.message}`;
    }
  },
);

registerTool(
  "create_pdf",
  "Verilen Markdown metnini PDF dosyasına dönüştürür.",
  z.object({ path: z.string(), markdown_content: z.string() }),
  async ({
    path: relPath,
    markdown_content,
  }: {
    path: string;
    markdown_content: string;
  }) => {
    try {
      if (!relPath.toLowerCase().endsWith(".pdf")) relPath += ".pdf";
      const target = _safePath(relPath);
      await fs.mkdir(path.dirname(target), { recursive: true });

      return new Promise((resolve) => {
        markdownpdf()
          .from.string(markdown_content)
          .to(target, () => {
            resolve(`OK: PDF oluşturuldu: ${relPath}`);
          });
      });
    } catch (e: any) {
      return `HATA PDF oluşturulamadı: ${e.message}`;
    }
  },
);

registerTool(
  "search_in_files",
  "Workspace içindeki dosyalarda kelime araması yapar.",
  z.object({ keyword: z.string(), subdir: z.string().optional().default(".") }),
  async ({ keyword, subdir }: { keyword: string; subdir: string }) => {
    try {
      const target = _safePath(subdir);
      const results: string[] = [];
      const extensions = [".ts", ".js", ".py", ".md", ".txt", ".json", ".yaml"];

      async function scan(dir: string) {
        const items = await fs.readdir(dir, { withFileTypes: true });
        for (const item of items) {
          const fullPath = path.join(dir, item.name);
          if (item.isDirectory()) {
            await scan(fullPath);
          } else if (
            extensions.includes(path.extname(fullPath).toLowerCase())
          ) {
            const content = await fs.readFile(fullPath, "utf-8");
            const lines = content.split("\n");
            lines.forEach((line, i) => {
              if (line.toLowerCase().includes(keyword.toLowerCase())) {
                const relPath = path.relative(_WORKSPACE, fullPath);
                results.push(`📄 ${relPath} [Satır ${i + 1}]: ${line.trim()}`);
              }
            });
          }
        }
      }

      await scan(target);
      if (results.length === 0) return `'${keyword}' kelimesi bulunamadı.`;
      return results.slice(0, 50).join("\n");
    } catch (e: any) {
      return `HATA arama yapılamadı: ${e.message}`;
    }
  },
);
