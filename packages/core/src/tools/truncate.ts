import fs from "fs";
import path from "path";
import { getProjectWorkdir } from "../project_context.js";

/**
 * Merkezi araç-çıktısı budama katmanı.
 *
 * Neden: read_file / execute_bash / search_in_files gibi araçlar sınırsız çıktı
 * döndürdüğünde tek bir turda on binlerce token modele gider (agent döngüsünün en
 * büyük token sızıntısı). opencode'un `truncate` servisini örnek alıyoruz: çıktı
 * eşiği aşıyorsa TAM metni diske yaz, modele yalnız bir önizleme + dosya işaretçisi
 * döndür. Böylece hiçbir veri kaybolmaz; model gerekirse belirli aralığı okur.
 */

/** Varsayılan satır tavanı (bu satırdan sonrası diske taşar). */
export const MAX_OUTPUT_LINES = 2000;
/** Varsayılan byte tavanı — 50KB (~12.5k token). */
export const MAX_OUTPUT_BYTES = 50 * 1024;
/** Taşan çıktıların saklandığı gün sayısı (retention). */
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export interface TruncateOptions {
  /** Satır tavanı override. */
  maxLines?: number;
  /** Byte tavanı override. */
  maxBytes?: number;
  /**
   * İşaretçi notunda ve taşma dosyası adında kullanılan etiket
   * (ör. "read_file src/x.ts"). Yalnız teşhis amaçlı.
   */
  label?: string;
}

/** Taşma dizini: <workspace>/.cowrangler/truncation (search_in_files bunu tarama dışı bırakır). */
function truncationDir(): string {
  return path.join(getProjectWorkdir(), ".cowrangler", "truncation");
}

/** 7 günden eski taşma dosyalarını en iyi çabayla temizle (disk şişmesin). */
function pruneOld(dir: string): void {
  try {
    const now = Date.now();
    for (const name of fs.readdirSync(dir)) {
      if (!name.startsWith("tool_")) continue;
      const full = path.join(dir, name);
      try {
        if (now - fs.statSync(full).mtimeMs > RETENTION_MS) fs.unlinkSync(full);
      } catch { /* dosya yarışı — yoksay */ }
    }
  } catch { /* dizin yok — yoksay */ }
}

/**
 * Çıktıyı eşiklere göre buda. Sığıyorsa metni aynen döndürür (davranış değişmez).
 * Taşıyorsa: tam metni diske yazar, önizleme + işaretçi notu döndürür.
 */
export function truncateToolOutput(text: string, opts: TruncateOptions = {}): string {
  const maxLines = opts.maxLines ?? MAX_OUTPUT_LINES;
  const maxBytes = opts.maxBytes ?? MAX_OUTPUT_BYTES;
  const label = opts.label ?? "output";

  const byteLen = Buffer.byteLength(text, "utf-8");
  const lines = text.split("\n");
  // Hızlı yol: eşik altındaysa dokunma.
  if (lines.length <= maxLines && byteLen <= maxBytes) return text;

  // Önizleme: önce satırla kes, sonra byte ile sert kes (utf-8 sınırında güvenli).
  let preview = lines.slice(0, maxLines).join("\n");
  if (Buffer.byteLength(preview, "utf-8") > maxBytes) {
    const buf = Buffer.from(preview, "utf-8").subarray(0, maxBytes);
    // subarray çok-baytlı bir karakteri ortadan kesebilir; geçersiz kuyruğu at.
    preview = buf.toString("utf-8").replace(/�+$/, "");
  }

  // Tam metni taşma dosyasına yaz (hiçbir şey kaybolmaz).
  let outputPath = "";
  try {
    const dir = truncationDir();
    fs.mkdirSync(dir, { recursive: true });
    pruneOld(dir);
    const safe = label.replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(0, 60);
    outputPath = path.join(dir, `tool_${Date.now()}_${safe}.txt`);
    fs.writeFileSync(outputPath, text, "utf-8");
  } catch { /* diske yazılamazsa yine önizleme dön */ }

  const shownLines = Math.min(maxLines, lines.length);
  const note = outputPath
    ? `[output truncated — showing first ${shownLines} of ${lines.length} lines ` +
      `(~${Math.round(byteLen / 1024)}KB total). Full output saved to ${outputPath}. ` +
      `Read a specific slice with read_file(start_line, end_line), or narrow with ` +
      `search_in_files / grep, instead of re-reading the whole thing.]`
    : `[output truncated — showing first ${shownLines} of ${lines.length} lines ` +
      `(~${Math.round(byteLen / 1024)}KB total). Narrow your query to see more.]`;

  return `${preview}\n\n${note}`;
}
