import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { Theme } from "../theme.js";
import { TraceEntry, SpinnerMode } from "./types.js";
import {
  formatArgs,
  formatElapsed,
  padToolName,
  truncateNarrative,
} from "./format.js";

// CLI_CONVERSATION.md: 30 saniyeden sonra step sayacı belirginleşir
const SHOW_STEPS_AFTER_MS = 30_000;

/**
 * Tek bir trace entry'nin görsel temsili.
 *
 * default mod:
 *   ✓ read_file       src/foo.ts   0.3s
 *   ┆ "Dosyayı inceliyorum..."
 *
 * transcript mod (TraceBlock içinde):
 *   ⏺ read_file  src/foo.ts  0.3s
 *
 * brief mod:
 *   ⚡ [proactive] Görev tamamlandı!
 *   ◎ [message]   Yanıt hazır.
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

  if (entry.kind === "brief") {
    const isProactive = entry.status === "proactive";
    const icon = isProactive ? "⚡" : "◎";
    const colorHex = isProactive ? "#FF9500" : "#5CA4D4";
    const label = isProactive ? "[proactive] " : "[message]   ";
    return (
      <Box>
        <Text>{`  ${icon} `}</Text>
        <Text color={colorHex}>{label}</Text>
        <Text dimColor>{truncateNarrative(entry.message, 80)}</Text>
      </Box>
    );
  }

  // tool entry
  const argStr = formatArgs(entry.tool, entry.args);
  const head = Theme.success("  ✓ ") + Theme.accent(padToolName(entry.tool));
  const argPart = argStr ? "  " + Theme.dim(argStr) : "";
  const tail = "  " + Theme.dim(formatElapsed(entry.ms));

  return <Text>{head + argPart + tail}</Text>;
};

/**
 * Transcript mod — tüm trace entries'i ⏺ işareti ile gösterir.
 * App.tsx'te Ctrl+O ile aktive edilir.
 */
export const TraceBlock: React.FC<{ entries: TraceEntry[] }> = ({ entries }) => {
  if (!entries.length) return null;
  return (
    <Box flexDirection="column" marginTop={1}>
      {entries.map((entry, i) => {
        if (entry.kind === "tool") {
          const argStr = formatArgs(entry.tool, entry.args);
          return (
            <Text key={i}>
              {Theme.dim("  ⏺ ") +
                Theme.accent(padToolName(entry.tool)) +
                (argStr ? "  " + Theme.dim(argStr) : "") +
                "  " + Theme.dim(formatElapsed(entry.ms))}
            </Text>
          );
        }
        if (entry.kind === "narrative") {
          return (
            <Text key={i}>
              {Theme.dim("  ┆ ") + Theme.dim(truncateNarrative(entry.text, 100))}
            </Text>
          );
        }
        if (entry.kind === "brief") {
          const isProactive = entry.status === "proactive";
          return (
            <Box key={i}>
              <Text>{`  ${isProactive ? "⚡" : "◎"} `}</Text>
              <Text color={isProactive ? "#FF9500" : "#5CA4D4"}>
                {isProactive ? "[proactive] " : "[message]   "}
              </Text>
              <Text>{entry.message}</Text>
            </Box>
          );
        }
        return null;
      })}
    </Box>
  );
};

/**
 * Compact one-line summary shown in the committed (Static) turn record.
 * Replaces the full trace so the scrollback stays clean.
 * Example:  ⊕ 17 adım · 4.3s
 */
export const TraceSummary: React.FC<{
  toolCount: number;
  durationMs?: number;
}> = ({ toolCount, durationMs }) => {
  if (toolCount === 0) return null;
  const steps = `${toolCount} adım`;
  const time =
    durationMs !== undefined ? ` · ${(durationMs / 1000).toFixed(1)}s` : "";
  return <Text>{Theme.dim(`  ⊕ ${steps}${time}`)}</Text>;
};

/**
 * Live spinner — CLI_CONVERSATION.md spinner mimarisi.
 *
 * SpinnerMode'a göre farklı davranış:
 *   thinking → "Düşünüyor..." cyan dots animasyonu
 *   tool     → "<tool adı>..." sarı line animasyonu
 *   waiting  → "Yanıt bekleniyor..." mavi dots2
 *   idle     → Gösterilmez
 *
 * 30 saniyeden sonra step sayacı belirginleşir.
 * Verbose modda süre de gösterilir.
 */
export const ActiveSpinner: React.FC<{
  label?: string;
  stepCount?: number;
  mode?: SpinnerMode;
  startTime?: number;
  verbose?: boolean;
}> = ({
  label = "Düşünüyor...",
  stepCount = 0,
  mode = "thinking",
  startTime,
  verbose = false,
}) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const ref = startTime ?? Date.now();
    const interval = setInterval(() => {
      setElapsed(Date.now() - ref);
    }, 50);
    return () => clearInterval(interval);
  }, [startTime]);

  if (mode === "idle") return null;

  const shouldShowSteps = elapsed > SHOW_STEPS_AFTER_MS;
  const stepBadge =
    shouldShowSteps && stepCount > 0
      ? Theme.dim(` [${stepCount} adım]`)
      : stepCount > 0
      ? Theme.dim(` [${stepCount}]`)
      : "";

  const durationStr =
    verbose && elapsed > 1000
      ? Theme.dim(` · ${(elapsed / 1000).toFixed(0)}s`)
      : "";

  const spinnerColor =
    mode === "thinking" ? "cyan"
    : mode === "tool"    ? "yellow"
    : mode === "waiting" ? "blue"
    : "white";

  const spinnerType: any =
    mode === "thinking" ? "dots"
    : mode === "tool"    ? "line"
    : "dots2";

  return (
    <Text>
      <Text color={spinnerColor}>
        <Spinner type={spinnerType} />
      </Text>
      {" " + Theme.dim(label) + stepBadge + durationStr}
    </Text>
  );
};
