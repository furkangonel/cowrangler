/**
 * Native OpenAI Chat Completions client — vercel `@ai-sdk/openai` YERİNE.
 *
 * "openai" wire'ı en geniş kapsam: openai, copilot, openrouter, groq, ollama,
 * lmstudio, custom sağlayıcılar hepsi bu API şeklini konuşur.
 *
 * ChatModel portunu gerçekler: streaming, tool_calls delta birleştirme
 * (index anahtarlı), reasoning_content, usage (stream_options.include_usage).
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

/** Message[] → OpenAI messages. tool_call/tool_result OpenAI şekline map edilir. */
export function toOpenAIBody(req: ChatRequest): Record<string, unknown> {
  const messages: Array<Record<string, unknown>> = [];
  if (req.system) messages.push({ role: "system", content: req.system });

  for (const m of req.messages) {
    if (m.role === "tool") {
      // Her tool_result ayrı bir `role:tool` mesajı olur.
      for (const p of normalizeParts(m.content)) {
        if (p.type !== "tool_result") continue;
        messages.push({
          role: "tool",
          tool_call_id: p.id,
          content: typeof p.result === "string" ? p.result : JSON.stringify(p.result),
        });
      }
      continue;
    }

    if (m.role === "assistant") {
      const parts = normalizeParts(m.content);
      const textParts = parts.filter((p) => p.type === "text" || p.type === "reasoning");
      const toolCalls = parts.filter((p) => p.type === "tool_call") as Extract<
        ContentPart,
        { type: "tool_call" }
      >[];
      const msg: Record<string, unknown> = { role: "assistant" };
      const text = textParts.map((p) => ("text" in p ? p.text : "")).join("");
      msg.content = text || null;
      if (toolCalls.length > 0) {
        msg.tool_calls = toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments: typeof tc.args === "string" ? tc.args : JSON.stringify(tc.args ?? {}),
          },
        }));
      }
      messages.push(msg);
      continue;
    }

    // system (mesaj içi) / user
    messages.push({
      role: m.role,
      content: typeof m.content === "string" ? m.content : partsToText(normalizeParts(m.content)),
    });
  }

  const tools = req.tools?.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  // Reasoning (o-serisi / uyumlu): budget → effort. Yalnız thinking açıkken ekle.
  let reasoningEffort: "low" | "medium" | "high" | undefined;
  if (req.thinking?.enabled) {
    const b = req.thinking.budgetTokens ?? 8000;
    reasoningEffort = b > 4000 ? "high" : b > 2000 ? "medium" : "low";
  }

  return {
    model: req.model,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    ...(req.temperature != null ? { temperature: req.temperature } : {}),
    ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
    ...(tools && tools.length > 0 ? { tools } : {}),
    messages,
  };
}

function normalizeParts(content: string | ContentPart[]): ContentPart[] {
  return typeof content === "string" ? [{ type: "text", text: content }] : content;
}
function partsToText(content: ContentPart[]): string {
  return content.map((p) => ("text" in p ? p.text : "")).join("");
}

// ── SSE olay eşleme (saf, test edilebilir) ─────────────────────────────────

interface ToolAcc {
  id: string;
  name: string;
  argsBuf: string;
}

/**
 * OpenAI Chat Completions SSE frame'lerini port StreamEvent'lerine çevirir.
 * tool_calls index anahtarıyla biriktirilir; finish'te tam tool_call yayınlanır.
 */
export async function* mapOpenAIEvents(
  frames: AsyncIterable<SSEFrame>,
): AsyncIterable<StreamEvent> {
  const tools = new Map<number, ToolAcc>();
  const usage: Usage = {};
  let finishReason: FinishReason = "stop";
  let sawFinish = false;

  for await (const frame of frames) {
    if (frame.data === "[DONE]") break;
    let data: any;
    try {
      data = JSON.parse(frame.data);
    } catch {
      continue;
    }

    // Usage yalnız choices'sız son chunk'ta gelebilir.
    if (data.usage) {
      usage.inputTokens = data.usage.prompt_tokens;
      usage.outputTokens = data.usage.completion_tokens;
      const details = data.usage.prompt_tokens_details;
      if (details?.cached_tokens != null) usage.cacheReadTokens = details.cached_tokens;
    }

    const choice = data.choices?.[0];
    if (!choice) continue;
    const delta = choice.delta ?? {};

    if (typeof delta.content === "string" && delta.content.length > 0) {
      yield { type: "text_delta", text: delta.content };
    }
    // deepseek vb. reasoning akışı
    if (typeof delta.reasoning_content === "string" && delta.reasoning_content.length > 0) {
      yield { type: "reasoning_delta", text: delta.reasoning_content };
    }

    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const idx: number = tc.index ?? 0;
        let acc = tools.get(idx);
        if (!acc) {
          acc = { id: tc.id ?? "", name: tc.function?.name ?? "", argsBuf: "" };
          tools.set(idx, acc);
          yield { type: "tool_call_delta", id: acc.id, name: acc.name, argsDelta: "" };
        } else {
          if (tc.id && !acc.id) acc.id = tc.id;
          if (tc.function?.name && !acc.name) acc.name = tc.function.name;
        }
        const argChunk = tc.function?.arguments;
        if (typeof argChunk === "string" && argChunk.length > 0) {
          acc.argsBuf += argChunk;
          yield { type: "tool_call_delta", id: acc.id, argsDelta: argChunk };
        }
      }
    }

    if (choice.finish_reason) {
      finishReason = mapFinish(choice.finish_reason);
      sawFinish = true;
    }
  }

  // Biriken tool_call'ları yayınla (finish sırasına göre).
  for (const acc of tools.values()) {
    let args: unknown = {};
    if (acc.argsBuf.trim()) {
      try {
        args = JSON.parse(acc.argsBuf);
      } catch {
        args = {};
      }
    }
    yield { type: "tool_call", id: acc.id, name: acc.name, args };
  }

  yield { type: "finish", reason: sawFinish ? finishReason : "stop", usage };
}

function mapFinish(r: string): FinishReason {
  switch (r) {
    case "tool_calls":
    case "function_call":
      return "tool_calls";
    case "length":
      return "length";
    case "content_filter":
      return "content_filter";
    case "stop":
      return "stop";
    default:
      return "stop";
  }
}

// ── ChatModel gerçeklemesi ─────────────────────────────────────────────────

export class OpenAIChatModel implements ChatModel {
  constructor(
    private readonly ep: ResolvedEndpoint,
    readonly modelId: string,
  ) {}

  get providerId(): string {
    return this.ep.providerId;
  }
  get wire(): string {
    return this.ep.wire;
  }

  async *streamChat(req: ChatRequest): AsyncIterable<StreamEvent> {
    const body = toOpenAIBody({ ...req, model: this.modelId });
    const doFetch = this.ep.fetch ?? fetch;

    const res = await doFetch(`${this.ep.baseURL}/chat/completions`, {
      method: "POST",
      signal: req.abortSignal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.ep.apiKey}`,
        ...(this.ep.headers ?? {}),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      yield { type: "error", error: new Error(`OpenAI ${res.status}: ${text.slice(0, 500)}`) };
      return;
    }

    yield* mapOpenAIEvents(parseSSE(readableToBytes(res.body)));
  }
}
