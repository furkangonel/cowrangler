/**
 * Edit/Write tool çağrılarından before/after içeriğini çıkarır — WP-3 diff kartı.
 *
 * Saf modül: react/electron/core import ETMEZ. Farklı tool sağlayıcılarının
 * argüman anahtarlarını (path/file_path/TargetFile, old_string/new_string, …)
 * tek bir sözleşmeye normalize eder ki DiffCard tek bir yoldan render etsin.
 */

export interface ExtractedEdit {
  filePath: string;
  fileName: string;
  before: string;
  after: string;
  /** true → yalnız yeni içerik biliniyor (Write/create); gerçek "before" yok. */
  isFullContent: boolean;
}

const EDIT_HINTS = ["edit", "write", "replace", "create", "multi_replace"];

/** İsim bir düzenleme (dosya yazma/değiştirme) tool'una mı işaret ediyor? */
export function isEditTool(name: string): boolean {
  const n = name.toLowerCase();
  return EDIT_HINTS.some((h) => n.includes(h));
}

function pick(args: any, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = args?.[k];
    if (typeof v === "string") return v;
  }
  return undefined;
}

function baseName(filePath: string): string {
  if (!filePath) return "file";
  return filePath.split("/").pop() || filePath;
}

/**
 * Düzenleme tool'unun argümanlarından diff için before/after çıkarır.
 * Eşleşme yoksa null döner (çağıran taraf klasik gösterime düşebilir).
 */
export function extractEdit(name: string, args: any): ExtractedEdit | null {
  if (!isEditTool(name) || !args) return null;

  const filePath =
    pick(args, ["path", "file_path", "TargetFile", "filePath", "AbsolutePath"]) ?? "";
  const fileName = baseName(filePath);

  // Çoklu düzenleme (multi_replace / multiedit): edits dizisini birleştir.
  if (Array.isArray(args.edits) && args.edits.length > 0) {
    const before = args.edits
      .map((e: any) => e?.old_string ?? e?.oldString ?? e?.old_str ?? "")
      .join("\n");
    const after = args.edits
      .map((e: any) => e?.new_string ?? e?.newString ?? e?.new_str ?? "")
      .join("\n");
    return { filePath, fileName, before, after, isFullContent: false };
  }

  // Tekil düzenleme: old_string → new_string
  const oldStr = pick(args, ["old_string", "oldString", "old_str", "search"]);
  const newStr = pick(args, ["new_string", "newString", "new_str", "replace"]);
  if (oldStr !== undefined && newStr !== undefined) {
    return { filePath, fileName, before: oldStr, after: newStr, isFullContent: false };
  }

  // Yazma/oluşturma: content tüm yeni dosya.
  const content = pick(args, ["content", "contents", "text", "file_text"]);
  if (content !== undefined) {
    return { filePath, fileName, before: "", after: content, isFullContent: true };
  }

  return null;
}
