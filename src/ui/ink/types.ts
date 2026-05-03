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
 * A trace entry produced while the agent is running a single user request.
 * These are streamed live in the busy region, then frozen onto the Turn
 * record when the request completes.
 */
export type TraceEntry =
  | { kind: "tool"; tool: string; args?: Record<string, any>; ms: number }
  | { kind: "narrative"; text: string };

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
  /**
   * For /command turns we don't have a model reply — the command's own
   * stdout output (printed via console.log) shows up directly in the
   * terminal above the live region. We still record the turn for context.
   */
  isCommand?: boolean;
}
