import React from "react";
import { Text } from "ink";
import chalk from "chalk";
import { Theme } from "../theme.js";

interface PromptProps {
  value: string;
  cursor: number;
  /** When false the prompt is "frozen" while the agent is running. */
  active: boolean;
}

/**
 * Single-Text input line.
 *
 * Why one Text and not several:
 *
 * Ink's Box/Text layout works great for structural composition but it
 * occasionally introduces a visible cell boundary between adjacent Text
 * children that don't share font metrics (the inverse-cursor span and
 * its neighbours, in particular). On narrow terminals that boundary can
 * tip Ink's flex measurement just past the column limit and force the
 * row to wrap — which the user perceives as "the prompt rendered twice"
 * or "structure broken".
 *
 * By embedding all colors as inline ANSI via chalk and handing Ink a
 * single string, we sidestep that whole class of layout drama. Ink
 * passes through ANSI escapes inside Text content unchanged, so we get
 * the same visual result with zero layout risk.
 */
export const Prompt: React.FC<PromptProps> = ({ value, cursor, active }) => {
  const safeCursor = Math.max(0, Math.min(cursor, value.length));
  const before = value.slice(0, safeCursor);
  const atChar = value[safeCursor] ?? " ";
  const after = safeCursor < value.length ? value.slice(safeCursor + 1) : "";

  const arrow = active ? Theme.main("❯") : Theme.dim("❯");
  // chalk.inverse renders one cell of reversed video — that's the
  // cursor block. When the prompt is not active (agent running) we
  // skip the inverse so it doesn't look like an interactive prompt.
  const cursorCell = active ? chalk.inverse(atChar) : atChar;

  return <Text>{`${arrow} ${before}${cursorCell}${after}`}</Text>;
};

/**
 * A subdued read-only echo of a previously submitted input — used at the
 * top of every committed Turn block so the user can see what they asked.
 */
export const SubmittedPrompt: React.FC<{ value: string }> = ({ value }) => (
  <Text>{`${Theme.dim("❯")} ${value}`}</Text>
);

/**
 * One-line hint shown below an empty prompt — mirrors Claude Code's
 * "? for shortcuts" footer. Disappears as soon as the user starts typing.
 */
export const PromptHint: React.FC = () => (
  <Text>{Theme.dim("  ? for shortcuts")}</Text>
);
