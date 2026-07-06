/**
 * Generic Server-Sent Events (SSE) frame parser.
 *
 * Tüm wire'lar (Anthropic / OpenAI / Gemini) `text/event-stream` döndürür.
 * Bu parser byte akışını SSE frame'lerine böler; wire'a özgü hiçbir bilgi içermez.
 *
 * SSE kuralları (WHATWG): frame'ler boş satırla (\n\n) ayrılır; her satır
 * "field: value" biçiminde; aynı frame içinde birden çok `data:` satırı
 * newline ile birleştirilir. `:` ile başlayan satırlar yorumdur (yoksayılır).
 */

export interface SSEFrame {
  event: string; // "message" (varsayılan) veya `event:` alanı
  data: string; // birleştirilmiş data satırları
}

/** UTF-8 byte parçalarını satır-arabelleğiyle SSE frame'lerine çevirir. */
export async function* parseSSE(
  chunks: AsyncIterable<Uint8Array>,
): AsyncIterable<SSEFrame> {
  const decoder = new TextDecoder("utf-8");
  let buf = "";

  for await (const chunk of chunks) {
    buf += decoder.decode(chunk, { stream: true });

    // CRLF'i normalize et; frame sınırı çift newline.
    let idx: number;
    // \n\n sınırını ara (CRLF normalize edildiği için yalnız \n yeter).
    buf = buf.replace(/\r\n/g, "\n");
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const frame = parseFrame(raw);
      if (frame) yield frame;
    }
  }

  // Son artık (trailing) frame — bazı sunucular kapanışta \n\n koymaz.
  const tail = buf.trim();
  if (tail) {
    const frame = parseFrame(tail);
    if (frame) yield frame;
  }
}

function parseFrame(raw: string): SSEFrame | null {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of raw.split("\n")) {
    if (line === "" || line.startsWith(":")) continue; // yorum / boş
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    // Spec: `:` sonrası tek boşluk kırpılır.
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "event") event = value;
    else if (field === "data") dataLines.push(value);
    // id / retry alanları bizim için gereksiz.
  }

  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

/** WHATWG ReadableStream<Uint8Array> → async iterable (Node/undici fetch uyumu). */
export async function* readableToBytes(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<Uint8Array> {
  const anyBody = body as any;
  if (typeof anyBody[Symbol.asyncIterator] === "function") {
    yield* anyBody as AsyncIterable<Uint8Array>;
    return;
  }
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

/** Bir string'i (test/mock için) tek Uint8Array parçası akışına çevirir. */
export async function* stringToChunks(
  s: string,
  parts = 1,
): AsyncIterable<Uint8Array> {
  const enc = new TextEncoder();
  if (parts <= 1) {
    yield enc.encode(s);
    return;
  }
  const size = Math.ceil(s.length / parts);
  for (let i = 0; i < s.length; i += size) {
    yield enc.encode(s.slice(i, i + size));
  }
}
