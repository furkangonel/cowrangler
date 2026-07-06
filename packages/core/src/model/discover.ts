import { PROVIDERS, ProviderRow, resolveProviderToken } from "./driver.js";

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface DiscoverCacheEntry {
  fetchedAt: number;
  models: string[];
}

const discoverCache: Record<string, DiscoverCacheEntry> = {};

// We can clear the cache when a new key is added
export function clearDiscoverCache(providerId?: string) {
  if (providerId) {
    delete discoverCache[providerId];
  } else {
    for (const key of Object.keys(discoverCache)) {
      delete discoverCache[key];
    }
  }
}

/**
 * Discovers available models for a given provider.
 * Returns an array of model IDs.
 */
export async function discover(
  providerId: string,
  env: NodeJS.ProcessEnv,
  customProviders: Record<string, { base_url: string; api_key_env?: string; headers?: Record<string, string> }> = {}
): Promise<string[]> {
  // Check cache
  const cached = discoverCache[providerId];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.models;
  }

  let row = PROVIDERS.find((p) => p.id === providerId);
  let baseURL = "";
  let apiKey = "";
  let modelsUrl = "/models";
  let customHeaders: Record<string, string> | undefined;

  if (row) {
    baseURL = row.base_url;
    if (row.env_override && env[row.env_override]) {
      baseURL = env[row.env_override]!;
    }
    modelsUrl = row.models_url || "/models";
    if (row.id !== "ollama" && row.id !== "lmstudio" && row.id !== "local") {
      apiKey = resolveProviderToken(row, env) || "";
      if (!apiKey) {
         // No API key, cannot discover
         return [];
      }
    }
  } else if (customProviders[providerId]) {
    const custom = customProviders[providerId];
    baseURL = custom.base_url;
    apiKey = custom.api_key_env ? env[custom.api_key_env] || "" : "";
    customHeaders = custom.headers;
    if (custom.api_key_env && !apiKey) {
      return [];
    }
  } else {
    // Unknown provider
    return [];
  }

  // Remove trailing slash from base url
  if (baseURL.endsWith("/")) {
    baseURL = baseURL.slice(0, -1);
  }

  // Certain providers might have different discovery endpoints, 
  // but mostly they follow OpenAI's /v1/models pattern.
  const fetchUrl = `${baseURL}${modelsUrl}`;

  try {
    const headers: Record<string, string> = { ...customHeaders };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const res = await fetch(fetchUrl, { headers });
    if (!res.ok) {
      return [];
    }
    const json = await res.json();
    let models: string[] = [];

    // Most follow { data: [{ id: "model-name" }] }
    if (json && Array.isArray(json.data)) {
      models = json.data.map((m: any) => m.id).filter(Boolean);
    } else if (json && Array.isArray(json.models)) {
      models = json.models.map((m: any) => m.name || m.id).filter(Boolean);
    } else if (Array.isArray(json)) {
      models = json.map((m: any) => m.id || m.name || m).filter(Boolean);
    }

    // Special case handling for providers that return different structures can be added here
    // e.g. Anthropic's models endpoint structure (if they had one). Anthropic doesn't have a standard /models endpoint right now,
    // so we might just return an empty array and rely on models_dev.

    discoverCache[providerId] = {
      fetchedAt: Date.now(),
      models
    };

    return models;
  } catch (err) {
    console.error(`Discover failed for ${providerId}:`, err);
    return [];
  }
}

/**
 * Discover models for all configured providers.
 */
export async function discoverAll(
  env: NodeJS.ProcessEnv,
  customProviders: Record<string, { base_url: string; api_key_env?: string; headers?: Record<string, string> }> = {}
): Promise<Record<string, string[]>> {
  const allProviders = [
    ...PROVIDERS.map(p => p.id),
    ...Object.keys(customProviders)
  ];

  const results: Record<string, string[]> = {};
  await Promise.all(
    allProviders.map(async (pid) => {
      const models = await discover(pid, env, customProviders);
      if (models.length > 0) {
        results[pid] = models;
      }
    })
  );

  return results;
}
