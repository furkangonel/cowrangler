/**
 * Native Anthropic Messages API client — vercel `@ai-sdk/anthropic` YERİNE.
 *
 * ChatModel portunu gerçekler: streaming, tool-call assembly, prompt caching
 * (cache_control). agent.ts'e dokunmaz; izole ve test edilebilir.
 *
 * Referans: https://docs.anthropic.com/en/api/messages (streaming events)
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

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 4096;

// ── İstek gövdesi (saf, test edilebilir) ───────────────────────────────────

interface CacheControl {
  cache_control?: { type: "ephemeral" };
}

/** Message[] → Anthropic gövdesi. system ayrı param; tool_result user mesajı olur. */
export function toAnthropicBody(req: ChatRequest): Record<string, unknown> {
  const systemChunks: string[] = [];
  if (req.system) systemChunks.push(req.system);

  const messages: Array<{ role: "user" | "assistant"; content: unknown[] }> = [];

  for (const m of req.messages) {
    if (m.role === "system") {
      systemChunks.push(typeof m.content === "string" ? m.content : partsToText(m.content));
      continue;
    }
    if (m.role === "tool") {
      // tool_result → user mesajı içinde blok(lar).
      const parts = normalizeParts(m.content).filter((p) => p.type === "tool_result");
      messages.push({
        role: "user",
        content: parts.map((p) => {
          const tr = p as Extract<ContentPart, { type: "tool_result" }>;
          return {
            type: "tool_result",
            tool_use_id: tr.id,
            content: typeof tr.result === "string" ? tr.result : JSON.stringify(tr.result),
            ...(tr.isError ? { is_error: true } : {}),
          };
        }),
      });
      continue;
    }
    // user / assistant
    messages.push({
      role: m.role,
      content: normalizeParts(m.content).map(toAnthropicBlock),
    });
  }

  // system'i blok dizisi yap ki son bloğa cache_control koyabilelim.
  let system: unknown;
  if (systemChunks.length > 0) {
    const blocks: Array<Record<string, unknown> & CacheControl> = systemChunks.map((t) => ({
      type: "text",
      text: t,
    }));
    if (req.cache?.cacheSystemAndTools && blocks.length > 0) {
      blocks[blocks.length - 1].cache_control = { type: "ephemeral" };
    }
    system = blocks;
  }

  // tools — son araca cache_control (prefix cache breakpoint).
  let tools: unknown;
  if (req.tools && req.tools.length > 0) {
    const t = req.tools.map((ts) => ({
      name: ts.name,
      description: ts.description,
      input_schema: ts.parameters,
    })) as Array<Record<string, unknown> & CacheControl>;
    if (req.cache?.cacheSystemAndTools) {
      t[t.length - 1].cache_control = { type: "ephemeral" };
    }
    tools = t;
  }

  // Extended thinking: budget'tan büyük max_tokens gerekir; thinking açıkken
  // Anthropic temperature=1 zorunlu kılar (biz temperature'ı düşürüyoruz).
  const thinkingOn = req.thinking?.enabled === true;
  const budget = req.thinking?.budgetTokens ?? 8000;
  const maxTokens = thinkingOn
    ? Math.max(req.maxTokens ?? DEFAULT_MAX_TOKENS, budget + 1024)
    : req.maxTokens ?? DEFAULT_MAX_TOKENS;

  return {
    model: req.model,
    max_tokens: maxTokens,
    stream: true,
    ...(system ? { system } : {}),
    ...(tools ? { tools } : {}),
    ...(thinkingOn
      ? { thinking: { type: "enabled", budget_tokens: budget } }
      : req.temperature != null
        ? { temperature: req.temperature }
        : {}),
    messages,
  };
}

function toAnthropicBlock(p: ContentPart): unknown {
  switch (p.type) {
    case "text":
      return { type: "text", text: p.text };
    case "reasoning":
      return { type: "text", text: p.text }; // geçmişte reasoning'i text olarak taşı
    case "image":
      return { type: "image", source: { type: "base64", media_type: p.mimeType, data: p.data } };
    case "tool_call":
      return { type: "tool_use", id: p.id, name: p.name, input: p.args ?? {} };
    case "tool_result":
      return {
        type: "tool_result",
        tool_use_id: p.id,
        content: typeof p.result === "string" ? p.result : JSON.stringify(p.result),
        ...(p.isError ? { is_error: true } : {}),
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

interface OpenBlock {
  kind: "text" | "thinking" | "tool_use";
  id?: string;
  name?: string;
  jsonBuf: string;
}

/**
 * Anthropic SSE frame'lerini port StreamEvent'lerine çevirir.
 * Saf async generator — fetch'siz mock frame'lerle test edilir.
 */
export async function* mapAnthropicEvents(
  frames: AsyncIterable<SSEFrame>,
): AsyncIterable<StreamEvent> {
  const blocks = new Map<number, OpenBlock>();
  const usage: Usage = {};
  let stopReason: string | undefined;

  for await (const frame of frames) {
    let data: any;
    try {
      data = JSON.parse(frame.data);
    } catch {
      continue; // "[DONE]" veya bozuk frame — atla
    }

    const type = data.type ?? frame.event;

    switch (type) {
      case "message_start": {
        const u = data.message?.usage;
        if (u) {
          usage.inputTokens = u.input_tokens;
          usage.cacheReadTokens = u.cache_read_input_tokens;
          usage.cacheWriteTokens = u.cache_creation_input_tokens;
        }
        break;
      }
      case "content_block_start": {
        const cb = data.content_block ?? {};
        const kind: OpenBlock["kind"] =
          cb.type === "tool_use" ? "tool_use" : cb.type === "thinking" ? "thinking" : "text";
        blocks.set(data.index, { kind, id: cb.id, name: cb.name, jsonBuf: "" });
        if (kind === "tool_use" && cb.id && cb.name) {
          yield { type: "tool_call_delta", id: cb.id, name: cb.name, argsDelta: "" };
        }
        break;
      }
      case "content_block_delta": {
        const blk = blocks.get(data.index);
        const d = data.delta ?? {};
        if (d.type === "text_delta") {
          yield { type: "text_delta", text: d.text ?? "" };
        } else if (d.type === "thinking_delta") {
          yield { type: "reasoning_delta", text: d.thinking ?? "" };
        } else if (d.type === "input_json_delta" && blk?.kind === "tool_use") {
          blk.jsonBuf += d.partial_json ?? "";
          yield { type: "tool_call_delta", id: blk.id!, argsDelta: d.partial_json ?? "" };
        }
        break;
      }
      case "content_block_stop": {
        const blk = blocks.get(data.index);
        if (blk?.kind === "tool_use" && blk.id && blk.name) {
          let args: unknown = {};
          if (blk.jsonBuf.trim()) {
            try {
              args = JSON.parse(blk.jsonBuf);
            } catch {
              args = {};
            }
          }
          yield { type: "tool_call", id: blk.id, name: blk.name, args };
        }
        blocks.delete(data.index);
        break;
      }
      case "message_delta": {
        if (data.delta?.stop_reason) stopReason = data.delta.stop_reason;
        if (data.usage?.output_tokens != null) usage.outputTokens = data.usage.output_tokens;
        break;
      }
      case "message_stop": {
        yield { type: "finish", reason: mapStopReason(stopReason), usage };
        break;
      }
      case "error": {
        const msg = data.error?.message ?? "anthropic stream error";
        yield { type: "error", error: new Error(msg) };
        break;
      }
      // ping / diğerleri: yoksay
    }
  }
}

function mapStopReason(r: string | undefined): FinishReason {
  switch (r) {
    case "tool_use":
      return "tool_calls";
    case "max_tokens":
      return "length";
    case "end_turn":
    case "stop_sequence":
      return "stop";
    default:
      return "stop";
  }
}

// ── ChatModel gerçeklemesi ─────────────────────────────────────────────────

export class AnthropicChatModel implements ChatModel {
  readonly wire = "anthropic";
  constructor(
    private readonly ep: ResolvedEndpoint,
    readonly modelId: string,
  ) {}

  get providerId(): string {
    return this.ep.providerId;
  }

  async *streamChat(req: ChatRequest): AsyncIterable<StreamEvent> {
    const body = toAnthropicBody({ ...req, model: this.modelId });
    const doFetch = this.ep.fetch ?? fetch;

    const res = await doFetch(`${this.ep.baseURL}/messages`, {
      method: "POST",
      signal: req.abortSignal,
      headers: {
        "content-type": "application/json",
        "x-api-key": this.ep.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        ...(this.ep.headers ?? {}),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      yield {
        type: "error",
        error: new Error(`Anthropic ${res.status}: ${text.slice(0, 500)}`),
      };
      return;
    }

    yield* mapAnthropicEvents(parseSSE(readableToBytes(res.body)));
  }
}
