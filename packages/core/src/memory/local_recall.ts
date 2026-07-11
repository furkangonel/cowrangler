/**
 * local_recall — bağımlılıksız yerel uzun-dönem hafıza sağlayıcısı.
 *
 * Konuşma turlarını global proje deposundaki `recall.jsonl` içine yazar (proje
 * dizinini kirletmez); sorguya göre anahtar-kelime örtüşmesi + yakınlık (recency)
 * ile en ilgili birkaç turu geri getirir. Harici servis / vektör DB gerektirmez.
 */

import fs from "fs";
import { projectStoreDirFor } from "../project_context.js";
import path from "path";
import type { MemoryProvider } from "../memory_provider.js";

interface RecallEntry { ts: number; user: string; assistant: string; terms: string[]; }

const STOP = new Set([
  "the", "a", "an", "and", "or", "but", "to", "of", "in", "on", "for", "with",
  "is", "are", "was", "were", "be", "this", "that", "it", "as", "at", "by",
  "bir", "ve", "veya", "ile", "bu", "şu", "için", "de", "da", "mi", "ki",
]);

function terms(text: string): string[] {
  return Array.from(
    new Set(
      (text.toLowerCase().match(/[a-z0-9_çğıöşü]{3,}/gi) ?? [])
        .map((w) => w.toLowerCase())
        .filter((w) => !STOP.has(w)),
    ),
  ).slice(0, 40);
}

export class LocalRecallProvider implements MemoryProvider {
  readonly id = "local-recall";
  private base: string;
  private maxEntries = 500;

  constructor(base?: string) {
    this.base = path.resolve(base ?? process.cwd());
  }

  private file(): string {
    return path.join(projectStoreDirFor(this.base), "memory", "recall.jsonl");
  }

  private read(): RecallEntry[] {
    try {
      return fs.readFileSync(this.file(), "utf-8")
        .split("\n").filter(Boolean)
        .map((l) => { try { return JSON.parse(l) as RecallEntry; } catch { return null; } })
        .filter((x): x is RecallEntry => !!x);
    } catch { return []; }
  }

  syncTurn(userMessage: string, assistantMessage: string): void {
    if (!userMessage?.trim()) return;
    try {
      const entry: RecallEntry = {
        ts: Date.now(),
        user: userMessage.slice(0, 2000),
        assistant: (assistantMessage ?? "").slice(0, 2000),
        terms: terms(`${userMessage} ${assistantMessage}`),
      };
      let all = this.read();
      all.push(entry);
      if (all.length > this.maxEntries) all = all.slice(-this.maxEntries);
      fs.mkdirSync(path.dirname(this.file()), { recursive: true });
      fs.writeFileSync(this.file(), all.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf-8");
    } catch { /* best-effort */ }
  }

  prefetch(query: string): string {
    const q = new Set(terms(query));
    if (q.size === 0) return "";
    const all = this.read();
    const now = Date.now();
    const scored = all
      .map((e) => {
        const overlap = e.terms.reduce((n, t) => n + (q.has(t) ? 1 : 0), 0);
        const ageDays = (now - e.ts) / 86_400_000;
        const recency = Math.max(0, 1 - ageDays / 30); // 30 günde söner
        return { e, score: overlap + recency * 0.5 };
      })
      .filter((x) => x.score >= 1)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    if (scored.length === 0) return "";
    const lines = scored.map(({ e }) => {
      const when = new Date(e.ts).toLocaleDateString();
      return `- (${when}) You asked: "${e.user.slice(0, 160)}" → ${e.assistant.slice(0, 220)}`;
    });
    return `[Recalled from earlier work]\n${lines.join("\n")}`;
  }
}
