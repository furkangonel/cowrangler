/**
 * Native Google Gemini client — vercel `@ai-sdk/google` YERİNE.
 *
 * generativelanguage.googleapis.com `:streamGenerateContent?alt=sse`.
 * Gemini farkları: roller user/model; system ayrı `systemInstruction`;
 * araçlar `functionDeclarations`; tool_call = `functionCall` (args OBJE, parça
 * parça değil); tool_result = `functionResponse` (name ile eşleşir, id YOK).
 *
 * Port uyumu için functionCall'a sentetik id üretiriz (`call_<n>`); geri
 * dönüşte (body) Gemini id kullanmaz, `name` ile eşler — ContentPart.name var.
 */

import { parseSSE, readableToBytes, type SSEFrame } from "./sse.js";
import type {
  ChatModel,
  ChatRequest,
  ContentPart,
  FinishReason,
  ResolvedEndpoint,
  StreamEvent,
  Usage,
} from "./types.js";

const DEFAULT_MAX_TOKENS = 4096;

// ── İstek gövdesi (saf, test edilebilir) ───────────────────────────────────

export function toGeminiBody(req: ChatRequest): Record<string, unknown> {
  const systemChunks: string[] = [];
  if (req.system) systemChunks.push(req.system);

  const contents: Array<{ role: "user" | "model"; parts: unknown[] }> = [];

  for (const m of req.messages) {
    if (m.role === "system") {
      systemChunks.push(typeof m.content === "string" ? m.content : partsToText(normalizeParts(m.content)));
      continue;
    }
    if (m.role === "tool") {
      const parts = normalizeParts(m.content)
        .filter((p) => p.type === "tool_result")
        .map((p) => {
          const tr = p as Extract<ContentPart, { type: "tool_result" }>;
          return {
            functionResponse: {
              name: tr.name,
              response:
                typeof tr.result === "object" && tr.result !== null
                  ? (tr.result as object)
                  : { result: String(tr.result) },
            },
          };
        });
      contents.push({ role: "user", parts });
      continue;
    }
    // user → user, assistant → model
    const role = m.role === "assistant" ? "model" : "user";
    contents.push({ role, parts: normalizeParts(m.content).map(toGeminiPart) });
  }

  const tools =
    req.tools && req.tools.length > 0
      ? [
          {
            functionDeclarations: req.tools.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            })),
          },
        ]
      : undefined;

  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
  };
  if (req.temperature != null) generationConfig.temperature = req.temperature;
  if (req.thinking?.enabled) {
    generationConfig.thinkingConfig = { thinkingBudget: req.thinking.budgetTokens ?? 8000 };
  }

  return {
    contents,
    ...(systemChunks.length > 0
      ? { systemInstruction: { parts: [{ text: systemChunks.join("\n\n") }] } }
      : {}),
    ...(tools ? { tools } : {}),
    generationConfig,
  };
}

function toGeminiPart(p: ContentPart): unknown {
  switch (p.type) {
    case "text":
    case "reasoning":
      return { text: p.text };
    case "tool_call":
      return { functionCall: { name: p.name, args: p.args ?? {} } };
    case "tool_result":
      return {
        functionResponse: {
          name: p.name,
          response:
            typeof p.result === "object" && p.result !== null ? p.result : { result: String(p.result) },
        },
      };
  }
}

function normalizeParts(content: string | ContentPart[]): ContentPart[] {
  return typeof content === "string" ? [{ type: "text", text: content }] : content;
}
function partsToText(content: ContentPart[]): string {
  return content.map((p) => ("text" in p ? p.text : "")).join("");
}

// ── SSE olay eşleme (saf, test edilebilir) ─────────────────────────────────

export async function* mapGeminiEvents(frames: AsyncIterable<SSEFrame>): AsyncIterable<StreamEvent> {
  const usage: Usage = {};
  let finishReason: FinishReason = "stop";
  let toolCounter = 0;
  let sawTool = false;

  for await (const frame of frames) {
    let data: any;
    try {
      data = JSON.parse(frame.data);
    } catch {
      continue;
    }

    if (data.usageMetadata) {
      usage.inputTokens = data.usageMetadata.promptTokenCount;
      usage.outputTokens = data.usageMetadata.candidatesTokenCount;
      if (data.usageMetadata.cachedContentTokenCount != null) {
        usage.cacheReadTokens = data.usageMetadata.cachedContentTokenCount;
      }
    }

    const cand = data.candidates?.[0];
    if (!cand) continue;

    for (const part of cand.content?.parts ?? []) {
      if (typeof part.text === "string" && part.text.length > 0) {
        if (part.thought) yield { type: "reasoning_delta", text: part.text };
        else yield { type: "text_delta", text: part.text };
      } else if (part.functionCall) {
        sawTool = true;
        const id = `call_${toolCounter++}`;
        yield {
          type: "tool_call",
          id,
          name: part.functionCall.name,
          args: part.functionCall.args ?? {},
        };
      }
    }

    if (cand.finishReason) finishReason = mapFinish(cand.finishReason);
  }

  yield { type: "finish", reason: sawTool ? "tool_calls" : finishReason, usage };
}

function mapFinish(r: string): FinishReason {
  switch (r) {
    case "STOP":
      return "stop";
    case "MAX_TOKENS":
      return "length";
    case "SAFETY":
    case "RECITATION":
    case "BLOCKLIST":
    case "PROHIBITED_CONTENT":
      return "content_filter";
    default:
      return "stop";
  }
}

// ── ChatModel gerçeklemesi ─────────────────────────────────────────────────

export class GeminiChatModel implements ChatModel {
  readonly wire = "gemini";
  constructor(
    private readonly ep: ResolvedEndpoint,
    readonly modelId: string,
  ) {}

  get providerId(): string {
    return this.ep.providerId;
  }

  async *streamChat(req: ChatRequest): AsyncIterable<StreamEvent> {
    const body = toGeminiBody(req);
    const doFetch = this.ep.fetch ?? fetch;
    const url = `${this.ep.baseURL}/models/${encodeURIComponent(this.modelId)}:streamGenerateContent?alt=sse`;

    const res = await doFetch(url, {
      method: "POST",
      signal: req.abortSignal,
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": this.ep.apiKey,
        ...(this.ep.headers ?? {}),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      yield { type: "error", error: new Error(`Gemini ${res.status}: ${text.slice(0, 500)}`) };
      return;
    }

    yield* mapGeminiEvents(parseSSE(readableToBytes(res.body)));
  }
}
