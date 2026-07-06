import { describe, it, expect } from "vitest";
import { parseSSE, stringToChunks } from "@cowrangler/core/model/native/sse.js";
import { mapGeminiEvents, toGeminiBody } from "@cowrangler/core/model/native/gemini.js";
import type { ChatRequest, StreamEvent } from "@cowrangler/core/model/native/types.js";

// Gemini streamGenerateContent?alt=sse: metin delta'ları + functionCall + usageMetadata.
const STREAM = [
  `data: {"candidates":[{"content":{"role":"model","parts":[{"text":"Merhaba"}]},"index":0}]}`,
  ``,
  `data: {"candidates":[{"content":{"role":"model","parts":[{"text":" dünya"}]},"index":0}]}`,
  ``,
  `data: {"candidates":[{"content":{"role":"model","parts":[{"functionCall":{"name":"read_file","args":{"path":"a.txt"}}}]},"finishReason":"STOP","index":0}],"usageMetadata":{"promptTokenCount":42,"candidatesTokenCount":7}}`,
  ``,
].join("\n");

async function collect(events: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

describe("mapGeminiEvents", () => {
  it("metin + functionCall → tool_call + usage; sentetik id", async () => {
    const events = await collect(mapGeminiEvents(parseSSE(stringToChunks(STREAM))));

    const text = (events.filter((e) => e.type === "text_delta") as Extract<StreamEvent, { type: "text_delta" }>[])
      .map((e) => e.text)
      .join("");
    expect(text).toBe("Merhaba dünya");

    const call = events.find((e) => e.type === "tool_call") as Extract<StreamEvent, { type: "tool_call" }>;
    expect(call.name).toBe("read_file");
    expect(call.args).toEqual({ path: "a.txt" });
    expect(call.id).toMatch(/^call_\d+$/);

    const finish = events.find((e) => e.type === "finish") as Extract<StreamEvent, { type: "finish" }>;
    // functionCall varsa finish reason tool_calls'a yükseltilir
    expect(finish.reason).toBe("tool_calls");
    expect(finish.usage?.inputTokens).toBe(42);
    expect(finish.usage?.outputTokens).toBe(7);
  });
});

describe("toGeminiBody", () => {
  it("system→systemInstruction, tool_call→functionCall, tool_result→functionResponse (name eşleşmesi)", () => {
    const req: ChatRequest = {
      model: "gemini-x",
      system: "sistem",
      tools: [{ name: "read_file", description: "read", parameters: { type: "object" } }],
      messages: [
        { role: "user", content: "oku" },
        { role: "assistant", content: [{ type: "tool_call", id: "call_0", name: "read_file", args: { path: "a" } }] },
        { role: "tool", content: [{ type: "tool_result", id: "call_0", name: "read_file", result: "içerik" }] },
      ],
    };
    const body = toGeminiBody(req) as any;

    expect(body.systemInstruction).toEqual({ parts: [{ text: "sistem" }] });
    expect(body.tools[0].functionDeclarations[0].name).toBe("read_file");
    // user
    expect(body.contents[0]).toEqual({ role: "user", parts: [{ text: "oku" }] });
    // assistant → model, functionCall
    expect(body.contents[1]).toEqual({ role: "model", parts: [{ functionCall: { name: "read_file", args: { path: "a" } } }] });
    // tool → user, functionResponse (name ile eşleşir, string sonuç objeye sarılır)
    expect(body.contents[2]).toEqual({
      role: "user",
      parts: [{ functionResponse: { name: "read_file", response: { result: "içerik" } } }],
    });
  });
});
