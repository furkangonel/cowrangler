import ora, { Ora } from "ora";
import { Theme } from "./theme.js";

/**
 * TaskSpinner — Claude Code-style step-by-step progress display.
 *
 * Each completed tool call is committed as a permanent line via
 * `stopAndPersist()`, so the user sees the full execution trace:
 *
 *   ✓ read_file   src/core/agent.ts    0.3s
 *   ✓ write_file  src/core/agent.ts    1.1s
 *   ✓ execute_bash  npm run build      2.4s
 *   ⠋ Thinking...
 */
export class TaskSpinner {
  private spinner: Ora | null = null;
  private stepStart: number = 0;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  start(initialText: string = "Thinking...") {
    this.stepStart = Date.now();
    this.spinner = ora({
      text: Theme.dim(initialText),
      spinner: "dots",
      color: "cyan",
      prefixText: " ",
    }).start();
  }

  /**
   * Called after each tool step completes.
   * Commits the finished step as a permanent line, then spins again.
   */
  update(toolName: string, args?: Record<string, any>) {
    if (!this.spinner) return;

    const elapsed = ((Date.now() - this.stepStart) / 1000).toFixed(1);
    const label = this._formatLabel(toolName, args);

    // Commit finished step — becomes a permanent line
    this.spinner.stopAndPersist({
      symbol: Theme.success("✓"),
      text: `${label}  ${Theme.dim(elapsed + "s")}`,
      prefixText: " ",
    });

    // Spin again while agent reasons about the next step
    this.stepStart = Date.now();
    this.spinner = ora({
      text: Theme.dim("Thinking..."),
      spinner: "dots",
      color: "cyan",
      prefixText: " ",
    }).start();
  }

  /** Stop the active spinner without persisting it (clean exit). */
  stop() {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  // ── Formatting ─────────────────────────────────────────────────────────────

  private _formatLabel(toolName: string, args?: Record<string, any>): string {
    const argStr = args ? this._formatArgs(toolName, args) : "";
    const tool = Theme.accent(toolName.padEnd(18));
    return argStr ? `${tool}  ${Theme.dim(argStr)}` : tool.trimEnd();
  }

  private _formatArgs(toolName: string, args: Record<string, any>): string {
    // Map each tool to the arg keys worth surfacing in the progress line
    const keyMap: Record<string, string[]> = {
      read_file:        ["path"],
      write_file:       ["path"],
      edit_file:        ["path"],
      append_to_file:   ["path"],
      copy_file:        ["source"],
      delete_file:      ["path"],
      delete_folder:    ["path"],
      list_files:       ["path"],
      glob_files:       ["pattern"],
      grep_files:       ["pattern", "path"],
      file_info:        ["path"],
      execute_bash:     ["command"],
      fetch_webpage:    ["url"],
      http_request:     ["method", "url"],
      web_search:       ["query"],
      git_status:       [],
      git_diff:         ["path"],
      git_log:          [],
      git_add:          ["paths"],
      git_commit:       ["message"],
      git_branch:       ["action", "name"],
      git_stash:        ["action"],
      git_checkout_file:["path"],
      spawn_subagent:   ["type", "task"],
      utilize_skill:    ["skill_name"],
      create_skill:     ["skill_id"],
      get_system_info:  [],
      which_command:    ["command"],
      manage_todo:      ["action"],
      sleep:            ["ms"],
    };

    const keys = keyMap[toolName] ?? Object.keys(args).slice(0, 2);
    const parts: string[] = [];

    for (const k of keys) {
      const v = args[k];
      if (v === undefined || v === null) continue;
      let str =
        Array.isArray(v)
          ? v.join(", ")
          : typeof v === "string"
          ? v
          : JSON.stringify(v);
      // Truncate so the line stays readable
      if (str.length > 48) str = str.slice(0, 45) + "…";
      parts.push(str);
    }

    return parts.join("  ");
  }
}
