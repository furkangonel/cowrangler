/**
 * Tool Registry — birim testleri
 */

import { describe, it, expect, beforeEach } from "vitest";

// Tool registry doğrudan test edilir
// (Gerçek tool'lar side-effect import'ları — burada sadece kayıt mekanizmasını test ediyoruz)

interface MockTool {
  name: string;
  description: string;
  parameters: object;
}

// ToolRegistry'nin temel mantığını simüle eden in-memory registry
class InMemoryToolRegistry {
  private schemas: Record<string, MockTool> = {};
  private handlers: Record<string, (args: any) => unknown> = {};

  register(schema: MockTool, handler: (args: any) => unknown): void {
    this.schemas[schema.name] = schema;
    this.handlers[schema.name] = handler;
  }

  getSchema(name: string): MockTool | undefined {
    return this.schemas[name];
  }

  async execute(name: string, args: any): Promise<unknown> {
    const handler = this.handlers[name];
    if (!handler) throw new Error(`Tool '${name}' not found`);
    return handler(args);
  }

  get toolNames(): string[] {
    return Object.keys(this.schemas);
  }
}

describe("Tool Registry", () => {
  let registry: InMemoryToolRegistry;

  beforeEach(() => {
    registry = new InMemoryToolRegistry();
  });

  it("registers a tool and retrieves its schema", () => {
    registry.register(
      {
        name: "test_tool",
        description: "A test tool",
        parameters: { type: "object", properties: { input: { type: "string" } } },
      },
      (args) => `result: ${args.input}`,
    );

    const schema = registry.getSchema("test_tool");
    expect(schema).toBeDefined();
    expect(schema?.name).toBe("test_tool");
    expect(schema?.description).toBe("A test tool");
  });

  it("executes a registered tool with correct args", async () => {
    registry.register(
      { name: "echo", description: "Echo tool", parameters: {} },
      (args) => `echo: ${args.message}`,
    );

    const result = await registry.execute("echo", { message: "hello" });
    expect(result).toBe("echo: hello");
  });

  it("throws when executing an unknown tool", async () => {
    await expect(registry.execute("nonexistent", {})).rejects.toThrow(
      "Tool 'nonexistent' not found",
    );
  });

  it("lists all registered tool names", () => {
    registry.register({ name: "tool_a", description: "", parameters: {} }, () => null);
    registry.register({ name: "tool_b", description: "", parameters: {} }, () => null);
    registry.register({ name: "tool_c", description: "", parameters: {} }, () => null);

    expect(registry.toolNames).toHaveLength(3);
    expect(registry.toolNames).toContain("tool_a");
    expect(registry.toolNames).toContain("tool_b");
    expect(registry.toolNames).toContain("tool_c");
  });

  it("overwrites a tool when registered with the same name", () => {
    registry.register({ name: "dup", description: "v1", parameters: {} }, () => "v1");
    registry.register({ name: "dup", description: "v2", parameters: {} }, () => "v2");

    const schema = registry.getSchema("dup");
    expect(schema?.description).toBe("v2");
    expect(registry.toolNames).toHaveLength(1);
  });

  it("returns undefined for unregistered schema", () => {
    expect(registry.getSchema("missing")).toBeUndefined();
  });

  it("supports async tool handlers", async () => {
    registry.register(
      { name: "async_tool", description: "Async", parameters: {} },
      async (args) => {
        await new Promise((r) => setTimeout(r, 10));
        return `async: ${args.value}`;
      },
    );

    const result = await registry.execute("async_tool", { value: "world" });
    expect(result).toBe("async: world");
  });
});
