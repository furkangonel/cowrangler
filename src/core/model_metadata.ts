/**
 * Model metadata — context window boyutları, fiyatlandırma, özellikler.
 *
 * Fiyatlar USD/1M token cinsinden.
 * Son güncelleme: Mayıs 2026
 */

export interface ModelMeta {
  contextWindow: number;       // max context tokens
  maxOutputTokens: number;     // max output tokens per response
  inputPricePerMToken: number; // USD / 1M input tokens
  outputPricePerMToken: number; // USD / 1M output tokens
  supportsThinking: boolean;   // extended thinking desteği
  supportsVision: boolean;     // görsel input desteği
  supportsCaching: boolean;    // prompt caching desteği
  provider: string;
  displayName: string;
}

const MODEL_REGISTRY: Record<string, ModelMeta> = {
  // ── Anthropic ────────────────────────────────────────────────────────────
  "claude-opus-4-6": {
    contextWindow: 200_000, maxOutputTokens: 32_000,
    inputPricePerMToken: 15, outputPricePerMToken: 75,
    supportsThinking: true, supportsVision: true, supportsCaching: true,
    provider: "anthropic", displayName: "Claude Opus 4.6",
  },
  "claude-sonnet-4-6": {
    contextWindow: 200_000, maxOutputTokens: 16_000,
    inputPricePerMToken: 3, outputPricePerMToken: 15,
    supportsThinking: true, supportsVision: true, supportsCaching: true,
    provider: "anthropic", displayName: "Claude Sonnet 4.6",
  },
  "claude-sonnet-4-5": {
    contextWindow: 200_000, maxOutputTokens: 16_000,
    inputPricePerMToken: 3, outputPricePerMToken: 15,
    supportsThinking: false, supportsVision: true, supportsCaching: true,
    provider: "anthropic", displayName: "Claude Sonnet 4.5",
  },
  "claude-haiku-4-5": {
    contextWindow: 200_000, maxOutputTokens: 8_000,
    inputPricePerMToken: 0.25, outputPricePerMToken: 1.25,
    supportsThinking: false, supportsVision: true, supportsCaching: true,
    provider: "anthropic", displayName: "Claude Haiku 4.5",
  },
  "claude-opus-4-5": {
    contextWindow: 200_000, maxOutputTokens: 32_000,
    inputPricePerMToken: 15, outputPricePerMToken: 75,
    supportsThinking: true, supportsVision: true, supportsCaching: true,
    provider: "anthropic", displayName: "Claude Opus 4.5",
  },

  // ── OpenAI ───────────────────────────────────────────────────────────────
  "gpt-4o": {
    contextWindow: 128_000, maxOutputTokens: 16_384,
    inputPricePerMToken: 2.5, outputPricePerMToken: 10,
    supportsThinking: false, supportsVision: true, supportsCaching: true,
    provider: "openai", displayName: "GPT-4o",
  },
  "gpt-4o-mini": {
    contextWindow: 128_000, maxOutputTokens: 16_384,
    inputPricePerMToken: 0.15, outputPricePerMToken: 0.6,
    supportsThinking: false, supportsVision: true, supportsCaching: true,
    provider: "openai", displayName: "GPT-4o mini",
  },
  "o3": {
    contextWindow: 200_000, maxOutputTokens: 100_000,
    inputPricePerMToken: 10, outputPricePerMToken: 40,
    supportsThinking: true, supportsVision: true, supportsCaching: false,
    provider: "openai", displayName: "o3",
  },
  "o4-mini": {
    contextWindow: 200_000, maxOutputTokens: 100_000,
    inputPricePerMToken: 1.1, outputPricePerMToken: 4.4,
    supportsThinking: true, supportsVision: true, supportsCaching: false,
    provider: "openai", displayName: "o4-mini",
  },

  // ── Google Gemini ─────────────────────────────────────────────────────────
  "gemini-2.5-pro": {
    contextWindow: 1_000_000, maxOutputTokens: 65_536,
    inputPricePerMToken: 1.25, outputPricePerMToken: 10,
    supportsThinking: true, supportsVision: true, supportsCaching: true,
    provider: "google", displayName: "Gemini 2.5 Pro",
  },
  "gemini-2.5-flash": {
    contextWindow: 1_000_000, maxOutputTokens: 65_536,
    inputPricePerMToken: 0.075, outputPricePerMToken: 0.3,
    supportsThinking: true, supportsVision: true, supportsCaching: true,
    provider: "google", displayName: "Gemini 2.5 Flash",
  },
  "gemini-2.0-flash": {
    contextWindow: 1_000_000, maxOutputTokens: 8_192,
    inputPricePerMToken: 0.1, outputPricePerMToken: 0.4,
    supportsThinking: false, supportsVision: true, supportsCaching: false,
    provider: "google", displayName: "Gemini 2.0 Flash",
  },

  // ── Groq ─────────────────────────────────────────────────────────────────
  "groq/llama-3.3-70b-versatile": {
    contextWindow: 128_000, maxOutputTokens: 32_768,
    inputPricePerMToken: 0.59, outputPricePerMToken: 0.79,
    supportsThinking: false, supportsVision: false, supportsCaching: false,
    provider: "groq", displayName: "Llama 3.3 70B",
  },
  "groq/llama-3.1-8b-instant": {
    contextWindow: 128_000, maxOutputTokens: 8_192,
    inputPricePerMToken: 0.05, outputPricePerMToken: 0.08,
    supportsThinking: false, supportsVision: false, supportsCaching: false,
    provider: "groq", displayName: "Llama 3.1 8B",
  },
};

// OpenRouter prefix'ini normalize et
function normalizeModelKey(model: string): string {
  return model.replace(/^openrouter\//, "").replace(/^google\//, "gemini-").replace(/^anthropic\//, "");
}

export function getModelMeta(model: string): ModelMeta | null {
  // Doğrudan eşleşme
  if (MODEL_REGISTRY[model]) return MODEL_REGISTRY[model];

  // Normalize edilmiş eşleşme
  const normalized = normalizeModelKey(model);
  if (MODEL_REGISTRY[normalized]) return MODEL_REGISTRY[normalized];

  // Prefix tabanlı tahmini eşleşme
  for (const [key, meta] of Object.entries(MODEL_REGISTRY)) {
    if (model.includes(key) || key.includes(normalized)) return meta;
  }

  return null;
}

export function getContextWindow(model: string): number {
  return getModelMeta(model)?.contextWindow ?? 128_000;
}

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const meta = getModelMeta(model);
  if (!meta) return 0;
  return (
    (inputTokens / 1_000_000) * meta.inputPricePerMToken +
    (outputTokens / 1_000_000) * meta.outputPricePerMToken
  );
}

export function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

/** Model extended thinking destekliyor mu? */
export function modelSupportsThinking(model: string): boolean {
  return getModelMeta(model)?.supportsThinking ?? false;
}

/** Model prompt caching destekliyor mu? */
export function modelSupportsCaching(model: string): boolean {
  return getModelMeta(model)?.supportsCaching ?? false;
}
