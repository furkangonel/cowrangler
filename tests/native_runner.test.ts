import { describe, it, expect } from "vitest";
import { z } from "zod";
import { runNativeAgentTurn } from "@cowrangler/core/model/native/runner.js";
import type { ChatModel, ChatRequest, StreamEvent } from "@cowrangler/core/model/native/types.js";

class FakeModel implements ChatModel {
  readonly providerId = "fake";
  readonly wire = "fake";
  readonly modelId = "fake-1";
  constructor(private scripts: StreamEvent[][]) {}
  async *streamChat(_req: ChatRequest): AsyncIterable<StreamEvent> {
    const s = this.scripts.shift() ?? [{ type: "finish", reason: "stop" }];
    for (const ev of s) yield ev;
  }
}

describe("runNativeAgentTurn", () => {
  it("agent.ts muhasebesini üretir: finalText, usage, responseMessages, plugins hook", async () => {
    const model = new FakeModel([
      [
        { type: "tool_call", id: "t1", name: "read_file", args: { path: "a" } },
        { type: "finish", reason: "tool_calls", usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 3 } },
      ],
      [
        { type: "text_delta", text: "cevap" },
        { type: "finish", reason: "stop", usage: { inputTokens: 20, outputTokens: 8 } },
      ],
    ]);

    const preToolCalls: string[] = [];
    let executed = false;

    const res = await runNativeAgentTurn({
      modelId: "fake-1",
      model,
      system: "sistem",
      history: [{ role: "user", content: "oku" }],
      tools: {
        read_file: {
          description: "read",
          parameters: z.object({ path: z.string() }),
          execute: async () => {
            executed = true;
            return { result: "içerik" };
          },
        },
      },
      maxSteps: 10,
      preToolCall: async (name) => {
        preToolCalls.push(name);
      },
    });

    expect(res.finalText).toBe("cevap");
    expect(executed).toBe(true);
    expect(preToolCalls).toEqual(["read_file"]);
    expect(res.toolCalls).toEqual([{ name: "read_file", args: { path: "a" } }]);

    // usage iki turdan toplanır
    expect(res.inputTokens).toBe(30);
    expect(res.outputTokens).toBe(13);
    expect(res.totalTokens).toBe(43);
    expect(res.cacheReadTokens).toBe(3);

    // responseMessages: SADECE üretilen (girdi user'ı hariç), vercel CoreMessage şeklinde
    const roles = res.responseMessages.map((m) => m.role);
    expect(roles).toEqual(["assistant", "tool", "assistant"]);
    // ilk assistant tool-call vercel şekli
    expect(res.responseMessages[0].content[0]).toEqual({
      type: "tool-call",
      toolCallId: "t1",
      toolName: "read_file",
      args: { path: "a" },
    });
    // tool-result
    expect(res.responseMessages[1].content[0]).toMatchObject({
      type: "tool-result",
      toolCallId: "t1",
      toolName: "read_file",
    });
    expect(res.finishReason).toBe("stop");
  });
});
