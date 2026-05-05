import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { Theme } from "../theme.js";
import { TraceEntry } from "./types.js";
import {
  formatArgs,
  formatElapsed,
  padToolName,
  truncateNarrative,
} from "./format.js";

/**
 * Render a single trace entry exactly as the old TaskSpinner used to:
 *
 *     ✓ read_file       src/foo.ts   0.3s
 *     ┆ "Looking up the previous handler..."
 *
 * Same single-Text-per-row discipline as CompletionMenu / Prompt — see
 * those files for why we don't split a line across multiple <Text>
 * children. Colors are baked in via chalk (Theme.*), Ink passes the
 * ANSI escapes through to the terminal as-is.
 */
export const TraceLine: React.FC<{ entry: TraceEntry }> = ({ entry }) => {
  if (entry.kind === "narrative") {
    const lines = entry.text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    return (
      <Box flexDirection="column">
        {lines.map((line, i) => (
          <Text key={i}>
            {Theme.dim("  ┆ ") + Theme.dim(truncateNarrative(line))}
          </Text>
        ))}
      </Box>
    );
  }

  const argStr = formatArgs(entry.tool, entry.args);
  const head = Theme.success("  ✓ ") + Theme.accent(padToolName(entry.tool));
  const argPart = argStr ? "  " + Theme.dim(argStr) : "";
  const tail = "  " + Theme.dim(formatElapsed(entry.ms));

  return <Text>{head + argPart + tail}</Text>;
};

/**
 * Compact one-line summary shown in the committed (Static) turn record.
 * Replaces the full trace so the scrollback stays clean.
 * Example:  ⊕ 17 steps · 4.3s
 */
export const TraceSummary: React.FC<{
  toolCount: number;
  durationMs?: number;
}> = ({ toolCount, durationMs }) => {
  if (toolCount === 0) return null;
  const steps = `${toolCount} step${toolCount !== 1 ? "s" : ""}`;
  const time =
    durationMs !== undefined ? ` · ${(durationMs / 1000).toFixed(1)}s` : "";
  return <Text>{Theme.dim(`  ⊕ ${steps}${time}`)}</Text>;
};

/**
 * Live spinner shown while the agent is mid-step.
 * Shows animated dots, the current step label, and an optional step counter.
 */
export const ActiveSpinner: React.FC<{ label?: string; stepCount?: number }> = ({
  label = "Thinking...",
  stepCount = 0,
}) => {
  const stepBadge = stepCount > 0 ? Theme.dim(` [${stepCount}]`) : "";
  return (
    <Text>
      <Text color="cyan">
        <Spinner type="dots" />
      </Text>
      {" " + Theme.dim(label) + stepBadge}
    </Text>
  );
};
