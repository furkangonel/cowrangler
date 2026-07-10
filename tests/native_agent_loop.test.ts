import { describe, it, expect } from "vitest";
import { runAgentLoop } from "@cowrangler/core/model/native/loop.js";
import type { ChatModel, ChatRequest, StreamEvent, Message } from "@cowrangler/core/model/native/types.js";

type Script = StreamEvent[] | Error;

/** Scripted fake model: her streamChat çağrısında sıradaki olay dizisini akıtır. */
class FakeModel implements ChatModel {
  readonly providerId = "fake";
  readonly wire = "fake";
  readonly modelId = "fake-1";
  calls: ChatRequest[] = [];
  constructor(private scripts: Script[]) {}
  async *streamChat(req: ChatRequest): AsyncIterable<StreamEvent> {
    this.calls.push(req);
    const script = this.scripts.shift() ?? [{ type: "finish", reason: "stop" }];
    if (script instanceof Error) throw script;
    for (const ev of script) yield ev;
  }
}

describe("runAgentLoop", () => {
  it("çok-adım: tool_call → execute → tool_result → ikinci tur metin → dur", async () => {
    const model = new FakeModel([
      // Tur 1: bir tool_call
      [
        { type: "tool_call", id: "t1", name: "read_file", args: { path: "a.txt" } },
        { type: "finish", reason: "tool_calls", usage: { inputTokens: 10, outputTokens: 5 } },
      ],
      // Tur 2: düz metin, tool yok
      [
        { type: "text_delta", text: "Dosya: içerik" },
        { type: "finish", reason: "stop", usage: { inputTokens: 20, outputTokens: 8 } },
      ],
    ]);

    const started: string[] = [];
    const steps: number[] = [];
    const texts: string[] = [];

    const res = await runAgentLoop({
      model,
      messages: [{ role: "user", content: "dosyayı oku" }],
      tools: [{ name: "read_file", description: "read", parameters: { type: "object" } }],
      executeTool: async (inv) => {
        expect(inv.name).toBe("read_file");
        expect(inv.args).toEqual({ path: "a.txt" });
        return { result: "içerik" };
      },
      handlers: {
        onToolStart: (inv) => started.push(inv.name),
        onStepFinish: (s) => steps.push(s),
        onText: (t) => texts.push(t),
      },
    });

    expect(res.finishReason).toBe("stop");
    expect(res.steps).toBe(2);
    expect(model.calls.length).toBe(2);

    // İkinci çağrıda geçmiş: user, assistant(tool_call), tool(result), (yeni tur)
    const secondCallMsgs = model.calls[1].messages;
    const roles = secondCallMsgs.map((m: Message) => m.role);
    expect(roles).toEqual(["user", "assistant", "tool"]);
    const toolMsg = secondCallMsgs[2].content as any[];
    expect(toolMsg[0]).toMatchObject({ type: "tool_result", id: "t1", name: "read_file", result: "içerik" });

    // Usage iki turdan toplanır
    expect(res.usage.inputTokens).toBe(30);
    expect(res.usage.outputTokens).toBe(13);

    expect(started).toEqual(["read_file"]);
    expect(steps).toEqual([1, 2]);
    expect(texts.join("")).toBe("Dosya: içerik");
  });

  it("executeTool fırlatırsa isError tool_result üretir, loop çökmez", async () => {
    const model = new FakeModel([
      [
        { type: "tool_call", id: "t1", name: "boom", args: {} },
        { type: "finish", reason: "tool_calls" },
      ],
      [{ type: "text_delta", text: "toparlandım" }, { type: "finish", reason: "stop" }],
    ]);
    let sawError = false;
    const res = await runAgentLoop({
      model,
      messages: [{ role: "user", content: "çalıştır" }],
      executeTool: async () => {
        throw new Error("patladı");
      },
      handlers: { onToolResult: (_i, o) => { if (o.isError) sawError = true; } },
    });
    expect(sawError).toBe(true);
    expect(res.finishReason).toBe("stop");
    const toolMsg = model.calls[1].messages[2].content as any[];
    expect(toolMsg[0]).toMatchObject({ type: "tool_result", isError: true, result: "patladı" });
  });

  it("maxSteps'e ulaşınca durur (sonsuz tool döngüsü koruması)", async () => {
    // Her tur hep tool_call döndürür → maxSteps guard devreye girer.
    const infinite: StreamEvent[][] = Array.from({ length: 10 }, () => [
      { type: "tool_call", id: "t", name: "loop", args: {} } as StreamEvent,
      { type: "finish", reason: "tool_calls" } as StreamEvent,
    ]);
    const model = new FakeModel(infinite);
    const res = await runAgentLoop({
      model,
      messages: [{ role: "user", content: "sonsuz" }],
      maxSteps: 3,
      executeTool: async () => ({ result: "ok" }),
    });
    expect(res.finishReason).toBe("max_steps");
    expect(res.steps).toBe(3);
    expect(model.calls.length).toBe(3);
  });

  it("model error event'i loop'u error ile bitirir", async () => {
    const model = new FakeModel([[{ type: "error", error: new Error("500") }, { type: "finish", reason: "error" }]]);
    const res = await runAgentLoop({
      model,
      messages: [{ role: "user", content: "x" }],
      maxRetries: 0,
      executeTool: async () => ({ result: "" }),
    });
    expect(res.finishReason).toBe("error");
  });

  it("retryable model hatasını aynı step içinde backoff ile tekrar dener", async () => {
    const firstError = new Error("rate limit");
    (firstError as any).statusCode = 429;
    const model = new FakeModel([
      firstError,
      [
        { type: "text_delta", text: "tamam" },
        { type: "finish", reason: "stop", usage: { inputTokens: 2, outputTokens: 3 } },
      ],
    ]);
    const retries: Array<{ attempt: number; delayMs: number; message: string }> = [];

    const res = await runAgentLoop({
      model,
      messages: [{ role: "user", content: "x" }],
      maxRetries: 1,
      baseBackoffMs: 0,
      executeTool: async () => ({ result: "" }),
      handlers: {
        onRetry: (err, attempt, delayMs) => retries.push({ attempt, delayMs, message: err.message }),
      },
    });

    expect(res.finishReason).toBe("stop");
    expect(res.steps).toBe(1);
    expect(model.calls.length).toBe(2);
    expect(retries).toEqual([{ attempt: 1, delayMs: 0, message: "rate limit" }]);
    expect(res.usage.inputTokens).toBe(2);
    expect(res.usage.outputTokens).toBe(3);
    expect(res.messages).toEqual([
      { role: "user", content: "x" },
      { role: "assistant", content: [{ type: "text", text: "tamam" }] },
    ]);
  });

  it("başarısız denemedeki partial assistant mesajını history'ye yazmaz", async () => {
    const stalled = new Error("stream stalled");
    const model = new FakeModel([
      [
        { type: "text_delta", text: "yarım" },
        { type: "error", error: stalled },
      ],
      [
        { type: "text_delta", text: "tam cevap" },
        { type: "finish", reason: "stop" },
      ],
    ]);

    const res = await runAgentLoop({
      model,
      messages: [{ role: "user", content: "x" }],
      maxRetries: 1,
      baseBackoffMs: 0,
      executeTool: async () => ({ result: "" }),
    });

    expect(res.finishReason).toBe("stop");
    expect(res.messages).toEqual([
      { role: "user", content: "x" },
      { role: "assistant", content: [{ type: "text", text: "tam cevap" }] },
    ]);
  });
});
