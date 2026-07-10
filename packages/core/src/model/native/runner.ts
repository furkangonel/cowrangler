/**
 * Native agent turn runner — agent.ts ile native provider katmanı arasındaki
 * tek köprü. agent.ts'in `streamText(...)` + fullStream + onStepFinish bloğunun
 * ürettiği muhasebenin (finalText, usage, cache, responseMessages) aynısını
 * SDK-agnostik yoldan üretir.
 *
 * Amaç: agent.ts'e yalnızca küçük, flag'li bir dal düşsün — bütün native mantık
 * burada toplanır ve fake model'le izole test edilir.
 *
 * NOT: thinking/reasoningEffort provider-özel ayarları bu v1'de iletilmiyor
 * (reasoning yine de sağlayıcı akıtırsa onReasoningToken'a düşer). Faz sonrası
 * ChatRequest'e `providerOptions` alanı eklenerek kapatılabilir.
 */

import { resolveEndpoint } from "../driver.js";
import { rotateCredentialPoolKey } from "../../credential_pool.js";
import { makeNativeModel } from "./index.js";
import { bindRegistry, type RegistryToolDef } from "./tooling.js";
import { fromCoreMessages, toCoreMessages } from "./coremsg.js";
import { runAgentLoop } from "./loop.js";
import type { ToolInvocation, ToolOutcome } from "./loop.js";
import type { ChatModel, ThinkingConfig } from "./types.js";

export interface NativeTurnOptions {
  modelId: string;
  /** Model doğrudan enjekte edilirse (test) resolveEndpoint atlanır. */
  model?: ChatModel;
  providerId?: string;
  env?: NodeJS.ProcessEnv;
  customProviders?: Record<string, { base_url: string; api_key_env?: string; headers?: Record<string, string> }>;

  system: string;
  /** Sistem HARİÇ konuşma geçmişi (vercel CoreMessage[]). */
  history: Array<{ role: string; content: any }>;
  /** agent.getTools() çıktısı. */
  tools: Record<string, RegistryToolDef>;

  maxSteps: number;
  temperature?: number;
  maxTokens?: number;
  cacheSystemAndTools?: boolean;
  thinking?: ThinkingConfig;
  abortSignal?: AbortSignal;

  onToken?(delta: string): void;
  onReasoningToken?(delta: string): void;
  onToolCallDelta?(id: string, name: string | undefined, argsDelta: string): void;
  onToolStart?(inv: ToolInvocation): void;
  onToolResult?(inv: ToolInvocation, outcome: ToolOutcome): void;
  /** Her model turundan sonra usage ile (plugins post_llm_call vb.). */
  onStep?(usage: NativeTurnUsage): void;
  /** Tool çalışmadan ÖNCE (plugins pre_tool_call vb.). */
  preToolCall?(name: string, args: unknown): Promise<void> | void;
  onRetry?(err: Error, attempt: number, delayMs: number): void;
}

export interface NativeTurnUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface NativeTurnResult {
  finalText: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Bu turda üretilen assistant/tool mesajları (CoreMessage[] biçiminde). */
  responseMessages: Array<{ role: string; content: any }>;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  finishReason: "stop" | "max_steps" | "aborted" | "error";
}

export async function runNativeAgentTurn(opts: NativeTurnOptions): Promise<NativeTurnResult> {
  let model = opts.model;
  if (!model) {
    if (!opts.providerId) throw new Error("runNativeAgentTurn: providerId veya model gerekli");
    const buildModel = (): ChatModel => {
      const ep = resolveEndpoint(opts.modelId, opts.providerId!, opts.env ?? process.env, opts.customProviders ?? {});
      return makeNativeModel(ep, opts.modelId);
    };
    const initial = buildModel();
    model = {
      providerId: initial.providerId,
      wire: initial.wire,
      modelId: initial.modelId,
      streamChat: (req) => buildModel().streamChat(req),
    };
  }
  const { specs, executeTool } = bindRegistry(opts.tools);

  const history = fromCoreMessages(opts.history);
  const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let finalText = "";

  const res = await runAgentLoop({
    model,
    messages: history,
    tools: specs,
    system: opts.system,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    cacheSystemAndTools: opts.cacheSystemAndTools,
    thinking: opts.thinking,
    abortSignal: opts.abortSignal,
    maxSteps: opts.maxSteps,
    executeTool,
    handlers: {
      onText: (t) => {
        finalText += t;
        opts.onToken?.(t);
      },
      onReasoning: (t) => opts.onReasoningToken?.(t),
      onToolCallDelta: (id, name, d) => opts.onToolCallDelta?.(id, name, d),
      onToolStart: async (inv) => {
        toolCalls.push({ name: inv.name, args: (inv.args ?? {}) as Record<string, unknown> });
        await opts.preToolCall?.(inv.name, inv.args);
        opts.onToolStart?.(inv);
      },
      onToolResult: (inv, outcome) => opts.onToolResult?.(inv, outcome),
      onStepFinish: (_step, usage) =>
        opts.onStep?.({
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          cacheReadTokens: usage.cacheReadTokens ?? 0,
          cacheWriteTokens: usage.cacheWriteTokens ?? 0,
        }),
      onRetry: (err, attempt, delayMs) => {
        if (!opts.model && isRateLimitError(err)) {
          rotateCredentialPoolKey(opts.modelId);
        }
        opts.onRetry?.(err, attempt, delayMs);
      },
    },
  });

  // Yalnızca bu turda ÜRETİLEN mesajlar (girdi geçmişini çıkar).
  const produced = res.messages.slice(history.length);
  const responseMessages = toCoreMessages(produced);

  const inputTokens = res.usage.inputTokens ?? 0;
  const outputTokens = res.usage.outputTokens ?? 0;

  return {
    finalText,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cacheReadTokens: res.usage.cacheReadTokens ?? 0,
    cacheWriteTokens: res.usage.cacheWriteTokens ?? 0,
    responseMessages,
    toolCalls,
    finishReason: res.finishReason,
  };
}

function isRateLimitError(error: Error): boolean {
  const e = error as any;
  const code = e.statusCode ?? e.status ?? e.code;
  if (Number(code) === 429) return true;
  const msg = error.message.toLowerCase();
  return msg.includes("rate limit") || msg.includes("too many requests");
}
