import { createOpenAI } from "@ai-sdk/openai";

export class LLM {
  public provider: ReturnType<typeof createOpenAI>;
  public model: string;

  constructor(model: string, temperature: number = 0.7) {
    this.model = model;
    this.provider = createOpenAI({
      apiKey: process.env.OPENROUTER_API_KEY || "missing_key",
      baseURL: "https://openrouter.ai/api/v1",
    });
  }

  getModel() {
    return this.provider(this.model);
  }
}
