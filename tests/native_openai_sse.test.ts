import { describe, it, expect } from "vitest";
import { parseSSE, stringToChunks } from "@cowrangler/core/model/native/sse.js";
import { mapOpenAIEvents, toOpenAIBody } from "@cowrangler/core/model/native/openai.js";
import type { ChatRequest, StreamEvent } from "@cowrangler/core/model/native/types.js";

// OpenAI Chat Completions streaming: metin + index-anahtarlı tool_call + usage + [DONE].
const STREAM = [
  `data: {"choices":[{"index":0,"delta":{"role":"assistant","content":""}}]}`,
  ``,
  `data: {"choices":[{"index":0,"delta":{"content":"Selam"}}]}`,
  ``,
  `data: {"choices":[{"index":0,"delta":{"content":" dünya"}}]}`,
  ``,
  `data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"read_file","arguments":""}}]}}]}`,
  ``,
  `data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"path\\":"}}]}}]}`,
  ``,
  `data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"a.txt\\"}"}}]}}]}`,
  ``,
  `data: {"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}`,
  ``,
  `data: {"choices":[],"usage":{"prompt_tokens":42,"completion_tokens":7,"prompt_tokens_details":{"cached_tokens":10}}}`,
  ``,
  `data: [DONE]`,
  ``,
].join("\n");

async function collect(events: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

describe("mapOpenAIEvents", () => {
  it("metin + tool_call birleştirme + usage", async () => {
    const events = await collect(mapOpenAIEvents(parseSSE(stringToChunks(STREAM))));

    const text = (events.filter((e) => e.type === "text_delta") as Extract<StreamEvent, { type: "text_delta" }>[])
      .map((e) => e.text)
      .join("");
    expect(text).toBe("Selam dünya");

    const call = events.find((e) => e.type === "tool_call") as Extract<StreamEvent, { type: "tool_call" }>;
    expect(call.id).toBe("call_1");
    expect(call.name).toBe("read_file");
    expect(call.args).toEqual({ path: "a.txt" });

    const finish = events.find((e) => e.type === "finish") as Extract<StreamEvent, { type: "finish" }>;
    expect(finish.reason).toBe("tool_calls");
    expect(finish.usage?.inputTokens).toBe(42);
    expect(finish.usage?.outputTokens).toBe(7);
    expect(finish.usage?.cacheReadTokens).toBe(10);
  });

  it("chunk sınırları ortadan geçse de tool_call args bütünlüğü korunur", async () => {
    const events = await collect(mapOpenAIEvents(parseSSE(stringToChunks(STREAM, 9))));
    const call = events.find((e) => e.type === "tool_call") as Extract<StreamEvent, { type: "tool_call" }>;
    expect(call.args).toEqual({ path: "a.txt" });
  });
});

describe("toOpenAIBody", () => {
  it("assistant tool_call ve tool_result'ı OpenAI şekline çevirir", () => {
    const req: ChatRequest = {
      model: "gpt-x",
      system: "sistem",
      tools: [{ name: "read_file", description: "read", parameters: { type: "object" } }],
      messages: [
        { role: "user", content: "oku" },
        { role: "assistant", content: [{ type: "tool_call", id: "c1", name: "read_file", args: { path: "a" } }] },
        { role: "tool", content: [{ type: "tool_result", id: "c1", name: "read_file", result: "içerik" }] },
      ],
    };
    const body = toOpenAIBody(req) as any;

    expect(body.stream_options).toEqual({ include_usage: true });
    expect(body.messages[0]).toEqual({ role: "system", content: "sistem" });
    // assistant tool_calls: arguments JSON string
    const asst = body.messages[2];
    expect(asst.role).toBe("assistant");
    expect(asst.content).toBeNull();
    expect(asst.tool_calls[0]).toMatchObject({ id: "c1", type: "function" });
    expect(asst.tool_calls[0].function).toEqual({ name: "read_file", arguments: '{"path":"a"}' });
    // tool_result → role:tool
    expect(body.messages[3]).toEqual({ role: "tool", tool_call_id: "c1", content: "içerik" });
    // tools şekli
    expect(body.tools[0]).toEqual({ type: "function", function: { name: "read_file", description: "read", parameters: { type: "object" } } });
  });
});
