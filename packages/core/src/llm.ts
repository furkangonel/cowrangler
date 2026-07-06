import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createVertex } from "@ai-sdk/google-vertex";
import { LanguageModelV1 } from "ai";
import { getConfig } from "./init.js";
import { getModelCapabilities, ModelCapabilities } from "./model_metadata.js";
import { PluginManager } from "./plugins.js";

/** config.custom_providers — koda dokunmadan OpenAI-uyumlu sağlayıcı ekleme. */
interface CustomProviderCfg { base_url: string; api_key_env?: string; headers?: Record<string, string>; }
function getCustomProviders(): Record<string, CustomProviderCfg> {
  try {
    const cp = (getConfig() as any)?.custom_providers;
    return cp && typeof cp === "object" ? cp : {};
  } catch { return {}; }
}

export class LLM {
  public model: string;
  private _abortController: AbortController | null = null;

  public abort(): void {
    this._abortController?.abort();
    this._abortController = null;
  }

  public getAbortSignal(): AbortSignal {
    this._abortController = new AbortController();
    return this._abortController.signal;
  }

  public clearAbortController(): void {
    this._abortController = null;
  }

  /**
   * Modeli yerinde değiştirir (agent'ı yeniden oluşturmadan).
   * getModel() her çağrıda this.model'i taze çözdüğü için bir sonraki mesaj
   * yeni modeli kullanır; sohbet geçmişi ve oturum korunur.
   * Gerekli env var yoksa MISSING_KEY/UNSUPPORTED_MODEL fırlatır.
   */
  public setModel(model: string): void {
    this._validateRequiredVars(model);
    this.model = model;
  }

  constructor(model: string, temperature: number = 0.7) {
    this.model = model;
    // Constructor'da sadece zorunlu env var'ların varlığını kontrol et.
    // SDK nesnesi OLUŞTURULMUYOR — getModel() çağrıldığında lazy olarak oluşturulur.
    // Bu sayede /key set sonrası /model set gerekmeden env değişiklikleri
    // bir sonraki mesajda otomatik olarak yansır.
    this._validateRequiredVars(model);
  }

  /**
   * Sadece env var eksikliğini kontrol eder, SDK nesnesi oluşturmaz.
   * MISSING_KEY hatası fırlatılırsa /model set anında kullanıcıya bildirilir.
   */

  private _validateRequiredVars(modelName: string): void {
    // ── Plugin-provided providers ──────────────────────────────────────────
    // If an installed plugin registered a provider interceptor for this model's
    // provider (e.g. Antigravity OAuth under "google"), it supplies its own
    // auth via a stored token / custom fetch — so skip env-key validation.
    const providerPrefix = modelName.includes("/") ? modelName.split("/")[0] : "";
    if (providerPrefix && PluginManager.getInstance().getProviderInterceptor(providerPrefix)) {
      return;
    }

    // ── provider/model_name format (örn: anthropic/claude-sonnet-4-6) ──────
    // eski kısa prefix'ler (claude-*, gpt-*) hâlâ çalışır.
    if (modelName.startsWith("anthropic/")) {
      if (!process.env.ANTHROPIC_API_KEY && !process.env.COWRANGLER_OAUTH_ANTHROPIC)
        throw new Error("MISSING_KEY:ANTHROPIC_API_KEY");
      return;
    }
    if (modelName.startsWith("openai/")) {
      if (!process.env.OPENAI_API_KEY && !process.env.COWRANGLER_OAUTH_OPENAI)
        throw new Error("MISSING_KEY:OPENAI_API_KEY");
      return;
    }
    if (modelName.startsWith("google/")) {
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && !process.env.COWRANGLER_OAUTH_GEMINI)
        throw new Error("MISSING_KEY:GOOGLE_GENERATIVE_AI_API_KEY");
      return;
    }

    // ── Kısa prefix'ler (geriye dönük uyumluluk) ────────────────────────────
    if (
      modelName.startsWith("gpt-") ||
      modelName.startsWith("o1-") ||
      modelName.startsWith("o3-") ||
      modelName.startsWith("o4-")
    ) {
      if (!process.env.OPENAI_API_KEY && !process.env.COWRANGLER_OAUTH_OPENAI)
        throw new Error("MISSING_KEY:OPENAI_API_KEY");
    } else if (modelName.startsWith("claude-")) {
      if (!process.env.ANTHROPIC_API_KEY && !process.env.COWRANGLER_OAUTH_ANTHROPIC)
        throw new Error("MISSING_KEY:ANTHROPIC_API_KEY");
    } else if (modelName.startsWith("gemini-")) {
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && !process.env.COWRANGLER_OAUTH_GEMINI)
        throw new Error("MISSING_KEY:GOOGLE_GENERATIVE_AI_API_KEY");
    } else if (modelName.startsWith("vertex/")) {
      if (!process.env.GOOGLE_VERTEX_PROJECT)
        throw new Error("MISSING_KEY:GOOGLE_VERTEX_PROJECT");
    } else if (modelName.startsWith("copilot/")) {
      if (!process.env.GITHUB_TOKEN && !process.env.COWRANGLER_OAUTH_COPILOT)
        throw new Error("MISSING_KEY:GITHUB_TOKEN");
    } else if (modelName.startsWith("groq/")) {
      if (!process.env.GROQ_API_KEY)
        throw new Error("MISSING_KEY:GROQ_API_KEY");
    } else if (
      modelName.startsWith("ollama/") ||
      modelName.startsWith("lmstudio/") ||
      modelName.startsWith("local/")
    ) {
      // Yerel modeller API key gerektirmez.
      return;
    } else if (
      modelName.startsWith("mistral/") ||
      modelName.startsWith("deepseek/") ||
      modelName.startsWith("xai/") ||
      modelName.startsWith("together/") ||
      modelName.startsWith("cerebras/") ||
      modelName.startsWith("fireworks/")
    ) {
      const envKey: Record<string, string> = {
        "mistral": "MISTRAL_API_KEY", "deepseek": "DEEPSEEK_API_KEY", "xai": "XAI_API_KEY",
        "together": "TOGETHER_API_KEY", "cerebras": "CEREBRAS_API_KEY", "fireworks": "FIREWORKS_API_KEY",
      };
      const prov = modelName.split("/")[0];
      if (!process.env[envKey[prov]]) throw new Error(`MISSING_KEY:${envKey[prov]}`);
    } else if (getCustomProviders()[modelName.split("/")[0]]?.base_url && modelName.includes("/")) {
      const cfg = getCustomProviders()[modelName.split("/")[0]];
      if (cfg.api_key_env && !process.env[cfg.api_key_env]) throw new Error(`MISSING_KEY:${cfg.api_key_env}`);
    } else if (modelName.startsWith("openrouter/") || modelName.includes("/")) {
      if (!process.env.OPENROUTER_API_KEY)
        throw new Error("MISSING_KEY:OPENROUTER_API_KEY");
    } else if (!modelName.includes("/")) {
      throw new Error(`UNSUPPORTED_MODEL:${modelName}`);
    }
  }

  /**
   * Her çağrıda mevcut env var'larını okuyarak sağlayıcı nesnesi oluşturur.
   * Lazy + fresh: /key set sonrası bir sonraki mesajda otomatik yansır.
   */

  // ── OAuth-farkında sağlayıcı üreticileri ────────────────────────────────
  // API key yoksa fakat abonelik OAuth token'ı varsa (applyOAuthEnv tarafından
  // COWRANGLER_OAUTH_* env'lerine yerleştirilir) onu kullanır.
  private _makeAnthropic(modelId: string): LanguageModelV1 {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const oauth = process.env.COWRANGLER_OAUTH_ANTHROPIC;
    if (!apiKey && !oauth) throw new Error("MISSING_KEY:ANTHROPIC_API_KEY");
    const anthropic = createAnthropic(
      apiKey
        ? { apiKey }
        : {
            apiKey: "",
            headers: {
              authorization: `Bearer ${oauth}`,
              "anthropic-beta": "oauth-2025-04-20",
            },
          },
    );
    return anthropic(modelId);
  }

  private _makeOpenAI(modelId: string): LanguageModelV1 {
    const apiKey = process.env.OPENAI_API_KEY || process.env.COWRANGLER_OAUTH_OPENAI;
    if (!apiKey) throw new Error("MISSING_KEY:OPENAI_API_KEY");
    const headers: Record<string, string> = {};
    if (!process.env.OPENAI_API_KEY && process.env.COWRANGLER_OAUTH_OPENAI_ACCOUNT)
      headers["chatgpt-account-id"] = process.env.COWRANGLER_OAUTH_OPENAI_ACCOUNT;
    const openai = createOpenAI({ apiKey, ...(Object.keys(headers).length ? { headers } : {}) });
    return openai(modelId);
  }

  private _makeGoogle(modelId: string): LanguageModelV1 {
    // Plugin-provided auth (e.g. Antigravity OAuth) → route requests through the
    // interceptor's custom fetch so the stored token/refresh flow supplies auth.
    const interceptor = PluginManager.getInstance().getProviderInterceptor("google");
    if (interceptor && interceptor.fetch) {
      const google = createGoogleGenerativeAI({
        apiKey: interceptor.apiKey || "dummy-plugin-key",
        fetch: interceptor.fetch as any,
        ...(interceptor.headers ? { headers: interceptor.headers } : {}),
      });
      return google(modelId);
    }
    // Real API key → standard generativelanguage API.
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (apiKey) {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(modelId);
    }
    throw new Error("MISSING_KEY:GOOGLE_GENERATIVE_AI_API_KEY");
  }



  private resolveProvider(modelName: string): LanguageModelV1 {
    // 0. PROVIDER/MODEL_NAME FORMAT (eg. anthropic/claude-sonnet-4-6)
    // Uzun format kısa prefix'lerden önce kontrol edilir.
    if (modelName.startsWith("anthropic/")) {
      return this._makeAnthropic(modelName.slice("anthropic/".length));
    }
    if (modelName.startsWith("openai/")) {
      return this._makeOpenAI(modelName.slice("openai/".length));
    }
    if (modelName.startsWith("google/")) {
      return this._makeGoogle(modelName.slice("google/".length));
    }


    // 1. OFFICIAL OPENAI KONTROLÜ (gpt-..., o1-..., o3-..., o4-...)
    if (
      modelName.startsWith("gpt-") ||
      modelName.startsWith("o1-") ||
      modelName.startsWith("o3-") ||
      modelName.startsWith("o4-")
    ) {
      return this._makeOpenAI(modelName);
    }

    // 2. OFFICIAL ANTHROPIC KONTROLÜ (claude-...)
    // @ai-sdk/anthropic 1.2+ → cacheControl varsayılan açık, thinking ayrıca
    // generateText providerOptions üzerinden aktarılır (model-level değil).
    if (modelName.startsWith("claude-")) {
      return this._makeAnthropic(modelName);
    }

    // 3. OFFICIAL GOOGLE GEMINI KONTROLÜ (gemini-...)

    if (modelName.startsWith("gemini-")) {
      return this._makeGoogle(modelName);
    }

    // 4. GOOGLE VERTEX AI KONTROLÜ (vertex/...)
    // API key DEĞİL — GCP Project ID + konum + kimlik doğrulama gerektirir.
    // Kimlik doğrulama öncelik sırası:
    //   a) GOOGLE_APPLICATION_CREDENTIALS (service account JSON key dosyası yolu)
    //   b) Application Default Credentials — `gcloud auth application-default login`
    //
    // Örnek model adları:
    //   vertex/gemini-2.0-flash
    //   vertex/gemini-1.5-pro
    //   vertex/publishers/anthropic/models/claude-3-5-sonnet@20241022

    if (modelName.startsWith("vertex/")) {
      const project = process.env.GOOGLE_VERTEX_PROJECT;
      const location = process.env.GOOGLE_VERTEX_LOCATION ?? "us-central1";

      if (!project) throw new Error("MISSING_KEY:GOOGLE_VERTEX_PROJECT");

      const googleAuthOptions = process.env.GOOGLE_APPLICATION_CREDENTIALS
        ? { keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS }
        : undefined;

      const vertex = createVertex({
        project,
        location,
        ...(googleAuthOptions ? { googleAuthOptions } : {}),
      }); // "vertex/" önekini sil, geri kalanı doğrudan Vertex API'ye ilet

      return vertex(modelName.slice("vertex/".length));
    }

    // 5. GITHUB COPILOT KONTROLÜ (copilot/...)
    // GITHUB_TOKEN ile api.githubcopilot.com üzerinden OpenAI-uyumlu API.
    // Abonelik gerektiren modeller: gpt-4o, claude-3.5-sonnet, gemini-2.0-flash, o3-mini...
    if (modelName.startsWith("copilot/")) {
      const copilotKey = process.env.GITHUB_TOKEN || process.env.COWRANGLER_OAUTH_COPILOT;
      if (!copilotKey) throw new Error("MISSING_KEY:GITHUB_TOKEN");
      const oauthCopilot = process.env.COWRANGLER_OAUTH_COPILOT && !process.env.GITHUB_TOKEN;
      // caveman parity: derive the API base from the token's proxy-ep
      // (tid=…;proxy-ep=proxy.individual.githubcopilot.com;…) and send the
      // Copilot editor headers the backend expects.
      const baseFromToken = (() => {
        const m = process.env.COWRANGLER_OAUTH_COPILOT?.match(/proxy-ep=([^;]+)/);
        return m ? `https://${m[1].replace(/^proxy\./, "api.")}` : null;
      })();
      const copilot = createOpenAI({
        apiKey: copilotKey,
        baseURL: oauthCopilot
          ? (baseFromToken ?? "https://api.individual.githubcopilot.com")
          : "https://models.inference.ai.azure.com",
        headers: oauthCopilot
          ? {
              "User-Agent": "GitHubCopilotChat/0.35.0",
              "Editor-Version": "vscode/1.107.0",
              "Editor-Plugin-Version": "copilot-chat/0.35.0",
              "Copilot-Integration-Id": "vscode-chat",
            }
          : undefined,
      });
      return copilot(modelName.slice("copilot/".length));
    }

    // 6. GROQ KONTROLÜ (groq/...)
    // ÖNEMLİ: Bu kural vertex/ ve copilot/'den SONRA gelmeli —
    // groq/ prefix'i diğerleriyle çakışmaz ama OpenRouter catch-all'ından
    // önce açıkça yakalanması gerekir.
    if (modelName.startsWith("groq/")) {
      if (!process.env.GROQ_API_KEY)
        throw new Error("MISSING_KEY:GROQ_API_KEY");
      const groq = createOpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: "https://api.groq.com/openai/v1",
      });
      return groq(modelName.replace("groq/", ""));
    }

    // 6b. OPENAI-UYUMLU SAĞLAYICILAR (mistral/, deepseek/, xai/, together/, cerebras/, fireworks/)
    {
      const compat: Record<string, { env: string; baseURL: string }> = {
        "mistral/":   { env: "MISTRAL_API_KEY",   baseURL: "https://api.mistral.ai/v1" },
        "deepseek/":  { env: "DEEPSEEK_API_KEY",  baseURL: "https://api.deepseek.com/v1" },
        "xai/":       { env: "XAI_API_KEY",       baseURL: "https://api.x.ai/v1" },
        "together/":  { env: "TOGETHER_API_KEY",  baseURL: "https://api.together.xyz/v1" },
        "cerebras/":  { env: "CEREBRAS_API_KEY",  baseURL: "https://api.cerebras.ai/v1" },
        "fireworks/": { env: "FIREWORKS_API_KEY", baseURL: "https://api.fireworks.ai/inference/v1" },
      };
      for (const [prefix, cfg] of Object.entries(compat)) {
        if (modelName.startsWith(prefix)) {
          const key = process.env[cfg.env];
          if (!key) throw new Error(`MISSING_KEY:${cfg.env}`);
          const client = createOpenAI({ apiKey: key, baseURL: cfg.baseURL });
          return client(modelName.slice(prefix.length));
        }
      }
    }

    // 7. YEREL MODELLER (ollama/, lmstudio/, local/)
    if (modelName.startsWith("ollama/")) {
      const ollama = createOpenAI({
        apiKey: "ollama", // Dummy key, required by OpenAI SDK
        baseURL: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/v1",
      });
      return ollama(modelName.replace("ollama/", ""));
    }
    if (modelName.startsWith("lmstudio/")) {
      const lmstudio = createOpenAI({
        apiKey: "lmstudio",
        baseURL: process.env.LMSTUDIO_BASE_URL || "http://127.0.0.1:1234/v1",
      });
      return lmstudio(modelName.replace("lmstudio/", ""));
    }
    if (modelName.startsWith("local/")) {
      const local = createOpenAI({
        apiKey: "local",
        baseURL: process.env.LOCAL_API_BASE_URL || "http://127.0.0.1:8080/v1",
      });
      return local(modelName.replace("local/", ""));
    }
    
    // 7b. CUSTOM PROVIDERS (config.custom_providers) — <prefix>/model
    {
      const custom = getCustomProviders();
      const prefix = modelName.split("/")[0];
      const cfg = custom[prefix];
      if (cfg?.base_url && modelName.includes("/")) {
        const key = cfg.api_key_env ? process.env[cfg.api_key_env] : undefined;
        if (cfg.api_key_env && !key) throw new Error(`MISSING_KEY:${cfg.api_key_env}`);
        const client = createOpenAI({
          apiKey: key ?? "custom",
          baseURL: cfg.base_url,
          ...(cfg.headers ? { headers: cfg.headers } : {}),
        });
        return client(modelName.slice(prefix.length + 1));
      }
    }

    // 8. OPENROUTER KONTROLÜ (openrouter/ öneki veya provider/model formatı)
    // Bu kural en sona gelir çünkü '/' içeren tüm tanımsız modelleri yakalar.
    // vertex/, groq/ gibi özel önekler yukarıda zaten işlenmiş olur.

    if (modelName.startsWith("openrouter/") || modelName.includes("/")) {
      if (!process.env.OPENROUTER_API_KEY)
        throw new Error("MISSING_KEY:OPENROUTER_API_KEY");
      const openrouter = createOpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: "https://openrouter.ai/api/v1",
        headers: {
          "HTTP-Referer": "https://cowrangler.com",
          "X-Title": "Cowrangler",
        },
      }); // "openrouter/" önekini temizle (varsa), direkt model adını kullan

      const cleanModelName = modelName.replace("openrouter/", "");
      return openrouter(cleanModelName);
    } // Eğer hiçbir şablona uymuyorsa hata fırlat

    throw new Error(`UNSUPPORTED_MODEL:${modelName}`);
  } /**
   * Ajanın generateText metodunda doğrudan kullanacağı nesne.
   * Her çağrıda env var'larını taze okur — /key set sonrası otomatik yansır.
   */

  getModel(): LanguageModelV1 {
    return this.resolveProvider(this.model);
  }

  // ── WP-6: model yetenekleri (tek kaynak: model_metadata) ─────────────────
  /** Aktif modelin yetenek özeti. */
  public capabilities(): ModelCapabilities {
    return getModelCapabilities(this.model);
  }

  /** Model native (provider-seviyesi) tool-calling destekliyor mu? */
  public supportsNativeToolCalling(): boolean {
    return this.capabilities().nativeToolCalling;
  }

  /** Model prompt caching destekliyor mu? */
  public supportsPromptCache(): boolean {
    return this.capabilities().supportsPromptCache;
  }
}
