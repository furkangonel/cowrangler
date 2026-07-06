import React from "react";
import { Box, Text } from "ink";
import { Theme } from "../theme.js";
import { CompletionItem } from "./types.js";

interface CompletionMenuProps {
  items: CompletionItem[];
  selectedIndex: number;
  isFile: boolean;
}

/** Strip ANSI escapes when measuring visible width. */
function visLen(s: string): number {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

/**
 * Two-column popup menu rendered just below the prompt.
 *
 * Implementation note — every row is composed as a SINGLE STRING that
 * Ink renders inside a single <Text>. We do NOT split a row across
 * multiple Text children. The reason is that Ink's flex layout for a
 * row of multiple Text spans can, on certain widths, decide that the
 * combined visible width exceeds the row's flex basis and wrap mid-row.
 * That wrap is what made the previous version look like the menu was
 * "drawn many times / structure broken".
 *
 * Colors are embedded directly via chalk (Theme.*); Ink passes ANSI
 * escapes inside Text content through to the terminal unmodified, so
 * the final visual is identical without the layout risk.
 *
 * Column math:
 *
 *   row = "  │ ▶ <label-padded-to-labelMax>  <desc-padded-to-descMax> │"
 *
 *   total visible width  =  2 (indent)
 *                        +  1 (left │)
 *                        +  3 (bullet)
 *                        +  labelMax
 *                        +  2 (gutter)
 *                        +  descMax
 *                        +  1 (right gutter)
 *                        +  1 (right │)
 *                        =  labelMax + descMax + 10
 *
 *   border row width     =  2 (indent) + 1 (corner) + innerWidth + 1 (corner)
 *                        =  innerWidth + 4
 *                        =  (labelMax + descMax + 6) + 4
 *                        =  labelMax + descMax + 10   ✓ matches
 *
 *   We clamp descMax so the total never exceeds (cols − 4) — leaves a
 *   2-cell safety margin on the right so soft-wrapping never triggers.
 */
export const CompletionMenu: React.FC<CompletionMenuProps> = ({
  items,
  selectedIndex,
  isFile,
}) => {
  if (!items.length) return null;

  const cols = Math.max(40, process.stdout.columns ?? 80);

  const labelMax = Math.min(
    28,
    Math.max(...items.map((i) => visLen(i.label))),
  );

  const descMaxByItems = Math.max(...items.map((i) => visLen(i.description)));
  // 14 = 10 (decoration in row) + 4 (safety margin)
  const descMax = Math.min(
    Math.max(8, cols - labelMax - 14),
    descMaxByItems,
  );

  const innerWidth = labelMax + descMax + 6;
  const indent = "  ";
  const top = Theme.dim("╭" + "─".repeat(innerWidth) + "╮");
  const bot = Theme.dim("╰" + "─".repeat(innerWidth) + "╯");
  const hint = Theme.dim(
    isFile ? " TAB apply  ESC dismiss " : " TAB apply  ↑↓ navigate ",
  );

  // Build each menu row as a single ANSI-styled string.
  const rows: string[] = [];
  rows.push(indent + top);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const isSel = i === selectedIndex;

    const labelText = item.label.slice(0, labelMax);
    const labelPad = " ".repeat(Math.max(0, labelMax - visLen(labelText)));
    const descText = item.description.slice(0, descMax);
    const descPad = " ".repeat(Math.max(0, descMax - visLen(descText)));

    const bullet = isSel ? Theme.main(" ▶ ") : Theme.dim("   ");
    const labelStyled = isSel
      ? Theme.accent.bold(labelText)
      : Theme.dim(labelText);
    const descStyled = Theme.dim(descText);

    const row =
      indent +
      Theme.dim("│") +
      bullet +
      labelStyled +
      labelPad +
      "  " +
      descStyled +
      descPad +
      " " +
      Theme.dim("│");

    rows.push(row);
  }

  rows.push(indent + bot + hint);

  return (
    <Box flexDirection="column">
      {rows.map((row, i) => (
        <Text key={i}>{row}</Text>
      ))}
    </Box>
  );
};
