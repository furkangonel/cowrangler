import { fetchModelsDev, ModelDevMeta } from "./models_dev.js";
import { discoverAll, discover, type CustomProviderConfig } from "./discover.js";
import { PROVIDERS } from "./driver.js";
import { getConfig } from "../init.js";
import { getLogger } from "../logger.js";

export const MODEL_CATALOG_PRECEDENCE = [
  "discovery-availability",
  "models.dev-metadata",
  "synthesized-defaults",
] as const;

export type ModelMetadataSource = "models.dev" | "synthesized";

export interface ModelInfo {
  id: string; // the fully qualified id, e.g. "openai/gpt-4o" or just "gpt-4o" if we prefer. 
              // To maintain backward compatibility, let's keep the format the picker expects
              // Actually, the previous implementation used `prefix/model` or just `model` if builtin like claude-sonnet-5.
              // Let's use `providerId/modelId` uniformly for custom and unknown, but allow clean matching.
  bareId: string;
  provider: string;
  displayName: string;
  contextWindow: number;
  maxOutputTokens: number;
  inputPricePerMToken: number;
  outputPricePerMToken: number;
  supportsThinking: boolean;
  supportsVision: boolean;
  supportsCaching: boolean;
  nativeToolCalling: boolean;
  metadataSource: ModelMetadataSource;
}

function isCustomProviderMap(value: unknown): value is Record<string, CustomProviderConfig> {
  if (!value || typeof value !== "object") return false;
  return Object.values(value).every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const provider = entry as Partial<CustomProviderConfig>;
    return typeof provider.base_url === "string";
  });
}

function getCustomProviders(): Record<string, CustomProviderConfig> {
  try {
    const config = getConfig() as { custom_providers?: unknown };
    const cp = config.custom_providers;
    return isCustomProviderMap(cp) ? cp : {};
  } catch {
    return {};
  }
}

let catalogCache: ModelInfo[] = [];
let catalogCacheTime = 0;
const CATALOG_TTL_MS = 5 * 60 * 1000; // 5 min cache for the union merge

/** 
 * Synthesize default metadata for a model discovered dynamically 
 * but missing from models.dev 
 */
function synthesizeDefaultMeta(bareId: string, provider: string): ModelInfo {
  const norm = bareId.toLowerCase();
  const isThinking = norm.includes("thinking") || norm.includes("reasoning") || norm.includes("r1") || norm.includes("o1") || norm.includes("o3");
  const isVision = norm.includes("vision") || norm.includes("llava") || norm.includes("pixtral");
  const isLocal = provider === "ollama" || provider === "lmstudio" || provider === "local";

  return {
    id: `${provider}/${bareId}`,
    bareId,
    provider,
    displayName: `${provider} ${bareId}`,
    contextWindow: 128000,
    maxOutputTokens: 8192,
    inputPricePerMToken: 0,
    outputPricePerMToken: 0,
    supportsThinking: isThinking,
    supportsVision: isVision,
    supportsCaching: false,
    nativeToolCalling: !isLocal, // Local usually doesn't have reliable tools
    metadataSource: "synthesized",
  };
}

/**
 * Union merge of Discover and ModelsDev
 */
export async function buildCatalog(env: NodeJS.ProcessEnv = process.env, forceRefresh = false): Promise<ModelInfo[]> {
  if (!forceRefresh && Date.now() - catalogCacheTime < CATALOG_TTL_MS && catalogCache.length > 0) {
    return catalogCache;
  }

  const customProviders = getCustomProviders();
  const [discoveredMap, devMetaList] = await Promise.all([
    discoverAll(env, customProviders),
    fetchModelsDev()
  ]);

  const devMetaMap = new Map<string, ModelDevMeta>();
  for (const meta of devMetaList) {
    devMetaMap.set(meta.id, meta);
  }

  const result: ModelInfo[] = [];
  let modelsDevMetadataCount = 0;
  let synthesizedMetadataCount = 0;

  for (const [provider, modelIds] of Object.entries(discoveredMap)) {
    for (const bareId of modelIds) {
      // openrouter includes the provider in the id (e.g. anthropic/claude-3-5-sonnet)
      const cleanId = provider === "openrouter" ? bareId : bareId.replace(`${provider}/`, "");
      
      const devMeta = devMetaMap.get(cleanId) || devMetaMap.get(bareId);

      if (devMeta) {
        modelsDevMetadataCount += 1;
        // We found metadata!
        const inputPrice = parseFloat(String(devMeta.pricing?.prompt || "0")) * 1_000_000;
        const outputPrice = parseFloat(String(devMeta.pricing?.completion || "0")) * 1_000_000;
        const modality = devMeta.architecture?.modality || "";
        const supportsVision = modality.includes("image") || modality.startsWith("multimodal");
        const supportedParams = Array.isArray(devMeta.supported_parameters) ? devMeta.supported_parameters : [];
        const nativeToolCalling = supportedParams.includes("tools");
        const norm = cleanId.toLowerCase();
        const supportsThinking = norm.includes("thinking") || norm.includes("reasoning") || norm.includes("r1") || norm.includes("o1") || norm.includes("o3");

        result.push({
          id: `${provider}/${cleanId}`,
          bareId: cleanId,
          provider,
          displayName: devMeta.name || cleanId,
          contextWindow: devMeta.context_length || 128000,
          maxOutputTokens: devMeta.max_completion_tokens || 8192,
          inputPricePerMToken: inputPrice,
          outputPricePerMToken: outputPrice,
          supportsThinking,
          supportsVision,
          supportsCaching: false, // We can't reliably know caching from standard models.dev schema yet
          nativeToolCalling,
          metadataSource: "models.dev",
        });
      } else {
        // Discovered but no metadata -> synthesize
        synthesizedMetadataCount += 1;
        result.push(synthesizeDefaultMeta(cleanId, provider));
      }
    }
  }

  // If a model is in models.dev but NOT discovered, we hide it (do not add to result).
  // This satisfies "models.dev'de var, discover'da yok -> gizle".

  // Hardcode some known antigravity specials if needed, but the plan says everything data-driven.
  // We'll trust discovery.

  getLogger().debug("agent", "Built model catalog", {
    precedence: MODEL_CATALOG_PRECEDENCE.join(" > "),
    discoveredProviders: Object.keys(discoveredMap).length,
    discoveredModels: result.length,
    modelsDevMetadata: modelsDevMetadataCount,
    synthesizedMetadata: synthesizedMetadataCount,
  });

  catalogCache = result;
  catalogCacheTime = Date.now();
  return result;
}

/**
 * Returns the full list of models (used by ModelPicker)
 */
export async function listModels(): Promise<ModelInfo[]> {
  return buildCatalog();
}

/**
 * Determines the provider for a given full model ID.
 * Tries to extract from `provider/model` prefix.
 * If no prefix, falls back to openrouter or default based on logic.
 */
export function providerOf(modelId: string): string {
  const parts = modelId.split("/");
  if (parts.length > 1) {
    const prefix = parts[0];
    const customProviders = getCustomProviders();
    if (PROVIDERS.find(p => p.id === prefix) || customProviders[prefix]) {
      return prefix;
    }
  }
  // If it has a slash but prefix is unknown, fallback to openrouter.
  // E.g. `anthropic/claude-3` will go to openrouter if `anthropic` provider isn't configured, 
  // but wait, `anthropic` is in providers.json.
  if (modelId.includes("/")) return "openrouter";

  // For models with no slash (e.g. gpt-4o), they should ideally be specified as openai/gpt-4o
  // But if not, we can default to openrouter or openai
  return "openai";
}

/**
 * Get synthesized metadata synchronously if it's not in the cache, to ensure getModelMeta never returns null.
 */
export function getModelMetaSync(modelId: string): ModelInfo {
  // Try to find in cache first
  const found = catalogCache.find(m => m.id === modelId || m.bareId === modelId);
  if (found) return found;

  const provider = providerOf(modelId);
  let bareId = modelId;
  if (bareId.startsWith(`${provider}/`)) {
    bareId = bareId.slice(provider.length + 1);
  }

  return synthesizeDefaultMeta(bareId, provider);
}

/**
 * Forces a refresh of the catalog (e.g. when keys change)
 */
export async function refreshCatalog(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await buildCatalog(env, true);
}
