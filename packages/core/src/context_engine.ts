/**
 * Context Engine — token tabanlı bağlam yönetimi ve sıkıştırma.
 *
 *
 * dosyalarına göre TypeScript'e uyarlanmıştır.
 *
 * Özellikler:
 * - Token sayısına göre sıkıştırma (mesaj sayısı değil)
 * - %85 eşiği (konfigüre edilebilir)
 * - Tool result budaması — yoğun sonuçları kırp
 * - Yardımcı LLM ile özet üretimi
 * - Pluggable context engine ABC
 * - Status bar için snapshot API'si
 */

import { generateText, CoreMessage } from "ai";
import { LLM } from "./llm.js";
import { getContextWindow, formatTokenCount } from "./model_metadata.js";
import { getConfig } from "./init.js";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface ContextSnapshot {
  sessionInputTokens: number;
  sessionOutputTokens: number;
  sessionTotalTokens: number;
  contextTokens: number; // mevcut context'teki token tahmini
  contextWindowSize: number; // modelin max context penceresi
  contextUsagePercent: number; // contextTokens / contextWindowSize * 100
  compressionCount: number; // bu oturumda kaç kez sıkıştırıldı
  lastRoundDurationMs: number; // son round süresi (ms)
  sessionDurationMs: number; // oturum başlangıcından bu yana geçen süre
  // Anthropic prompt caching istatistikleri
  cacheReadTokens: number; // önbellekten okunan token sayısı
  cacheWriteTokens: number; // önbelleğe yazılan token sayısı
  cacheHitRate: number; // cacheRead / (cacheRead + cacheWrite), 0..1
}

export type ContextStyle = "normal" | "warning" | "critical";

/**
 * Aynı araç + aynı argümanlarla birden fazla kez çağrılmış tool-result'lar
 * arasında SONUNCUSU dışındakiler düşük bilgi taşır (ör. model aynı dosyayı
 * peş peşe üç kez okumuşsa, ilk iki okuma özet için gürültüdür — üçüncüsü
 * neyin "güncel" olduğunu zaten temsil eder). Yalnızca sıkıştırılıp özete
 * dönüştürülecek dilime uygulanmalıdır; korunan "recent" mesajlara değil.
 */
export function collapseDuplicateToolResults(messages: CoreMessage[]): CoreMessage[] {
  // 1) toolCallId → "toolName:args" anahtarı (assistant mesajlarındaki tool-call'lardan)
  const keyByCallId = new Map<string, string>();
  for (const msg of messages) {
    if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue;
    for (const part of msg.content as any[]) {
      if (part?.type === "tool-call" && part.toolCallId) {
        keyByCallId.set(part.toolCallId, `${part.toolName}:${JSON.stringify(part.args ?? {})}`);
      }
    }
  }
  if (keyByCallId.size === 0) return messages;

  // 2) Her anahtarın EN SON geçtiği mesaj indeksi
  const lastMessageIndexForKey = new Map<string, number>();
  messages.forEach((msg, idx) => {
    if (msg.role !== "tool" || !Array.isArray(msg.content)) return;
    for (const part of msg.content as any[]) {
      if (part?.type !== "tool-result") continue;
      const key = keyByCallId.get(part.toolCallId);
      if (key) lastMessageIndexForKey.set(key, idx);
    }
  });

  // 3) Son olmayan tekrarları yer tutucuyla değiştir
  return messages.map((msg, idx) => {
    if (msg.role !== "tool" || !Array.isArray(msg.content)) return msg;
    const content = (msg.content as any[]).map((part) => {
      if (part?.type !== "tool-result") return part;
      const key = keyByCallId.get(part.toolCallId);
      if (!key) return part;
      if (lastMessageIndexForKey.get(key) === idx) return part; // en güncel — korunur
      return {
        ...part,
        result: `[duplicate ${part.toolName ?? "tool"} call — superseded by an identical later call, earlier result omitted]`,
      };
    });
    return { ...msg, content } as CoreMessage;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT ENGINE ABSTRACT (pluggable)
// ─────────────────────────────────────────────────────────────────────────────

export abstract class ContextEngine {
  abstract updateFromResponse(usage: TokenUsage): void;
  abstract shouldCompress(estimatedContextTokens: number): boolean;
  abstract compress(
    messages: CoreMessage[],
    llm: LLM,
    systemPrompt: string,
  ): Promise<CoreMessage[]>;
  abstract getSnapshot(): ContextSnapshot;
  abstract reset(): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT CONTEXT ENGINE
// ─────────────────────────────────────────────────────────────────────────────

const COMPRESS_THRESHOLD = 0.85; // %85 context dolduysa sıkıştır
const COMPRESS_KEEP_RECENT = 8; // son 8 mesajı koru
const TOOL_RESULT_MAX_CHARS = 2000; // tool result kırpma limiti
const SUMMARY_MAX_TOKENS = 800; // özet için max token
// Büyük context penceresi teknik kapasitedir, ekonomik hedef değildir. Tool
// kullanan ajanlarda geçmişi yüz binlerce tokena kadar taşımak her adımda aynı
// içeriği yeniden faturalandırır. Config ile yükseltilebilir.
const ECONOMIC_CONTEXT_LIMIT_TOKENS = 24_000;

/**
 * Sıkıştırma sonrası yanıt + sonraki tur için ayrılan mutlak token payı.
 * Küçük context pencereli modeller (ör. 8k yerel model) bu paya göre daha
 * erken sıkıştırır; büyük pencereli modeller yapılandırılmış eşiği kullanır.
 */
const RESERVE_HEADROOM_TOKENS = 24_000;

/**
 * WP-6: context penceresine göre otomatik uyarlanan sıkıştırma eşiği.
 * Her zaman en az `RESERVE_HEADROOM_TOKENS` kadar boşluk bırakacak şekilde
 * yapılandırılmış eşiği aşağı çeker; asla base'in üstüne çıkmaz.
 *   - 8k pencere   → ~%50 (taban)
 *   - 128k pencere → ~%81
 *   - ≥200k pencere → base (ör. %85)
 */
export function computeCompressThreshold(
  base: number,
  contextWindow: number,
): number {
  if (!Number.isFinite(contextWindow) || contextWindow <= 0) return base;
  const headroomRatio = 1 - RESERVE_HEADROOM_TOKENS / contextWindow;
  return Math.max(0.5, Math.min(base, headroomRatio));
}

export class DefaultContextEngine extends ContextEngine {
  private model: string;
  private sessionInputTokens = 0;
  private sessionOutputTokens = 0;
  private sessionCacheReadTokens = 0;
  private sessionCacheWriteTokens = 0;
  private contextTokens = 0;
  private compressionCount = 0;
  private lastRoundDurationMs = 0;
  private sessionStartMs: number;
  private thresholdRatio: number;
  private keepRecent: number;
  /** Özet üretimi için ucuz yardımcı model (null = ana model) */
  private summaryModel: string | null;

  constructor(model: string, thresholdRatio?: number) {
    super();
    this.model = model;

    // Config'den ayarları oku (env/yaml). Hata olursa varsayılanlar.
    let cfgThreshold = COMPRESS_THRESHOLD;
    let cfgKeepRecent = COMPRESS_KEEP_RECENT;
    let cfgSummaryModel: string | null = null;
    try {
      const ctx = getConfig().context ?? {};
      if (typeof ctx.compress_threshold === "number") cfgThreshold = ctx.compress_threshold;
      if (typeof ctx.keep_recent === "number") cfgKeepRecent = ctx.keep_recent;
      if (typeof ctx.summary_model === "string" && ctx.summary_model.trim()) {
        cfgSummaryModel = ctx.summary_model.trim();
      }
    } catch { /* varsayılanlar */ }

    this.thresholdRatio = thresholdRatio ?? cfgThreshold;
    this.keepRecent = cfgKeepRecent;
    this.summaryModel = cfgSummaryModel;
    this.sessionStartMs = Date.now();
  }

  updateFromResponse(usage: TokenUsage): void {
    this.sessionInputTokens += usage.inputTokens;
    this.sessionOutputTokens += usage.outputTokens;
    this.sessionCacheReadTokens += usage.cacheReadTokens ?? 0;
    this.sessionCacheWriteTokens += usage.cacheWriteTokens ?? 0;

    // Context token'larını input token'dan tahmin et
    this.contextTokens = usage.inputTokens;
  }

  setLastRoundDuration(ms: number): void {
    this.lastRoundDurationMs = ms;
  }

  shouldCompress(estimatedContextTokens: number): boolean {
    const customCWs = getConfig().custom_context_windows || {};
    const windowSize = customCWs[this.model] ?? getContextWindow(this.model);
    const effectiveThreshold = computeCompressThreshold(
      this.thresholdRatio,
      windowSize,
    );
    let softLimit = ECONOMIC_CONTEXT_LIMIT_TOKENS;
    try {
      const configured = Number((getConfig().context as any)?.soft_limit_tokens);
      if (Number.isFinite(configured) && configured >= 8_000) softLimit = configured;
    } catch { /* varsayılan ekonomik limit */ }
    const thresholdTokens = Math.min(windowSize * effectiveThreshold, softLimit);
    return estimatedContextTokens >= thresholdTokens;
  }

  /**
   * Her model çağrısından önce tool çıktılarını sınırlar. Önceden budama yalnız
   * compression tetiklenince çalışıyordu; 1M context modellerinde yüzlerce tool
   * sonucu tekrar tekrar taşınabiliyordu.
   */
  compactForNextTurn(messages: CoreMessage[]): CoreMessage[] {
    return this._pruneToolResults(messages);
  }

  async compress(
    messages: CoreMessage[],
    llm: LLM,
    systemPrompt: string,
  ): Promise<CoreMessage[]> {
    if (messages.length <= this.keepRecent) return messages;

    // Önce tool result'larını kırp
    const pruned = this._pruneToolResults(messages);

    // Güvenli bölme noktasını hesapla: `recent` ASLA bir orphan
    // tool-result ile (role === "tool") başlamamalı; aksi halde provider'a
    // geçersiz mesaj dizisi gider (tool_result without preceding tool_call).
    const splitAt = this._safeSplitIndex(pruned, this.keepRecent);

    // Atılacak kısımdaki tekrarlanan (aynı araç + aynı argüman) çağrıların
    // eski sonuçlarını düşük-bilgi kabul edip yer tutucuyla değiştir — özet
    // üretimi aynı dosya/komut çıktısını tekrar tekrar işlemesin. `recent`
    // (korunan) kısma dokunulmaz.
    const toSummarize = collapseDuplicateToolResults(pruned.slice(0, splitAt));
    const recent = pruned.slice(splitAt);

    if (toSummarize.length === 0) return messages;

    try {
      const summaryText = await this._generateSummary(toSummarize, llm);
      const summaryMessage: CoreMessage = {
        role: "user",
        content:
          `[CONVERSATION SUMMARY — ${toSummarize.length} earlier messages compressed]\n\n` +
          summaryText,
      };

      this.compressionCount++;
      return [summaryMessage, ...recent];
    } catch {
      // Sıkıştırma başarısız → sadece eski mesajları at
      this.compressionCount++;
      return recent;
    }
  }

  /**
   * Güvenli bölme indeksi: en az `keepRecent` mesaj korunur, fakat `recent`
   * dilimi bir "tool" rolüyle (orphan tool-result) BAŞLAMAYACAK şekilde sınır
   * geriye doğru kaydırılır. Böylece assistant tool_call + tool_result çiftleri
   * asla ikiye bölünmez. (toSummarize zaten düz metne çevrildiği için
   * geçerliliği önemli değildir.)
   */
  private _safeSplitIndex(messages: CoreMessage[], keepRecent: number): number {
    let idx = Math.max(0, messages.length - keepRecent);
    while (idx > 0 && idx < messages.length && messages[idx].role === "tool") {
      idx--; // sınırı erkene çek → tüm çifti `recent` içine al
    }
    return idx;
  }

  private _pruneToolResults(messages: CoreMessage[]): CoreMessage[] {
    return messages.map((msg) => {
      if (msg.role === "tool") {
        // tool content is an array of ToolContent items
        const toolMsg = msg as any;
        const content = Array.isArray(toolMsg.content)
          ? toolMsg.content
          : [
              {
                type: "tool-result",
                toolCallId: "",
                result: String(toolMsg.content),
              },
            ];

        const pruned = content.map((c: any) => {
          if (c.type === "tool-result") {
            const resultStr =
              typeof c.result === "string"
                ? c.result
                : JSON.stringify(c.result);
            if (resultStr.length > TOOL_RESULT_MAX_CHARS) {
              return {
                ...c,
                result:
                  resultStr.slice(0, TOOL_RESULT_MAX_CHARS) +
                  `\n... [${resultStr.length - TOOL_RESULT_MAX_CHARS} chars pruned]`,
              };
            }
          }
          return c;
        });

        return { ...msg, content: pruned } as CoreMessage;
      }
      return msg;
    });
  }

  private async _generateSummary(
    messages: CoreMessage[],
    llm: LLM,
  ): Promise<string> {
    const condensed = messages
      .map((m) => {
        const content =
          typeof m.content === "string" ? m.content : JSON.stringify(m.content);
        return `[${m.role.toUpperCase()}]: ${content.slice(0, 300)}`;
      })
      .join("\n\n");

    // Özet için ucuz yardımcı model varsa onu kullan; aksi halde ana model.
    let summaryLLM = llm;
    if (this.summaryModel && this.summaryModel !== llm.model) {
      try {
        summaryLLM = new LLM(this.summaryModel);
      } catch {
        summaryLLM = llm; // yardımcı model yapılandırılamadıysa ana modele düş
      }
    }

    const result = await generateText({
      model: summaryLLM.getModel(),
      system:
        "You are a conversation summarizer. Produce a concise factual summary of the conversation " +
        "history. Preserve: decisions made, files changed, errors encountered, completed tasks, " +
        "and any pending work. Omit pleasantries. Reply in plain prose, no headers.",
      messages: [
        {
          role: "user",
          content: `Summarize this conversation history:\n\n${condensed}`,
        },
      ],
      maxTokens: SUMMARY_MAX_TOKENS,
    });

    return result.text;
  }

  getSnapshot(): ContextSnapshot {
    const customCWs = getConfig().custom_context_windows || {};
    const windowSize = customCWs[this.model] ?? getContextWindow(this.model);
    const usagePercent = Math.min(100, (this.contextTokens / windowSize) * 100);

    return {
      sessionInputTokens: this.sessionInputTokens,
      sessionOutputTokens: this.sessionOutputTokens,
      sessionTotalTokens: this.sessionInputTokens + this.sessionOutputTokens,
      contextTokens: this.contextTokens,
      contextWindowSize: windowSize,
      contextUsagePercent: usagePercent,
      compressionCount: this.compressionCount,
      lastRoundDurationMs: this.lastRoundDurationMs,
      sessionDurationMs: Date.now() - this.sessionStartMs,
      cacheReadTokens: this.sessionCacheReadTokens,
      cacheWriteTokens: this.sessionCacheWriteTokens,
      cacheHitRate: this._cacheHitRate(),
    };
  }

  /** cacheRead / (cacheRead + cacheWrite) — 0..1, veri yoksa 0. */
  private _cacheHitRate(): number {
    const total = this.sessionCacheReadTokens + this.sessionCacheWriteTokens;
    if (total <= 0) return 0;
    return this.sessionCacheReadTokens / total;
  }

  getContextStyle(): ContextStyle {
    const { contextUsagePercent } = this.getSnapshot();
    if (contextUsagePercent >= 95) return "critical";
    if (contextUsagePercent >= 85) return "warning";
    return "normal";
  }

  get cacheStats() {
    return {
      readTokens: this.sessionCacheReadTokens,
      writeTokens: this.sessionCacheWriteTokens,
    };
  }

  reset(): void {
    this.sessionInputTokens = 0;
    this.sessionOutputTokens = 0;
    this.sessionCacheReadTokens = 0;
    this.sessionCacheWriteTokens = 0;
    this.contextTokens = 0;
    this.compressionCount = 0;
    this.lastRoundDurationMs = 0;
    this.sessionStartMs = Date.now();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS BAR FORMATTER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Terminal genişliğine göre durum çubuğu metni üretir.
 *
 * < 52  →  ⚕ model · 0:00:00
 * 52-76 →  ⚕ model · 9% · 🗜2 · 3:41:05
 * ≥ 76  →  ⚕ claude-sonnet-4-6 │ 12k/128k │ ██░░░ 9% │ 🗜 2 │ 3:41:05 │ 2.3s
 */
export function buildStatusBarText(
  snap: ContextSnapshot,
  modelShortName: string,
  termWidth: number,
): { text: string; style: ContextStyle } {
  const style: ContextStyle =
    snap.contextUsagePercent >= 95
      ? "critical"
      : snap.contextUsagePercent >= 85
        ? "warning"
        : "normal";

  const duration = _formatDuration(snap.sessionDurationMs);
  const pct = Math.round(snap.contextUsagePercent);

  if (termWidth < 52) {
    return { text: `◆ ${modelShortName} · ${duration}`, style };
  }

  if (termWidth < 76) {
    const compress =
      snap.compressionCount > 0 ? ` · 🗜${snap.compressionCount}` : "";
    return {
      text: `◆ ${modelShortName} · ${pct}%${compress} · ${duration}`,
      style,
    };
  }

  // Geniş mod
  const ctx = formatTokenCount(snap.contextTokens);
  const win = formatTokenCount(snap.contextWindowSize);
  const bar = _buildProgressBar(pct, 5);
  const compress =
    snap.compressionCount > 0 ? ` │ 🗜 ${snap.compressionCount}` : "";
  const roundMs =
    snap.lastRoundDurationMs > 0
      ? ` │ ${(snap.lastRoundDurationMs / 1000).toFixed(1)}s`
      : "";

  return {
    text: `◆ ${modelShortName} │ ${ctx}/${win} │ ${bar} ${pct}%${compress} │ ${duration}${roundMs}`,
    style,
  };
}

function _formatDuration(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return [
    h > 0 ? String(h) : null,
    h > 0 ? String(m).padStart(2, "0") : String(m),
    String(s).padStart(2, "0"),
  ]
    .filter(Boolean)
    .join(":");
}

function _buildProgressBar(pct: number, width: number): string {
  const filled = Math.round((pct / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}
