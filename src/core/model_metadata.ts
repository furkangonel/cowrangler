/**
 * Model metadata — context window boyutları, fiyatlandırma, özellikler.
 *
 * Fiyatlar USD/1M token cinsinden.
 * Son güncelleme: Temmuz 2026
 *
 * Bilinmeyen modeller için prefetchModelMeta() çağrısı OpenRouter API'den
 * metadata çeker ve ~/.cowrangler/cache/model_meta.json'a 24 saatlik cache yazar.
 */

import fs from "fs";
import os from "os";
import path from "path";
import yaml from "js-yaml";

export interface ModelMeta {
  contextWindow: number;       // max context tokens
  maxOutputTokens: number;     // max output tokens per response
  inputPricePerMToken: number; // USD / 1M input tokens
  outputPricePerMToken: number; // USD / 1M output tokens
  supportsThinking: boolean;   // extended thinking desteği
  supportsVision: boolean;     // görsel input desteği
  supportsCaching: boolean;    // prompt caching desteği
  /**
   * Native (provider-seviyesi) tool-calling desteği. Belirtilmezse
   * getModelCapabilities() sağlayıcıya göre türetir. `false` olan modeller
   * için ajan JSON tool-call fallback protokolüne düşer (tool_fallback.ts).
   */
  nativeToolCalling?: boolean;
  provider: string;
  displayName: string;
}

/**
 * Modelin tek-kaynak yetenek özeti. WP-6: hangi model bağlanırsa bağlansın
 * (Claude/GPT/Gemini/yerel) ajan davranışını bu bayraklara göre uyarlar.
 */
export interface ModelCapabilities {
  provider: string;
  displayName: string;
  contextWindow: number;
  supportsVision: boolean;
  supportsPromptCache: boolean;
  nativeToolCalling: boolean;
  supportsThinking: boolean;
  reasoningEffort: boolean; // effort/budget ayarlanabiliyor mu (thinking ile eş)
}

const MODEL_REGISTRY: Record<string, ModelMeta> = {
  // ── Anthropic ────────────────────────────────────────────────────────────
  "claude-fable-5": {
    contextWindow: 1_000_000, maxOutputTokens: 128_000,
    inputPricePerMToken: 10, outputPricePerMToken: 50,
    supportsThinking: true, supportsVision: true, supportsCaching: true,
    provider: "anthropic", displayName: "Claude Fable 5",
  },
  "claude-sonnet-5": {
    contextWindow: 1_000_000, maxOutputTokens: 128_000,
    inputPricePerMToken: 2, outputPricePerMToken: 10,
    supportsThinking: true, supportsVision: true, supportsCaching: true,
    provider: "anthropic", displayName: "Claude Sonnet 5",
  },
  "claude-opus-4-8": {
    contextWindow: 1_000_000, maxOutputTokens: 128_000,
    inputPricePerMToken: 5, outputPricePerMToken: 25,
    supportsThinking: true, supportsVision: true, supportsCaching: true,
    provider: "anthropic", displayName: "Claude Opus 4.8",
  },
  "claude-opus-4-7": {
    contextWindow: 1_000_000, maxOutputTokens: 128_000,
    inputPricePerMToken: 5, outputPricePerMToken: 25,
    supportsThinking: true, supportsVision: true, supportsCaching: true,
    provider: "anthropic", displayName: "Claude Opus 4.7",
  },
  "claude-opus-4-6": {
    contextWindow: 1_000_000, maxOutputTokens: 128_000,
    inputPricePerMToken: 15, outputPricePerMToken: 75,
    supportsThinking: true, supportsVision: true, supportsCaching: true,
    provider: "anthropic", displayName: "Claude Opus 4.6",
  },
  "claude-sonnet-4-6": {
    contextWindow: 1_000_000, maxOutputTokens: 128_000,
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
    contextWindow: 200_000, maxOutputTokens: 64_000,
    inputPricePerMToken: 1, outputPricePerMToken: 5,
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
  "gpt-5.5": {
    contextWindow: 1_050_000, maxOutputTokens: 100_000,
    inputPricePerMToken: 5, outputPricePerMToken: 30,
    supportsThinking: true, supportsVision: true, supportsCaching: true,
    provider: "openai", displayName: "GPT-5.5",
  },
  "gpt-5.4": {
    contextWindow: 1_050_000, maxOutputTokens: 100_000,
    inputPricePerMToken: 2.5, outputPricePerMToken: 15,
    supportsThinking: true, supportsVision: true, supportsCaching: true,
    provider: "openai", displayName: "GPT-5.4",
  },
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
  "gemini-3.5-flash": {
    contextWindow: 1_000_000, maxOutputTokens: 65_536,
    inputPricePerMToken: 0.075, outputPricePerMToken: 0.3,
    supportsThinking: true, supportsVision: true, supportsCaching: true,
    provider: "google", displayName: "Gemini 3.5 Flash",
  },
  "gemini-3.1-pro": {
    contextWindow: 1_000_000, maxOutputTokens: 65_536,
    inputPricePerMToken: 1.25, outputPricePerMToken: 10,
    supportsThinking: true, supportsVision: true, supportsCaching: true,
    provider: "google", displayName: "Gemini 3.1 Pro",
  },
  // Public generativelanguage API'de Pro'nun geçerli adı "-preview" ekli.
  "gemini-3.1-pro-preview": {
    contextWindow: 1_000_000, maxOutputTokens: 65_536,
    inputPricePerMToken: 1.25, outputPricePerMToken: 10,
    supportsThinking: true, supportsVision: true, supportsCaching: true,
    provider: "google", displayName: "Gemini 3.1 Pro",
  },
  "gemini-3.1-flash-lite": {
    contextWindow: 1_000_000, maxOutputTokens: 65_536,
    inputPricePerMToken: 0.02, outputPricePerMToken: 0.08,
    supportsThinking: false, supportsVision: true, supportsCaching: true,
    provider: "google", displayName: "Gemini 3.1 Flash-Lite",
  },
  "gemini-3.0-pro": {
    contextWindow: 1_000_000, maxOutputTokens: 65_536,
    inputPricePerMToken: 1.25, outputPricePerMToken: 10,
    supportsThinking: true, supportsVision: true, supportsCaching: true,
    provider: "google", displayName: "Gemini 3.0 Pro",
  },
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

  // ── Antigravity özel modeller ────────────────────────────────────────────
  "gpt-oss-120b": {
    contextWindow: 128_000, maxOutputTokens: 16_384,
    inputPricePerMToken: 0, outputPricePerMToken: 0,
    supportsThinking: false, supportsVision: false, supportsCaching: false,
    nativeToolCalling: false,
    provider: "antigravity", displayName: "GPT-OSS 120B",
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
  // Yerel modeller
  if (model.startsWith("ollama/") || model.startsWith("lmstudio/") || model.startsWith("local/")) {
    return {
      contextWindow: 128_000,
      maxOutputTokens: 8_192,
      inputPricePerMToken: 0,
      outputPricePerMToken: 0,
      supportsThinking: model.includes("thinking") || model.includes("reasoning") || model.includes("r1") || model.includes("deepseek"),
      supportsVision: model.includes("vision") || model.includes("llava") || model.includes("pixtral"),
      supportsCaching: false,
      // Yerel modeller (Ollama/LM Studio) native tool-calling'i güvenilir
      // desteklemez → ajan JSON fallback protokolünü kullanır.
      nativeToolCalling: false,
      provider: "local",
      displayName: model.split("/").slice(1).join("/") || model,
    };
  }

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

/**
 * Kullanıcının saved_models_meta'da belirttiği context window değerini
 * veya model registry'deki varsayılanı döndürür.
 */
export function getContextWindow(model: string): number {
  // 1. Kullanıcının config'te belirttiği özel context window
  const userCtx = _getUserContextWindow(model);
  if (userCtx) return userCtx;
  // 2. Registry'deki varsayılan
  return getModelMeta(model)?.contextWindow ?? 128_000;
}

/** ~/.cowrangler/config.yaml → saved_models_meta'dan kullanıcının girdiği context window. */
function _getUserContextWindow(model: string): number | null {
  try {
    const cfgPath = path.join(os.homedir(), ".cowrangler", "config.yaml");
    if (!fs.existsSync(cfgPath)) return null;
    const cfg = yaml.load(fs.readFileSync(cfgPath, "utf-8")) as any;
    const meta: Record<string, any> = cfg?.saved_models_meta;
    if (!meta || typeof meta !== "object") return null;
    const entry = meta[model];
    if (entry && typeof entry === "object" && typeof entry.contextWindow === "number" && entry.contextWindow > 0) {
      return entry.contextWindow;
    }
    return null;
  } catch { return null; }
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
  const norm = model.toLowerCase();
  
  // Explicitly check for known thinking models (including OpenRouter variants)
  if (
    norm.includes("deepseek-r1") || 
    norm.includes("deepseek/r1") ||
    norm.includes("o1-") || 
    norm.includes("o3-") || 
    norm.includes("claude-sonnet-4-6") || 
    norm.includes("claude-3.7-sonnet") ||
    norm.includes("thinking") ||
    norm.includes("reasoning")
  ) {
    return true;
  }
  
  return getModelMeta(model)?.supportsThinking ?? false;
}

/** Model prompt caching destekliyor mu? */
export function modelSupportsCaching(model: string): boolean {
  return getModelMeta(model)?.supportsCaching ?? false;
}

/**
 * Native tool-calling desteğini türetir. Meta'da açık bayrak varsa onu,
 * yoksa sağlayıcıya göre makul varsayılanı döndürür.
 * - Yerel modeller (ollama/lmstudio/local) → false (JSON fallback)
 * - antigravity / gpt-oss → false
 * - Bilinen bulut sağlayıcılar (anthropic/openai/google/groq/vertex/copilot/
 *   openrouter…) → true
 */
export function deriveNativeToolCalling(model: string, meta: ModelMeta | null): boolean {
  if (meta && typeof meta.nativeToolCalling === "boolean") return meta.nativeToolCalling;
  const m = model.toLowerCase();
  if (
    m.startsWith("ollama/") ||
    m.startsWith("lmstudio/") ||
    m.startsWith("local/") ||
    meta?.provider === "local"
  ) {
    return false;
  }
  if (meta?.provider === "antigravity" || m.includes("gpt-oss")) return false;
  return true;
}

/** Model native tool-calling destekliyor mu? (tek kaynak) */
export function modelSupportsNativeToolCalling(model: string): boolean {
  return deriveNativeToolCalling(model, getModelMeta(model));
}

/**
 * WP-6 tek-kaynak yetenek özeti. Ajan/llm/context_engine bu fonksiyondan
 * beslenir; model bilgisi tek yerde tutulur.
 */
export function getModelCapabilities(model: string): ModelCapabilities {
  const meta = getModelMeta(model);
  const thinking = modelSupportsThinking(model);
  return {
    provider: meta?.provider ?? "unknown",
    displayName: meta?.displayName ?? model,
    contextWindow: getContextWindow(model),
    supportsVision: meta?.supportsVision ?? false,
    supportsPromptCache: meta?.supportsCaching ?? false,
    nativeToolCalling: deriveNativeToolCalling(model, meta),
    supportsThinking: thinking,
    reasoningEffort: thinking,
  };
}

// ── OpenRouter metadata fetcher ───────────────────────────────────────────────

const CACHE_PATH = path.join(os.homedir(), ".cowrangler", "cache", "model_meta.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 saat

interface DiskCacheEntry extends ModelMeta {
  fetchedAt: number;
}

function _loadDiskCache(): Record<string, DiskCacheEntry> {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
    }
  } catch { /* sessizce devam */ }
  return {};
}

function _saveDiskCache(cache: Record<string, DiskCacheEntry>): void {
  try {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");
  } catch { /* sessizce devam */ }
}

/**
 * Bilinmeyen model için OpenRouter API'den metadata çeker ve yerel registry'e
 * + disk cache'e yazar. Zaten registry'de olanlar için no-op'tur.
 *
 * Çağrı: await prefetchModelMeta(configuration.model)
 *
 * Başarısız olursa (ağ yok, model bulunamadı vb.) sessizce geçer;
 * getContextWindow() standart 128k fallback'iyle çalışmaya devam eder.
 */
export async function prefetchModelMeta(modelName: string): Promise<void> {
  // Registry'de zaten varsa atla
  if (MODEL_REGISTRY[modelName] || MODEL_REGISTRY[normalizeModelKey(modelName)]) return;

  // OpenRouter modeli mi? (openrouter/ öneki veya bilinmeyen provider/model formatı)
  const knownPrefixes = ["anthropic/", "google/", "vertex/", "copilot/", "groq/", "ollama/", "lmstudio/", "local/"];
  const isKnownProvider = knownPrefixes.some((p) => modelName.startsWith(p));
  if (isKnownProvider) return; // Kendi registry'imizde olmayan bilinen provider → fallback yeterli

  // Model ID'sini normalize et (openrouter/ önekini kaldır)
  const cleanId = modelName.replace(/^openrouter\//, "");

  // Disk cache'e bak
  const diskCache = _loadDiskCache();
  const cached = diskCache[cleanId];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    MODEL_REGISTRY[modelName] = cached;
    return;
  }

  // OpenRouter API'den çek (auth opsiyonel — model listesi herkese açık)
  const apiKey = process.env.OPENROUTER_API_KEY;
  const headers: Record<string, string> = {
    "HTTP-Referer": "https://github.com/co-wrangler/co-wrangler",
  };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", { headers });
    if (!res.ok) return;

    const json = (await res.json()) as { data: any[] };
    // Model ID'ye göre ara (hem "owl-alpha" hem "openrouter/owl-alpha" formatını dene)
    const found = json.data.find(
      (m: any) => m.id === cleanId || m.id === modelName || m.id === `openrouter/${cleanId}`,
    );
    if (!found) return;

    // OpenRouter pricing: USD/token → USD/1M token
    const inputPrice  = parseFloat(found.pricing?.prompt      ?? "0") * 1_000_000;
    const outputPrice = parseFloat(found.pricing?.completion  ?? "0") * 1_000_000;

    // Vision desteği: mimari modality'e bakarak tespit et
    const modality: string = found.architecture?.modality ?? "";
    const supportsVision = modality.includes("image") || modality.startsWith("multimodal");

    // OpenRouter, tool desteğini supported_parameters listesinde bildirir.
    const supportedParams: string[] = Array.isArray(found.supported_parameters)
      ? found.supported_parameters
      : [];
    const nativeToolCalling = supportedParams.includes("tools");

    const entry: ModelMeta = {
      contextWindow:        found.context_length                       ?? 128_000,
      maxOutputTokens:      found.top_provider?.max_completion_tokens  ?? 4_096,
      inputPricePerMToken:  inputPrice,
      outputPricePerMToken: outputPrice,
      supportsThinking:     false,
      supportsVision,
      supportsCaching:      false,
      nativeToolCalling,
      provider:             "openrouter",
      displayName:          found.name ?? cleanId,
    };

    // Hem orijinal isim hem clean ID ile kaydet
    MODEL_REGISTRY[modelName] = entry;
    MODEL_REGISTRY[cleanId]   = entry;

    // Disk cache'e yaz
    diskCache[cleanId] = { ...entry, fetchedAt: Date.now() };
    _saveDiskCache(diskCache);
  } catch { /* ağ hatası vb. → sessizce geç, fallback çalışır */ }
}
