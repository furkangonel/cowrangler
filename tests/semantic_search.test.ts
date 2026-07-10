import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildSemanticIndex,
  chunkFile,
  cosineSimilarity,
  searchSemanticIndex,
  type EmbeddingProvider,
} from "@cowrangler/core/tools/semantic_search.js";

describe("cosineSimilarity", () => {
  it("is 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it("is -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 6);
  });

  it("returns 0 for mismatched or empty vectors instead of throwing", () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
  });
});

describe("chunkFile", () => {
  it("returns a single chunk for content shorter than maxLines", () => {
    const content = Array.from({ length: 10 }, (_, i) => `line ${i}`).join("\n");
    const chunks = chunkFile(content, { maxLines: 60 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(10);
  });

  it("splits long content into overlapping windows", () => {
    const content = Array.from({ length: 130 }, (_, i) => `line ${i}`).join("\n");
    const chunks = chunkFile(content, { maxLines: 60, overlapLines: 10 });
    expect(chunks.length).toBeGreaterThan(1);
    // Ardışık pencereler örtüşmeli (ikinci pencere ilkinden önce başlamalı bitmemeli)
    expect(chunks[1].startLine).toBeLessThan(chunks[0].endLine);
    expect(chunks[chunks.length - 1].endLine).toBe(130);
  });

  it("skips blank/whitespace-only chunks", () => {
    expect(chunkFile("   \n\n  \n")).toEqual([]);
  });

  it("handles empty content", () => {
    expect(chunkFile("")).toEqual([]);
  });
});

/** Deterministik sahte sağlayıcı — ağa çıkmaz, kelime-sayımına dayalı basit bir "embedding" üretir. */
class FakeEmbeddingProvider implements EmbeddingProvider {
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => {
      const lower = t.toLowerCase();
      return [
        (lower.match(/auth/g) ?? []).length,
        (lower.match(/database|db/g) ?? []).length,
        (lower.match(/render|ui|component/g) ?? []).length,
      ];
    });
  }
}

describe("buildSemanticIndex + searchSemanticIndex", () => {
  const tmpDirs: string[] = [];
  afterEach(() => {
    for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  function tmpProject(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cowrangler-semsearch-"));
    tmpDirs.push(dir);
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(dir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, "utf-8");
    }
    return dir;
  }

  it("indexes source files and ranks the most relevant chunk first", async () => {
    const root = tmpProject({
      "auth.ts": "function checkAuth(token) { /* auth auth auth logic here */ return true; }",
      "db.ts": "function queryDatabase(sql) { /* database database access */ return []; }",
      "Button.tsx": "function Button() { /* render ui component */ return null; }",
    });

    const index = await buildSemanticIndex(root, new FakeEmbeddingProvider());
    expect(index.chunks.length).toBeGreaterThanOrEqual(3);
    expect(index.chunks.every((c) => c.vector.length === 3)).toBe(true);

    const results = searchSemanticIndex(index, [1, 0, 0], 1); // "auth"-heavy query vector
    expect(results[0].file).toBe("auth.ts");
  });

  it("respects the maxFiles cap", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 10; i++) files[`f${i}.ts`] = `export const x${i} = ${i};`;
    const root = tmpProject(files);

    const index = await buildSemanticIndex(root, new FakeEmbeddingProvider(), { maxFiles: 3 });
    const distinctFiles = new Set(index.chunks.map((c) => c.file));
    expect(distinctFiles.size).toBeLessThanOrEqual(3);
  });

  it("ignores node_modules and other skip-dirs", async () => {
    const root = tmpProject({
      "src/real.ts": "export const real = 1;",
      "node_modules/dep/index.js": "module.exports = {};",
    });

    const index = await buildSemanticIndex(root, new FakeEmbeddingProvider());
    expect(index.chunks.some((c) => c.file.includes("node_modules"))).toBe(false);
    expect(index.chunks.some((c) => c.file.includes("real.ts"))).toBe(true);
  });

  it("returns an empty index for a directory with no source files", async () => {
    const root = tmpProject({ "readme.md": "# hello" });
    const index = await buildSemanticIndex(root, new FakeEmbeddingProvider());
    expect(index.chunks).toEqual([]);
  });
});
