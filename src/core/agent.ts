/**
 * Agent — Ana konuşma döngüsü.
 *
 * v2 değişiklikleri:
 * - Token tabanlı context compression (mesaj sayısı değil)
 * - DefaultContextEngine entegrasyonu
 * - Session DB entegrasyonu (opsiyonel)
 * - Plugin hook sistemi
 * - Tool call count takibi
 * - Context snapshot API (status bar için)
 */

import { streamText, CoreMessage } from "ai";
import fs from "fs";
import path from "path";
import { LLM } from "./llm.js";
import { SkillManager } from "./skills.js";
import { TOOL_SCHEMAS } from "../tools/registry.js";
import { BriefBuffer, createSendMessageTool } from "../tools/brief_tool.js";
import { DIRS, COWRNGLR_MD, getConfig } from "./init.js";
import { setActiveSessionId } from "./project_context.js";
import { DefaultContextEngine, ContextSnapshot } from "./context_engine.js";
import { getSessionDB } from "./session_db.js";
import { getPluginManager } from "./plugins.js";
import { modelSupportsThinking, estimateCost } from "./model_metadata.js";
import { getLogger } from "./logger.js";
import { rotateCredentialPoolKey } from "./credential_pool.js";
import { TrajectoryRecorder } from "./trajectory.js";

/** Extended thinking destekleyen modeller için hızlı kontrol */
function _supportsThinking(model: string): boolean {
  return modelSupportsThinking(model);
}

// ─────────────────────────────────────────────────────────────────────────────
// RETRY — exponential backoff for transient API errors (429 / 500 / 503)
// ─────────────────────────────────────────────────────────────────────────────
const RETRYABLE_CODES = new Set([429, 500, 503]);
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;

function isRetryable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as any;
  const code = e.statusCode ?? e.status ?? e.code;
  if (typeof code === "number" && RETRYABLE_CODES.has(code)) return true;
  const msg: string = (e.message ?? "").toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("service unavailable")
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentChatResult {
  text: string;
  tokenCount: number;
  inputTokens: number;
  outputTokens: number;
  toolCallCount: number;
  durationMs: number;
}

export class Agent {
  public llm: LLM;
  public maxIterations: number;

  /** CLI görünüm modu — /mode komutu veya Ctrl+O ile değiştirilir */
  public viewMode: "brief" | "default" | "transcript" = "default";

  /** Per-instance brief message buffer */
  public readonly briefBuffer: BriefBuffer;

  /** Context engine — token tabanlı sıkıştırma + istatistikler */
  private contextEngine: DefaultContextEngine;

  /** Session DB kimliği — null ise kayıt yapılmaz */
  private sessionId: string | null = null;
  private sessionToolCallCount = 0;

  private skillManager: SkillManager;
  private originalPrompt: string;
  private baseSystemPrompt: string;
  private messages: CoreMessage[] = [];
  private allowedTools?: string[];

  /** Interrupt flag — /stop veya Ctrl+C */
  private _interruptRequested = false;

  /** Aktif chat çağrısının araç callback'leri (her execute sarmalayıcısı okur) */
  private _onToolCall?: (name: string, args: any) => void;
  private _onToolEvent?: (e: {
    id: string;
    name: string;
    args?: any;
    phase: "start" | "done" | "error";
    durationMs?: number;
  }) => void;

  /** Trajectory recorder — null ise kayıt yapılmaz */
  public trajectoryRecorder: TrajectoryRecorder | null = null;

  constructor(
    llm: LLM,
    systemPrompt: string,
    maxIterations: number = 25,
    allowedTools?: string[],
    sessionSource: string = "cli",
  ) {
    this.llm = llm;
    this.maxIterations = maxIterations;
    this.allowedTools = allowedTools;
    this.skillManager = new SkillManager();
    this.originalPrompt = systemPrompt;
    this.baseSystemPrompt = this._buildSystemPrompt(systemPrompt);
    this.briefBuffer = new BriefBuffer();

    // Context engine — modele göre ayarlanır
    this.contextEngine = new DefaultContextEngine(llm.model);

    // Session başlat
    this._startSession(sessionSource);

    // Plugin hook
    getPluginManager().emit("on_session_start", this.sessionId);
  }

  private _startSession(source: string): void {
    try {
      const db = getSessionDB();
      this.sessionId = db.createSession({
        source,
        model: this.llm.model,
        workdir: process.cwd(),
      });
      setActiveSessionId(this.sessionId);
    } catch {
      // Session DB kullanılamıyorsa sessizce devam et
      this.sessionId = null;
      setActiveSessionId(null);
    }
  }

  private _buildSystemPrompt(basePrompt: string): string {
    let finalPrompt = basePrompt;

    if (fs.existsSync(COWRNGLR_MD)) {
      const cowrnglrContent = fs.readFileSync(COWRNGLR_MD, "utf-8").trim();
      if (cowrnglrContent) {
        finalPrompt +=
          `\n\n[COWRNGLR.md — PROJECT CONTEXT]\nThis file was generated by /init and may have been ` +
          `manually edited. Treat it as the authoritative source of truth for this project:\n---\n${cowrnglrContent}\n---`;
      }
    }

    if (fs.existsSync(DIRS.local.memory)) {
      const stat = fs.statSync(DIRS.local.memory);
      let memoryContent = "";
      if (stat.isDirectory()) {
        const files = fs.readdirSync(DIRS.local.memory).filter(f => f.endsWith(".md"));
        for (const file of files) {
          const content = fs.readFileSync(path.join(DIRS.local.memory, file), "utf-8").trim();
          if (content) {
            memoryContent += `\n--- [${file}] ---\n${content}\n`;
          }
        }
      } else {
        memoryContent = fs.readFileSync(DIRS.local.memory, "utf-8").trim();
      }
      
      memoryContent = memoryContent.trim();
      if (memoryContent) {
        finalPrompt +=
          `\n\n[PROJECT MEMORY]\nThe following contains authoritative facts about the project. ` +
          `Always respect these:\n${memoryContent}`;
      }
    }

    const skills = this.skillManager.getAvailableSkills();
    
    // Her zaman aktif olması gereken system skill: setup-cowork
    const setupCowork = skills.find(s => s.id === 'setup-cowork');
    if (setupCowork) {
      finalPrompt += `\n\n[SYSTEM DIRECTIVE: SETUP-COWORK]\nThe following is a core operating procedure that must ALWAYS be followed:\n---\n${setupCowork.content}\n---`;
    }

    const visibleSkills = skills.filter(s => s.id !== 'setup-cowork');
    if (visibleSkills.length > 0) {
      const skillsText = visibleSkills
        .map((s) => `- **${s.id}**: ${s.description}`)
        .join("\n");
      finalPrompt +=
        `\n\n[AVAILABLE SKILLS]\nYou have the following Standard Operating Procedures (SOPs). ` +
        `When a user request matches one, load it with \`utilize_skill\` — bu çağrı skill'i ` +
        `projenin CONTEXT alanına kopyalar ve aktif hale getirir:\n${skillsText}`;
    }

    return finalPrompt;
  }

  private getTools() {
    let base: Record<string, any>;
    if (!this.allowedTools || this.allowedTools.includes("*")) {
      base = { ...TOOL_SCHEMAS };
    } else {
      base = {};
      for (const [key, value] of Object.entries(TOOL_SCHEMAS)) {
        if (this.allowedTools.includes(key)) base[key] = value;
      }
    }
    // Instance'a özgü send_message — global kaydı override eder
    base["send_message"] = createSendMessageTool(this.briefBuffer);

    // Her aracın execute'ını sarmalayarak GERÇEK ZAMANLI, BAĞIMSIZ start/done/error
    // olayları yayınla (toplu/batch değil). id = SDK'nın toolCallId'si.
    const wrapped: Record<string, any> = {};
    for (const [name, t] of Object.entries(base)) {
      if (!t || typeof (t as any).execute !== "function") {
        wrapped[name] = t;
        continue;
      }
      const orig = (t as any).execute;
      wrapped[name] = {
        ...(t as any),
        execute: async (args: any, options: any) => {
          const id =
            options?.toolCallId ??
            `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const startedAt = Date.now();
          this._onToolCall?.(name, args);
          this._onToolEvent?.({ id, name, args, phase: "start" });
          try {
            const r = await orig(args, options);
            this._onToolEvent?.({ id, name, phase: "done", durationMs: Date.now() - startedAt });
            return r;
          } catch (err) {
            this._onToolEvent?.({ id, name, phase: "error", durationMs: Date.now() - startedAt });
            throw err;
          }
        },
      };
    }
    return wrapped;
  }

  setModel(newLlm: LLM) {
    this.llm = newLlm;
    // Context engine'i yeni model için yeniden oluştur
    this.contextEngine = new DefaultContextEngine(newLlm.model);
  }

  refreshSystemPrompt() {
    this.baseSystemPrompt = this._buildSystemPrompt(this.originalPrompt);
  }

  requestInterrupt(): void {
    this._interruptRequested = true;
    this.llm.abort();
  }

  clearInterrupt(): void {
    this._interruptRequested = false;
  }

  /**
   * Ana chat döngüsü.
   *
   * Callbacks:
   *   onToolCall(name, args)  — araç çağrıldığında
   *   onStepText(text)        — model ara metin ürettiğinde
   *
   * Returns: AgentChatResult
   */
  async chat(
    userMessage: string,
    onToolCall?: (name: string, args: any) => void,
    onStepText?: (text: string) => void,
    onToken?: (delta: string) => void,
    onToolEvent?: (e: {
      id: string;
      name: string;
      args?: any;
      phase: "start" | "done" | "error";
      durationMs?: number;
    }) => void,
  ): Promise<AgentChatResult> {
    const roundStart = Date.now();
    this._interruptRequested = false;
    this._onToolCall = onToolCall;
    this._onToolEvent = onToolEvent;

    const log = getLogger();
    log.info("agent", "Chat round started", {
      model: this.llm.model,
      messageCount: this.messages.length,
      userMessageLength: userMessage.length,
    });

    // Plugin: pre_llm_call
    const plugins = getPluginManager();
    await plugins.emitAsync("pre_llm_call", { messages: this.messages, model: this.llm.model });

    // Token tabanlı context sıkıştırma kontrolü
    const snap = this.contextEngine.getSnapshot();
    if (this.contextEngine.shouldCompress(snap.contextTokens)) {
      this.messages = await this.contextEngine.compress(
        this.messages,
        this.llm,
        this.baseSystemPrompt,
      );
    }

    // Aktif CONTEXT skill'lerini kullanıcı mesajından hemen önce enjekte et.
    // Bu sayede baseSystemPrompt sabit kalır ve Anthropic/Gemini prompt caching korunur.
    const contextSkills = this.skillManager.getContextSkills();
    let finalUserMessage = userMessage;
    if (contextSkills.length > 0) {
      const active = contextSkills
        .map((s) => `### SKILL: ${s.id}\n${s.content}`)
        .join("\n\n");
      finalUserMessage = `[ACTIVE CONTEXT SKILLS]\nThe following SOPs are active in this project's CONTEXT. Follow them precisely when relevant:\n---\n${active}\n---\n\n[USER REQUEST]\n${userMessage}`;
    }

    // Kullanıcı mesajını ekle
    this.messages.push({ role: "user", content: finalUserMessage });

    // Session DB'ye yaz
    if (this.sessionId) {
      try {
        getSessionDB().appendMessage({
          sessionId: this.sessionId,
          role: "user",
          content: userMessage,
        });
      } catch { /* sessizce devam */ }
    }

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTokens = 0;
    let totalCacheReadTokens = 0;
    let totalCacheWriteTokens = 0;
    let finalText = "";
    let responseMessages: CoreMessage[] = [];
    let roundToolCallCount = 0;
    const roundToolCalls: { name: string; args: Record<string, unknown> }[] = [];

    try {
      let lastError: unknown;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (this._interruptRequested) break;

        if (attempt > 0) {
          await new Promise((r) =>
            setTimeout(r, BASE_BACKOFF_MS * Math.pow(2, attempt - 1)),
          );
        }

        try {
          let stepInputTokens = 0;
          let stepOutputTokens = 0;
          let stepCacheReadTokens = 0;
          let stepCacheWriteTokens = 0;

          // ── Provider options ────────────────────────────────────────────────
          // Anthropic: prompt caching + extended thinking (config ile kontrol edilir)
          const isAnthropic = this.llm.model.startsWith("claude-");

          // Thinking ayarı: config.thinking + env override.
          // COWRANGLER_THINKING=1/0 her zaman config'i ezer.
          const cfg = getConfig();
          const envThinking = process.env.COWRANGLER_THINKING;
          const thinkingConfigured =
            envThinking === "1"
              ? true
              : envThinking === "0"
                ? false
                : Boolean(cfg.thinking?.enabled);
          const thinkingEnabled =
            isAnthropic && thinkingConfigured && _supportsThinking(this.llm.model);
          const thinkingBudget = parseInt(
            process.env.COWRANGLER_THINKING_BUDGET ??
              String(cfg.thinking?.budget_tokens ?? 8000),
            10,
          );

          // Sistem mesajını mesaj listesine alarak cache_control uygula.
          // Anthropic SDK 1.2+ cache_control varsayılan açık; biz sistem
          // mesajını açıkça ephemeral olarak işaretleyerek ilk cache
          // breakpoint'ini garanti altına alıyoruz.
          const systemMessage = isAnthropic
            ? {
                role: "system" as const,
                content: this.baseSystemPrompt,
                providerOptions: {
                  anthropic: { cacheControl: { type: "ephemeral" as const } },
                },
              }
            : null;

          const historyMessages = this.messages.filter((m) => m.role !== "system");

          // İkinci cache breakpoint: konuşma geçmişinin son mesajını ephemeral
          // olarak işaretle. Anthropic, prefix'i (tools + system + history) bu
          // noktaya kadar cache'ler; çok-adımlı tool döngülerinde tekrar tekrar
          // okunur ve maliyet ~10x düşer. (system breakpoint tools+system'i,
          // bu breakpoint ise tüm geçmişi kapsar.)
          if (isAnthropic && historyMessages.length > 0) {
            const lastIdx = historyMessages.length - 1;
            const last = historyMessages[lastIdx] as any;
            historyMessages[lastIdx] = {
              ...last,
              providerOptions: {
                ...(last.providerOptions ?? {}),
                anthropic: {
                  ...(last.providerOptions?.anthropic ?? {}),
                  cacheControl: { type: "ephemeral" as const },
                },
              },
            };
          }

          const messagesWithSystem = systemMessage
            ? [systemMessage, ...historyMessages]
            : historyMessages;

          const callOptions: Parameters<typeof streamText>[0] = {
            abortSignal: this.llm.getAbortSignal(),
            model: this.llm.getModel(),
            ...(isAnthropic ? {} : { system: this.baseSystemPrompt }),
            messages: messagesWithSystem,
            tools: this.getTools(),
            maxSteps: this.maxIterations,
            ...(thinkingEnabled
              ? {
                  providerOptions: {
                    anthropic: {
                      thinking: { type: "enabled" as const, budgetTokens: thinkingBudget },
                    },
                  },
                }
              : {}),
            onStepFinish: async ({ text, toolCalls, usage, providerMetadata }: any) => {
              if (this._interruptRequested) return;

              if (text?.trim() && onStepText) {
                onStepText(text.trim());
              }

              if (toolCalls && toolCalls.length > 0) {
                for (const call of toolCalls) {
                  roundToolCallCount++;
                  roundToolCalls.push({
                    name: call.toolName,
                    args: (call.args ?? {}) as Record<string, unknown>,
                  });

                  // Plugin: pre_tool_call
                  await plugins.emitAsync("pre_tool_call", {
                    toolName: call.toolName,
                    args: call.args,
                  });

                  // UI start/done olayları getTools() execute sarmalayıcısından
                  // gerçek zamanlı, araç-bazlı yayınlanıyor (onToolCall/onToolEvent).
                }
              }

              if (usage) {
                stepInputTokens += usage.promptTokens ?? 0;
                stepOutputTokens += usage.completionTokens ?? 0;

                // Plugin: post_llm_call
                await plugins.emitAsync("post_llm_call", { usage });
              }

              // Anthropic cache istatistikleri (providerMetadata üzerinden)
              if (providerMetadata?.anthropic?.usage) {
                const au = providerMetadata.anthropic.usage as any;
                stepCacheReadTokens += au.cacheReadInputTokens ?? 0;
                stepCacheWriteTokens += au.cacheCreationInputTokens ?? 0;
              }
            },
          };

          // streamText — token'ları akıtarak gecikmeyi düşür. Stream'in
          // ilerlemesi için fullStream'i tüketmek zorunludur; text-delta'ları
          // onToken ile UI'a iletiyoruz. Hesaplama (usage/cache) onStepFinish
          // ve aşağıdaki final await'ler üzerinden yapılır.
          const result = streamText(callOptions);

          for await (const part of result.fullStream) {
            if (this._interruptRequested) break;
            if (part.type === "text-delta") {
              if (onToken && part.textDelta) onToken(part.textDelta);
            } else if (part.type === "error") {
              throw (part as any).error;
            }
          }

          finalText = await result.text;
          const finalUsage = await result.usage;
          const finalResponse = await result.response;
          const finalProviderMeta = await result.providerMetadata;

          totalInputTokens = stepInputTokens > 0 ? stepInputTokens : (finalUsage?.promptTokens ?? 0);
          totalOutputTokens = stepOutputTokens > 0 ? stepOutputTokens : (finalUsage?.completionTokens ?? 0);
          totalTokens = totalInputTokens + totalOutputTokens;

          // Sonuç düzeyinde cache istatistikleri (tek adımlı yanıtlar için)
          if (finalProviderMeta?.anthropic) {
            const au = (finalProviderMeta.anthropic as any).usage;
            if (au) {
              stepCacheReadTokens += au.cacheReadInputTokens ?? 0;
              stepCacheWriteTokens += au.cacheCreationInputTokens ?? 0;
            }
          }

          responseMessages = finalResponse.messages as CoreMessage[];
          lastError = undefined;

          // Cache tokenlarını geçici değişkende sakla (döngü dışında kullanacağız)
          totalCacheReadTokens += stepCacheReadTokens;
          totalCacheWriteTokens += stepCacheWriteTokens;
          this.llm.clearAbortController();
          break;
        } catch (err) {
          lastError = err;

          // AbortError = user interrupted, do not retry
          if ((err as any)?.name === 'AbortError' || (err as any)?.message?.includes('aborted')) {
            this.llm.clearAbortController();
            throw err;
          }

          // 429 rate limit → credential pool'dan farklı anahtar dene
          const e = err as any;
          const statusCode = e?.statusCode ?? e?.status ?? e?.code;
          const isRateLimit =
            statusCode === 429 ||
            (e?.message ?? "").toLowerCase().includes("rate limit") ||
            (e?.message ?? "").toLowerCase().includes("too many requests");

          if (isRateLimit && rotateCredentialPoolKey(this.llm.model)) {
            // Pool rotasyonu başarılı — backoff olmadan hemen tekrar dene
            getLogger().info(
              "agent",
              "Rate limit hit — rotated to next credential pool key",
            );
            continue;
          }

          if (attempt < MAX_RETRIES && isRetryable(err)) continue;
          throw err;
        }
      }

      if (responseMessages.length === 0 && lastError) throw lastError;

      for (const msg of responseMessages) {
        this.messages.push(msg as CoreMessage);
      }

      // Context engine güncelle
      const durationMs = Date.now() - roundStart;
      this.contextEngine.updateFromResponse({
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cacheReadTokens: totalCacheReadTokens,
        cacheWriteTokens: totalCacheWriteTokens,
      });
      this.contextEngine.setLastRoundDuration(durationMs);

      // Session istatistiklerini güncelle
      this.sessionToolCallCount += roundToolCallCount;
      if (this.sessionId) {
        try {
          const db = getSessionDB();
          
          // Kaydedilen geçmişi, asistanın döndüğü tam `responseMessages` dizisine göre işle
          for (const msg of responseMessages) {
            if (msg.role === "assistant") {
              if (typeof msg.content === "string") {
                if (msg.content) {
                  db.appendMessage({ sessionId: this.sessionId, role: "assistant", content: msg.content, tokenCount: totalOutputTokens });
                }
              } else if (Array.isArray(msg.content)) {
                let textContent = "";
                for (const part of msg.content) {
                  if (part.type === "text") {
                    textContent += part.text;
                  } else if (part.type === "tool-call") {
                    db.appendMessage({
                      sessionId: this.sessionId,
                      role: "tool_call",
                      content: JSON.stringify(part.args),
                      toolName: part.toolName,
                      toolCallId: part.toolCallId,
                    });
                  }
                }
                if (textContent) {
                  db.appendMessage({ sessionId: this.sessionId, role: "assistant", content: textContent, tokenCount: totalOutputTokens });
                }
              }
            } else if (msg.role === "tool") {
              if (Array.isArray(msg.content)) {
                for (const part of msg.content) {
                  if (part.type === "tool-result") {
                    db.appendMessage({
                      sessionId: this.sessionId,
                      role: "tool_result",
                      content: typeof part.result === "string" ? part.result : JSON.stringify(part.result),
                      toolName: part.toolName,
                      toolCallId: part.toolCallId,
                    });
                  }
                }
              }
            }
          }

          const snap = this.contextEngine.getSnapshot();
          // Maliyet tahmini — cache'ten okunan token'lar tam fiyatlanmaz
          // (Anthropic: cache read ~0.1x). Basit yaklaşım: faturalanabilir
          // input = sessionInput - cacheRead, +%10 cache read maliyeti.
          const billableInput = Math.max(
            0,
            snap.sessionInputTokens - snap.cacheReadTokens,
          );
          const cost =
            estimateCost(this.llm.model, billableInput, snap.sessionOutputTokens) +
            estimateCost(this.llm.model, snap.cacheReadTokens, 0) * 0.1;
          db.updateSession(this.sessionId, {
            input_tokens: snap.sessionInputTokens,
            output_tokens: snap.sessionOutputTokens,
            cache_read_tokens: snap.cacheReadTokens,
            cache_write_tokens: snap.cacheWriteTokens,
            tool_call_count: this.sessionToolCallCount,
            estimated_cost_usd: cost,
          });
        } catch { /* sessizce devam */ }
      }

      // Plugin: post_tool_call (toplu)
      if (roundToolCallCount > 0) {
        await plugins.emitAsync("post_tool_call", {
          count: roundToolCallCount,
        });
      }

      const durationMs2 = Date.now() - roundStart;
      log.info("agent", "Chat round completed", {
        model: this.llm.model,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cacheReadTokens: totalCacheReadTokens,
        cacheWriteTokens: totalCacheWriteTokens,
        toolCalls: roundToolCallCount,
        durationMs: durationMs2,
      });

      // Trajectory kaydı
      if (this.trajectoryRecorder) {
        this.trajectoryRecorder.recordTurn({
          userMessage,
          assistantResponse: finalText,
          toolCalls: roundToolCalls,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          tokenCount: totalTokens,
          durationMs: durationMs2,
        });
      }

      return {
        text: finalText,
        tokenCount: totalTokens,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        toolCallCount: roundToolCallCount,
        durationMs: durationMs2,
      };
    } catch (error) {
      const e = error as any;
      getLogger().error("agent", "Chat round failed", {
        model: this.llm.model,
        error: e?.message ?? String(error),
        status: e?.statusCode ?? e?.status ?? e?.code,
        responseBody: e?.responseBody ?? e?.data ?? undefined,
        url: e?.url ?? undefined,
      });
      this.messages.pop();
      throw error;
    }
  }

  /** Context snapshot — status bar için */
  getContextSnapshot(): ContextSnapshot {
    return this.contextEngine.getSnapshot();
  }

  /** Kısa model adı — status bar için */
  get modelShortName(): string {
    return this.llm.model
      .replace("openrouter/", "")
      .replace("google/", "")
      .replace("anthropic/", "")
      .split("/")
      .pop()
      ?.replace("claude-", "")
      ?.replace("gemini-", "gem-") ?? this.llm.model;
  }

  reset(): void {
    // Mevcut oturumu kapat
    if (this.sessionId) {
      try {
        const snap = this.contextEngine.getSnapshot();
        getSessionDB().closeSession(this.sessionId, {
          input_tokens: snap.sessionInputTokens,
          output_tokens: snap.sessionOutputTokens,
          tool_call_count: this.sessionToolCallCount,
        });
        getPluginManager().emit("on_session_end", this.sessionId);
      } catch { /* sessizce */ }
    }

    // Yeni oturum başlat
    this.messages = [];
    this.briefBuffer.clear();
    this.contextEngine.reset();
    this.sessionToolCallCount = 0;
    this.baseSystemPrompt = this._buildSystemPrompt(this.originalPrompt);
    this._startSession("cli");
  }

  /** Oturum kimliği */
  get currentSessionId(): string | null {
    return this.sessionId;
  }

  get contextLength(): number {
    return this.messages.length;
  }
}
