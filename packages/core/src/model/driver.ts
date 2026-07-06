import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getSecret } from "../credential_vault.js";
import type { ResolvedEndpoint } from "./native/types.js";
import { PluginManager } from "../plugins.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ProviderRow {
  id: string;
  wire: string;
  base_url: string;
  env: string[];
  npm: string;
  models_url: string;
  env_override?: string; // used for local providers like OLLAMA_BASE_URL
  auth?: string;
  oauth_vault?: string;
}

function loadProviders(): ProviderRow[] {
  try {
    const data = fs.readFileSync(path.join(__dirname, "providers.json"), "utf8");
    return JSON.parse(data) as ProviderRow[];
  } catch (e) {
    return [];
  }
}

export const PROVIDERS = loadProviders();

export function getProviderRow(providerId: string): ProviderRow | undefined {
  return PROVIDERS.find((p) => p.id === providerId);
}

export function resolveProviderToken(row: ProviderRow, env: NodeJS.ProcessEnv): string | undefined {
  if (row.auth?.includes("oauth") && row.oauth_vault) {
    const vaultNs = row.oauth_vault;
    const tokensRaw = getSecret(vaultNs, "tokens");
    if (tokensRaw) {
      try {
        const parsed = JSON.parse(tokensRaw);
        if (parsed.access_token) return parsed.access_token;
      } catch {}
    }
    const directToken = getSecret(vaultNs, "access_token") || getSecret(vaultNs, "token");
    if (directToken) return directToken;
  }
  if (row.env && row.env.length > 0) {
    return env[row.env[0]];
  }
  return undefined;
}

export function makeModel(
  modelId: string,
  providerId: string,
  env: NodeJS.ProcessEnv,
  customProviders: Record<string, { base_url: string; api_key_env?: string; headers?: Record<string, string> }> = {}
) {
  let row = getProviderRow(providerId);

  // Fallback to custom providers
  if (!row && customProviders[providerId]) {
    const custom = customProviders[providerId];
    row = {
      id: providerId,
      wire: "openai", // Custom providers default to openai wire
      base_url: custom.base_url,
      env: custom.api_key_env ? [custom.api_key_env] : [],
      npm: "@ai-sdk/openai",
      models_url: "/models",
    };
  }

  // Generic fallback if all else fails but the model implies openrouter/ or contains a slash
  if (!row) {
    if (providerId === "openrouter" || providerId.includes("/")) {
       row = getProviderRow("openrouter");
    }
  }

  if (!row) {
    throw new Error(`UNSUPPORTED_PROVIDER:${providerId}`);
  }

  // Check custom headers for custom providers
  const customHeaders = customProviders[providerId]?.headers;

  // Resolve base URL (checking env_override for local)
  let baseURL = row.base_url;
  if (row.env_override && env[row.env_override]) {
    baseURL = env[row.env_override]!;
  }

  // Resolve API Key
  let apiKey = "";
  const interceptor = PluginManager.getInstance().getProviderInterceptor(providerId);

  if (row.id === "ollama" || row.id === "lmstudio" || row.id === "local") {
    apiKey = row.id; // dummy key
  } else {
    apiKey = resolveProviderToken(row, env) || "";
    if (!apiKey && !interceptor) {
      const primaryKey = row.env && row.env.length > 0 ? row.env[0] : "API_KEY";
      throw new Error(`MISSING_KEY:${primaryKey}`);
    }
    if (!apiKey && interceptor) {
      apiKey = interceptor.apiKey || "dummy-plugin-key";
    }
  }

  // Generate driver
  switch (row.wire) {
    case "openai": {
      let customFetch = interceptor?.fetch;
      const mergedHeaders = {
        ...(customHeaders || {}),
        ...(interceptor?.headers || {}),
      };

      if (row.id === "copilot") {
        let cachedCopilotToken = "";
        let cachedCopilotTokenExpires = 0;
        
        customFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
          if (Date.now() > cachedCopilotTokenExpires) {
            const tokenRes = await fetch("https://api.github.com/copilot_internal/v2/token", {
              headers: {
                Authorization: `token ${apiKey}`,
                Accept: "application/json",
              },
            });
            if (!tokenRes.ok) {
              throw new Error(`Failed to fetch copilot token: ${tokenRes.statusText}`);
            }
            const tokenData: any = await tokenRes.json();
            cachedCopilotToken = tokenData.token;
            cachedCopilotTokenExpires = tokenData.expires_at ? tokenData.expires_at * 1000 - 30000 : Date.now() + 15 * 60 * 1000;
          }
          
          const headers = new Headers(init?.headers);
          headers.set("Authorization", `Bearer ${cachedCopilotToken}`);
          return fetch(input, { ...init, headers });
        };
      }
      
      const openaiClient = createOpenAI({
        apiKey: row.id === "copilot" ? "dummy" : apiKey,
        baseURL,
        ...(customFetch ? { fetch: customFetch } : {}),
        ...(Object.keys(mergedHeaders).length > 0 ? { headers: mergedHeaders } : {}),
      });
      return openaiClient(modelId);
    }
      
    case "anthropic": {
      const anthropicClient = createAnthropic({
        apiKey,
        baseURL,
        ...(interceptor?.fetch ? { fetch: interceptor.fetch } : {}),
        ...(interceptor?.headers ? { headers: interceptor.headers } : {}),
      });
      return anthropicClient(modelId);
    }
      
    case "gemini": {
      const geminiClient = createGoogleGenerativeAI({
        apiKey,
        baseURL,
        ...(interceptor?.fetch ? { fetch: interceptor.fetch } : {}),
        ...(interceptor?.headers ? { headers: interceptor.headers } : {}),
      });
      return geminiClient(modelId);
    }

    default:
      throw new Error(`UNSUPPORTED_WIRE:${row.wire} for provider ${providerId}`);
  }
}

// ── Native provider katmanı köprüsü (Faz 3) ────────────────────────────────
// makeModel'e DOKUNMADAN: aynı row/apiKey/baseURL/copilot çözümünü SDK-agnostik
// ResolvedEndpoint olarak döndürür. native/makeNativeModel bunu tüketir.
// (Küçük mantık tekrarı bilinçli — canlı makeModel yolunu riske atmamak için.)

/** providerId+model → ResolvedEndpoint (wire, baseURL, apiKey, headers, fetch). */
export function resolveEndpoint(
  modelId: string,
  providerId: string,
  env: NodeJS.ProcessEnv,
  customProviders: Record<string, { base_url: string; api_key_env?: string; headers?: Record<string, string> }> = {},
): ResolvedEndpoint {
  let row = getProviderRow(providerId);

  if (!row && customProviders[providerId]) {
    const custom = customProviders[providerId];
    row = {
      id: providerId,
      wire: "openai",
      base_url: custom.base_url,
      env: custom.api_key_env ? [custom.api_key_env] : [],
      npm: "@ai-sdk/openai",
      models_url: "/models",
    };
  }
  if (!row && (providerId === "openrouter" || providerId.includes("/"))) {
    row = getProviderRow("openrouter");
  }
  if (!row) throw new Error(`UNSUPPORTED_PROVIDER:${providerId}`);

  const customHeaders = customProviders[providerId]?.headers;

  let baseURL = row.base_url;
  if (row.env_override && env[row.env_override]) baseURL = env[row.env_override]!;

  let apiKey = "";
  let customFetch: typeof fetch | undefined;
  
  const interceptor = PluginManager.getInstance().getProviderInterceptor(providerId);

  if (row.id === "ollama" || row.id === "lmstudio" || row.id === "local") {
    apiKey = row.id; // dummy
  } else {
    apiKey = resolveProviderToken(row, env) || "";
    if (!apiKey && !interceptor) {
      const primaryKey = row.env && row.env.length > 0 ? row.env[0] : "API_KEY";
      throw new Error(`MISSING_KEY:${primaryKey}`);
    }
    if (!apiKey && interceptor) {
      apiKey = interceptor.apiKey || "dummy-plugin-key";
    }
  }

  // Copilot: dinamik token exchange (makeModel'deki closure'ın aynısı).
  if (row.id === "copilot") {
    const githubToken = apiKey;
    apiKey = "dummy"; // gerçek Authorization customFetch içinde set edilir
    let cachedToken = "";
    let cachedExpires = 0;
    customFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (Date.now() > cachedExpires) {
        const tokenRes = await fetch("https://api.github.com/copilot_internal/v2/token", {
          headers: { Authorization: `token ${githubToken}`, Accept: "application/json" },
        });
        if (!tokenRes.ok) throw new Error(`Failed to fetch copilot token: ${tokenRes.statusText}`);
        const data: any = await tokenRes.json();
        cachedToken = data.token;
        cachedExpires = data.expires_at ? data.expires_at * 1000 - 30000 : Date.now() + 15 * 60 * 1000;
      }
      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${cachedToken}`);
      return fetch(input, { ...init, headers });
    };
  }

  const mergedHeaders = {
    ...(customHeaders || {}),
    ...(interceptor?.headers || {}),
  };
  const finalFetch = customFetch || interceptor?.fetch;

  return {
    providerId: row.id,
    wire: row.wire,
    baseURL,
    apiKey,
    ...(Object.keys(mergedHeaders).length > 0 ? { headers: mergedHeaders } : {}),
    ...(finalFetch ? { fetch: finalFetch } : {}),
  };
}

