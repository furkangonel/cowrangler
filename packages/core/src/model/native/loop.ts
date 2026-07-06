/**
 * SDK-agnostik ajan loop — vercel `streamText({ maxSteps, tools })` YERİNE.
 *
 * Vercel'in bizim yerimize yaptığı çok-adım tool orchestration'ı burada,
 * ChatModel portu üstünde, saf TypeScript'le yapılır:
 *
 *   1. model.streamChat(messages, tools) çağır
 *   2. akış olaylarını handler'lara ilet, tool_call'ları + metni topla
 *   3. assistant mesajını (metin + tool_call parçaları) geçmişe ekle
 *   4. tool_call yoksa → bitti
 *   5. her tool_call'ı executeTool ile çalıştır → tool_result mesajı ekle
 *   6. maxSteps'e kadar tekrarla
 *
 * agent.ts'e bağlı değil; tool'ların execute'ını çağıran taraf `executeTool`
 * callback'ini verir (zod→JSONSchema dönüşümü ve registry bağlama Faz 3 adapter'ında).
 */

import type {
  ChatModel,
  ContentPart,
  Message,
  StreamEvent,
  ThinkingConfig,
  ToolSpec,
  Usage,
} from "./types.js";

export interface ToolInvocation {
  id: string;
  name: string;
  args: unknown;
}

export interface ToolOutcome {
  result: unknown;
  isError?: boolean;
}

export interface AgentLoopHandlers {
  onText?(delta: string): void;
  onReasoning?(delta: string): void;
  onToolCallDelta?(id: string, name: string | undefined, argsDelta: string): void;
  onToolStart?(inv: ToolInvocation): void;
  onToolResult?(inv: ToolInvocation, outcome: ToolOutcome): void;
  /** Her model turundan sonra (streamText onStepFinish karşılığı). */
  onStepFinish?(step: number, usage: Usage): void;
  onError?(err: Error): void;
}

export interface AgentLoopOptions {
  model: ChatModel;
  messages: Message[];
  tools?: ToolSpec[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
  /** Anthropic prompt caching prefix'i (system+tools). */
  cacheSystemAndTools?: boolean;
  thinking?: ThinkingConfig;
  abortSignal?: AbortSignal;
  /** Vercel maxSteps karşılığı — toplam model turu üst sınırı. */
  maxSteps?: number;
  /**
   * Aynı turdaki tool_call'ları paralel çalıştır. Varsayılan false (deterministik,
   * sıralı). Tool'lar birbirine bağımlı değilse true hız kazandırır.
   */
  parallelTools?: boolean;
  executeTool(inv: ToolInvocation): Promise<ToolOutcome>;
  handlers?: AgentLoopHandlers;
}

export interface AgentLoopResult {
  /** Başlangıç + üretilen tüm assistant/tool mesajları. */
  messages: Message[];
  /** Tüm turların toplam usage'ı. */
  usage: Usage;
  steps: number;
  finishReason: "stop" | "max_steps" | "aborted" | "error";
}

const DEFAULT_MAX_STEPS = 25;

export async function runAgentLoop(opts: AgentLoopOptions): Promise<AgentLoopResult> {
  const messages = [...opts.messages];
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;
  const total: Usage = {};
  let steps = 0;

  for (let step = 0; step < maxSteps; step++) {
    if (opts.abortSignal?.aborted) {
      return { messages, usage: total, steps, finishReason: "aborted" };
    }
    steps = step + 1;

    // ── 1) Model turu — akışı tüket ────────────────────────────────────────
    let text = "";
    const toolCalls: ToolInvocation[] = [];
    let stepUsage: Usage = {};
    let errored: Error | undefined;

    const stream = opts.model.streamChat({
      model: opts.model.modelId,
      // Kopya: çağıran, sonraki turlardaki mutasyonları gözlemleyemez.
      messages: [...messages],
      tools: opts.tools,
      system: opts.system,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      abortSignal: opts.abortSignal,
      cache: opts.cacheSystemAndTools ? { cacheSystemAndTools: true } : undefined,
      thinking: opts.thinking,
    });

    try {
      for await (const ev of stream) {
        dispatch(ev, opts.handlers);
        if (ev.type === "text_delta") text += ev.text;
        else if (ev.type === "tool_call") toolCalls.push({ id: ev.id, name: ev.name, args: ev.args });
        else if (ev.type === "finish" && ev.usage) stepUsage = ev.usage;
        else if (ev.type === "error") errored = ev.error;
      }
    } catch (e) {
      errored = e instanceof Error ? e : new Error(String(e));
    }

    accumulate(total, stepUsage);
    opts.handlers?.onStepFinish?.(steps, stepUsage);

    if (errored) {
      opts.handlers?.onError?.(errored);
      return { messages, usage: total, steps, finishReason: "error" };
    }

    // ── 2) Assistant mesajını geçmişe ekle ─────────────────────────────────
    const assistantParts: ContentPart[] = [];
    if (text) assistantParts.push({ type: "text", text });
    for (const tc of toolCalls) {
      assistantParts.push({ type: "tool_call", id: tc.id, name: tc.name, args: tc.args });
    }
    if (assistantParts.length > 0) {
      messages.push({ role: "assistant", content: assistantParts });
    }

    // ── 3) Tool yoksa bittik ───────────────────────────────────────────────
    if (toolCalls.length === 0) {
      return { messages, usage: total, steps, finishReason: "stop" };
    }

    // ── 4) Tool'ları çalıştır → tek `role:tool` mesajı (tüm sonuçlar) ───────
    const resultParts: ContentPart[] = [];
    const run = async (inv: ToolInvocation): Promise<void> => {
      opts.handlers?.onToolStart?.(inv);
      let outcome: ToolOutcome;
      try {
        outcome = await opts.executeTool(inv);
      } catch (e) {
        outcome = { result: e instanceof Error ? e.message : String(e), isError: true };
      }
      opts.handlers?.onToolResult?.(inv, outcome);
      resultParts.push({
        type: "tool_result",
        id: inv.id,
        name: inv.name,
        result: outcome.result,
        isError: outcome.isError,
      });
    };

    if (opts.parallelTools) {
      await Promise.all(toolCalls.map(run));
    } else {
      for (const inv of toolCalls) await run(inv);
    }

    messages.push({ role: "tool", content: resultParts });
    // döngü devam — tool sonuçlarıyla modeli tekrar çağır
  }

  return { messages, usage: total, steps, finishReason: "max_steps" };
}

function dispatch(ev: StreamEvent, h?: AgentLoopHandlers): void {
  if (!h) return;
  switch (ev.type) {
    case "text_delta":
      h.onText?.(ev.text);
      break;
    case "reasoning_delta":
      h.onReasoning?.(ev.text);
      break;
    case "tool_call_delta":
      h.onToolCallDelta?.(ev.id, ev.name, ev.argsDelta);
      break;
  }
}

function accumulate(total: Usage, add: Usage): void {
  total.inputTokens = (total.inputTokens ?? 0) + (add.inputTokens ?? 0);
  total.outputTokens = (total.outputTokens ?? 0) + (add.outputTokens ?? 0);
  if (add.cacheReadTokens != null) total.cacheReadTokens = (total.cacheReadTokens ?? 0) + add.cacheReadTokens;
  if (add.cacheWriteTokens != null) total.cacheWriteTokens = (total.cacheWriteTokens ?? 0) + add.cacheWriteTokens;
}
