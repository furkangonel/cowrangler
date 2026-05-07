import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createVertex } from "@ai-sdk/google-vertex";
import { LanguageModelV1 } from "ai";

export class LLM {
  public model: string;

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
    if (
      modelName.startsWith("gpt-") ||
      modelName.startsWith("o1-") ||
      modelName.startsWith("o3-") ||
      modelName.startsWith("o4-")
    ) {
      if (!process.env.OPENAI_API_KEY)
        throw new Error("MISSING_KEY:OPENAI_API_KEY");
    } else if (modelName.startsWith("claude-")) {
      if (!process.env.ANTHROPIC_API_KEY)
        throw new Error("MISSING_KEY:ANTHROPIC_API_KEY");
    } else if (modelName.startsWith("gemini-")) {
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY)
        throw new Error("MISSING_KEY:GOOGLE_GENERATIVE_AI_API_KEY");
    } else if (modelName.startsWith("vertex/")) {
      if (!process.env.GOOGLE_VERTEX_PROJECT)
        throw new Error("MISSING_KEY:GOOGLE_VERTEX_PROJECT");
    } else if (modelName.startsWith("copilot/")) {
      if (!process.env.GITHUB_TOKEN)
        throw new Error("MISSING_KEY:GITHUB_TOKEN");
    } else if (modelName.startsWith("groq/")) {
      if (!process.env.GROQ_API_KEY)
        throw new Error("MISSING_KEY:GROQ_API_KEY");
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

  private resolveProvider(modelName: string): LanguageModelV1 {
    // 1. OFFICIAL OPENAI KONTROLÜ (gpt-..., o1-..., o3-..., o4-...)
    if (
      modelName.startsWith("gpt-") ||
      modelName.startsWith("o1-") ||
      modelName.startsWith("o3-") ||
      modelName.startsWith("o4-")
    ) {
      if (!process.env.OPENAI_API_KEY)
        throw new Error("MISSING_KEY:OPENAI_API_KEY");
      const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
      return openai(modelName);
    }

    // 2. OFFICIAL ANTHROPIC KONTROLÜ (claude-...)

    if (modelName.startsWith("claude-")) {
      if (!process.env.ANTHROPIC_API_KEY)
        throw new Error("MISSING_KEY:ANTHROPIC_API_KEY");
      const anthropic = createAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
      return anthropic(modelName);
    }

    // 3. OFFICIAL GOOGLE GEMINI KONTROLÜ (gemini-...)

    if (modelName.startsWith("gemini-")) {
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY)
        throw new Error("MISSING_KEY:GOOGLE_GENERATIVE_AI_API_KEY");
      const google = createGoogleGenerativeAI({
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      });
      return google(modelName);
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
      if (!process.env.GITHUB_TOKEN)
        throw new Error("MISSING_KEY:GITHUB_TOKEN");
      const copilot = createOpenAI({
        apiKey: process.env.GITHUB_TOKEN,
        baseURL: "https://models.inference.ai.azure.com",
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
    } // 7. OPENROUTER KONTROLÜ (openrouter/ öneki veya provider/model formatı)
    // Bu kural en sona gelir çünkü '/' içeren tüm tanımsız modelleri yakalar.
    // vertex/, groq/ gibi özel önekler yukarıda zaten işlenmiş olur.

    if (modelName.startsWith("openrouter/") || modelName.includes("/")) {
      if (!process.env.OPENROUTER_API_KEY)
        throw new Error("MISSING_KEY:OPENROUTER_API_KEY");
      const openrouter = createOpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: "https://openrouter.ai/api/v1",
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
}
