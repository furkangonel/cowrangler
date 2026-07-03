/**
 * Model-agnostik yetenek katmanı — birim testleri (WP-6).
 */

import { describe, it, expect } from "vitest";
import {
  getModelCapabilities,
  modelSupportsNativeToolCalling,
  deriveNativeToolCalling,
  getModelMeta,
} from "../src/core/model_metadata.js";
import { computeCompressThreshold } from "../src/core/context_engine.js";

describe("getModelCapabilities", () => {
  it("Claude için tam yetenek seti döner (tek kaynak)", () => {
    const caps = getModelCapabilities("claude-opus-4-8");
    expect(caps.provider).toBe("anthropic");
    expect(caps.supportsPromptCache).toBe(true);
    expect(caps.nativeToolCalling).toBe(true);
    expect(caps.supportsVision).toBe(true);
    expect(caps.contextWindow).toBeGreaterThan(0);
  });

  it("bilinmeyen model için güvenli varsayılan döner", () => {
    const caps = getModelCapabilities("some-unknown-model-xyz");
    expect(caps.provider).toBe("unknown");
    expect(caps.contextWindow).toBe(128_000);
    expect(caps.supportsPromptCache).toBe(false);
  });
});

describe("native tool-calling türetimi", () => {
  it("yerel Ollama modeli native tool-calling DESTEKLEMEZ → JSON fallback", () => {
    expect(modelSupportsNativeToolCalling("ollama/llama3.1")).toBe(false);
    expect(getModelCapabilities("ollama/llama3.1").nativeToolCalling).toBe(false);
  });

  it("lmstudio/local önekleri de false", () => {
    expect(modelSupportsNativeToolCalling("lmstudio/qwen")).toBe(false);
    expect(modelSupportsNativeToolCalling("local/foo")).toBe(false);
  });

  it("bulut sağlayıcılar (openai/google) native destekler", () => {
    expect(modelSupportsNativeToolCalling("gpt-5.5")).toBe(true);
    expect(modelSupportsNativeToolCalling("gemini-3.1-pro")).toBe(true);
  });

  it("gpt-oss ve antigravity native desteklemez", () => {
    expect(modelSupportsNativeToolCalling("gpt-oss-120b")).toBe(false);
  });

  it("meta'daki açık bayrak türetimi ezer", () => {
    const meta = getModelMeta("gpt-5.5");
    expect(deriveNativeToolCalling("gpt-5.5", { ...meta!, nativeToolCalling: false })).toBe(false);
  });
});

describe("computeCompressThreshold (adaptif eşik)", () => {
  it("büyük pencerede yapılandırılmış base'i korur", () => {
    expect(computeCompressThreshold(0.85, 1_000_000)).toBeCloseTo(0.85, 5);
    expect(computeCompressThreshold(0.85, 200_000)).toBeCloseTo(0.85, 5);
  });

  it("küçük pencerede daha erken sıkıştırır (base'in altına iner)", () => {
    const t128 = computeCompressThreshold(0.85, 128_000);
    expect(t128).toBeLessThan(0.85);
    expect(t128).toBeGreaterThan(0.5);
  });

  it("çok küçük pencerede %50 tabanına iner", () => {
    expect(computeCompressThreshold(0.85, 8_000)).toBe(0.5);
  });

  it("geçersiz pencere değerinde base'i döner", () => {
    expect(computeCompressThreshold(0.85, 0)).toBe(0.85);
    expect(computeCompressThreshold(0.85, NaN)).toBe(0.85);
  });

  it("base'in üstüne asla çıkmaz", () => {
    expect(computeCompressThreshold(0.7, 1_000_000)).toBeCloseTo(0.7, 5);
  });
});
