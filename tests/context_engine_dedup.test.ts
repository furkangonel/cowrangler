import { describe, it, expect } from "vitest";
import { collapseDuplicateToolResults, DefaultContextEngine } from "@cowrangler/core/context_engine.js";
import { compactToolResultForModel } from "@cowrangler/core/agent.js";
import type { CoreMessage } from "ai";

function toolCallMsg(id: string, name: string, args: Record<string, unknown>): CoreMessage {
  return { role: "assistant", content: [{ type: "tool-call", toolCallId: id, toolName: name, args }] } as any;
}

function toolResultMsg(id: string, name: string, result: string): CoreMessage {
  return { role: "tool", content: [{ type: "tool-result", toolCallId: id, toolName: name, result }] } as any;
}

describe("collapseDuplicateToolResults", () => {
  it("keeps a single (non-repeated) tool call result untouched", () => {
    const messages = [toolCallMsg("1", "read_file", { path: "a.txt" }), toolResultMsg("1", "read_file", "contents of a")];
    const out = collapseDuplicateToolResults(messages);
    expect((out[1].content as any[])[0].result).toBe("contents of a");
  });

  it("collapses earlier duplicate calls, keeps the last one intact", () => {
    const messages = [
      toolCallMsg("1", "read_file", { path: "a.txt" }),
      toolResultMsg("1", "read_file", "stale contents"),
      toolCallMsg("2", "read_file", { path: "a.txt" }), // aynı araç + aynı args
      toolResultMsg("2", "read_file", "fresh contents"),
    ];
    const out = collapseDuplicateToolResults(messages);
    expect((out[1].content as any[])[0].result).toContain("duplicate");
    expect((out[3].content as any[])[0].result).toBe("fresh contents");
  });

  it("does not collapse calls to the same tool with different args", () => {
    const messages = [
      toolCallMsg("1", "read_file", { path: "a.txt" }),
      toolResultMsg("1", "read_file", "contents of a"),
      toolCallMsg("2", "read_file", { path: "b.txt" }),
      toolResultMsg("2", "read_file", "contents of b"),
    ];
    const out = collapseDuplicateToolResults(messages);
    expect((out[1].content as any[])[0].result).toBe("contents of a");
    expect((out[3].content as any[])[0].result).toBe("contents of b");
  });

  it("is a no-op when there are no tool calls at all", () => {
    const messages: CoreMessage[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    expect(collapseDuplicateToolResults(messages)).toEqual(messages);
  });

  it("handles three or more repeats, collapsing all but the last", () => {
    const messages = [
      toolCallMsg("1", "grep", { q: "TODO" }),
      toolResultMsg("1", "grep", "match 1"),
      toolCallMsg("2", "grep", { q: "TODO" }),
      toolResultMsg("2", "grep", "match 2"),
      toolCallMsg("3", "grep", { q: "TODO" }),
      toolResultMsg("3", "grep", "match 3 — final"),
    ];
    const out = collapseDuplicateToolResults(messages);
    expect((out[1].content as any[])[0].result).toContain("duplicate");
    expect((out[3].content as any[])[0].result).toContain("duplicate");
    expect((out[5].content as any[])[0].result).toBe("match 3 — final");
  });
});

describe("economic context controls", () => {
  it("prunes oversized tool results before every model turn", () => {
    const engine = new DefaultContextEngine("google/gemini-2.5-pro");
    const messages = [toolResultMsg("1", "read_file", "x".repeat(10_000))];
    const out = engine.compactForNextTurn(messages);
    const result = (out[0].content as any[])[0].result as string;
    expect(result.length).toBeLessThan(2_100);
    expect(result).toContain("chars pruned");
  });

  it("compacts tool output before the next step in the same agent loop", () => {
    const out = compactToolResultForModel({ result: "x".repeat(10_000) }, 1_000) as any;
    expect(out.truncated).toBe(true);
    expect(out.result.length).toBeLessThan(1_100);
    expect(out.result).toContain("request a narrower range");
  });

  it("compresses at the economic soft limit even for a 1M model window", () => {
    const engine = new DefaultContextEngine("google/gemini-2.5-pro");
    expect(engine.shouldCompress(23_999)).toBe(false);
    expect(engine.shouldCompress(24_000)).toBe(true);
  });
});
