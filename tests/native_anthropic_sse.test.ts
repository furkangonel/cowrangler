import { describe, it, expect } from "vitest";
import { parseSSE, stringToChunks, type SSEFrame } from "@cowrangler/core/model/native/sse.js";
import { mapAnthropicEvents, toAnthropicBody } from "@cowrangler/core/model/native/anthropic.js";
import type { ChatRequest, StreamEvent } from "@cowrangler/core/model/native/types.js";

// Gerçek Anthropic streaming olay dizisinin minimal kopyası: metin + bir tool_use.
const SAMPLE_STREAM = [
  `event: message_start`,
  `data: {"type":"message_start","message":{"usage":{"input_tokens":42,"cache_read_input_tokens":10}}}`,
  ``,
  `event: content_block_start`,
  `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`,
  ``,
  `event: content_block_delta`,
  `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Merhaba"}}`,
  ``,
  `event: content_block_delta`,
  `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" dünya"}}`,
  ``,
  `event: content_block_stop`,
  `data: {"type":"content_block_stop","index":0}`,
  ``,
  `event: content_block_start`,
  `data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"read_file"}}`,
  ``,
  `event: content_block_delta`,
  `data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\":"}}`,
  ``,
  `event: content_block_delta`,
  `data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\\"a.txt\\"}"}}`,
  ``,
  `event: content_block_stop`,
  `data: {"type":"content_block_stop","index":1}`,
  ``,
  `event: message_delta`,
  `data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":7}}`,
  ``,
  `event: message_stop`,
  `data: {"type":"message_stop"}`,
  ``,
].join("\n");

async function collect(events: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

describe("parseSSE", () => {
  it("byte'ları frame'lere böler, event + birleşik data verir", async () => {
    const frames: SSEFrame[] = [];
    for await (const f of parseSSE(stringToChunks(SAMPLE_STREAM))) frames.push(f);
    expect(frames[0]).toEqual({
      event: "message_start",
      data: `{"type":"message_start","message":{"usage":{"input_tokens":42,"cache_read_input_tokens":10}}}`,
    });
    // 8 frame: message_start, block_start, 2 delta, block_stop, block_start, 2 delta, block_stop, message_delta, message_stop
    expect(frames.length).toBe(11);
  });

  it("parçalanmış (chunked) byte akışında frame sınırlarını korur", async () => {
    const frames: SSEFrame[] = [];
    // 7 parçaya böl — sınırların ortasından geçer.
    for await (const f of parseSSE(stringToChunks(SAMPLE_STREAM, 7))) frames.push(f);
    expect(frames.length).toBe(11);
    expect(frames[frames.length - 1].event).toBe("message_stop");
  });
});

describe("mapAnthropicEvents", () => {
  it("Anthropic olaylarını port StreamEvent'lerine çevirir", async () => {
    const events = await collect(mapAnthropicEvents(parseSSE(stringToChunks(SAMPLE_STREAM))));

    const textDeltas = events.filter((e) => e.type === "text_delta") as Extract<StreamEvent, { type: "text_delta" }>[];
    expect(textDeltas.map((e) => e.text).join("")).toBe("Merhaba dünya");

    const toolCall = events.find((e) => e.type === "tool_call") as Extract<StreamEvent, { type: "tool_call" }>;
    expect(toolCall).toBeTruthy();
    expect(toolCall.id).toBe("toolu_1");
    expect(toolCall.name).toBe("read_file");
    expect(toolCall.args).toEqual({ path: "a.txt" });

    const finish = events.find((e) => e.type === "finish") as Extract<StreamEvent, { type: "finish" }>;
    expect(finish.reason).toBe("tool_calls");
    expect(finish.usage?.inputTokens).toBe(42);
    expect(finish.usage?.outputTokens).toBe(7);
    expect(finish.usage?.cacheReadTokens).toBe(10);
  });

  it("bozuk JSON frame'i güvenle atlar", async () => {
    const bad = [`event: content_block_delta`, `data: {not json`, ``, `event: message_stop`, `data: {"type":"message_stop"}`, ``].join("\n");
    const events = await collect(mapAnthropicEvents(parseSSE(stringToChunks(bad))));
    expect(events.some((e) => e.type === "finish")).toBe(true);
  });
});

describe("toAnthropicBody", () => {
  it("system'i ayırır, tool_result'ı user mesajına çevirir, cache_control koyar", () => {
    const req: ChatRequest = {
      model: "claude-x",
      system: "Sen bir ajanısın.",
      cache: { cacheSystemAndTools: true },
      tools: [{ name: "read_file", description: "read", parameters: { type: "object" } }],
      messages: [
        { role: "user", content: "dosyayı oku" },
        { role: "assistant", content: [{ type: "tool_call", id: "t1", name: "read_file", args: { path: "a" } }] },
        { role: "tool", content: [{ type: "tool_result", id: "t1", name: "read_file", result: "içerik" }] },
      ],
    };
    const body = toAnthropicBody(req) as any;

    expect(body.model).toBe("claude-x");
    expect(body.stream).toBe(true);
    // system blok dizisi + son blokta cache_control
    expect(Array.isArray(body.system)).toBe(true);
    expect(body.system[body.system.length - 1].cache_control).toEqual({ type: "ephemeral" });
    // tools son araçta cache_control
    expect(body.tools[body.tools.length - 1].cache_control).toEqual({ type: "ephemeral" });
    // assistant tool_use bloğu
    expect(body.messages[1].content[0]).toMatchObject({ type: "tool_use", id: "t1", name: "read_file", input: { path: "a" } });
    // tool_result → user mesajı
    expect(body.messages[2].role).toBe("user");
    expect(body.messages[2].content[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1", content: "içerik" });
  });
});
