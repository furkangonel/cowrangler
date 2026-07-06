import React from "react";
import { Box, Text } from "ink";
import { Theme } from "../theme.js";
import { t } from "@cowrangler/core/i18n/index.js";

/**
 * Shortcut reference overlay — shown when the user presses "?" on an empty
 * prompt, exactly like Claude Code's "? for shortcuts" behaviour.
 *
 * Layout mirrors Claude Code: three columns, dimmed text, no border box.
 * Disappears as soon as the user presses any key (handled in App.tsx).
 */

interface Row {
  col1: string;
  col2: string;
  col3: string;
}

function getRows(): Row[] {
  return [
    { col1: t("shortcuts.commands"),     col2: t("shortcuts.line_start"),   col3: t("shortcuts.exit") },
    { col1: t("shortcuts.file_paths"),   col2: t("shortcuts.line_end"),     col3: t("shortcuts.clear_screen") },
    { col1: t("shortcuts.shortcuts"),    col2: t("shortcuts.kill_start"),   col3: t("shortcuts.kill_end") },
    { col1: t("shortcuts.side_note"),    col2: t("shortcuts.delete_word"),  col3: t("shortcuts.history") },
    { col1: t("shortcuts.scan_project"), col2: t("shortcuts.autocomplete"), col3: t("shortcuts.dismiss") },
    { col1: t("shortcuts.clear_context"),col2: t("shortcuts.newline"),      col3: t("shortcuts.customize") },
  ];
}

const C1 = 26;
const C2 = 36;

function pad(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n);
  return s + " ".repeat(n - s.length);
}

export const ShortcutOverlay: React.FC = () => {
  const rows = getRows();
  return (
    <Box flexDirection="column" marginTop={0}>
      {rows.map((row, i) => {
        const line =
          Theme.dim(pad(row.col1, C1)) +
          Theme.dim(pad(row.col2, C2)) +
          Theme.dim(row.col3);
        return <Text key={i}>{line}</Text>;
      })}
    </Box>
  );
};
