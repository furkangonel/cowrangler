/**
 * Native provider katmanı — public yüzey.
 *
 * `makeNativeModel(endpoint, modelId)` wire'a göre doğru ChatModel'i döndürür.
 * Bu, driver.ts'in vercel `makeModel`'inin SDK-agnostik karşılığıdır; Faz 3'te
 * agent/llm bu fabrikaya geçirilecek (feature-flag ile A/B).
 */

import { AnthropicChatModel } from "./anthropic.js";
import { OpenAIChatModel } from "./openai.js";
import { GeminiChatModel } from "./gemini.js";
import { resolveEndpoint } from "../driver.js";
import { providerOf } from "../catalog.js";
import type { ChatModel, Message, ResolvedEndpoint, StreamEvent } from "./types.js";

export * from "./types.js";
export { parseSSE, readableToBytes, stringToChunks } from "./sse.js";
export { AnthropicChatModel, toAnthropicBody, mapAnthropicEvents } from "./anthropic.js";
export { OpenAIChatModel, toOpenAIBody, mapOpenAIEvents } from "./openai.js";
export { GeminiChatModel, toGeminiBody, mapGeminiEvents } from "./gemini.js";
export { runAgentLoop } from "./loop.js";
export type {
  AgentLoopOptions,
  AgentLoopResult,
  AgentLoopHandlers,
  ToolInvocation,
  ToolOutcome,
} from "./loop.js";
export { bindRegistry, toJSONSchema } from "./tooling.js";
export type { RegistryToolDef } from "./tooling.js";
export { fromCoreMessages, fromCoreMessage, toCoreMessages, toCoreMessage } from "./coremsg.js";
export { runNativeAgentTurn } from "./runner.js";
export type { NativeTurnOptions, NativeTurnResult, NativeTurnUsage } from "./runner.js";

/**
 * Native provider katmanı etkin mi?
 * Varsayılan AÇIK (native). Kaçış kapağı: COWRANGLER_LEGACY_SDK=1 → vercel `ai`.
 * Öncelik: LEGACY_SDK=1 > NATIVE_PROVIDERS=0/1 > config.native_providers > default(true).
 */
export function nativeProvidersEnabled(cfg?: { native_providers?: boolean } | any): boolean {
  if (process.env.COWRANGLER_LEGACY_SDK === "1") return false;
  if (process.env.COWRANGLER_NATIVE_PROVIDERS === "0") return false;
  if (process.env.COWRANGLER_NATIVE_PROVIDERS === "1") return true;
  if (cfg && typeof cfg.native_providers === "boolean") return cfg.native_providers;
  return true;
}

/** Desteklenen wire'lar. providers.json `wire` alanıyla eşleşir. */
export type Wire = "anthropic" | "openai" | "gemini";

export function isSupportedWire(wire: string): wire is Wire {
  return wire === "anthropic" || wire === "openai" || wire === "gemini";
}

/** Çözülmüş uç + model → native ChatModel. */
export function makeNativeModel(ep: ResolvedEndpoint, modelId: string): ChatModel {
  switch (ep.wire) {
    case "anthropic":
      return new AnthropicChatModel(ep, modelId);
    case "gemini":
      return new GeminiChatModel(ep, modelId);
    case "openai":
    default:
      // openai wire en geniş kapsam: openai/copilot/openrouter/groq/ollama/custom.
      // Bilinmeyen wire'ları da OpenAI-uyumlu kabul et (çoğu sağlayıcı öyle).
      return new OpenAIChatModel(ep, modelId);
  }
}

/** model string → native ChatModel (providerOf + resolveEndpoint + fabrika). */
export function nativeModelForId(modelId: string, env: NodeJS.ProcessEnv = process.env): ChatModel {
  const providerId = providerOf(modelId);
  const ep = resolveEndpoint(modelId, providerId, env);
  return makeNativeModel(ep, modelId);
}

/**
 * Vercel `generateText` karşılığı — tek-atış, tool'suz metin üretimi.
 * llm_health (ping) ve context_engine (özet) için.
 */
export async function generateOnce(opts: {
  modelId: string;
  system?: string;
  prompt?: string;
  messages?: Message[];
  maxTokens?: number;
  temperature?: number;
  abortSignal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
}): Promise<string> {
  const model = nativeModelForId(opts.modelId, opts.env);
  const messages: Message[] =
    opts.messages ?? (opts.prompt != null ? [{ role: "user", content: opts.prompt }] : []);
  const { text } = await collectText(
    model.streamChat({
      model: opts.modelId,
      messages,
      system: opts.system,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
      abortSignal: opts.abortSignal,
    }),
  );
  return text;
}

/**
 * generateText benzeri kolaylık: akışı tüketip düz metni toplar.
 * (llm_health / context_engine gibi tool'suz tek-atış çağrılar için.)
 */
export async function collectText(events: AsyncIterable<StreamEvent>): Promise<{
  text: string;
  reasoning: string;
  toolCalls: Array<{ id: string; name: string; args: unknown }>;
}> {
  let text = "";
  let reasoning = "";
  const toolCalls: Array<{ id: string; name: string; args: unknown }> = [];
  for await (const e of events) {
    if (e.type === "text_delta") text += e.text;
    else if (e.type === "reasoning_delta") reasoning += e.text;
    else if (e.type === "tool_call") toolCalls.push({ id: e.id, name: e.name, args: e.args });
    else if (e.type === "error") throw e.error;
  }
  return { text, reasoning, toolCalls };
}
