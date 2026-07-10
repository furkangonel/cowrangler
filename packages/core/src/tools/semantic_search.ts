/**
 * semantic_search — embedding tabanlı anlamsal kod arama (PROTOTİP).
 *
 * `repo_map` (repomap_tool.ts) sezgisel import-grafiği ile "önemli" dosyaları
 * sıralar ama anlam bilmez — "kullanıcı kimlik doğrulamasını nerede
 * yapıyoruz?" gibi doğal dilde bir soruya cevap veremez. Bu modül, dosyaları
 * parçalayıp (chunk) her parça için bir embedding vektörü çıkarır, sorguyu da
 * aynı uzaya gömüp kosinüs benzerliğiyle en alakalı parçaları döndürür.
 *
 * Saf mantık (chunking, kosinüs benzerliği, indeks arama) `EmbeddingProvider`
 * arayüzü arkasında izole edilmiştir — gerçek bir sağlayıcıya (OpenAI
 * embeddings API) bağımlı değildir ve sahte/deterministik bir sağlayıcıyla
 * tamamen birim test edilebilir. `OpenAIEmbeddingProvider` gerçek çağrıyı
 * yapan tek somut implementasyondur.
 *
 * Bilinen sınırlar (prototip): indeks kalıcı değildir (her çağrıda yeniden
 * kurulur), artımlı yeniden indeksleme yoktur, dosya/parça sayısı üst sınırla
 * sınırlıdır. Üretime hazır bir sürüm için bunlar ele alınmalı.
 */

import fs from "fs";
import path from "path";
import { z } from "zod";
import { registerTool } from "./registry.js";

// ─────────────────────────────────────────────────────────────────────────────
// SAF MANTIK — ağdan bağımsız, tamamen test edilebilir
// ─────────────────────────────────────────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface RawChunk {
  text: string;
  startLine: number;
  endLine: number;
}

/**
 * Bir dosyayı sabit satır pencereleriyle (örtüşmeli) parçalara ayırır. Dil
 * bağımsız ve basit — fonksiyon/sınıf sınırlarını sezmeye çalışmaz, bu yüzden
 * bir tanım ortadan bölünebilir; örtüşme (`overlapLines`) bu riski azaltır.
 */
export function chunkFile(
  content: string,
  opts: { maxLines?: number; overlapLines?: number } = {},
): RawChunk[] {
  const maxLines = opts.maxLines ?? 60;
  const overlap = Math.min(opts.overlapLines ?? 10, maxLines - 1);
  const lines = content.split("\n");
  if (lines.length === 0) return [];

  const chunks: RawChunk[] = [];
  let start = 0;
  while (start < lines.length) {
    const end = Math.min(start + maxLines, lines.length);
    const text = lines.slice(start, end).join("\n").trim();
    if (text) chunks.push({ text, startLine: start + 1, endLine: end });
    if (end >= lines.length) break;
    start = end - overlap;
  }
  return chunks;
}

export interface IndexedChunk extends RawChunk {
  file: string; // proje köküne göre bağıl yol
  vector: number[];
}

export interface SemanticIndex {
  root: string;
  builtAt: number;
  chunks: IndexedChunk[];
}

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "out", "release", "build", ".next",
  "coverage", ".cache", "vendor", "__pycache__", ".venv", "venv",
]);
const CODE_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs",
  ".java", ".rb", ".php", ".c", ".h", ".cpp", ".cs", ".swift", ".kt",
]);

function walkSourceFiles(root: string, maxFiles: number): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length && out.length < maxFiles) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") && e.name !== ".") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) stack.push(full);
      } else if (CODE_EXT.has(path.extname(e.name)) && out.length < maxFiles) {
        out.push(full);
      }
    }
  }
  return out;
}

/** Verilen kök dizini tarar, parçalar, embed eder ve bir indeks döndürür. */
export async function buildSemanticIndex(
  root: string,
  embedder: EmbeddingProvider,
  opts: { maxFiles?: number; maxLinesPerChunk?: number; batchSize?: number } = {},
): Promise<SemanticIndex> {
  const maxFiles = opts.maxFiles ?? 200;
  const batchSize = opts.batchSize ?? 64;
  const files = walkSourceFiles(root, maxFiles);

  const pending: { file: string; chunk: RawChunk }[] = [];
  for (const f of files) {
    let content: string;
    try {
      content = fs.readFileSync(f, "utf-8");
    } catch {
      continue;
    }
    const rel = path.relative(root, f) || path.basename(f);
    for (const chunk of chunkFile(content, { maxLines: opts.maxLinesPerChunk })) {
      pending.push({ file: rel, chunk });
    }
  }

  const chunks: IndexedChunk[] = [];
  for (let i = 0; i < pending.length; i += batchSize) {
    const batch = pending.slice(i, i + batchSize);
    const vectors = await embedder.embed(batch.map((b) => b.chunk.text));
    for (let j = 0; j < batch.length; j++) {
      chunks.push({ ...batch[j].chunk, file: batch[j].file, vector: vectors[j] });
    }
  }

  return { root, builtAt: Date.now(), chunks };
}

export interface ScoredChunk extends IndexedChunk {
  score: number;
}

export function searchSemanticIndex(
  index: SemanticIndex,
  queryVector: number[],
  topK = 8,
): ScoredChunk[] {
  return index.chunks
    .map((c) => ({ ...c, score: cosineSimilarity(c.vector, queryVector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ─────────────────────────────────────────────────────────────────────────────
// GERÇEK SAĞLAYICI — OpenAI embeddings API
// ─────────────────────────────────────────────────────────────────────────────

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private apiKey: string,
    private model = "text-embedding-3-small",
    private baseUrl = "https://api.openai.com/v1",
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`OpenAI embeddings request failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const json: any = await res.json();
    const data: any[] = json?.data ?? [];
    return data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding as number[]);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL KAYDI
// ─────────────────────────────────────────────────────────────────────────────

registerTool(
  "semantic_code_search",
  "PROTOTYPE: Search the codebase by MEANING using embeddings, not just keyword/import matching (unlike repo_map or search_in_files). Good for vague/conceptual questions like 'where do we validate permissions?'. Requires OPENAI_API_KEY to be configured — indexes the whole project fresh on every call, so it is slower and costlier than repo_map; prefer repo_map/search_in_files first and fall back to this only when those don't find what you need.",
  z.object({
    query: z.string().describe("Natural-language description of what you're looking for"),
    root: z.string().optional().describe("Directory to search (default: current workspace)"),
    topK: z.number().optional().default(8).describe("Number of results to return (default: 8)"),
  }),
  async ({ query, root, topK = 8 }: { query: string; root?: string; topK?: number }) => {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return "semantic_code_search unavailable: OPENAI_API_KEY is not configured. Set it in Settings → Models & API, or fall back to repo_map / search_in_files.";
    }
    try {
      const base = path.resolve(root ?? ".");
      const embedder = new OpenAIEmbeddingProvider(apiKey);
      const index = await buildSemanticIndex(base, embedder);
      if (index.chunks.length === 0) return "No source files found to search.";

      const [queryVector] = await embedder.embed([query]);
      const results = searchSemanticIndex(index, queryVector, topK);

      const lines = [`Semantic search results for "${query}":`, ""];
      for (const r of results) {
        lines.push(`${r.file}:${r.startLine}-${r.endLine}  (score ${r.score.toFixed(3)})`);
        lines.push(r.text.split("\n").slice(0, 6).join("\n"));
        lines.push("");
      }
      return lines.join("\n").trim();
    } catch (e: any) {
      return `ERROR running semantic_code_search: ${e?.message ?? String(e)}`;
    }
  },
);
