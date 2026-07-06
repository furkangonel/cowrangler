/**
 * Tool-call JSON fallback — WP-6.
 *
 * Native (provider-seviyesi) tool-calling desteklemeyen modeller (ör. yerel
 * Ollama, bazı OpenRouter modelleri) için yapılandırılmış bir JSON protokolü
 * sağlar. Model, araç çağırmak istediğinde sistem promptundaki talimata göre
 * bir ```json bloğu üretir; `parseToolCalls()` bunu çözer.
 *
 * Bu modül SAF (yan etkisiz) tutulur → kolay test edilir, `react/ink/electron`
 * import etmez.
 */

export interface ParsedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/** Fallback protokolünün model çıktısında aradığı işaret. */
export const TOOL_FALLBACK_SENTINEL = "tool_calls";

interface ToolLike {
  description?: string;
  parameters?: unknown;
}

/** Zod veya JSON-schema parametre nesnesinden en iyi çabayla alan adlarını çıkarır. */
function extractParamKeys(parameters: unknown): string[] {
  if (!parameters || typeof parameters !== "object") return [];
  const p = parameters as any;
  // Zod object: .shape ya da ._def.shape()
  const shape =
    p.shape ??
    (typeof p._def?.shape === "function" ? p._def.shape() : p._def?.shape);
  if (shape && typeof shape === "object") return Object.keys(shape);
  // JSON schema: .properties
  if (p.properties && typeof p.properties === "object") {
    return Object.keys(p.properties);
  }
  return [];
}

/**
 * Native tool-calling'i olmayan modeller için sistem promptuna eklenecek
 * talimat bloğunu üretir. Araç adı + açıklaması + (varsa) parametre adlarını
 * listeler ve katı JSON çıktı formatını dayatır.
 */
export function buildToolFallbackInstructions(
  tools: Record<string, ToolLike>,
): string {
  const lines: string[] = [];
  for (const [name, tool] of Object.entries(tools)) {
    const desc = (tool?.description ?? "").split("\n")[0].trim();
    const keys = extractParamKeys(tool?.parameters);
    const params = keys.length ? ` (params: ${keys.join(", ")})` : "";
    lines.push(`- ${name}${params}${desc ? `: ${desc}` : ""}`);
  }

  return [
    "[TOOL CALLING PROTOCOL]",
    "This model has no native tool-calling. To call one or more tools, reply with",
    "ONE fenced json code block and NOTHING else, in exactly this shape:",
    "```json",
    `{"${TOOL_FALLBACK_SENTINEL}":[{"name":"<tool>","arguments":{ }}]}`,
    "```",
    "Rules:",
    "- Use the exact tool names below and put every argument inside `arguments`.",
    "- Emit the json block ONLY when you actually want to run tools; otherwise reply",
    "  with normal prose.",
    "- Do not wrap the json in extra commentary when calling tools.",
    "",
    "Available tools:",
    ...(lines.length ? lines : ["(none)"]),
  ].join("\n");
}

/** Metinde fallback tool-call bloğu var mı? (ucuz ön kontrol) */
export function hasToolCall(text: string): boolean {
  return typeof text === "string" && text.includes(TOOL_FALLBACK_SENTINEL);
}

/** Bir aday nesneyi ParsedToolCall'a normalize eder; geçersizse null. */
function normalizeCall(raw: any): ParsedToolCall | null {
  if (!raw || typeof raw !== "object") return null;
  const name = raw.name ?? raw.tool ?? raw.tool_name ?? raw.function;
  if (typeof name !== "string" || !name.trim()) return null;

  let args = raw.arguments ?? raw.args ?? raw.parameters ?? raw.input ?? {};
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      args = {};
    }
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) args = {};
  return { name: name.trim(), arguments: args as Record<string, unknown> };
}

/** Bir JSON değerinden tool-call listesi çıkarır (birden çok şekli destekler). */
function collectFromJson(value: any): ParsedToolCall[] {
  if (!value) return [];
  // { tool_calls: [...] }
  if (Array.isArray(value?.[TOOL_FALLBACK_SENTINEL])) {
    return value[TOOL_FALLBACK_SENTINEL]
      .map(normalizeCall)
      .filter((c: ParsedToolCall | null): c is ParsedToolCall => c !== null);
  }
  // [ {name,arguments}, ... ]
  if (Array.isArray(value)) {
    return value
      .map(normalizeCall)
      .filter((c: ParsedToolCall | null): c is ParsedToolCall => c !== null);
  }
  // { name, arguments }
  const single = normalizeCall(value);
  return single ? [single] : [];
}

/**
 * Model çıktısından tool-call'ları çözer. ```json blokları önceliklidir;
 * yoksa metindeki ilk dengeli JSON nesnesi/dizisi denenir. Hiçbir şey
 * bulunamazsa boş dizi döner (→ normal metin yanıtı olarak işlenir).
 */
export function parseToolCalls(text: string): ParsedToolCall[] {
  if (typeof text !== "string" || !text.trim()) return [];

  const candidates: string[] = [];

  // 1. ```json ... ``` (ya da ``` ... ```) blokları
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) {
    if (m[1]?.trim()) candidates.push(m[1].trim());
  }

  // 2. Fence yoksa: sentinel'i içeren ilk dengeli { ... } bloğunu bul
  if (candidates.length === 0 && text.includes(TOOL_FALLBACK_SENTINEL)) {
    const balanced = _extractBalancedObject(text);
    if (balanced) candidates.push(balanced);
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const calls = collectFromJson(parsed);
      if (calls.length) return calls;
    } catch {
      /* sonraki adaya geç */
    }
  }
  return [];
}

/** İçinde sentinel geçen ilk dengeli süslü-parantez bloğunu çıkarır. */
function _extractBalancedObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
