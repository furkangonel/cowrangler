import { describe, it, expect } from "vitest";
import { toAnthropicBody } from "@cowrangler/core/model/native/anthropic.js";
import { toOpenAIBody } from "@cowrangler/core/model/native/openai.js";
import { toGeminiBody } from "@cowrangler/core/model/native/gemini.js";
import type { ChatRequest } from "@cowrangler/core/model/native/types.js";

const base: ChatRequest = { model: "m", messages: [{ role: "user", content: "hi" }] };

describe("thinking → wire eşlemesi", () => {
  it("anthropic: thinking bloğu + budget'tan büyük max_tokens + temperature düşer", () => {
    const b = toAnthropicBody({ ...base, temperature: 0.7, maxTokens: 2000, thinking: { enabled: true, budgetTokens: 5000 } }) as any;
    expect(b.thinking).toEqual({ type: "enabled", budget_tokens: 5000 });
    expect(b.max_tokens).toBe(5000 + 1024); // budget+1024 (2000'den büyük)
    expect(b.temperature).toBeUndefined(); // thinking açıkken temperature yok
  });

  it("anthropic: thinking kapalıyken temperature korunur, thinking yok", () => {
    const b = toAnthropicBody({ ...base, temperature: 0.5 }) as any;
    expect(b.thinking).toBeUndefined();
    expect(b.temperature).toBe(0.5);
  });

  it("openai: budget → reasoning_effort", () => {
    expect((toOpenAIBody({ ...base, thinking: { enabled: true, budgetTokens: 5000 } }) as any).reasoning_effort).toBe("high");
    expect((toOpenAIBody({ ...base, thinking: { enabled: true, budgetTokens: 3000 } }) as any).reasoning_effort).toBe("medium");
    expect((toOpenAIBody({ ...base, thinking: { enabled: true, budgetTokens: 1000 } }) as any).reasoning_effort).toBe("low");
    expect((toOpenAIBody(base) as any).reasoning_effort).toBeUndefined();
  });

  it("gemini: thinkingConfig.thinkingBudget", () => {
    const g = toGeminiBody({ ...base, thinking: { enabled: true, budgetTokens: 4096 } }) as any;
    expect(g.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 4096 });
    expect((toGeminiBody(base) as any).generationConfig.thinkingConfig).toBeUndefined();
  });
});
