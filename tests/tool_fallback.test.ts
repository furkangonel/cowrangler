/**
 * Tool-call JSON fallback — birim testleri (WP-6).
 */

import { describe, it, expect } from "vitest";
import {
  buildToolFallbackInstructions,
  parseToolCalls,
  hasToolCall,
  TOOL_FALLBACK_SENTINEL,
} from "../src/core/tool_fallback.js";

describe("buildToolFallbackInstructions", () => {
  it("araç adlarını ve parametre anahtarlarını listeler", () => {
    const tools = {
      read_file: {
        description: "Read a file from disk\nsecond line ignored",
        parameters: { shape: { path: {}, limit: {} } }, // zod benzeri
      },
      run_bash: {
        description: "Run a shell command",
        parameters: { properties: { command: {} } }, // json-schema benzeri
      },
    };
    const text = buildToolFallbackInstructions(tools);
    expect(text).toContain(TOOL_FALLBACK_SENTINEL);
    expect(text).toContain("read_file");
    expect(text).toContain("params: path, limit");
    expect(text).toContain("run_bash");
    expect(text).toContain("params: command");
    // Yalnız açıklamanın ilk satırı alınır
    expect(text).toContain("Read a file from disk");
    expect(text).not.toContain("second line ignored");
  });

  it("araç yoksa (none) yazar", () => {
    expect(buildToolFallbackInstructions({})).toContain("(none)");
  });
});

describe("parseToolCalls", () => {
  it("```json bloğundaki tool_calls dizisini çözer", () => {
    const out = `Sure, I'll do that.
\`\`\`json
{"tool_calls":[{"name":"read_file","arguments":{"path":"a.ts"}}]}
\`\`\``;
    const calls = parseToolCalls(out);
    expect(calls).toEqual([{ name: "read_file", arguments: { path: "a.ts" } }]);
  });

  it("birden çok tool-call'ı korur", () => {
    const out = `\`\`\`json
{"tool_calls":[
  {"name":"a","arguments":{"x":1}},
  {"name":"b","arguments":{"y":2}}
]}
\`\`\``;
    const calls = parseToolCalls(out);
    expect(calls.map((c) => c.name)).toEqual(["a", "b"]);
    expect(calls[1].arguments).toEqual({ y: 2 });
  });

  it("fence olmadan da dengeli JSON nesnesini bulur", () => {
    const out = `here you go {"tool_calls":[{"name":"run_bash","arguments":{"command":"ls"}}]} thanks`;
    const calls = parseToolCalls(out);
    expect(calls).toEqual([
      { name: "run_bash", arguments: { command: "ls" } },
    ]);
  });

  it("alternatif alan adlarını (tool/args) ve string arguments'ı normalize eder", () => {
    const out = `\`\`\`json
{"tool_calls":[{"tool":"grep","args":"{\\"pattern\\":\\"foo\\"}"}]}
\`\`\``;
    const calls = parseToolCalls(out);
    expect(calls).toEqual([{ name: "grep", arguments: { pattern: "foo" } }]);
  });

  it("tek nesne şeklini de kabul eder", () => {
    const out = `\`\`\`json
{"name":"ls","arguments":{}}
\`\`\``;
    expect(parseToolCalls(out)).toEqual([{ name: "ls", arguments: {} }]);
  });

  it("tool-call yoksa boş dizi döner (düz metin)", () => {
    expect(parseToolCalls("Just a normal answer, no tools.")).toEqual([]);
    expect(parseToolCalls("")).toEqual([]);
  });

  it("bozuk JSON'da çökmeden boş dizi döner", () => {
    const out = "```json\n{ not valid json ,,, tool_calls }\n```";
    expect(parseToolCalls(out)).toEqual([]);
  });
});

describe("hasToolCall", () => {
  it("sentinel varlığını tespit eder", () => {
    expect(hasToolCall('x {"tool_calls":[]} y')).toBe(true);
    expect(hasToolCall("plain text")).toBe(false);
  });
});
