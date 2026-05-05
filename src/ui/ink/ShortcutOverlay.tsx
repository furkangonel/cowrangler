import React from "react";
import { Box, Text } from "ink";
import { Theme } from "../theme.js";

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

const ROWS: Row[] = [
  { col1: "/ for commands",       col2: "ctrl+a  go to line start",  col3: "ctrl+c  exit" },
  { col1: "@ for file paths",     col2: "ctrl+e  go to line end",    col3: "ctrl+l  clear screen" },
  { col1: "? for shortcuts",      col2: "ctrl+u  kill to start",     col3: "ctrl+k  kill to end" },
  { col1: "/btw for side note",   col2: "ctrl+w  delete word back",  col3: "↑↓  browse history" },
  { col1: "/init  scan project",  col2: "TAB  autocomplete",         col3: "ESC  dismiss menu" },
  { col1: "/reset  clear context",col2: "shift+↵ / opt+↵  newline",  col3: "/keybindings to customize" },
];

const C1 = 26;
const C2 = 36;

function pad(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n);
  return s + " ".repeat(n - s.length);
}

export const ShortcutOverlay: React.FC = () => {
  return (
    <Box flexDirection="column" marginTop={0}>
      {ROWS.map((row, i) => {
        const line =
          Theme.dim(pad(row.col1, C1)) +
          Theme.dim(pad(row.col2, C2)) +
          Theme.dim(row.col3);
        return <Text key={i}>{line}</Text>;
      })}
    </Box>
  );
};
