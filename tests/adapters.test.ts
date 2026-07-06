import { describe, it, expect } from "vitest";
import { createAdapter, createAllAdapters, INTERFACE_POLICIES } from "@cowrangler/adapter-cli/interface_adapters.js";
import type { CoreServices } from "@cowrangler/adapter-cli/core_facade.js";

function fakeCore(): { core: CoreServices; captured: { last?: any } } {
  const captured: { last?: any } = {};
  const core = {
    model: {} as any,
    context: {} as any,
    agent: {
      runTurn: async (o: any) => {
        captured.last = o;
        return { finalText: "ok", inputTokens: 0, outputTokens: 0, totalTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, responseMessages: [], toolCalls: [], finishReason: "stop" } as any;
      },
      generateOnce: async () => "",
    },
  } as CoreServices;
  return { core, captured };
}

describe("interface adapters", () => {
  it("her arayüz kendi politikasını taşır", () => {
    expect(createAdapter("cli").policy.thinkingDefault).toBe(false);
    expect(createAdapter("cowork").policy.thinkingDefault).toBe(true);
    expect(createAdapter("design").policy.tools).toContain("read_file");
    expect(createAdapter("code").policy.tools).toBe("*");
  });

  it("design/cowork/code turu thinking varsayılanını enjekte eder", async () => {
    const { core, captured } = fakeCore();
    const design = createAdapter("design", core);
    await design.runTurn({ modelId: "m", system: "", history: [], tools: {}, maxSteps: 1 });
    expect(captured.last.thinking).toEqual({ enabled: true });
  });

  it("cli turu thinking'i açmaz (hız)", async () => {
    const { core, captured } = fakeCore();
    const cli = createAdapter("cli", core);
    await cli.runTurn({ modelId: "m", system: "", history: [], tools: {}, maxSteps: 1 });
    expect(captured.last.thinking).toBeUndefined();
  });

  it("çağıran thinking'i açıkça verirse politikayı ezer", async () => {
    const { core, captured } = fakeCore();
    const cli = createAdapter("cli", core);
    await cli.runTurn({ modelId: "m", system: "", history: [], tools: {}, maxSteps: 1, thinking: { enabled: true, budgetTokens: 3000 } });
    expect(captured.last.thinking).toEqual({ enabled: true, budgetTokens: 3000 });
  });

  it("createAllAdapters tek core üstünde dört yüzeyi kurar", () => {
    const all = createAllAdapters();
    expect(Object.keys(all).sort()).toEqual(["cli", "code", "cowork", "design"]);
    // hepsi aynı core facade'ı paylaşır
    expect(all.cli.core).toBe(all.design.core);
  });

  it("INTERFACE_POLICIES dört arayüzü kapsar", () => {
    expect(Object.keys(INTERFACE_POLICIES).sort()).toEqual(["cli", "code", "cowork", "design"]);
  });
});
