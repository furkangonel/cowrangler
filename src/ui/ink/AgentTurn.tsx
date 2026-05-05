import React from "react";
import { Box, Text } from "ink";
import { Turn, ViewMode } from "./types.js";
import { SubmittedPrompt } from "./Prompt.js";
import { TraceSummary, TraceBlock } from "./Trace.js";
import { Theme } from "../theme.js";
import { formatBriefTimestamp } from "../../utils/formatBriefTimestamp.js";

const FAIL = "#D62926";
const PROACTIVE_COLOR = "#FF9500";

interface AgentTurnProps {
  turn: Turn;
  viewMode?: ViewMode;
}

/**
 * Frozen render of a completed turn.
 *
 * CLI_CONVERSATION.md'e göre 3 farklı görünüm modu:
 *
 * brief (sade) — Tool'lar gizlenir, sadece send_message çıktısı gösterilir
 *   ❯ kullanıcı sorusu
 *
 *     Agent  13:45
 *       Görev tamamlandı! ✓
 *
 * default (dengeli) — Tool özeti + ⎿ prefix ile yanıt
 *   ❯ kullanıcı sorusu
 *     ⊕ 5 adım · 2.3s
 *   ⎿ <markdown yanıt>
 *
 * transcript (tam şeffaflık) — Her şey ham haliyle (Ctrl+O)
 *   ❯ kullanıcı sorusu
 *   ⏺ tool: read_file  src/agent.ts  0.3s
 *   ⏺ narrative: "Dosyayı okuyorum..."
 *   ⎿ <tam yanıt + timing>
 */
export const AgentTurn: React.FC<AgentTurnProps> = ({
  turn,
  viewMode = "default",
}) => {
  const briefEntries = turn.trace.filter((e) => e.kind === "brief");
  const toolEntries = turn.trace.filter((e) => e.kind === "tool");
  const ts = turn.completedAt ? formatBriefTimestamp(turn.completedAt) : "";

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* ── Kullanıcı girdisi ──────────────────────────────────────────────── */}
      <SubmittedPrompt value={turn.userInput} />

      {/* ── BRIEF MOD: sadece send_message çıktısı ────────────────────────── */}
      {viewMode === "brief" && briefEntries.length > 0 && (
        <Box flexDirection="column" marginTop={1} paddingLeft={2}>
          {briefEntries.map((entry, i) => {
            if (entry.kind !== "brief") return null;
            const msgTs = formatBriefTimestamp(entry.sentAt);
            const isProactive = entry.status === "proactive";
            return (
              <Box key={i} flexDirection="column" marginBottom={1}>
                <Box flexDirection="row">
                  <Text color={isProactive ? PROACTIVE_COLOR : "#5CA4D4"}>
                    {isProactive ? "⚡ Agent" : "  Agent"}
                  </Text>
                  {msgTs ? (
                    <Text dimColor>{"  " + msgTs}</Text>
                  ) : null}
                </Box>
                <Box paddingLeft={2}>
                  <Text>{entry.message}</Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Brief mod: send_message yoksa normal yanıtı göster */}
      {viewMode === "brief" && briefEntries.length === 0 && turn.reply ? (
        <Box marginTop={1} flexDirection="column" paddingLeft={2}>
          <Box flexDirection="row">
            <Text color="#5CA4D4">{"  Agent"}</Text>
            {ts ? <Text dimColor>{"  " + ts}</Text> : null}
          </Box>
          <Box paddingLeft={2}>
            <Text>{turn.reply}</Text>
          </Box>
        </Box>
      ) : null}

      {/* ── DEFAULT MOD: özet + ⎿ yanıt ───────────────────────────────────── */}
      {viewMode === "default" && (
        <>
          <TraceSummary
            toolCount={toolEntries.length}
            durationMs={turn.durationMs}
          />

          {turn.error ? (
            <Box marginTop={1} paddingLeft={2}>
              <Text color={FAIL}>{"✗ " + turn.error}</Text>
            </Box>
          ) : null}

          {turn.reply ? (
            <Box marginTop={1} flexDirection="row">
              <Text dimColor>{"  ⎿  "}</Text>
              <Box flexShrink={1} flexGrow={1}>
                <Text>{turn.reply}</Text>
              </Box>
            </Box>
          ) : null}

          {/* Proactive mesajlar default modda da gösterilir */}
          {briefEntries
            .filter((e) => e.kind === "brief" && e.status === "proactive")
            .map((entry, i) => {
              if (entry.kind !== "brief") return null;
              return (
                <Box key={i} marginTop={1} paddingLeft={2}>
                  <Text color={PROACTIVE_COLOR}>{"⚡ "}</Text>
                  <Text dimColor>{entry.message}</Text>
                </Box>
              );
            })}
        </>
      )}

      {/* ── TRANSCRIPT MOD: her şey ham haliyle ───────────────────────────── */}
      {viewMode === "transcript" && (
        <>
          {/* Tüm trace entries — tool + narrative + brief */}
          <TraceBlock entries={turn.trace} />

          {turn.error ? (
            <Box marginTop={1} paddingLeft={2}>
              <Text color={FAIL}>{"✗ " + turn.error}</Text>
            </Box>
          ) : null}

          {turn.reply ? (
            <Box marginTop={1} flexDirection="row">
              <Text dimColor>{"  ⎿  "}</Text>
              <Box flexShrink={1} flexGrow={1}>
                <Text>{turn.reply}</Text>
              </Box>
            </Box>
          ) : null}

          {/* Transcript mod altbilgisi: timing + token count */}
          <Box marginTop={1} paddingLeft={2}>
            <Text dimColor>
              {[
                ts ? `Sent ${ts}` : null,
                turn.durationMs
                  ? `${(turn.durationMs / 1000).toFixed(1)}s`
                  : null,
                turn.tokenCount ? `~${turn.tokenCount} tokens` : null,
              ]
                .filter(Boolean)
                .join("  ·  ")}
            </Text>
          </Box>
        </>
      )}
    </Box>
  );
};
