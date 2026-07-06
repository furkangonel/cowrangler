/**
 * checkpoints — dosya-durumu anlık görüntüsü + geri alma.
 *
 * Ajan bir dosyayı değiştirmeden ÖNCE `beforeMutation()` çağrılır; dosyanın o
 * anki içeriği (yoksa null = yeni oluşturulacak) bir journal girdisine yazılır.
 * `/undo` en son girdiyi geri yükler — kullanıcının gerçek git geçmişini
 * bozmadan. Gölge-git yerine taşınabilir, bağımlılıksız bir yaklaşım.
 *
 * Journal: <base>/.cowrangler/checkpoints/journal.json
 */

import fs from "fs";
import path from "path";

export interface CheckpointFile {
  /** mutlak yol */
  path: string;
  /** değişiklikten önceki içerik; null → dosya yoktu (yeni oluşturuluyordu) */
  before: string | null;
}

export interface CheckpointEntry {
  id: string;
  ts: number;
  label: string;
  files: CheckpointFile[];
}

const MAX_ENTRIES = 200;
let _base = process.cwd();

export function setCheckpointBase(dir: string): void {
  _base = path.resolve(dir);
}

function dir(): string {
  return path.join(_base, ".cowrangler", "checkpoints");
}
function journalPath(): string {
  return path.join(dir(), "journal.json");
}

function readJournal(): CheckpointEntry[] {
  try {
    const raw = fs.readFileSync(journalPath(), "utf-8");
    const j = JSON.parse(raw);
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

function writeJournal(entries: CheckpointEntry[]): void {
  try {
    fs.mkdirSync(dir(), { recursive: true });
    const trimmed = entries.slice(-MAX_ENTRIES);
    fs.writeFileSync(journalPath(), JSON.stringify(trimmed, null, 2), "utf-8");
  } catch {
    /* checkpoint kaydı best-effort — hata akışı bozmamalı */
  }
}

function snapshotContent(absPath: string): string | null {
  try {
    return fs.readFileSync(absPath, "utf-8");
  } catch {
    return null; // dosya yok → yeni oluşturuluyor
  }
}

/**
 * Bir dosyayı değiştirmeden önce çağır. Grup varsa (aynı groupId) aynı girdiye
 * ekler; yoksa yeni girdi açar. Basit kullanım için groupId atlanabilir.
 */
export function beforeMutation(absPath: string, label = "edit", groupId?: string): void {
  const entries = readJournal();
  const before = snapshotContent(absPath);
  if (groupId) {
    const existing = entries.find((e) => e.id === groupId);
    if (existing) {
      if (!existing.files.some((f) => f.path === absPath)) {
        existing.files.push({ path: absPath, before });
      }
      writeJournal(entries);
      return;
    }
  }
  entries.push({
    id: groupId ?? `cp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    ts: Date.now(),
    label,
    files: [{ path: absPath, before }],
  });
  writeJournal(entries);
}

export function listCheckpoints(): CheckpointEntry[] {
  return readJournal().slice().reverse(); // en yeni önce
}

/** En son checkpoint'i geri yükler. */
export function undoLast(): { ok: boolean; label?: string; restored: number; message: string } {
  const entries = readJournal();
  const entry = entries.pop();
  if (!entry) return { ok: false, restored: 0, message: "No checkpoints to undo." };
  let restored = 0;
  for (const f of entry.files) {
    try {
      if (f.before === null) {
        // dosya yeni oluşturulmuştu → sil
        if (fs.existsSync(f.path)) fs.rmSync(f.path);
      } else {
        fs.mkdirSync(path.dirname(f.path), { recursive: true });
        fs.writeFileSync(f.path, f.before, "utf-8");
      }
      restored++;
    } catch {
      /* tek dosya geri yüklenemezse diğerlerine devam */
    }
  }
  writeJournal(entries);
  return {
    ok: true,
    label: entry.label,
    restored,
    message: `Undid "${entry.label}" — ${restored} file(s) restored.`,
  };
}

export function clearCheckpoints(): void {
  writeJournal([]);
}
