import { describe, it, expect, vi } from "vitest";
import { getModelMeta, classifyProviderAuth } from "@cowrangler/core/model_metadata.js";
import { providerOf, buildCatalog } from "@cowrangler/core/model/catalog.js";
import { makeModel } from "@cowrangler/core/model/driver.js";
import { PROVIDERS } from "@cowrangler/core/model/driver.js";

describe("Data-driven Provider Catalog", () => {
  it("providers.json schema is valid", () => {
    expect(PROVIDERS.length).toBeGreaterThan(0);
    for (const p of PROVIDERS) {
      expect(p.id).toBeTypeOf("string");
      expect(p.wire).toBeTypeOf("string");
      expect(p.base_url).toBeTypeOf("string");
      expect(Array.isArray(p.env)).toBe(true);
    }
  });

  it("providerOf correctly extracts prefix", () => {
    expect(providerOf("anthropic/claude-sonnet")).toBe("anthropic");
    expect(providerOf("openai/gpt-4o")).toBe("openai");
    expect(providerOf("google/gemini")).toBe("google");
    expect(providerOf("unknown/model")).toBe("openrouter");
    expect(providerOf("gpt-4o")).toBe("openai");
  });

  it("getModelMeta never returns null", () => {
    const meta = getModelMeta("some/weird-model");
    expect(meta).toBeDefined();
    expect(meta.id).toBe("openrouter/weird-model");
    expect(meta.contextWindow).toBe(128000);
  });

  it("getModelMeta synthesizes thinking correctly", () => {
    const meta1 = getModelMeta("openai/o1-preview");
    expect(meta1.supportsThinking).toBe(true);
    
    const meta2 = getModelMeta("anthropic/claude");
    expect(meta2.supportsThinking).toBe(false);
  });

  it("classifyProviderAuth offline checks env vars", () => {
    const env = { OPENAI_API_KEY: "sk-123" };
    expect(classifyProviderAuth("openai/gpt-4o", env)).toEqual({ kind: "ok" });
    expect(classifyProviderAuth("anthropic/claude-3", env)).toEqual({ kind: "missing", env: "ANTHROPIC_API_KEY" });
  });

  it("makeModel creates language model instances based on driver config", () => {
    const env = { OPENAI_API_KEY: "sk-123", GROQ_API_KEY: "gsk-123" };
    
    // Will not throw because API key is present
    const openaiModel = makeModel("gpt-4o", "openai", env);
    expect(openaiModel).toBeDefined();

    const groqModel = makeModel("llama3", "groq", env);
    expect(groqModel).toBeDefined();

    // Throws because anthropic key is missing
    expect(() => makeModel("claude", "anthropic", env)).toThrow(/MISSING_KEY/);
  });
});
