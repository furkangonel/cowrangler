import { describe, it, expect } from "vitest";
import { collapseDuplicateToolResults } from "@cowrangler/core/context_engine.js";
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
