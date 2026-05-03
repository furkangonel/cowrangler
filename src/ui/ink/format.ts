/**
 * Trace formatting helpers shared between the live spinner area and the
 * frozen turn record. These mirror the pre-Ink TaskSpinner formatting so
 * the look stays familiar to existing users.
 */

const TOOL_LABEL_WIDTH = 18;

/**
 * Map of tool name → which arg keys are worth surfacing in the progress
 * trace line. Mirrors the legacy spinner.ts table so we don't lose
 * cherry-picked argument display.
 */
const TOOL_ARG_KEYS: Record<string, string[]> = {
  read_file: ["path"],
  write_file: ["path"],
  edit_file: ["path"],
  append_to_file: ["path"],
  copy_file: ["source"],
  delete_file: ["path"],
  delete_folder: ["path"],
  list_files: ["path"],
  glob_files: ["pattern"],
  grep_files: ["pattern", "path"],
  file_info: ["path"],
  execute_bash: ["command"],
  fetch_webpage: ["url"],
  http_request: ["method", "url"],
  web_search: ["query"],
  git_status: [],
  git_diff: ["path"],
  git_log: [],
  git_add: ["paths"],
  git_commit: ["message"],
  git_branch: ["action", "name"],
  git_stash: ["action"],
  git_checkout_file: ["path"],
  spawn_subagent: ["type", "task"],
  utilize_skill: ["skill_name"],
  create_skill: ["skill_id"],
  get_system_info: [],
  which_command: ["command"],
  manage_todo: ["action"],
  sleep: ["ms"],
};

export function formatArgs(
  toolName: string,
  args?: Record<string, any>,
): string {
  if (!args) return "";
  const keys = TOOL_ARG_KEYS[toolName] ?? Object.keys(args).slice(0, 2);
  const parts: string[] = [];
  for (const k of keys) {
    const v = args[k];
    if (v === undefined || v === null) continue;
    let str = Array.isArray(v)
      ? v.join(", ")
      : typeof v === "string"
        ? v
        : JSON.stringify(v);
    if (str.length > 48) str = str.slice(0, 45) + "…";
    parts.push(str);
  }
  return parts.join("  ");
}

export function padToolName(name: string): string {
  return name.length >= TOOL_LABEL_WIDTH
    ? name
    : name + " ".repeat(TOOL_LABEL_WIDTH - name.length);
}

export function truncateNarrative(text: string, max = 120): string {
  return text.length > max ? text.slice(0, max - 3) + "…" : text;
}

export function formatElapsed(ms: number): string {
  return (ms / 1000).toFixed(1) + "s";
}
