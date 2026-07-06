export type PromptContext = "cli" | "desktop_session" | "desktop_design" | "desktop_code";

export interface PromptOptions {
  templateStructure?: string; // used for design
}

import { getCLIContextPrompt } from "./cli.js";
import { getDesktopSessionPrompt } from "./desktop_session.js";
import { getDesktopDesignPrompt } from "./desktop_design.js";
import { getDesktopCodePrompt } from "./desktop_code.js";

/**
 * Returns a highly optimized system prompt based on the execution context.
 */
export function getSystemPrompt(context: PromptContext, options?: PromptOptions): string {
  switch (context) {
    case "cli":
      return getCLIContextPrompt();
    case "desktop_session":
      return getDesktopSessionPrompt();
    case "desktop_design":
      return getDesktopDesignPrompt(options?.templateStructure);
    case "desktop_code":
      return getDesktopCodePrompt();
    default:
      return getCLIContextPrompt();
  }
}

/**
 * Re-export subagent prompts
 */
export * from "./subagents.js";
