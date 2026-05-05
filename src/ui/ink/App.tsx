import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Box, Static, Text, useApp, useInput } from "ink";
import { Agent } from "../../core/agent.js";
import { SkillManager } from "../../core/skills.js";
import { CommandRouter, CommandContext } from "../commands.js";
import { UI, Theme } from "../theme.js";
import { Turn, TraceEntry, CompletionItem, ViewMode, SpinnerMode } from "./types.js";
import { getBriefMessages, clearBriefMessages } from "../../tools/brief_tool.js";
import {
  buildStaticPool,
  detectMode,
  filterForMode,
  applyCompletion,
} from "./completion.js";
import { loadHistory, appendHistory } from "./history.js";
import { Prompt, PromptHint } from "./Prompt.js";
import { CompletionMenu } from "./CompletionMenu.js";
import { AgentTurn } from "./AgentTurn.js";
import { ActiveSpinner, TraceLine } from "./Trace.js";
import { ShortcutOverlay } from "./ShortcutOverlay.js";

interface AppProps {
  agent: Agent;
}

/**
 * Root Ink component for the Co-Wrangler REPL.
 *
 * State machine:
 *
 *   IDLE  ── user types ──▶ IDLE (input mutates, completion menu may show)
 *     │
 *     │  ENTER on non-empty input
 *     ▼
 *   BUSY ──▶ tool calls / narrative stream into liveTrace
 *     │
 *     │  agent.chat resolves (or rejects)
 *     ▼
 *   commit Turn → Static, clear live state, back to IDLE
 *
 * The split between <Static> (committed turns) and the dynamic block
 * below it is what kills the drift bug for good. Ink's reconciler only
 * re-paints the dynamic block; the Static items get printed once and
 * stay put in the terminal's scrollback. There is no manual cursor
 * arithmetic anywhere in this file — that whole class of bugs is gone.
 */
/** Full-width horizontal separator — mirrors Claude Code's input area dividers. */
const Separator: React.FC<{ cols: number }> = ({ cols }) => {
  const line = Theme.dim("─".repeat(Math.max(1, cols)));
  return <Text>{line}</Text>;
};

export const App: React.FC<AppProps> = ({ agent }) => {
  const { exit } = useApp();

  // ── Long-lived collaborators ────────────────────────────────────────────
  const skillManager = useMemo(() => new SkillManager(), []);
  const router = useMemo(() => new CommandRouter(), []);

  // ── Static (committed) turns ────────────────────────────────────────────
  const [turns, setTurns] = useState<Turn[]>([]);

  // ── Input + cursor ──────────────────────────────────────────────────────
  const [input, setInput] = useState<string>("");
  const [cursor, setCursor] = useState<number>(0);

  // ── Completion menu ─────────────────────────────────────────────────────
  const [menuIndex, setMenuIndex] = useState<number>(0);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [staticPool, setStaticPool] = useState<CompletionItem[]>(() =>
    buildStaticPool(router, skillManager),
  );

  // ── History ─────────────────────────────────────────────────────────────
  const [history, setHistory] = useState<string[]>(() => loadHistory());
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const savedInputRef = useRef<string>("");

  // ── Shortcut overlay ────────────────────────────────────────────────────
  const [showShortcuts, setShowShortcuts] = useState<boolean>(false);

  // ── Terminal width — resize-safe separator rendering ────────────────────
  // We track columns in React state so the Separator re-renders with the
  // correct width. On resize we also flush \x1b[J (erase-to-end-of-screen)
  // so Ink's previous wider dynamic region is wiped before the next frame
  // is drawn — eliminating the "stacked duplicate separator" artifact.
  const [termCols, setTermCols] = useState<number>(
    () => process.stdout.columns ?? 80,
  );
  useEffect(() => {
    const onResize = () => {
      // Erase from cursor to bottom of screen — clears the stale dynamic
      // region that Ink hasn't overwritten yet after the width change.
      process.stdout.write("\x1b[J");
      setTermCols(process.stdout.columns ?? 80);
    };
    process.stdout.on("resize", onResize);
    return () => { process.stdout.off("resize", onResize); };
  }, []);

  // ── View mode — CLI_CONVERSATION.md 3 katmanlı görünüm sistemi ──────────
  // brief      → Tool'lar gizlenir, sadece send_message çıktısı görünür
  // default    → Tool'lar ⎿ prefix ile gösterilir (varsayılan)
  // transcript → Her şey ham haliyle (Ctrl+O ile aç/kapat)
  const [viewMode, setViewMode] = useState<ViewMode>("default");

  // ── Transient view-mode toast (replaces noisy console.log) ───────────────
  const [viewModeToast, setViewModeToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Live agent run ──────────────────────────────────────────────────────
  const [busy, setBusy] = useState<boolean>(false);
  const [spinnerLabel, setSpinnerLabel] = useState<string>("Düşünüyor...");
  const [spinnerMode, setSpinnerMode] = useState<SpinnerMode>("thinking");
  const [liveTrace, setLiveTrace] = useState<TraceEntry[]>([]);
  const [stepCount, setStepCount] = useState<number>(0);
  const stepStartRef = useRef<number>(0);
  const runStartRef = useRef<number>(0);   // wall-clock start of the whole run
  const busyRef = useRef<boolean>(false); // synchronous mirror for input gating

  // ── Derived: completion mode + visible menu items ───────────────────────
  const mode = useMemo(() => detectMode(input), [input]);
  const menuItems = useMemo(
    () => (busy ? [] : filterForMode(mode, staticPool)),
    [busy, mode, staticPool],
  );
  const menuVisible = menuOpen && !busy && menuItems.length > 0;

  // Cleanup toast timer on unmount
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Clamp the selected index whenever the visible list changes.
  useEffect(() => {
    if (menuIndex >= menuItems.length) setMenuIndex(0);
  }, [menuItems.length, menuIndex]);

  // Auto-open the menu whenever the user is in a completion context with
  // at least one match. The menu hides on its own once the trigger char is
  // removed (mode becomes "none" → menuItems empty).
  useEffect(() => {
    if (!busy && mode.mode !== "none" && menuItems.length > 0) {
      setMenuOpen(true);
    } else if (mode.mode === "none") {
      setMenuOpen(false);
    }
  }, [busy, mode, menuItems.length]);

  // ── Helpers ─────────────────────────────────────────────────────────────

  /** Reset the input/cursor/menu/history-cursor for the next prompt. */
  const resetPromptState = useCallback(() => {
    setInput("");
    setCursor(0);
    setMenuOpen(false);
    setMenuIndex(0);
    setHistoryIdx(-1);
    savedInputRef.current = "";
  }, []);

  /** Push a finished Turn onto the Static list. */
  const commitTurn = useCallback((turn: Turn) => {
    setTurns((prev) => [...prev, turn]);
  }, []);

  /**
   * Run an agent request. Bridges Agent.chat callbacks into React state
   * so tool-call traces and narrative lines appear live below the prompt
   * area. When the request finishes (or throws) the accumulated trace is
   * baked into the Turn record and committed.
   */
  const runAgent = useCallback(
    async (userInput: string) => {
      busyRef.current = true;
      setBusy(true);
      setSpinnerLabel("Düşünüyor...");
      setSpinnerMode("thinking");
      setLiveTrace([]);
      setStepCount(0);
      clearBriefMessages();
      runStartRef.current = Date.now();
      stepStartRef.current = Date.now();

      let collected: TraceEntry[] = [];
      let toolCallCount = 0;
      try {
        const reply = await agent.chat(
          userInput,
          (toolName, args) => {
            toolCallCount++;
            const elapsed = Date.now() - stepStartRef.current;

            // BriefTool çağrısını özel trace entry olarak ekle
            if (toolName === "send_message" && args?.message) {
              const briefEntry: TraceEntry = {
                kind: "brief",
                message: args.message,
                status: args.status ?? "normal",
                sentAt: new Date().toISOString(),
              };
              collected.push(briefEntry);
              setLiveTrace((p) => [...p, briefEntry]);
            } else {
              const entry: TraceEntry = {
                kind: "tool",
                tool: toolName,
                args,
                ms: elapsed,
              };
              collected.push(entry);
              setLiveTrace((p) => [...p, entry]);
            }

            setStepCount(toolCallCount);
            // Spinner modunu tool'a göre ayarla
            const displayTool = toolName.replace(/_/g, " ");
            setSpinnerLabel(`${displayTool}...`);
            setSpinnerMode("tool");
            stepStartRef.current = Date.now();
          },
          (text) => {
            if (!text.trim()) return;
            const entry: TraceEntry = { kind: "narrative", text: text.trim() };
            collected.push(entry);
            setLiveTrace((p) => [...p, entry]);
            setSpinnerLabel("Düşünüyor...");
            setSpinnerMode("thinking");
            stepStartRef.current = Date.now();
          },
        );

        const rendered = await UI.renderMarkdown(reply);
        commitTurn({
          id: `t-${Date.now()}`,
          userInput,
          trace: collected,
          reply: rendered.trimEnd(),
          durationMs: Date.now() - runStartRef.current,
          completedAt: new Date().toISOString(),
          viewMode,
        });
      } catch (e: any) {
        commitTurn({
          id: `t-${Date.now()}`,
          userInput,
          trace: collected,
          error: e?.message ?? String(e),
          durationMs: Date.now() - runStartRef.current,
        });
      } finally {
        busyRef.current = false;
        setBusy(false);
        setLiveTrace([]);
      }
    },
    [agent, commitTurn, viewMode],
  );

  /**
   * Run a /command. Commands print to stdout via UI.box / UI.success etc.
   * Ink patches console.log so those writes land above the live region
   * without disturbing the prompt — exactly like Claude Code does it.
   *
   * After a command runs we still rebuild the static pool (skills may
   * have changed) and commit a minimal Turn for context.
   */
  const runCommand = useCallback(
    async (text: string) => {
      busyRef.current = true;
      setBusy(true);

      const ctx: CommandContext = {
        agent,
        skillManager,
        executeAgentDirective: async (directive: string) => {
          // Some commands (e.g. /skill) want to chain straight into an
          // agent call. Reuse runAgent but skip its busy toggle by
          // calling the underlying logic inline.
          await runAgent(directive);
        },
      };

      try {
        await router.route(text, ctx);
        commitTurn({
          id: `t-${Date.now()}`,
          userInput: text,
          trace: [],
          isCommand: true,
        });
      } catch (e: any) {
        commitTurn({
          id: `t-${Date.now()}`,
          userInput: text,
          trace: [],
          error: e?.message ?? String(e),
          isCommand: true,
        });
      } finally {
        // Skill list may have grown — refresh the pool.
        setStaticPool(buildStaticPool(router, skillManager));
        busyRef.current = false;
        setBusy(false);
      }
    },
    [agent, commitTurn, router, runAgent, skillManager],
  );

  /** Apply the current menu selection to the input. */
  const applySelectedCompletion = useCallback(() => {
    if (!menuVisible || !menuItems.length) return;
    const chosen = menuItems[menuIndex];
    const { input: newInput, cursor: newCursor } = applyCompletion(
      input,
      mode,
      chosen,
    );
    setInput(newInput);
    setCursor(newCursor);
    setMenuOpen(false);
  }, [menuVisible, menuItems, menuIndex, input, mode]);

  // ── Keyboard handling ───────────────────────────────────────────────────
  useInput((char, key) => {
    // Ctrl-C: graceful exit. Ink restores the terminal automatically.
    if (key.ctrl && char === "c") {
      exit();
      // Ink unmounts asynchronously; nudge process exit so a pending
      // network request from the LLM provider can't keep the loop alive.
      setTimeout(() => process.exit(0), 30);
      return;
    }

    // Ctrl-L: clear the screen and the committed turns. Ink will redraw
    // the live region on the next frame.
    if (key.ctrl && char === "l") {
      process.stdout.write("\x1b[2J\x1b[H");
      setTurns([]);
      setShowShortcuts(false);
      return;
    }

    // Ctrl-O: görünüm modunu döngüsel olarak değiştir
    // brief → default → transcript → brief (CLI_CONVERSATION.md)
    if (key.ctrl && char === "o") {
      setViewMode((prev) => {
        const next = prev === "brief" ? "default" : prev === "default" ? "transcript" : "brief";
        const labels: Record<ViewMode, string> = {
          brief:      "Brief  —  sadece agent mesajları",
          default:    "Default  —  dengeli görünüm",
          transcript: "Transcript  —  tüm araç çağrıları",
        };
        // Transient toast: clear any pending timer then show the new label
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setViewModeToast(labels[next]);
        toastTimerRef.current = setTimeout(() => setViewModeToast(null), 1800);
        return next;
      });
      return;
    }

    // While the agent is running we ignore all editing keys. Only Ctrl-C
    // (handled above) breaks out. This prevents the user from queueing
    // a second request before the first one finishes.
    if (busyRef.current) return;

    // Escape: dismiss the menu / shortcut overlay without applying anything.
    if (key.escape) {
      if (showShortcuts) {
        setShowShortcuts(false);
        return;
      }
      if (menuOpen) setMenuOpen(false);
      return;
    }

    // "?" on an empty input → show shortcut overlay (like Claude Code).
    // Any further keypress dismisses it.
    if (showShortcuts) {
      setShowShortcuts(false);
      // Don't consume the keypress — fall through so the character is inserted.
    }
    if (char === "?" && input === "" && !key.ctrl && !key.meta) {
      setShowShortcuts(true);
      return;
    }

    // ── Up / Down ─────────────────────────────────────────────────────────
    // When the menu is visible the arrows navigate the menu. Otherwise
    // they walk through command history.
    if (key.upArrow) {
      if (menuVisible) {
        setMenuIndex((i) => (i - 1 + menuItems.length) % menuItems.length);
        return;
      }
      // history navigation
      if (history.length === 0) return;
      if (historyIdx === -1) savedInputRef.current = input;
      const nextIdx = Math.min(historyIdx + 1, history.length - 1);
      setHistoryIdx(nextIdx);
      const recalled = history[history.length - 1 - nextIdx];
      setInput(recalled);
      setCursor(recalled.length);
      return;
    }
    if (key.downArrow) {
      if (menuVisible) {
        setMenuIndex((i) => (i + 1) % menuItems.length);
        return;
      }
      if (historyIdx <= 0) {
        setHistoryIdx(-1);
        setInput(savedInputRef.current);
        setCursor(savedInputRef.current.length);
      } else {
        const nextIdx = historyIdx - 1;
        setHistoryIdx(nextIdx);
        const recalled = history[history.length - 1 - nextIdx];
        setInput(recalled);
        setCursor(recalled.length);
      }
      return;
    }

    // ── Cursor movement ──────────────────────────────────────────────────
    if (key.leftArrow) {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (key.rightArrow) {
      setCursor((c) => Math.min(input.length, c + 1));
      return;
    }
    if (key.ctrl && char === "a") {
      setCursor(0);
      return;
    }
    if (key.ctrl && char === "e") {
      setCursor(input.length);
      return;
    }

    // ── Line editing (kill / kill-line / delete word) ────────────────────
    if (key.ctrl && char === "u") {
      setInput(input.slice(cursor));
      setCursor(0);
      return;
    }
    if (key.ctrl && char === "k") {
      setInput(input.slice(0, cursor));
      return;
    }
    if (key.ctrl && char === "w") {
      const before = input.slice(0, cursor).replace(/\S+\s*$/, "");
      const after = input.slice(cursor);
      setInput(before + after);
      setCursor(before.length);
      return;
    }

    // ── TAB: open menu / apply selection ─────────────────────────────────
    if (key.tab) {
      if (menuVisible) {
        applySelectedCompletion();
      } else if (menuItems.length > 0) {
        setMenuOpen(true);
      }
      return;
    }

    // ── Shift+Enter / Alt(Option)+Enter: insert newline ─────────────────
    // Most terminal emulators cannot distinguish Shift+Enter from plain
    // Enter (both send \r). key.meta+key.return (Alt/Option+Enter) IS
    // reliably detectable because the terminal prefixes the sequence with
    // ESC (\x1b\r), which readline surfaces as meta=true.
    // We keep key.shift && key.return for terminals that DO support it
    // (Kitty keyboard protocol, WezTerm, …) and char==='\n' for piped input.
    if (
      (key.shift && key.return) ||
      (key.meta && key.return) ||
      (key.ctrl && char === "n") ||
      (char === "\n" && !key.return)
    ) {
      const next = input.slice(0, cursor) + "\n" + input.slice(cursor);
      setInput(next);
      setCursor(cursor + 1);
      setHistoryIdx(-1);
      return;
    }

    // ── ENTER: submit ────────────────────────────────────────────────────
    if (key.return) {
      // If the menu is open, treat Enter on a file completion as "insert
      // and stay" (matches the legacy REPL); for command completions we
      // apply and submit.
      if (menuVisible) {
        const chosen = menuItems[menuIndex];
        if (mode.mode === "file") {
          applySelectedCompletion();
          return;
        }
        const { input: applied } = applyCompletion(input, mode, chosen);
        const text = applied.trim();
        resetPromptState();
        if (text) {
          setHistory((h) => appendHistory(text, h));
          if (text.startsWith("/")) {
            void runCommand(text);
          } else {
            void runAgent(text);
          }
        }
        return;
      }

      const text = input.trim();
      resetPromptState();
      if (!text) return;
      setHistory((h) => appendHistory(text, h));
      if (text.startsWith("/")) {
        void runCommand(text);
      } else {
        void runAgent(text);
      }
      return;
    }

    // ── Backspace / Delete ───────────────────────────────────────────────
    // On macOS the regular Backspace key sends DEL (0x7f), which Ink
    // sometimes surfaces as `key.delete=true` rather than `key.backspace`.
    // We collapse both into "delete the character before the cursor" —
    // matching the behaviour of `ink-text-input` and every other CLI
    // line editor. Forward-delete is sacrificed because (a) the typical
    // dedicated Forward-Delete key is rare in TUIs, and (b) Ctrl-D /
    // Ctrl-K already provide forward editing.
    if (key.backspace || key.delete) {
      if (cursor > 0) {
        const next = input.slice(0, cursor - 1) + input.slice(cursor);
        setInput(next);
        setCursor(cursor - 1);
      }
      return;
    }

    // ── Printable character ──────────────────────────────────────────────
    if (char && !key.ctrl && !key.meta) {
      // Some terminals send multi-byte sequences; insert the whole chunk
      // at the cursor position.
      const next = input.slice(0, cursor) + char + input.slice(cursor);
      setInput(next);
      setCursor(cursor + char.length);
      // Any keystroke after history navigation drops us out of the
      // history walk.
      setHistoryIdx(-1);
    }
  });

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <>
      <Static items={turns}>
        {(turn) => (
          <AgentTurn
            key={turn.id}
            turn={turn}
            viewMode={turn.viewMode ?? viewMode}
          />
        )}
      </Static>

      {/*
       * ── Input region ──────────────────────────────────────────────────────
       *
       *  ────────────────────────────────────  (top separator)
       *  ❯ user input here                     (prompt — between the lines)
       *  ────────────────────────────────────  (bottom separator)
       *  [completion menu / shortcut overlay / hint]  (OUTSIDE / below)
       *
       * While the agent is busy the trace + spinner live between the lines.
       * Brief mod: tool'lar gizlenir, sadece brief mesajlar gösterilir.
       * Default mod: son 4 tool call gösterilir.
       * Transcript mod: tüm trace gösterilir.
       */}
      <Box flexDirection="column" marginTop={1}>
        {/* ── Between the two separator lines ── */}
        <Separator cols={termCols} />
        {busy ? (
          <Box flexDirection="column">
            {/* Görünüm moduna göre live trace filtresi */}
            {viewMode === "brief"
              ? // Brief: sadece brief (send_message) entries
                liveTrace
                  .filter((e) => e.kind === "brief")
                  .slice(-3)
                  .map((entry, i) => <TraceLine key={i} entry={entry} />)
              : viewMode === "transcript"
              ? // Transcript: tool + narrative entries (boş satırlar filtrelenir)
                liveTrace
                  .filter((e) => e.kind !== "narrative" || (e.kind === "narrative" && e.text.trim().length > 0))
                  .slice(-8)
                  .map((entry, i) => <TraceLine key={i} entry={entry} />)
              : // Default: son 4 tool call
                liveTrace
                  .filter((e) => e.kind === "tool")
                  .slice(-4)
                  .map((entry, i) => <TraceLine key={i} entry={entry} />)}
            <ActiveSpinner
              label={spinnerLabel}
              stepCount={stepCount}
              mode={spinnerMode}
              startTime={runStartRef.current}
              verbose={viewMode === "transcript"}
            />
          </Box>
        ) : (
          <Prompt value={input} cursor={cursor} active={!busy} />
        )}
        <Separator cols={termCols} />

        {/* ── Transient view-mode toast (Ctrl+O feedback, no scrollback pollution) ── */}
        {viewModeToast && (
          <Box paddingLeft={2} marginTop={0}>
            <Text color="#5CA4D4">
              {"◈ "}
            </Text>
            <Text color="#5CA4D4">{viewModeToast}</Text>
            <Text dimColor>{"  [Ctrl+O]"}</Text>
          </Box>
        )}

        {/* ── Persistent mode badge (only when non-default and no toast showing) ── */}
        {!viewModeToast && viewMode !== "default" && (
          <Box paddingLeft={2} marginTop={0}>
            <Text dimColor>
              {viewMode === "brief" ? "◈ brief mode" : "◈ transcript mode"}
            </Text>
          </Box>
        )}

        {/* ── Below the bottom line: suggestions / overlay / hint ── */}
        {!busy &&
          (menuVisible ? (
            <CompletionMenu
              items={menuItems}
              selectedIndex={menuIndex}
              isFile={mode.mode === "file"}
            />
          ) : showShortcuts ? (
            <ShortcutOverlay />
          ) : input === "" && !viewModeToast ? (
            <PromptHint />
          ) : null)}
      </Box>
    </>
  );
};

/**
 * Re-export a small helper used by the entrypoint (cli.ts) to spin up an
 * Ink render with sensible defaults.
 */
export function renderProps(agent: Agent) {
  return { agent };
}

/** Re-exported only so the file is unambiguously a module. */
export { Text };
