import React from "react";
import { render } from "ink";
import { Agent } from "../core/agent.js";
import { UI } from "./theme.js";
import { SkillManager } from "../core/skills.js";
import { TOOL_SCHEMAS } from "../tools/registry.js";
import { App } from "./ink/App.js";

/**
 * CLI entrypoint.
 *
 * Steps:
 *   1. Print the static welcome dashboard via the existing UI helpers.
 *      These run before Ink mounts so they end up at the top of the
 *      terminal scrollback, exactly where they used to be.
 *   2. Hand control to Ink. App.tsx owns the prompt, autocomplete menu,
 *      tool-call traces, and committed Static turns.
 *
 *  We use React.createElement instead of JSX here so cli.ts can stay a
 *  plain .ts file (no JSX runtime needed at this layer).
 */
export async function runCLI(agent: Agent): Promise<void> {
  UI.printDashboard(agent.llm.model, process.cwd());

  const skillCount = new SkillManager().getAvailableSkills().length;
  const toolCount = Object.keys(TOOL_SCHEMAS).length;
  UI.info(
    `${toolCount} tools · ${skillCount} skills loaded. Type /help to get started.\n`,
  );

  const instance = render(React.createElement(App, { agent }), {
    // Let Ink intercept console.* writes so command output (UI.box,
    // UI.success, etc.) shows up *above* the live region instead of
    // overwriting the prompt line. This is how Claude Code / gemini-cli
    // achieve the "log + dynamic prompt" experience.
    patchConsole: true,
    // We want full-screen redraws when the terminal is resized so the
    // committed Static items stay anchored at the top.
    exitOnCtrlC: false,
  });

  // Keep the process alive until the Ink app unmounts (App handles
  // Ctrl-C itself).
  await instance.waitUntilExit();
}
