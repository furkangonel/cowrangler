import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { LanguageModelV1 } from "ai";

export class LLM {
  public model: string;
  private resolvedModel: LanguageModelV1;

  constructor(model: string, temperature: number = 0.7) {
    this.model = model;
    this.resolvedModel = this.resolveProvider(model, temperature);
  }

  // Fabrika Metodu: Model adına bakarak doğru sağlayıcıyı (Provider) oluşturur
  private resolveProvider(
    modelName: string,
    temperature: number,
  ): LanguageModelV1 {
    // 1. OFFICIAL OPENAI KONTROLÜ (gpt-..., o1-...)
    if (modelName.startsWith("gpt-") || modelName.startsWith("o1-")) {
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

    // 4. GROQ KONTROLÜ (groq/...)
    if (modelName.startsWith("groq/")) {
      if (!process.env.GROQ_API_KEY)
        throw new Error("MISSING_KEY:GROQ_API_KEY");
      const groq = createOpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: "https://api.groq.com/openai/v1",
      });
      return groq(modelName.replace("groq/", ""));
    }

    // 5. OPENROUTER KONTROLÜ (İçinde '/' barındıran tüm diğer modeller veya openrouter/ öneki alanlar)
    if (modelName.includes("/") || modelName.startsWith("openrouter/")) {
      if (!process.env.OPENROUTER_API_KEY)
        throw new Error("MISSING_KEY:OPENROUTER_API_KEY");
      const openrouter = createOpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: "https://openrouter.ai/api/v1",
      });

      // Eğer kullanıcı "openrouter/tencent/..." yazdıysa öneki temizle, yoksa direkt kullan
      const cleanModelName = modelName.replace("openrouter/", "");
      return openrouter(cleanModelName);
    }

    // Eğer hiçbir şablona uymuyorsa hata fırlat
    throw new Error(`UNSUPPORTED_MODEL:${modelName}`);
  }

  // Ajanın generateText metodunda doğrudan kullanacağı nesne
  getModel(): LanguageModelV1 {
    return this.resolvedModel;
  }
}
