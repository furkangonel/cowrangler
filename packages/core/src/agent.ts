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
import { z } from "zod";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { LLM } from "./llm.js";
import { SkillManager } from "./skills.js";
import { TOOL_SCHEMAS, hasTool } from "./tools/registry.js";

/**
 * Katmanlı araç sunumu için ÇEKİRDEK araçlar — her zaman aktif (tam şema modele
 * gider). Kalanlar "extended" olarak load_tool ile talep üzerine aktive edilir.
 * Böylece 50+ aracın şeması her turda taşınmaz; sadece isim+açıklaması load_tool
 * kataloğunda durur (ucuz), tam şema yalnız gerekince yüklenir.
 */
const CORE_TOOL_NAMES = [
  // Dosya işleri
  "read_file", "write_file", "edit_file", "apply_patch",
  // Keşif: `explore` birleşik araç EK olarak var ama orijinal keşif araçlarını da
  // çekirdekte TUTUYORUZ. Bunları explore ardına gizlemek (extended tier) modelin
  // alışık olduğu arayüzü bozup regresyona yol açtı; geri koyduk. explore isteğe
  // bağlı kolaylık, orijinaller birinci sınıf.
  "explore", "search_in_files", "glob_files", "list_files", "repo_map",
  "execute_bash",
  "web_search", "fetch_webpage", "manage_task", "spawn_subagent",
  "utilize_skill", "ask_user", "load_tool", "send_message",
];
const CORE_TOOL_SET = new Set(CORE_TOOL_NAMES);

/**
 * "Hızlı olması gereken" salt-okunur/keşif araçları. Bunlar saniyeler içinde
 * dönmeli; dönmezse (ör. devasa ağaçta glob, symlink döngüsü) tüm turu asmasınlar.
 * execute_bash (kendi timeout'u var), ask_user (kullanıcıyı bekler), spawn_subagent
 * ve ağ/görsel araçları (meşru uzun sürebilir) KAPSAM DIŞI.
 */
const TIMED_TOOLS = new Set([
  "read_file", "explore", "glob_files", "search_in_files", "list_files",
  "file_info", "repo_map", "semantic_code_search",
  "git_status", "git_diff", "git_log", "which_command",
]);

/** Zamanlama teşhis logları — sadece COWRANGLER_DEBUG_TIMING=1 iken konsola yazar. */
const DEBUG_TIMING = process.env.COWRANGLER_DEBUG_TIMING === "1";
import { BriefBuffer, createSendMessageTool } from "./tools/brief_tool.js";
import { DIRS, getConfig } from "./init.js";
import { scanContext } from "./context_security.js";
import { setActiveSessionId, getProjectWorkdir, getProjectCowrnglrMd, getProjectMemoryDir } from "./project_context.js";
import { buildToolFallbackInstructions } from "./tool_fallback.js";
import { DefaultContextEngine, ContextSnapshot } from "./context_engine.js";
import { getSessionDB } from "./session_db.js";
import { modelSupportsThinking, estimateCost } from "./model_metadata.js";
import { getLogger } from "./logger.js";
import { rotateCredentialPoolKey } from "./credential_pool.js";
import { TrajectoryRecorder, TRAJECTORY_RESULT_MAX_CHARS } from "./trajectory.js";
import { cancelPendingAskUser } from "./tools/ask_user.js";

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

export const AGENT_TOOL_RESULT_MAX_CHARS = 6_000;

/** Tool sonucunu aynı Code agent döngüsündeki sonraki model adımı için küçültür. */
export function compactToolResultForModel(
  value: unknown,
  maxChars = AGENT_TOOL_RESULT_MAX_CHARS,
): unknown {
  if (typeof value === "string") {
    if (value.length <= maxChars) return value;
    return `${value.slice(0, maxChars)}\n… [${value.length - maxChars} chars omitted; request a narrower range if needed]`;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.result === "string") {
      const compact = compactToolResultForModel(obj.result, maxChars);
      return compact === obj.result ? value : { ...obj, result: compact, truncated: true };
    }
    let serialized: string;
    try { serialized = JSON.stringify(value); } catch { return value; }
    if (serialized.length > maxChars) {
      return {
        result: `${serialized.slice(0, maxChars)}\n… [${serialized.length - maxChars} chars omitted; refine the query]`,
        truncated: true,
      };
    }
  }
  return value;
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
  /**
   * Bağlam bazlı thinking tercihi (ör. design turu). Kullanıcı config/env ile
   * thinking'i açıkça KAPATMADIYSA, bunu true yapmak thinking'i (model destekliyorsa)
   * etkinleştirir — muhakeme görünür yanıt yerine reasoning kanalına akar.
   */
  public preferThinking = false;

  /**
   * send_message aracının bu instance'a enjekte edilip edilmeyeceği.
   * Desktop bağlamları (chat/session/design) tek-kanal düz metin kullanır →
   * host bunu false yapar. CLI/gateway varsayılan olarak açık bırakır.
   */
  public sendMessageEnabled = true;

  /** CLI görünüm modu — /mode komutu veya Ctrl+O ile değiştirilir */
  public viewMode: "brief" | "default" | "transcript" = "default";

  /** Per-instance brief message buffer */
  public readonly briefBuffer: BriefBuffer;

  /** Context engine — token tabanlı sıkıştırma + istatistikler */
  private contextEngine: DefaultContextEngine;

  /** Session DB kimliği — null ise kayıt yapılmaz */
  private sessionId: string | null = null;
  private readonly sessionSource: string;
  private sessionToolCallCount = 0;

  private skillManager: SkillManager;
  private originalPrompt: string;
  private baseSystemPrompt: string;
  private messages: CoreMessage[] = [];
  private allowedTools?: string[];

  /** Interrupt flag — /stop veya Ctrl+C */
  private _interruptRequested = false;

  /** Stream watchdog — sağlayıcı akışı yarıda kalırsa döngü sonsuza dek asılı kalmasın. */
  private _toolRunning = 0;
  private _lastStreamActivity = 0;

  /** Aktif chat çağrısının araç callback'leri (her execute sarmalayıcısı okur) */
  private _onToolCall?: (name: string, args: any) => void;
  private _onToolEvent?: (e: {
    id: string;
    name: string;
    args?: any;
    phase: "start" | "done" | "error";
    durationMs?: number;
    result?: any;
    error?: string;
  }) => void;

  /** Trajectory recorder — null ise kayıt yapılmaz */
  public trajectoryRecorder: TrajectoryRecorder | null = null;
  /**
   * Bu turda tamamlanan araç çağrılarının sonuçları — execute sarmalayıcısı
   * (getTools) tarafından toolCallId'ye göre doldurulur, recordTurn'den önce
   * roundToolCalls'a eşlenip temizlenir. Sadece trajectoryRecorder aktifken
   * anlamlıdır (opt-in kayıt — kullanıcı /trajectory start ile açar).
   */
  private _pendingToolResults = new Map<string, { result: unknown; isError: boolean }>();
  /** Aynı agent turunda tekrarlanan salt-okunur çağrıları kısa devre eder. */
  private _roundReadToolCache = new Set<string>();
  /**
   * TURLAR ARASI dosya-okuma önbelleği. Bir dosya bir kez tam okunduğunda
   * mtime+size'ı burada saklanır. Sonraki tam okumada dosya DEĞİŞMEMİŞSE içeriği
   * yeniden göndermeyiz — sadece "değişmedi" işaretçisi döneriz. Mutasyonda ilgili
   * yol temizlenir. Belirli aralık (start/end_line) okumaları bu önbelleği atlar
   * (hedefli okuma her zaman servis edilir). "Aynı işi tekrar tekrar yapma".
   */
  private _fileReadCache = new Map<string, { mtime: number; size: number }>();
  /** Repo haritası bu oturumda bir kez enjekte edildi mi (agent el yordamıyla aramasın). */
  private _repoMapInjected = false;
  /**
   * P2 tiered lazy-load: load_tool ile bu oturumda aktive edilmiş "extended"
   * araçlar. experimental_activeTools üzerinden modele sunulur; kalıcıdır
   * (oturum boyu), böylece bir kez yüklenen araç tekrar yüklenmez.
   */
  private activatedTools = new Set<string>();
  /** Bu turun kullanıcı metni — extended araçların relevance seçimi için. */
  private _turnUserText = "";

  public approvedPlanActions = new Set<string>();

  constructor(
    llm: LLM,
    systemPrompt: string,
    maxIterations: number = 25,
    allowedTools?: string[],
    sessionSource: string = "cli",
  ) {
    this.llm = llm;
    this.sessionSource = sessionSource;
    this.maxIterations = maxIterations;
    this.allowedTools = allowedTools;
    // (setAllowedTools allows the host to re-scope tools per context without recreating.)
    this.skillManager = new SkillManager();
    this.originalPrompt = systemPrompt;
    this.baseSystemPrompt = this._buildSystemPrompt(systemPrompt);
    this.briefBuffer = new BriefBuffer();

    // Context engine — modele göre ayarlanır
    this.contextEngine = new DefaultContextEngine(llm.model);

    // Session başlat
    this._startSession(sessionSource);
  }

  private _startSession(source: string): void {
    try {
      const db = getSessionDB();
      this.sessionId = db.createSession({
        source,
        model: this.llm.model,
        workdir: getProjectWorkdir(),
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

    const cowrnglrMd = getProjectCowrnglrMd();
    if (fs.existsSync(cowrnglrMd)) {
      let cowrnglrContent = fs.readFileSync(cowrnglrMd, "utf-8").trim();
      if (cowrnglrContent) {
        const scan = scanContext(cowrnglrContent, "COWRNGLR.md");
        cowrnglrContent = scan.content;
        finalPrompt +=
          `\n\n[COWRNGLR.md — PROJECT CONTEXT]\nThis file was generated by /init and may have been ` +
          `manually edited. Treat it as the authoritative source of truth for this project:\n---\n${cowrnglrContent}\n---`;
      }
    }

    const localMemoryDir = getProjectMemoryDir();
    if (fs.existsSync(localMemoryDir)) {
      const stat = fs.statSync(localMemoryDir);
      let memoryContent = "";
      if (stat.isDirectory()) {
        const files = fs.readdirSync(localMemoryDir).filter(f => f.endsWith(".md"));
        for (const file of files) {
          const content = fs.readFileSync(path.join(localMemoryDir, file), "utf-8").trim();
          if (content) {
            memoryContent += `\n--- [${file}] ---\n${content}\n`;
          }
        }
      } else {
        memoryContent = fs.readFileSync(localMemoryDir, "utf-8").trim();
      }
      
      memoryContent = memoryContent.trim();
      if (memoryContent) {
        memoryContent = scanContext(memoryContent, "project memory").content;
        finalPrompt +=
          `\n\n[PROJECT MEMORY]\nThe following contains authoritative facts about the project. ` +
          `Always respect these:\n${memoryContent}`;
      }
    }

    // Yalnız ETKİN skill'ler listelenir — devre dışı bırakılanlar prompt'a
    // hiç girmez (önceden tüm skill'ler enjekte ediliyordu, disabled dahil).
    const skills = this.skillManager.getEnabledSkills();

    // setup-cowork ONBOARDING: yalnızca açıkça etkinleştirilmişse zorunlu direktif
    // olarak enjekte edilir (config.onboarding.force veya COWRANGLER_ONBOARDING=1).
    // Aksi halde normal bir skill gibi listelenir. Böylece model her "merhaba"da
    // kurulum akışını (TODO listesi + rol sorma + dosya tarama) zorla çalıştırmaz.
    let onboardingForced = false;
    try {
      onboardingForced =
        process.env.COWRANGLER_ONBOARDING === "1" ||
        Boolean((getConfig() as any)?.onboarding?.force);
    } catch { /* config yoksa varsayılan: zorunlu değil */ }

    const setupCowork = skills.find(s => s.id === 'setup-cowork');
    if (setupCowork && onboardingForced) {
      finalPrompt += `\n\n[SYSTEM DIRECTIVE: SETUP-COWORK]\nThe following is a core operating procedure that must ALWAYS be followed:\n---\n${setupCowork.content}\n---`;
    }

    // Onboarding zorlanmıyorsa setup-cowork'ü normal skill listesinde tut (kullanıcı
    // isterse utilize_skill ile çalıştırır); zorlanıyorsa listeden çıkar (zaten enjekte edildi).
    const visibleSkills = onboardingForced
      ? skills.filter(s => s.id !== 'setup-cowork')
      : skills;
    if (visibleSkills.length > 0) {
      const skillsText = visibleSkills
        .map((s) => `- **${s.id}**: ${s.description}`)
        .join("\n");
      finalPrompt +=
        `\n\n[AVAILABLE SKILLS]\nYou have the following Standard Operating Procedures (SOPs). ` +
        `When a user request matches one, load it with \`utilize_skill\` — bu çağrı skill'i ` +
        `projenin CONTEXT alanına kopyalar ve aktif hale getirir:\n${skillsText}`;
    }

    // WP-6: native tool-calling desteklemeyen modeller (yerel Ollama vb.) için
    // JSON tool-call fallback protokolünü sistem promptuna göm. Böylece araçlar
    // her modelde çalışır. Native destekli modellerde eklenmez (cache/temizlik).
    if (!this.llm.supportsNativeToolCalling()) {
      finalPrompt += `\n\n${buildToolFallbackInstructions(this._toolSetForPrompt())}`;
    }

    return finalPrompt;
  }

  /** Fallback protokol listesinde gösterilecek araç kümesi (allowedTools'a saygılı). */
  private _toolSetForPrompt(): Record<string, { description?: string; parameters?: unknown }> {
    if (!this.allowedTools || this.allowedTools.includes("*")) {
      return TOOL_SCHEMAS;
    }
    const subset: Record<string, any> = {};
    for (const [key, value] of Object.entries(TOOL_SCHEMAS)) {
      if (this.allowedTools.includes(key)) subset[key] = value;
    }
    return subset;
  }

  /** Re-scope the tools exposed to the model (e.g. a lean set for chat mode). */
  public setAllowedTools(tools?: string[]): void {
    this.allowedTools = tools;
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
    // Perf/odak: çok sayıda araç (builtin + MCP) modelin kafasını karıştırır ve
    // ilk-token gecikmesini artırır. İki mekanizma var:
    //
    //  1) COWRANGLER_MAX_TOOLS (hard-cap): açıkça ayarlıysa fazlalığı OBJEDEN
    //     siler. Eski davranış — geri uyum için korunur. Sildiği araç çağrılamaz.
    //  2) Tiered lazy-load (yeni, default): araçları objede TUTAR ama modele
    //     yalnız çekirdek + aktive edilmişleri sunar (experimental_activeTools).
    //     Kalanlar load_tool kataloğunda isim+açıklama olarak durur; kaybolmaz,
    //     bir tur gecikmeyle erişilir. Hard-cap set edilmişse tiering devre dışı.
    let cfgToolMax = "";
    try { cfgToolMax = String((getConfig() as any)?.tools?.max ?? ""); } catch {}
    const toolCap = parseInt(process.env.COWRANGLER_MAX_TOOLS ?? cfgToolMax, 10);
    const hardCapActive = Number.isFinite(toolCap) && toolCap > 0;
    if (hardCapActive && Object.keys(base).length > toolCap) {
      const kept: Record<string, any> = {};
      for (const k of CORE_TOOL_NAMES) if (base[k]) kept[k] = base[k];
      for (const k of Object.keys(base)) {
        if (Object.keys(kept).length >= toolCap) break;
        if (!kept[k]) kept[k] = base[k];
      }
      base = kept;
    }

    // Instance'a özgü send_message — global kaydı override eder.
    // Chat modunda (allowlist var ve send_message içermiyorsa) EKLEME: model düz
    // metin yanıt verir, bu da UI'da doğrudan görünür. Böylece "cevap tool
    // accordion'ında saklı kalıyor" karışıklığı ve gereksiz tur ortadan kalkar.
    const sendMessageAllowed =
      this.sendMessageEnabled &&
      (!this.allowedTools || this.allowedTools.includes("*") || this.allowedTools.includes("send_message"));
    if (sendMessageAllowed) {
      base["send_message"] = createSendMessageTool(this.briefBuffer);
    } else {
      // Tek-kanal düz metin modu: send_message kaydını explicit olarak sök ki
      // global TOOL_SCHEMAS'tan miras kalmasın.
      delete base["send_message"];
    }

    // ── P2: load_tool meta-aracı ────────────────────────────────────────────
    // Tiering aktifse, extended araçların isim+açıklamasını listeleyen bir
    // load_tool aracı ekle. Model gerekince bunu çağırır → activatedTools'a
    // eklenir → experimental_prepareStep bir sonraki adımda tam şemayı sunar.
    if (this._tieringActive(Object.keys(base).length, hardCapActive)) {
      const catalog = Object.keys(base)
        .filter((n) => !CORE_TOOL_SET.has(n) && !this.activatedTools.has(n))
        .map((n) => {
          const d = String(base[n]?.description ?? "").split("\n")[0].slice(0, 140);
          return `- ${n}: ${d}`;
        })
        .join("\n");
      // Katalog boşsa (her şey zaten aktif) load_tool ekleme.
      if (catalog) {
        const self = this;
        base["load_tool"] = {
          description:
            "Activate additional tools into the callable set. To save context, only core " +
            "tools are exposed by default. If a task needs a tool listed below, call load_tool " +
            "with its name(s) FIRST; the tool becomes callable on your next step.\n\n" +
            "Loadable tools:\n" +
            catalog,
          parameters: z.object({
            names: z.array(z.string()).describe("Exact tool name(s) to activate"),
          }),
          execute: async ({ names }: { names: string[] }) => {
            const loaded: string[] = [];
            const unknown: string[] = [];
            for (const n of names ?? []) {
              if (hasTool(n) || n in base) {
                self.activatedTools.add(n);
                loaded.push(n);
              } else {
                unknown.push(n);
              }
            }
            return {
              result:
                (loaded.length ? `Activated (now callable): ${loaded.join(", ")}.` : "No tools activated.") +
                (unknown.length ? ` Unknown, ignored: ${unknown.join(", ")}.` : ""),
            };
          },
        };
      }
    }

    // ── P2: tiering aktifse base'i AKTİF alt-kümeye indir ───────────────────
    // ÖNEMLİ: Daha önce tüm araçları `tools`'ta gönderip `experimental_activeTools`
    // ile daraltıyorduk. Anthropic'te sorunsuz ama GEMINI function-calling buna
    // hassas — model tool-call'ı emit edip stream'i donduruyordu (regresyon).
    // Provider-güvenli yol: doğrudan `tools`'u subset'le. Böylece her sağlayıcıya
    // sadece aktif araçlar standart biçimde gider. (load_tool yine çekirdekte;
    // çağrılınca activatedTools'a ekler, sonraki tur alt-kümede görünür.)
    const activeNames = new Set(this.getActiveToolNames(base));
    if (activeNames.size > 0 && activeNames.size < Object.keys(base).length) {
      const filtered: Record<string, any> = {};
      for (const k of Object.keys(base)) if (activeNames.has(k)) filtered[k] = base[k];
      base = filtered;
    }

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
            const cacheableReads = new Set([
              "read_file", "explore", "list_files", "glob_files", "search_in_files", "file_info",
              "git_status", "git_diff", "git_log", "which_command", "repo_map",
            ]);
            const readCacheKey = cacheableReads.has(name)
              ? `${name}:${JSON.stringify(args ?? {})}`
              : null;
            if (readCacheKey && this._roundReadToolCache.has(readCacheKey)) {
              const duplicate = {
                result: `[duplicate ${name} call omitted — the identical result is already present earlier in this turn]`,
              };
              this._onToolEvent?.({ id, name, phase: "done", durationMs: Date.now() - startedAt, result: duplicate });
              return duplicate;
            }

            // ── TURLAR ARASI dosya-okuma önbelleği ──────────────────────────
            // read_file / explore{action:read} TAM okuma (aralık yok) ve dosya son
            // okumadan beri DEĞİŞMEMİŞSE: içeriği yeniden gönderme, kısa işaretçi
            // dön. Böylece agent değişmeyen dosyaları tur tur yeniden okuyup token
            // yakmaz. Aralık (start/end_line) okumaları bilerek atlanır → hedefli
            // okuma her zaman gerçek içerik döndürür. Değişmiş/ilk okumada normal
            // akışa düşer (permission + hooks korunur); imza `fullReadAbs` üzerinden
            // orig çalıştıktan SONRA kaydedilir.
            let fullReadAbs: string | null = null;
            const isFullRead =
              args?.start_line == null &&
              args?.end_line == null &&
              typeof args?.path === "string" &&
              (name === "read_file" || (name === "explore" && args?.action === "read"));
            if (isFullRead) {
              try {
                const abs = path.isAbsolute(args.path)
                  ? path.resolve(args.path)
                  : path.resolve(getProjectWorkdir(), args.path);
                const st = fs.statSync(abs);
                const prev = this._fileReadCache.get(abs);
                const cur = { mtime: Math.floor(st.mtimeMs), size: st.size };
                if (prev && prev.mtime === cur.mtime && prev.size === cur.size) {
                  const unchanged = {
                    result:
                      `[${args.path} unchanged since you last read it this session ` +
                      `(${cur.size} bytes) — content NOT resent to save tokens. Your earlier read is still valid. ` +
                      `If you need a specific part again, read it with a start_line/end_line range.]`,
                  };
                  this._onToolEvent?.({ id, name, phase: "done", durationMs: Date.now() - startedAt, result: unchanged });
                  return unchanged;
                }
                fullReadAbs = abs; // değişmiş/ilk okuma — orig sonrası imzala
              } catch {
                // stat başarısız (dosya yok vb.) → normal akışa düş.
              }
            }
            // ── Centralized Permission Check ──
            const { checkPermission, riskBadge, normalizePermissionMode, isOptionSelected } = await import("./permissions.js");
            const config = getConfig();
            let permissionMode = normalizePermissionMode(args?.permission_mode ?? config.permission_mode ?? "default");

            // Design mode auto-bypass check
            const isDesignMode = this.allowedTools &&
                                 this.allowedTools.includes("generate_image") &&
                                 !this.allowedTools.includes("execute_bash");
            if (isDesignMode) {
              permissionMode = "bypass";
            }

            if (permissionMode !== "bypass") {
              let extraInfo: string | undefined;
              if (name === "execute_bash") {
                extraInfo = args.command;
              } else if (name === "delete_file" || name === "delete_folder" || name === "write_file" || name === "edit_file" || name === "append_to_file" || name === "create_folder") {
                extraInfo = args.path ? path.resolve(getProjectWorkdir(), args.path) : args.path;
              }

              const policy = {
                allow: config["permissions.allow"],
                deny: config["permissions.deny"],
                alwaysAskDestructive: config["permissions.alwaysAskDestructive"] !== false,
              };

              const permResult = checkPermission(name, permissionMode, extraInfo, policy);
              const recordPermDecision = (decision: "allowed" | "denied", source: "auto" | "user", reason?: string) => {
                try {
                  getSessionDB().recordPermissionDecision({
                    sessionId: this.sessionId ?? null,
                    toolName: name,
                    riskLevel: permResult.riskLevel,
                    decision,
                    source,
                    reason,
                    extraInfo,
                  });
                } catch {
                  // Denetim kaydı best-effort — hata araç yürütmesini engellemesin.
                }
              };

              if (!permResult.allowed && !permResult.requiresApproval) {
                const blockMsg = `${riskBadge(permResult.riskLevel)} BLOCKED: ${permResult.reason}`;
                recordPermDecision("denied", "auto", permResult.reason);
                this._onToolEvent?.({ id, name, phase: "done", durationMs: Date.now() - startedAt, result: blockMsg });
                if (this.trajectoryRecorder) this._pendingToolResults.set(id, { result: blockMsg, isError: true });
                return blockMsg;
              }

              if (permResult.requiresApproval) {
                const planKey = `${name}:${extraInfo ?? ""}`;
                if (permissionMode === "plan" && this.approvedPlanActions.has(planKey)) {
                  // Already approved in this plan context, proceed
                } else {
                  const { executeAskUser } = await import("./tools/ask_user.js");
                  const baseQuestion = name === "execute_bash"
                    ? `Do you want to run this command: "${args.command}"?`
                    : `Do you want to run tool: ${name}${extraInfo ? ` on "${extraInfo}"` : ""}?`;
                  // Kullanıcı SADECE "izin ver mi" değil, NEDEN sorulduğunu da görsün.
                  const questionText = permResult.reason
                    ? `${baseQuestion}\n\n${riskBadge(permResult.riskLevel)} ${permResult.reason}`
                    : baseQuestion;

                  // Onay istemi cevapsız kalırsa sonsuza dek asılı kalma:
                  // 10 dk sonra güvenli varsayılan olan Deny ile devam et.
                  const isDestructive =
                    permResult.actionClass === "irreversible" ||
                    permResult.externalEffect ||
                    permResult.riskLevel === "dangerous" ||
                    permResult.riskLevel === "critical" ||
                    name === "delete_file" ||
                    name === "delete_folder";

                  const intent = isDestructive ? "destructive_confirmation" as const : "permission_approval" as const;

                  const approval = await executeAskUser({
                    questions: [
                      {
                        question: questionText,
                        options: ["Allow", "Deny"],
                      }
                    ],
                    intent
                  }, { sessionId: this.sessionId }, { timeoutMs: 10 * 60_000, timeoutAnswer: "Deny" });

                  if (!isOptionSelected(approval, "Allow")) {
                    const blockMsg = `${riskBadge("dangerous")} BLOCKED: User denied permission.`;
                    recordPermDecision("denied", "user", "User denied permission.");
                    this._onToolEvent?.({ id, name, phase: "done", durationMs: Date.now() - startedAt, result: blockMsg });
                    if (this.trajectoryRecorder) this._pendingToolResults.set(id, { result: blockMsg, isError: true });
                    return blockMsg;
                  }

                  recordPermDecision("allowed", "user");

                  if (permissionMode === "plan") {
                    this.approvedPlanActions.add(planKey);
                  }
                }
              } else {
                recordPermDecision("allowed", "auto");
              }
            }

            try { const { runHooks } = await import("./hooks.js"); await runHooks("pre_tool_call", { tool: name }); } catch { /* hooks best-effort */ }
            // Araç çalışırken stream'den chunk gelmez — watchdog'un bunu stall
            // sanmaması için çalışan araç sayısını izle.
            const _tExecStart = Date.now();
            // eslint-disable-next-line no-console
            if (DEBUG_TIMING) console.error(`[TOOL-TIMING] ▶ ${name} start args=${JSON.stringify(args ?? {}).slice(0, 120)}`);
            this._toolRunning++;
            let r: any;
            try {
              r = await this._runToolWithTimeout(name, orig, args, options);
            } finally {
              this._toolRunning--;
              // eslint-disable-next-line no-console
              if (DEBUG_TIMING) console.error(`[TOOL-TIMING] ■ ${name} done in ${Date.now() - _tExecStart}ms`);
              this._lastStreamActivity = Date.now();
            }
            if (readCacheKey) this._roundReadToolCache.add(readCacheKey);
            // Tam okuma başarıyla tamamlandı → turlar-arası imzayı kaydet (sonraki
            // aynı okuma değişmemişse gönderilmeyecek).
            if (fullReadAbs) {
              try {
                const st2 = fs.statSync(fullReadAbs);
                this._fileReadCache.set(fullReadAbs, { mtime: Math.floor(st2.mtimeMs), size: st2.size });
              } catch { /* stat yarışı — kaydetme */ }
            }
            if ([
              "write_file", "edit_file", "apply_patch", "append_to_file",
              "move_item", "copy_file", "delete_file", "delete_folder", "create_folder",
              "execute_bash", "git_checkout_file", "git_stash",
            ].includes(name)) {
              // Bir mutasyon sonrası önceki dosya/git okumaları artık stale olabilir.
              this._roundReadToolCache.clear();
              // TURLAR ARASI önbelleği de geçersiz kıl. Yol-hedefli mutasyonlarda
              // yalnız o dosyayı düş; kapsamı bilinmeyen mutasyonlarda (bash, git,
              // move/copy) tamamını temizle (güvenli taraf — stale içerik dönmesin).
              const pathScoped = ["write_file", "edit_file", "apply_patch", "append_to_file", "delete_file"];
              if (pathScoped.includes(name) && typeof args?.path === "string") {
                const absM = path.isAbsolute(args.path)
                  ? path.resolve(args.path)
                  : path.resolve(getProjectWorkdir(), args.path);
                this._fileReadCache.delete(absM);
              } else {
                this._fileReadCache.clear();
              }
            }
            try { const { runHooks } = await import("./hooks.js"); await runHooks("post_tool_call", { tool: name }); } catch { /* hooks best-effort */ }
            if (name === "write_plan" && typeof r === "string" && r.startsWith("PLAN_APPROVED_CONTINUE:")) {
              if (args.steps && Array.isArray(args.steps)) {
                const workdir = getProjectWorkdir();
                for (const step of args.steps) {
                  if (step.files && Array.isArray(step.files)) {
                    for (const f of step.files) {
                      const absF = path.resolve(workdir, f);
                      this.approvedPlanActions.add(`write_file:${absF}`);
                      this.approvedPlanActions.add(`edit_file:${absF}`);
                      this.approvedPlanActions.add(`append_to_file:${absF}`);
                      this.approvedPlanActions.add(`delete_file:${absF}`);
                      this.approvedPlanActions.add(`create_folder:${absF}`);
                    }
                  }
                }
              }
            }
            this._onToolEvent?.({ id, name, phase: "done", durationMs: Date.now() - startedAt, result: r });
            if (this.trajectoryRecorder) this._pendingToolResults.set(id, { result: r, isError: false });
            return ["desktop_code", "desktop_session", "cli", "batch", "cron"].includes(this.sessionSource)
              ? compactToolResultForModel(r)
              : r;
          } catch (err) {
            const errMsg = (err as any)?.message ?? String(err);
            this._onToolEvent?.({ id, name, phase: "error", durationMs: Date.now() - startedAt, error: errMsg });
            if (this.trajectoryRecorder) this._pendingToolResults.set(id, { result: errMsg, isError: true });
            throw err;
          }
        },
      };
    }
    return wrapped;
  }

  /**
   * Tiering (katmanlı sunum) bu tur aktif mi?
   *  - Hard-cap (COWRANGLER_MAX_TOOLS) set ise → tiering KAPALI (çakışmasın).
   *  - COWRANGLER_TOOL_TIERING=0 / config.tools.tiered=false → kapalı.
   *  - =1 / true → açık.
   *  - Aksi halde: araç sayısı eşiği (default 25) aşınca otomatik açık.
   * Küçük allowlist'ler (chat/lean mod) eşiğin altında kalır → davranış değişmez.
   */
  private _tieringActive(toolCount: number, hardCapActive: boolean): boolean {
    if (hardCapActive) return false;
    let cfgTiered: unknown;
    let cfgThreshold = "";
    try {
      const t = (getConfig() as any)?.tools ?? {};
      cfgTiered = t.tiered;
      cfgThreshold = String(t.tier_threshold ?? "");
    } catch { /* config yoksa default */ }
    const env = process.env.COWRANGLER_TOOL_TIERING;
    if (env === "0" || cfgTiered === false) return false;
    if (env === "1" || cfgTiered === true) return true;
    // VARSAYILAN: KAPALI (opt-in). Tool subsetting bazı sağlayıcılarda (Gemini)
    // function-calling'i bozdu; güvenli varsayılan tüm araçları göndermek. Token
    // optimizasyonu için açıkça COWRANGLER_TOOL_TIERING=1 gerekiyor.
    void toolCount; void cfgThreshold;
    return false;
  }

  /**
   * Modele SUNULACAK araç adları (experimental_activeTools). Tiering aktifse
   * çekirdek + bu oturumda load_tool ile aktive edilmişler; değilse hepsi.
   * Kayıt sırasını korur → Anthropic prompt-cache prefix'i stabil kalır.
   */
  private getActiveToolNames(toolSet: Record<string, any>): string[] {
    const names = Object.keys(toolSet);
    // Hard-cap zaten objeyi kırptığından ikinci parametre hesaplanır; burada
    // yalnız tiering kararına bakıyoruz (hard-cap set ise _tieringActive false).
    let hardCapActive = false;
    try {
      const cfgMax = String((getConfig() as any)?.tools?.max ?? "");
      const cap = parseInt(process.env.COWRANGLER_MAX_TOOLS ?? cfgMax, 10);
      hardCapActive = Number.isFinite(cap) && cap > 0;
    } catch { /* default */ }
    if (!this._tieringActive(names.length, hardCapActive)) return names;
    const active = new Set<string>();
    for (const n of CORE_TOOL_NAMES) if (toolSet[n]) active.add(n);
    // Oturum boyu load_tool ile aktive edilmişler (kalıcı).
    for (const n of this.activatedTools) if (toolSet[n]) active.add(n);
    // Tur-başı relevance: extended araçlardan bu turun metnine uyanları da ekle,
    // böylece model çoğu ihtiyacı load_tool round-trip'i olmadan karşılar.
    for (const n of names) {
      if (active.has(n)) continue;
      if (this._toolMatchesTurn(n, toolSet[n])) active.add(n);
    }
    // Stabil sıra: orijinal kayıt sırasına göre filtrele (cache prefix'i bozulmasın).
    return names.filter((n) => active.has(n));
  }

  /**
   * Bir extended aracın bu turun kullanıcı metniyle alakalı olup olmadığı.
   * Ucuz sezgisel: araç adının alt-kelimeleri (>=4 harf) veya adı, metinde geçiyorsa
   * eşleşir. Hata payı güvenli tarafta — çekirdek araçlar zaten hep aktif; yanlış
   * eşleşme yalnız birkaç fazladan şema, kaçırma ise load_tool ile telafi edilir.
   */
  private _toolMatchesTurn(name: string, tool: any): boolean {
    const text = this._turnUserText.toLowerCase();
    if (!text) return false;
    if (text.includes(name.toLowerCase().replace(/_/g, " "))) return true;
    for (const part of name.toLowerCase().split(/[_\s]+/)) {
      if (part.length >= 4 && text.includes(part)) return true;
    }
    // Açıklamanın ilk cümlesindeki anlamlı kelimeler metinde geçiyor mu?
    const desc = String(tool?.description ?? "").toLowerCase().split(/[.\n]/)[0];
    for (const w of desc.split(/[^a-z0-9]+/)) {
      if (w.length >= 5 && text.includes(w)) return true;
    }
    return false;
  }

  /**
   * Bir aracı, "hızlı olması gereken" araç kümesindeyse zaman aşımıyla çalıştırır.
   * Süre aşılırsa araç TERK EDİLİR (arka plandaki promise sızmasın diye reddi yutulur)
   * ve modele bir hata sonucu döner — böylece model uyum sağlar, tur asılı kalmaz.
   * Bu, JS araçlarında (glob/search/read) timeout olmaması + stall watchdog'un çalışan
   * araç varken susması yüzünden oluşan sonsuz-asılma açığını kapatır.
   * `COWRANGLER_TOOL_TIMEOUT_MS=0` (veya config.tools.timeout_ms=0) ile kapatılabilir.
   */
  private async _runToolWithTimeout(
    name: string,
    orig: (a: any, o: any) => any,
    args: any,
    options: any,
  ): Promise<any> {
    if (!TIMED_TOOLS.has(name)) return orig(args, options);
    let ms = 60_000;
    try {
      const cfg = getConfig() as any;
      const raw = process.env.COWRANGLER_TOOL_TIMEOUT_MS ?? String(cfg?.tools?.timeout_ms ?? "");
      const parsed = parseInt(raw, 10);
      if (Number.isFinite(parsed)) ms = parsed; // 0 → kapalı
    } catch { /* config yoksa default */ }
    if (!(ms > 0)) return orig(args, options);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const TIMEOUT = Symbol("timeout");
    const timeout = new Promise<typeof TIMEOUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMEOUT), ms);
    });
    const p = Promise.resolve().then(() => orig(args, options));
    p.catch(() => { /* terk edilen aracın geç reddini yut */ });
    const res = await Promise.race([p, timeout]);
    if (timer) clearTimeout(timer);
    if (res === TIMEOUT) {
      return {
        result:
          `[${name} timed out after ${Math.round(ms / 1000)}s and was abandoned. ` +
          `The query was too broad or the tree too large. Narrow it: use a more specific ` +
          `path/pattern, add ignores, or read a specific file/line-range instead of scanning everything.]`,
      };
    }
    return res;
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
    // If the agent is parked inside ask_user awaiting a click, the aborted fetch
    // signal can't reach it — resolve the pending question so the loop wakes up
    // and the interrupt flag is honoured on the next check.
    cancelPendingAskUser();
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
    onReasoningToken?: (delta: string) => void,
    options?: { internal?: boolean },
  ): Promise<AgentChatResult> {
    const roundStart = Date.now();
    this._interruptRequested = false;
    this._onToolCall = onToolCall;
    this._onToolEvent = onToolEvent;

    // Dahili tur: sistem tarafından tetiklenen [SYSTEM] yönlendirmesi (boş-yanıt/
    // plan-devam guard'ları). Transcript'e YAZILMAZ ve kullanıcıya balon olarak
    // GÖSTERİLMEZ; ayrıca skill/hafıza enjeksiyonu atlanır (gereksiz token yok).
    const internal = options?.internal === true;
    // Relevance seçimi için turun kullanıcı metnini sakla (P2).
    this._turnUserText = userMessage ?? "";

    const log = getLogger();
    log.info("agent", "Chat round started", {
      model: this.llm.model,
      messageCount: this.messages.length,
      userMessageLength: userMessage.length,
    });

    // Tool sonuçlarını HER tur öncesinde buda. Büyük context modellerinde yalnız
    // %85 doluluğu beklemek aynı dosya/terminal çıktısını onlarca kez faturalar.
    this.messages = this.contextEngine.compactForNextTurn(this.messages);

    // Snapshot'taki son API input toplamı yerine mevcut geçmişin boyutunu ölç.
    // JSON/4, farklı tokenizer'lar arasında temkinli ve ucuz bir yaklaşımdır.
    const estimatedContextTokens = Math.ceil(
      (this.baseSystemPrompt.length + JSON.stringify(this.messages).length) / 4,
    );
    if (this.contextEngine.shouldCompress(estimatedContextTokens)) {
      this.messages = await this.contextEngine.compress(
        this.messages,
        this.llm,
        this.baseSystemPrompt,
      );
      // Lossy sıkıştırma eski dosya okumalarını özete taşımış olabilir; turlar-arası
      // okuma önbelleğini sıfırla ki "değişmedi, tekrar gönderme" işaretçisi artık
      // context'te olmayan bir içeriğe atıfta bulunup modeli aç bırakmasın.
      this._fileReadCache.clear();
    }

    // Skill eşleştirme + CONTEXT/hafıza enjeksiyonu yalnızca gerçek kullanıcı
    // turlarında. Dahili nudge turlarında bunlar hem gereksiz token yükü hem de
    // modele istenmeyen bağlam sızıntısıdır — tümüyle atlanır.
    let finalUserMessage = userMessage;
    if (!internal) {
      // Otomatik skill eşleştirme: kullanıcı mesajı ETKİN bir skill'le güçlü
      // eşleşiyorsa, model unutsa bile onu CONTEXT'e kopyala. Böylece hem bu tur
      // enjekte edilir hem de sağ paneldeki "Aktif Skiller"de görünür. Sadece
      // yeni eşleşmede kopyalar (idempotent, zaten aktifse dokunmaz).
      try {
        const match = this.skillManager.matchSkill(userMessage);
        if (match) {
          const already = this.skillManager
            .getContextSkills()
            .some((s) => s.id === match.id);
          if (!already) this.skillManager.copySkillToContext(match.id);
        }
      } catch { /* auto-skill best-effort */ }

      // Aktif CONTEXT skill'lerini kullanıcı mesajından hemen önce enjekte et.
      // Bu sayede baseSystemPrompt sabit kalır ve Anthropic/Gemini prompt caching korunur.
      const contextSkills = this.skillManager.getContextSkills();
      if (contextSkills.length > 0) {
        const active = contextSkills
          .map((s) => `### SKILL: ${s.id}\n${s.content}`)
          .join("\n\n");
        finalUserMessage = `[ACTIVE CONTEXT SKILLS]\nThe following SOPs are active in this project's CONTEXT. Follow them precisely when relevant:\n---\n${active}\n---\n\n[USER REQUEST]\n${userMessage}`;
      }

      // Repo haritası — oturumun İLK gerçek turunda bir kez enjekte et. Böylece
      // agent projeyi grep/list ile "el yordamıyla" keşfetmek yerine nereye
      // bakacağını baştan bilir → keşif adımları (ve token) düşer. Sadece bir kez;
      // baseSystemPrompt'a değil mesaja iliştirilir (prompt cache bozulmaz).
      // Repo-map enjeksiyonu VARSAYILAN KAPALI (opt-in): ilk tura ekstra bağlam +
      // gecikme ekliyor, kanıtlanmadı. COWRANGLER_REPO_MAP=1 ile aç.
      if (process.env.COWRANGLER_REPO_MAP === "1" && !this._repoMapInjected) {
        this._repoMapInjected = true; // hata olsa da tekrar deneyip her turu yavaşlatma
        try {
          const rm = TOOL_SCHEMAS["repo_map"];
          if (rm && typeof rm.execute === "function") {
            // İlk API çağrısından ÖNCE senkron çalışır; devasa/yavaş repoda turu
            // geciktirmesin diye 5s ile kutula — süre aşarsa haritasız devam et.
            const RM_TIMEOUT = Symbol("rm");
            const rmP = Promise.resolve().then(() => rm.execute({ limit: 25 }, {}));
            rmP.catch(() => {});
            const res = await Promise.race([
              rmP,
              new Promise((r) => setTimeout(() => r(RM_TIMEOUT), 5_000)),
            ]);
            if (res === RM_TIMEOUT) throw new Error("repo_map timed out");
            const mapText = typeof res === "string" ? res : ((res as any)?.result ?? "");
            const trimmed = String(mapText).slice(0, 4000);
            if (trimmed.trim() && !/no source files/i.test(trimmed)) {
              finalUserMessage =
                `[REPO MAP — auto-generated once for orientation. Use it to jump straight to relevant files ` +
                `instead of searching blindly. Verify with explore/read_file before editing.]\n${trimmed}\n\n---\n\n${finalUserMessage}`;
            }
          }
        } catch { /* repo map best-effort */ }
      }

      // Uzun-dönem hafıza — ilgili geçmişi geri getir ve mesaja iliştir
      try {
        const { getMemoryManager } = await import("./memory_provider.js");
        const mm = getMemoryManager();
        if (mm.enabled) {
          const recalled = await mm.prefetch(userMessage);
          if (recalled) finalUserMessage = `${recalled}\n\n---\n\n${finalUserMessage}`;
        }
      } catch { /* hafıza best-effort */ }
    }

    // Kullanıcı mesajını ekle — ekli görseller varsa native vision içeriği kur.
    this.messages.push({ role: "user", content: this._buildUserContent(finalUserMessage) });

    // Session DB'ye yaz — dahili nudge turları HARİÇ: [SYSTEM] yönergesi
    // transcript'e sızmasın (yeniden yüklemede balon olarak görünmesin).
    if (this.sessionId && !internal) {
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
    const roundToolCalls: { id?: string; name: string; args: Record<string, unknown> }[] = [];

    try {
      let lastError: unknown;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (this._interruptRequested) break;

        if (attempt > 0) {
          await new Promise((r) =>
            setTimeout(r, BASE_BACKOFF_MS * Math.pow(2, attempt - 1)),
          );
        }

        // Stream stall watchdog durumu — attempt başına sıfırlanır.
        let streamStalled = false;
        let turnTimedOut = false; // mutlak tur sınırı aşıldı mı
        let maxTurnMs = 0; // catch bloğundan da erişilebilsin diye attempt-scope
        let stallWatchdog: ReturnType<typeof setInterval> | null = null;

        try {
          let stepInputTokens = 0;
          let stepOutputTokens = 0;
          let stepCacheReadTokens = 0;
          let stepCacheWriteTokens = 0;

          // ── Provider options ────────────────────────────────────────────────
          // ── Provider options ────────────────────────────────────────────────
          const isAnthropic = this.llm.model.startsWith("claude-") || this.llm.model.includes("anthropic");

          // Thinking ayarı: config.thinking + env override.
          // COWRANGLER_THINKING=1/0 her zaman config'i ezer.
          const cfg = getConfig();
          const envThinking = process.env.COWRANGLER_THINKING;
          const thinkingConfigured =
            envThinking === "1"
              ? true
              : envThinking === "0"
                ? false // kullanıcı açıkça kapattı → bağlam tercihi ezmez
                : Boolean(cfg.thinking?.enabled) || this.preferThinking;
          const thinkingEnabled =
            thinkingConfigured && _supportsThinking(this.llm.model);
          const thinkingBudget = parseInt(
            process.env.COWRANGLER_THINKING_BUDGET ??
              String(cfg.thinking?.budget_tokens ?? 8000),
            10,
          );

          // Compile reasoning settings for multiple providers
          const providerOptions: any = {};
          if (thinkingEnabled) {
            providerOptions.anthropic = {
              thinking: { type: "enabled" as const, budgetTokens: thinkingBudget },
            };
            providerOptions.openai = {
              reasoningEffort: thinkingBudget > 4000 ? "high" : (thinkingBudget > 2000 ? "medium" : "low"),
              extraBody: {
                reasoning: {
                  max_tokens: thinkingBudget
                }
              }
            };
            providerOptions.google = {
              thinking: { budget: thinkingBudget },
            };
          }

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

          // P2: araç setini bir kez üret. Tüm araçlar objede KAYITLI (çağrılabilir)
          // ama modele yalnız `experimental_activeTools` alt-kümesi sunulur — böylece
          // 50+ aracın şeması her turda taşınmaz. Aktif küme = çekirdek + bu oturumda
          // load_tool ile aktive edilmiş + bu turun mesajına relevance ile eşleşen
          // extended araçlar. (streamText statik activeTools alır; prepareStep yalnız
          // generateText'te var, o yüzden tur-başı seçim yapıyoruz.)
          // getTools() artık tiering aktifken zaten aktif alt-kümeyi döndürüyor
          // (provider-güvenli). experimental_activeTools KULLANMIYORUZ — Gemini
          // gibi sağlayıcılarda stream'i donduruyordu.
          const toolSet = this.getTools();
          const callOptions: Parameters<typeof streamText>[0] = {
            abortSignal: this.llm.getAbortSignal(),
            model: this.llm.getModel(),
            ...(isAnthropic ? {} : { system: this.baseSystemPrompt }),
            messages: messagesWithSystem,
            tools: toolSet,
            maxSteps: this.maxIterations,
            ...(thinkingEnabled ? { providerOptions } : {}),
            onStepFinish: async ({ text, toolCalls, usage, providerMetadata }: any) => {
              if (this._interruptRequested) return;

              if (text?.trim() && onStepText) {
                onStepText(text.trim());
              }

              if (toolCalls && toolCalls.length > 0) {
                for (const call of toolCalls) {
                  roundToolCallCount++;
                  roundToolCalls.push({
                    id: call.toolCallId,
                    name: call.toolName,
                    args: (call.args ?? {}) as Record<string, unknown>,
                  });

                  // UI start/done olayları getTools() execute sarmalayıcısından
                  // gerçek zamanlı, araç-bazlı yayınlanıyor (onToolCall/onToolEvent).
                }
              }

              if (usage) {
                stepInputTokens += usage.promptTokens ?? 0;
                stepOutputTokens += usage.completionTokens ?? 0;
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
          const _tStreamStart = Date.now();
          // eslint-disable-next-line no-console
          if (DEBUG_TIMING) console.error(`[STREAM-TIMING] ▶ model call started (attempt ${attempt}, msgs=${messagesWithSystem.length})`);
          let _firstChunkLogged = false;
          const result = streamText(callOptions);

          // ── Stream stall watchdog ──────────────────────────────────────────
          // Sağlayıcı akışı yarıda kalırsa (half-open bağlantı, sessiz drop)
          // for-await sonsuza dek bekler ve UI "saatlerce takılı" görünür.
          // idleTimeoutMs boyunca hiç chunk gelmez ve araç da çalışmıyorsa
          // akışı iptal edip retry döngüsüne düşürüyoruz.
          const envIdle = parseInt(process.env.COWRANGLER_STREAM_IDLE_TIMEOUT_MS ?? "", 10);
          const idleTimeoutMs = Number.isFinite(envIdle)
            ? envIdle
            : ((cfg as any)?.stream_idle_timeout_ms ?? 120_000);
          // MUTLAK tur sınırı: idle watchdog yalnız "hiç chunk gelmiyor" halini
          // yakalar. Ama sağlayıcı yavaş yavaş reasoning/keepalive token akıtırsa
          // (ör. büyük context'te thinking'li model) her chunk aktiviteyi sıfırlar
          // ve tur SONSUZA dek sürer. Bu sert tavan, sebebi ne olursa olsun
          // (yavaş akış, uzun düşünme, takılı tool) turu belli sürede keser.
          const envMaxTurn = parseInt(process.env.COWRANGLER_MAX_TURN_MS ?? "", 10);
          maxTurnMs = Number.isFinite(envMaxTurn)
            ? envMaxTurn
            : ((cfg as any)?.max_turn_ms ?? 300_000); // 5 dk default
          const turnDeadline = Date.now() + maxTurnMs;
          this._lastStreamActivity = Date.now();
          if (idleTimeoutMs > 0 || maxTurnMs > 0) {
            stallWatchdog = setInterval(() => {
              // Sert tavan — tool çalışsa da, chunk gelse de geçerli.
              if (maxTurnMs > 0 && Date.now() > turnDeadline) {
                turnTimedOut = true;
                try { this.llm.abort(); } catch { /* zaten kapanmış olabilir */ }
                return;
              }
              if (this._toolRunning > 0) {
                this._lastStreamActivity = Date.now();
                return;
              }
              if (idleTimeoutMs > 0 && Date.now() - this._lastStreamActivity > idleTimeoutMs) {
                streamStalled = true;
                try { this.llm.abort(); } catch { /* zaten kapanmış olabilir */ }
              }
            }, 5_000);
          }

          const createdPlaceholders = new Set<string>();
          const toolCallChunks: Record<string, string> = {};

          for await (const part of result.fullStream) {
            this._lastStreamActivity = Date.now();
            if (!_firstChunkLogged) {
              _firstChunkLogged = true;
              // eslint-disable-next-line no-console
              if (DEBUG_TIMING) console.error(`[STREAM-TIMING] ◉ first chunk (${(part as any)?.type}) after ${Date.now() - _tStreamStart}ms`);
            }
            if (this._interruptRequested) break;
            if (part.type === "text-delta") {
              if (onToken && part.textDelta) onToken(part.textDelta);
            } else if (part.type === ("reasoning" as any) || part.type === ("reasoning-delta" as any)) {
              const delta = (part as any).textDelta || (part as any).reasoningDelta || (part as any).text;
              if (onReasoningToken && delta) onReasoningToken(delta);
            } else if (part.type === "tool-call-delta") {
              const chunk = part as any;
              const callId = chunk.toolCallId;
              if (chunk.toolName === "write_file" || chunk.toolName === "append_to_file") {
                toolCallChunks[callId] = (toolCallChunks[callId] ?? "") + (chunk.argsTextDelta ?? chunk.chunk ?? "");
                const accumulated = toolCallChunks[callId];
                const pathMatch = accumulated.match(/["']path["']\s*:\s*["']([^"']+)["']/);
                if (pathMatch && pathMatch[1]) {
                  const relPath = pathMatch[1];
                  if (!createdPlaceholders.has(relPath)) {
                    createdPlaceholders.add(relPath);
                    this.createPlaceholderFile(relPath).catch(() => {});
                  }
                }
              }
            } else if (part.type === "error") {
              throw (part as any).error;
            }
          }

          // Mutlak tur sınırı aşıldıysa — retry ETME (yavaş sağlayıcı/model tekrar
          // aynı süreyi yakar). Net bir hata ile turu bitir.
          if (turnTimedOut) {
            const toErr = new Error(
              `TURN_TIMEOUT: turn exceeded ${Math.round(maxTurnMs / 1000)}s and was stopped. ` +
              `The model/provider was too slow or stuck on this step. Try a smaller request, a faster model, or raise COWRANGLER_MAX_TURN_MS.`,
            );
            toErr.name = "TurnTimeoutError";
            throw toErr;
          }

          // Watchdog stall'ı yakaladıysa retryable hata olarak fırlat —
          // kullanıcı iptaliyle (AbortError) karıştırılmamalı.
          if (streamStalled) {
            const stallErr = new Error(
              `STREAM_STALL: no stream activity for ${idleTimeoutMs}ms`,
            );
            stallErr.name = "StreamStallError";
            throw stallErr;
          }

          // If the loop broke early because Stop was pressed, throw AbortError
          // so the catch block routes to agent:interrupted instead of agent:done.
          if (this._interruptRequested) {
            this.llm.clearAbortController();
            const abortErr = new Error("This operation was aborted");
            abortErr.name = "AbortError";
            throw abortErr;
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

          // Mutlak tur sınırı — abort AbortError olarak da gelebilir, o yüzden
          // bayrağı EN ÖNCE kontrol et. RETRY ETME: net mesajla bitir.
          if (turnTimedOut || (err as any)?.name === "TurnTimeoutError") {
            this.llm.clearAbortController();
            getLogger().error("agent", "Turn hard-timeout — aborted", {
              model: this.llm.model, maxTurnMs, attempt,
            });
            const msg = new Error(
              `Tur ${Math.round(maxTurnMs / 1000)} saniyeyi aştı ve durduruldu. ` +
              `Model/sağlayıcı bu adımda çok yavaştı veya takıldı. Daha küçük bir istek, ` +
              `daha hızlı bir model deneyin ya da COWRANGLER_MAX_TURN_MS değerini yükseltin.`,
            );
            msg.name = "TurnTimeoutError";
            throw msg;
          }

          // Stream stall (watchdog abort'u) — retryable; kullanıcı iptali DEĞİL.
          // Watchdog llm.abort() çağırdığı için hata AbortError olarak da
          // gelebilir; önce stall bayrağını kontrol et.
          if (streamStalled || (err as any)?.name === "StreamStallError") {
            this.llm.clearAbortController();
            getLogger().error("agent", "Stream stalled — will retry", {
              model: this.llm.model,
              attempt,
            });
            lastError = new Error(
              "Model yanıt akışı durdu (stream stalled). Ağ veya sağlayıcı kaynaklı olabilir.",
            );
            if (attempt < MAX_RETRIES) continue;
            throw lastError;
          }

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
        } finally {
          if (stallWatchdog) {
            clearInterval(stallWatchdog);
            stallWatchdog = null;
          }
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
                let reasoningContent = "";
                for (const part of msg.content) {
                  if (part.type === "text") {
                    textContent += part.text;
                  } else if (part.type === "reasoning") {
                    reasoningContent += (part as any).reasoning || (part as any).text || (part as any).details || "";
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
                if (reasoningContent) {
                  db.appendMessage({ sessionId: this.sessionId, role: "reasoning", content: reasoningContent, tokenCount: 0 });
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
          db.appendUsageEvent({
            sessionId: this.sessionId,
            surface: this.sessionSource,
            model: this.llm.model,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            cacheReadTokens: totalCacheReadTokens,
            cacheWriteTokens: totalCacheWriteTokens,
            toolCallCount: roundToolCallCount,
            status: "success",
          });
        } catch { /* sessizce devam */ }
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
        const toolCallsWithResults = roundToolCalls.map(({ id, ...rest }) => {
          const pending = id ? this._pendingToolResults.get(id) : undefined;
          if (!pending) return rest;
          const resultStr =
            typeof pending.result === "string" ? pending.result : JSON.stringify(pending.result);
          const truncated = resultStr.length > TRAJECTORY_RESULT_MAX_CHARS;
          return {
            ...rest,
            result: truncated ? resultStr.slice(0, TRAJECTORY_RESULT_MAX_CHARS) : resultStr,
            isError: pending.isError,
            resultTruncated: truncated,
          };
        });
        this._pendingToolResults.clear();

        this.trajectoryRecorder.recordTurn({
          userMessage,
          assistantResponse: finalText,
          toolCalls: toolCallsWithResults,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          tokenCount: totalTokens,
          durationMs: durationMs2,
        });
      }

      // Uzun-dönem hafıza — bu turu kalıcılaştır
      try {
        const { getMemoryManager } = await import("./memory_provider.js");
        const mm = getMemoryManager();
        if (mm.enabled) await mm.syncTurn(userMessage, finalText);
      } catch { /* hafıza best-effort */ }

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
      } catch { /* sessizce */ }
    }

    // Yeni oturum başlat
    this.messages = [];
    this._roundReadToolCache.clear();
    this.briefBuffer.clear();
    this.contextEngine.reset();
    this.sessionToolCallCount = 0;
    this.baseSystemPrompt = this._buildSystemPrompt(this.originalPrompt);
    this._startSession(this.sessionSource);
  }

  /** Oturum geçmişini veritabanından yükler */
  loadSession(sessionId: string): void {
    const db = getSessionDB();
    const sess = db.getSession(sessionId);
    if (!sess) return;

    this.sessionId = sessionId;
    setActiveSessionId(sessionId);

    const dbMsgs = db.getMessages(sessionId);
    const mapped: CoreMessage[] = [];

    for (const m of dbMsgs) {
      if (m.role === "user") {
        mapped.push({ role: "user", content: m.content });
      } else if (m.role === "assistant" || m.role === "tool_call") {
        let last = mapped[mapped.length - 1];
        if (!last || last.role !== "assistant") {
          last = { role: "assistant", content: [] };
          mapped.push(last);
        }

        if (typeof last.content === "string") {
          last.content = [{ type: "text", text: last.content }];
        }
        const contentArr = last.content as any[];

        if (m.role === "assistant") {
          contentArr.push({ type: "text", text: m.content });
        } else if (m.role === "tool_call") {
          let args = {};
          try {
            args = JSON.parse(m.content);
          } catch {
            args = {};
          }
          contentArr.push({
            type: "tool-call",
            toolCallId: m.tool_call_id || `tc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            toolName: m.tool_name || "",
            args,
          });
        }
      } else if (m.role === "tool_result") {
        let last = mapped[mapped.length - 1];
        if (!last || last.role !== "tool") {
          last = { role: "tool", content: [] };
          mapped.push(last);
        }
        const contentArr = last.content as any[];
        let result: any;
        try {
          result = JSON.parse(m.content);
        } catch {
          result = m.content;
        }
        contentArr.push({
          type: "tool-result",
          toolCallId: m.tool_call_id || "",
          toolName: m.tool_name || "",
          result,
        });
      }
    }

    // Boş nesneleri temizle
    this.messages = mapped.filter(m => {
      if (Array.isArray(m.content) && m.content.length === 0) return false;
      return true;
    });

    // Session yeniden açıldığında aynı salt-okunur çağrıları gereksiz yere
    // tekrarlamamak için geçmiş tool-call argümanlarını cache'e indeksle.
    this._roundReadToolCache.clear();
    const cacheableReads = new Set([
      "read_file", "list_files", "glob_files", "search_in_files", "file_info",
      "git_status", "git_diff", "git_log", "which_command", "repo_map",
    ]);
    for (const msg of this.messages) {
      if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue;
      for (const part of msg.content as any[]) {
        if (part?.type === "tool-call" && cacheableReads.has(part.toolName)) {
          this._roundReadToolCache.add(`${part.toolName}:${JSON.stringify(part.args ?? {})}`);
        }
      }
    }

    this.sessionToolCallCount = sess.tool_call_count;
    this.contextEngine.reset();
    this.baseSystemPrompt = this._buildSystemPrompt(this.originalPrompt);
  }

  /** Son asistan yanıtının düz metnini döndürür (/copy için). */
  getLastAssistantText(): string {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m: any = this.messages[i];
      if (m.role !== "assistant") continue;
      if (typeof m.content === "string") return m.content;
      if (Array.isArray(m.content)) {
        return m.content.filter((p: any) => p?.type === "text").map((p: any) => p.text).join("");
      }
    }
    return "";
  }

  /** Oturum kimliği */
  get currentSessionId(): string | null {
    return this.sessionId;
  }

  get contextLength(): number {
    return this.messages.length;
  }

  /**
   * Ekli görselleri native vision içeriğine dönüştürür.
   * Mesajdaki "- <path>.png/jpg/webp/gif" referanslarını tarar, proje
   * workdir'inden base64 okur ve metin + image parçalı içerik döndürür.
   * Görsel yoksa metni aynen döndürür (prompt caching korunur).
   */
  private _buildUserContent(text: string): string | any[] {
    try {
      const MIME: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
      };
      const workdir = getProjectWorkdir();
      if (!workdir) return text;
      const root = path.resolve(workdir);
      const refRe = /^-\s+(.+\.(?:png|jpe?g|webp|gif))\s*$/gim;
      const images: any[] = [];
      const seen = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = refRe.exec(text)) !== null) {
        const rel = m[1].trim();
        const ext = path.extname(rel).toLowerCase();
        const mime = MIME[ext];
        if (!mime) continue;
        const abs = path.resolve(root, rel);
        if (abs !== root && !abs.startsWith(root + path.sep)) continue; // traversal guard
        if (seen.has(abs) || !fs.existsSync(abs)) continue;
        seen.add(abs);
        const b64 = fs.readFileSync(abs).toString("base64");
        images.push({ type: "image", image: `data:${mime};base64,${b64}`, mimeType: mime });
      }
      if (!images.length) return text;
      return [{ type: "text", text }, ...images];
    } catch {
      return text;
    }
  }

  private async createPlaceholderFile(relPath: string) {
    try {
      const { getProjectWorkdir } = await import("./project_context.js");
      const path = await import("path");
      const fsPromises = await import("fs/promises");
      const { existsSync } = await import("fs");

      const target = path.isAbsolute(relPath)
        ? path.resolve(relPath)
        : path.resolve(getProjectWorkdir(), relPath);

      if (existsSync(target)) return;

      await fsPromises.mkdir(path.dirname(target), { recursive: true });

      const ext = relPath.split(".").pop()?.toLowerCase();
      let placeholder = "";
      if (ext === "html" || ext === "htm") {
        placeholder = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Loading...</title>
  <style>
    body {
      background: #fcfbfa;
      color: #7f7f7f;
      font-family: system-ui, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    .loader {
      text-align: center;
    }
    .spinner {
      border: 3px solid rgba(0,0,0,0.1);
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border-left-color: #c1693f;
      animation: spin 1s linear infinite;
      margin: 0 auto 12px;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="loader">
    <div class="spinner"></div>
    <div>Generating screen...</div>
  </div>
</body>
</html>`;
      } else if (ext === "jsx") {
        placeholder = `export default function App() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#fcfbfa', color: '#7f7f7f', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ border: '3px solid rgba(0,0,0,0.1)', width: '36px', height: '36px', borderRadius: '50%', borderLeftColor: '#c1693f', animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
      <div>Generating component...</div>
      <style>{\`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      \`}</style>
    </div>
  );
}`;
      } else if (ext === "svg") {
        placeholder = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <circle cx="50" cy="50" r="40" stroke="#c1693f" stroke-width="4" fill="none" opacity="0.3" />
  <path d="M50 10 A40 40 0 0 1 90 50" stroke="#c1693f" stroke-width="4" fill="none" />
</svg>`;
      } else if (ext === "mermaid" || ext === "mmd") {
        placeholder = `graph TD
  A[Generating diagram...]`;
      } else {
        placeholder = "Generating...";
      }

      await fsPromises.writeFile(target, placeholder, "utf-8");
    } catch (e) {
      // Ignore
    }
  }
}
