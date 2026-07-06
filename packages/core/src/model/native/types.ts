/**
 * ModelProvider port — SDK-agnostik çekirdek sözleşmesi.
 *
 * Bu dosya vercel `ai` / `@ai-sdk/*` TİPİ İÇERMEZ. Amaç: çekirdek sınırından
 * SDK tiplerini (CoreMessage, LanguageModelV1) çıkarmak. Her provider (wire)
 * bu portu native olarak gerçekler; ajan loop'u yalnızca bu tipleri görür.
 *
 * agent.ts'in bugün vercel streamText'ten tükettiği yüzeyin birebir karşılığı:
 *   text-delta        → StreamEvent { type: "text_delta" }
 *   reasoning-delta   → StreamEvent { type: "reasoning_delta" }
 *   tool-call-delta   → StreamEvent { type: "tool_call_delta" }
 *   (final tool call)  → StreamEvent { type: "tool_call" }
 *   onStepFinish/usage → StreamEvent { type: "finish" }
 *   error             → StreamEvent { type: "error" }
 */

// ── Mesaj modeli ──────────────────────────────────────────────────────────

export type Role = "system" | "user" | "assistant" | "tool";

/** Modelin ürettiği / bizim ilettiğimiz içerik parçaları. */
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool_call"; id: string; name: string; args: unknown }
  | { type: "tool_result"; id: string; name: string; result: unknown; isError?: boolean };

export interface Message {
  role: Role;
  /** Düz metin (kolay yol) veya çok parçalı içerik. */
  content: string | ContentPart[];
}

// ── Araç (tool) modeli ────────────────────────────────────────────────────

/** JSON Schema (Draft-07 alt kümesi). zod → jsonSchema dönüşümü core'da yapılır. */
export type JSONSchema = Record<string, unknown>;

/**
 * Porta verilen araç TANIMI — execute YOK. Aracın çalıştırılması ajan
 * loop'unun işidir; provider yalnızca şemayı modele iletir ve tool_call üretir.
 */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: JSONSchema;
}

// ── İstek ─────────────────────────────────────────────────────────────────

export interface CacheHints {
  /**
   * Anthropic prompt caching: system + tools prefix'ine cache_control koy.
   * Diğer wire'larda no-op. agent.ts'teki mevcut cache davranışının karşılığı.
   */
  cacheSystemAndTools?: boolean;
}

/** Extended thinking / reasoning — provider-agnostik. Her wire kendi biçimine map eder. */
export interface ThinkingConfig {
  enabled: boolean;
  /** Düşünme için ayrılan token bütçesi (anthropic budget_tokens / gemini thinkingBudget). */
  budgetTokens?: number;
}

export interface ChatRequest {
  model: string;
  messages: Message[];
  tools?: ToolSpec[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
  /** İptal için — LLM.getAbortSignal() ile aynı sözleşme. */
  abortSignal?: AbortSignal;
  cache?: CacheHints;
  thinking?: ThinkingConfig;
}

// ── Akış olayları ─────────────────────────────────────────────────────────

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  /** Anthropic cache: okunan / yazılan token. */
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export type FinishReason = "stop" | "tool_calls" | "length" | "content_filter" | "error" | "aborted";

export type StreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "reasoning_delta"; text: string }
  /** Bir tool_call'ın argüman JSON'u parça parça gelir (id ile eşleşir). */
  | { type: "tool_call_delta"; id: string; name?: string; argsDelta: string }
  /** Tamamlanmış tool_call — args parse edilmiş. */
  | { type: "tool_call"; id: string; name: string; args: unknown }
  | { type: "finish"; reason: FinishReason; usage?: Usage }
  | { type: "error"; error: Error };

// ── Model portu ───────────────────────────────────────────────────────────

/**
 * Her provider bunu gerçekler. Tek metot: streamChat.
 * (generateText gerektiren yerler — llm_health, context_engine — akışı
 *  tüketip metni toplayan ince bir helper ile karşılanır; ayrı metot gerekmez.)
 */
export interface ChatModel {
  readonly providerId: string;
  readonly wire: string;
  readonly modelId: string;
  streamChat(req: ChatRequest): AsyncIterable<StreamEvent>;
}

/** Provider fabrikası için çözülmüş kimlik/uç bilgisi (driver.ts'ten gelir). */
export interface ResolvedEndpoint {
  providerId: string;
  wire: string;
  baseURL: string;
  apiKey: string;
  headers?: Record<string, string>;
  /** copilot gibi dinamik token gereken wire'lar için opsiyonel fetch override. */
  fetch?: typeof fetch;
}
