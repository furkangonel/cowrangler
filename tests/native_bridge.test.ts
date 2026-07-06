import { describe, it, expect } from "vitest";
import { z } from "zod";
import { bindRegistry, toJSONSchema } from "@cowrangler/core/model/native/tooling.js";
import { fromCoreMessages, toCoreMessages } from "@cowrangler/core/model/native/coremsg.js";
import type { Message } from "@cowrangler/core/model/native/types.js";

describe("toJSONSchema", () => {
  it("zod şemasını JSON Schema'ya çevirir ($schema atılır)", () => {
    const js = toJSONSchema(z.object({ path: z.string(), n: z.number().optional() })) as any;
    expect(js.$schema).toBeUndefined();
    expect(js.type).toBe("object");
    expect(js.properties.path.type).toBe("string");
    expect(js.required).toContain("path");
  });

  it("ai jsonSchema() nesnesini (.jsonSchema) açar", () => {
    const wrapped = { jsonSchema: { type: "object", properties: { x: { type: "number" } } } };
    expect(toJSONSchema(wrapped)).toEqual({ type: "object", properties: { x: { type: "number" } } });
  });

  it("düz JSON Schema'yı olduğu gibi geçirir", () => {
    expect(toJSONSchema({ type: "object", properties: {} })).toEqual({ type: "object", properties: {} });
  });
});

describe("bindRegistry", () => {
  it("registry'yi ToolSpec[] + executeTool'a indirger", async () => {
    let called: any = null;
    const tools = {
      read_file: {
        description: "read a file",
        parameters: z.object({ path: z.string() }),
        execute: async (args: any, opts: any) => {
          called = { args, opts };
          return { result: "içerik" };
        },
      },
    };
    const { specs, executeTool } = bindRegistry(tools);
    expect(specs[0].name).toBe("read_file");
    expect(specs[0].description).toBe("read a file");
    expect((specs[0].parameters as any).properties.path.type).toBe("string");

    const outcome = await executeTool({ id: "c1", name: "read_file", args: { path: "a.txt" } });
    expect(outcome.result).toEqual({ result: "içerik" });
    expect(called.args).toEqual({ path: "a.txt" });
    expect(called.opts.toolCallId).toBe("c1");
  });

  it("bilinmeyen tool → isError", async () => {
    const { executeTool } = bindRegistry({});
    const outcome = await executeTool({ id: "x", name: "yok", args: {} });
    expect(outcome.isError).toBe(true);
  });

  it("execute fırlatırsa isError döner", async () => {
    const { executeTool } = bindRegistry({
      boom: { execute: async () => { throw new Error("patladı"); } },
    });
    const outcome = await executeTool({ id: "x", name: "boom", args: {} });
    expect(outcome).toEqual({ result: "patladı", isError: true });
  });
});

describe("CoreMessage ↔ Message köprüsü", () => {
  it("round-trip: tool-call/tool-result/text korunur", () => {
    const core = [
      { role: "system", content: "sistem" },
      { role: "user", content: "oku" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "okuyorum" },
          { type: "tool-call", toolCallId: "c1", toolName: "read_file", args: { path: "a" } },
        ],
      },
      {
        role: "tool",
        content: [{ type: "tool-result", toolCallId: "c1", toolName: "read_file", result: "içerik", isError: false }],
      },
    ];

    const ported: Message[] = fromCoreMessages(core as any);
    expect(ported[1]).toEqual({ role: "user", content: "oku" });
    expect(ported[2].content).toEqual([
      { type: "text", text: "okuyorum" },
      { type: "tool_call", id: "c1", name: "read_file", args: { path: "a" } },
    ]);
    expect((ported[3].content as any)[0]).toMatchObject({ type: "tool_result", id: "c1", name: "read_file", result: "içerik" });

    // geri dön → vercel şekli
    const back = toCoreMessages(ported);
    expect(back[2].content[1]).toEqual({ type: "tool-call", toolCallId: "c1", toolName: "read_file", args: { path: "a" } });
    expect(back[3].content[0]).toMatchObject({ type: "tool-result", toolCallId: "c1", toolName: "read_file", result: "içerik" });
  });
});
