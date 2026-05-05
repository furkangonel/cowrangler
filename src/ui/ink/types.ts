/**
 * Shared types for the Ink-based REPL UI layer.
 *
 * The terminal UI is split into two regions:
 *  - A `<Static>` region above the prompt that stores completed turns
 *    (user input + agent reply + tool trace). Once committed, items in
 *    this region are immutable and remain in the terminal scrollback.
 *  - A live region below the static area that contains the active prompt,
 *    autocomplete menu, and (while the agent is running) a spinner with
 *    streaming tool-call traces.
 *
 * A "Turn" is the unit that gets pushed into the Static region after each
 * user submission completes (whether a /command or an agent chat).
 *
 * CLI_CONVERSATION.md mimarisine göre 3 katmanlı görünüm sistemi:
 *   brief      → Sadece agent mesajları gösterilir, tool'lar gizlenir
 *   default    → Tool'lar kullanıcı dostu isimlerle gösterilir (varsayılan)
 *   transcript → Her şey ham haliyle görünür (Ctrl+O ile açılır)
 */

export type CompletionItemKind = "command" | "skill" | "file";

export interface CompletionItem {
  /** What is inserted when this item is confirmed. */
  value: string;
  /** Left column in the menu (the visible name). */
  label: string;
  /** Right column in the menu (description / type tag). */
  description: string;
  kind: CompletionItemKind;
}

export type CompletionMode =
  | { mode: "command"; query: string }
  | { mode: "file"; query: string; atIdx: number }
  | { mode: "none" };

/**
 * 3 katmanlı görünüm modu — CLI_CONVERSATION.md
 *
 * brief      → Tool kullanımları gizlenir; sadece send_message çıktısı görünür
 * default    → Tool'lar kullanıcı dostu isimle gösterilir (⎿ prefix ile)
 * transcript → Tüm ham detaylar: tool args, narrative, timing (Ctrl+O ile aç/kapat)
 */
export type ViewMode = "brief" | "default" | "transcript";

/**
 * Spinner modu — aktif işlemin türüne göre farklı animasyon
 */
export type SpinnerMode =
  | "thinking"  // Agent düşünüyor (shimmer animasyonu)
  | "tool"      // Tool çalışıyor (dönen ikon)
  | "waiting"   // Yanıt bekleniyor
  | "idle";     // Boşta

/**
 * A trace entry produced while the agent is running a single user request.
 * These are streamed live in the busy region, then frozen onto the Turn
 * record when the request completes.
 */
export type TraceEntry =
  | { kind: "tool"; tool: string; args?: Record<string, any>; ms: number }
  | { kind: "narrative"; text: string }
  | { kind: "brief"; message: string; status: "normal" | "proactive"; sentAt: string };

/**
 * A completed conversation turn. Pushed into the <Static> list so it
 * survives further re-renders without being re-painted (no flicker, no
 * drift, no double-printing).
 */
export interface Turn {
  id: string;
  /** Raw text the user submitted (with the leading "❯ " prefix stripped). */
  userInput: string;
  /** Tool/narrative trace collected while this turn was running. */
  trace: TraceEntry[];
  /** Final assistant reply, if this turn was an agent request. */
  reply?: string;
  /** Error message, if this turn failed. */
  error?: string;
  /** Total wall-clock time of the agent run, in milliseconds. */
  durationMs?: number;
  /** ISO 8601 timestamp when the turn was completed. */
  completedAt?: string;
  /** Approximate token count for this turn (if available from LLM). */
  tokenCount?: number;
  /**
   * For /command turns we don't have a model reply — the command's own
   * stdout output (printed via console.log) shows up directly in the
   * terminal above the live region. We still record the turn for context.
   */
  isCommand?: boolean;
  /** Active view mode when this turn was rendered. */
  viewMode?: ViewMode;
}
