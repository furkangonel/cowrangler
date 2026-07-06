/**
 * Satır bazında diff — WP-3 Code arayüzü inline diff kartları için.
 *
 * Saf, bağımsız modül: react/electron/core import ETMEZ. Bu sayede vitest'te
 * doğrudan test edilebilir ve `core/` sınırını ihlal etmez.
 *
 * Klasik LCS (en uzun ortak alt dizi) tabanı: iki metnin satırlarını hizalar,
 * değişmeyen satırları `context`, silinenleri `del`, eklenenleri `add` olarak
 * işaretler. Satır numaraları 1-index'lidir.
 */

export type DiffLineType = "context" | "add" | "del";

export interface DiffLine {
  type: DiffLineType;
  text: string;
  /** "before" metnindeki 1-index'li satır (context/del için) */
  beforeLine?: number;
  /** "after" metnindeki 1-index'li satır (context/add için) */
  afterLine?: number;
}

export interface DiffResult {
  lines: DiffLine[];
  added: number;
  removed: number;
}

/** Metni satırlara böler; boş metin = sıfır satır (yapay tek boş satır üretmez). */
function toLines(text: string): string[] {
  if (text.length === 0) return [];
  return text.split("\n");
}

/**
 * İki metin arasındaki satır bazlı farkı hesaplar.
 */
export function computeLineDiff(before: string, after: string): DiffResult {
  const a = toLines(before);
  const b = toLines(after);
  const n = a.length;
  const m = b.length;

  // dp[i][j] = a[i..] ile b[j..] arasındaki LCS uzunluğu
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let added = 0;
  let removed = 0;

  while (i < n && j < m) {
    if (a[i] === b[j]) {
      lines.push({ type: "context", text: a[i], beforeLine: i + 1, afterLine: j + 1 });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({ type: "del", text: a[i], beforeLine: i + 1 });
      i++;
      removed++;
    } else {
      lines.push({ type: "add", text: b[j], afterLine: j + 1 });
      j++;
      added++;
    }
  }
  while (i < n) {
    lines.push({ type: "del", text: a[i], beforeLine: i + 1 });
    i++;
    removed++;
  }
  while (j < m) {
    lines.push({ type: "add", text: b[j], afterLine: j + 1 });
    j++;
    added++;
  }

  return { lines, added, removed };
}
