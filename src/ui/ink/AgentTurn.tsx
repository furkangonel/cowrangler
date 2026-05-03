import React from "react";
import { Box, Text } from "ink";
import { Turn } from "./types.js";
import { SubmittedPrompt } from "./Prompt.js";
import { TraceLine } from "./Trace.js";

const FAIL = "#D62926";

interface AgentTurnProps {
  turn: Turn;
}

/**
 * Frozen render of a completed turn. These items get pushed onto the
 * <Static> list in App.tsx, which means Ink renders them exactly once
 * and then leaves them in the scrollback above the live area.
 *
 * Layout:
 *   ❯ <user input>
 *     ✓ tool_a  args  0.3s
 *     ┆ narrative
 *     ✓ tool_b  args  0.4s
 *
 *   <markdown-rendered reply, or error>
 *
 * For /command turns the trace is empty and reply is omitted — the
 * command itself prints its own output via console.log, which Ink's
 * patched-console plumbing routes above the live region anyway.
 */
export const AgentTurn: React.FC<AgentTurnProps> = ({ turn }) => {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <SubmittedPrompt value={turn.userInput} />

      {turn.trace.length > 0 ? (
        <Box flexDirection="column">
          {turn.trace.map((entry, i) => (
            <TraceLine key={i} entry={entry} />
          ))}
        </Box>
      ) : null}

      {turn.error ? (
        <Box marginTop={1}>
          <Text color={FAIL}>{"  ✗ " + turn.error}</Text>
        </Box>
      ) : null}

      {turn.reply ? (
        <Box marginTop={1}>
          {/*
            The reply has already been run through marked-terminal in
            UI.renderMarkdown(), which embeds ANSI color escapes. Ink's
            Text component passes those escapes through to the terminal
            as-is, so we get the same colored markdown rendering as the
            legacy REPL without re-implementing it.
          */}
          <Text>{turn.reply}</Text>
        </Box>
      ) : null}
    </Box>
  );
};
