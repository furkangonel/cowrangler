/**
 * permissions — Co-Wrangler's permission engine.
 *
 * The model is the one Anthropic ships with Claude Code, adopted wholesale so
 * that a policy is portable between the two and so the behaviour is the one
 * people already have in their heads:
 *
 *   • six permission modes, from `default` (ask on first use of a tool) through
 *     `plan`, `acceptEdits`, `auto` and `dontAsk` to `bypassPermissions`
 *   • three rule lists — `deny`, `ask`, `allow` — evaluated in that order, with
 *     `Tool(specifier)` syntax per tool family (see permission_rules.ts)
 *   • layered settings, where a managed policy outranks the project and no
 *     lower scope can subtract a `deny` from a higher one (permission_settings)
 *   • an OS sandbox as a separate axis: sandboxing decides *how* a command
 *     runs, permissions decide *whether* it runs at all
 *
 * The engine is deliberately declarative. `evaluatePermission()` returns a
 * decision plus everything the caller needs to explain it — the matched rule,
 * the layer that decided, whether the action is reversible, and the rule a
 * "don't ask again" answer should persist.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { getProjectWorkdir } from "./project_context.js";
import { getConfig } from "./init.js";
import {
  hostnameOf,
  matchBashPattern,
  matchDomainPattern,
  matchParamRule,
  matchPathPattern,
  matchToolName,
  parseRule,
  toolAliases,
  toolCapability,
  toPosix,
  type ParsedRule,
  type RuleType,
} from "./permission_rules.js";
import {
  effectiveAllowedDomains,
  invalidatePermissionSettings,
  resolvePermissionSettings,
  type ResolvedPermissionSettings,
  type SessionOverrides,
  type SourcedRule,
} from "./permission_settings.js";

export * from "./permission_rules.js";
export {
  resolvePermissionSettings,
  invalidatePermissionSettings,
  managedSettingsPath,
  effectiveAllowedDomains,
} from "./permission_settings.js";
export type {
  ResolvedPermissionSettings,
  SessionOverrides,
  SandboxSettings,
  SettingsScope,
} from "./permission_settings.js";

// ─────────────────────────────────────────────────────────────────────────────
// Modes
// ─────────────────────────────────────────────────────────────────────────────

export type PermissionMode =
  | "default"
  | "acceptEdits"
  | "plan"
  | "auto"
  | "dontAsk"
  | "bypassPermissions";

export const PERMISSION_MODES: PermissionMode[] = [
  "default",
  "acceptEdits",
  "plan",
  "auto",
  "dontAsk",
  "bypassPermissions",
];

/**
 * Aliases accepted for each mode. `manual` is Anthropic's UI label for
 * `default`; the short forms are what Co-Wrangler shipped before this rewrite
 * and keep working so an existing config.yaml does not silently change meaning.
 */
const MODE_ALIASES: Record<string, PermissionMode> = {
  default: "default",
  manual: "default",
  ask: "default",
  acceptedits: "acceptEdits",
  accept: "acceptEdits",
  acceptedit: "acceptEdits",
  plan: "plan",
  auto: "auto",
  dontask: "dontAsk",
  "dont-ask": "dontAsk",
  bypasspermissions: "bypassPermissions",
  bypass: "bypassPermissions",
  yolo: "bypassPermissions",
};

export interface ModeInfo {
  id: PermissionMode;
  label: string;
  summary: string;
  /** Longer description for settings UI. */
  detail: string;
}

export const MODE_INFO: Record<PermissionMode, ModeInfo> = {
  default: {
    id: "default",
    label: "Manual",
    summary: "Ask on first use of each tool.",
    detail:
      "Reads inside your working directories run freely. Everything else — shell commands, edits, network calls — prompts the first time, and you can save the answer as a rule.",
  },
  acceptEdits: {
    id: "acceptEdits",
    label: "Accept edits",
    summary: "Auto-accept file edits in the workspace.",
    detail:
      "File edits and routine filesystem commands (mkdir, touch, mv, cp) inside the working directory and additional directories run without asking. Anything reaching outside, or with an external effect, still prompts.",
  },
  plan: {
    id: "plan",
    label: "Plan",
    summary: "Explore and plan without touching source files.",
    detail:
      "Claude reads files and runs read-only commands to understand the problem, then proposes a plan. No writes, no external effects — approve the plan to leave the mode.",
  },
  auto: {
    id: "auto",
    label: "Auto",
    summary: "Auto-approve, with safety checks on irreversible work.",
    detail:
      "Reversible work inside the workspace runs automatically, under the sandbox and behind a checkpoint. Irreversible or external-effect actions — pushes, publishes, deletes outside the workspace — still stop for you.",
  },
  dontAsk: {
    id: "dontAsk",
    label: "Don't ask",
    summary: "Deny anything not already allowed by a rule.",
    detail:
      "Nothing prompts. A tool call runs only when an allow rule already covers it; everything else is refused. Useful for unattended runs where a stall is worse than a refusal.",
  },
  bypassPermissions: {
    id: "bypassPermissions",
    label: "Bypass permissions",
    summary: "Skip permission checks entirely.",
    detail:
      "No prompts and no rule checks beyond explicit denies. Only safe in a throwaway container or VM — a mistake here has nothing standing between it and your filesystem.",
  },
};

/** Normalise any historical or UI spelling to a canonical mode. */
export function normalizePermissionMode(mode: string | undefined | null): PermissionMode {
  if (!mode) return "default";
  return MODE_ALIASES[String(mode).trim().toLowerCase().replace(/[\s_]/g, "")] ?? "default";
}

// ─────────────────────────────────────────────────────────────────────────────
// Risk + reversibility classification
// ─────────────────────────────────────────────────────────────────────────────

export type RiskLevel = "safe" | "moderate" | "dangerous" | "critical";
export type ActionClass = "readonly" | "reversible" | "irreversible";

/** Commands blocked outright — no mode, sandbox or rule makes these safe. */
const CRITICAL_PATTERNS: RegExp[] = [
  /rm\s+-[a-zA-Z]*r[a-zA-Z]*f?\s+\/(\s|$)/,
  /rm\s+-[a-zA-Z]*r[a-zA-Z]*f?\s+~\/?(\s|$)/,
  /\bdd\s+if=/,
  /\bmkfs(\.\w+)?\b/,
  /\bfdisk\b/,
  />\s*\/dev\/(sd|hd|nvme|disk)/,
  /\bchmod\s+-R\s+777\s+\//,
  /\bsudo\s+rm\s+-rf?\s+\//,
  /\b(shutdown|reboot|halt|poweroff)\b/,
  /\bpasswd\b[^\n]*--delete/,
  /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
  /\bhistory\s+-c\b[^\n]*\brm\b/,
];

/** Commands worth a second look even when a rule would otherwise allow them. */
const DANGEROUS_PATTERNS: RegExp[] = [
  /\brm\s+-[a-zA-Z]*r/,
  /git\s+push\b[^\n]*--force/,
  /git\s+reset\s+--hard/,
  /\bnpm\s+publish\b/,
  /\bcurl\b[^\n]*\|\s*(ba)?sh/,
  /\bwget\b[^\n]*\|\s*(ba)?sh/,
  /\bsudo\b/,
  /\bchmod\s+-R\b/,
  /\bchown\s+-R\b/,
  /\bdrop\s+database\b/i,
  /\bdropdb\b/,
  /\bkubectl\s+delete\b/,
  /\bterraform\s+(destroy|apply)\b/,
];

/** Effects that leave this machine. Always confirmed outside bypass mode. */
const EXTERNAL_BASH_PATTERNS: RegExp[] = [
  /\bgit\s+push\b/,
  /\b(npm|yarn|pnpm|bun)\s+publish\b/,
  /\bcargo\s+publish\b/,
  /\btwine\s+upload\b/,
  /\bcurl\b[^\n]*\|\s*(ba)?sh/,
  /\bwget\b[^\n]*\|\s*(ba)?sh/,
  /\bssh\b/,
  /\bscp\b/,
  /\brsync\b[^\n]*::?/,
  /\bgh\s+(pr|release|repo)\b/,
  /\bdocker\s+push\b/,
  /\baws\s+s3\s+(cp|sync|rm)\b/,
  /\bgcloud\s+\w+\s+deploy\b/,
];

const READONLY_TOOLS = new Set([
  "read_file", "list_files", "glob_files", "search_in_files", "file_info",
  "repo_map", "semantic_code_search", "explore", "analyze_image",
  "get_current_time", "get_system_info", "which_command",
  "git_status", "git_log", "git_diff",
  "fetch_webpage", "web_search", "http_request",
  "list_skills", "utilize_skill", "mcp_status", "sleep", "notify",
  "get_preview_url", "write_plan", "manage_task",
]);

const REVERSIBLE_TOOLS = new Set([
  "write_file", "edit_file", "append_to_file", "apply_patch", "notebook_edit",
  "copy_file", "move_item", "create_folder", "create_pdf", "generate_image",
  "git_add", "git_commit", "git_stash", "git_branch",
  "spawn_subagent", "spawn_subagent_parallel", "create_skill",
  "set_preview_url", "stop_preview",
]);

const IRREVERSIBLE_TOOLS = new Set(["git_checkout_file", "git_worktree", "computer_use"]);

const TOOL_RISK: Record<string, RiskLevel> = {
  execute_bash: "dangerous",
  delete_file: "dangerous",
  delete_folder: "dangerous",
  computer_use: "dangerous",
  git_checkout_file: "dangerous",
  http_request: "moderate",
};

export function getToolRiskLevel(toolName: string): RiskLevel {
  if (TOOL_RISK[toolName]) return TOOL_RISK[toolName];
  if (READONLY_TOOLS.has(toolName)) return "safe";
  return "moderate";
}

export function analyzeBashRisk(command: string): RiskLevel {
  const cmd = String(command ?? "");
  if (CRITICAL_PATTERNS.some((re) => re.test(cmd))) return "critical";
  if (DANGEROUS_PATTERNS.some((re) => re.test(cmd))) return "dangerous";
  return "moderate";
}

export function isExternalEffect(toolName: string, extraInfo?: string): boolean {
  if (toolName === "execute_bash" && extraInfo) {
    return EXTERNAL_BASH_PATTERNS.some((re) => re.test(extraInfo));
  }
  if (toolName === "http_request" || toolName === "fetch_webpage") return false;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Working directories
// ─────────────────────────────────────────────────────────────────────────────

function workingDirectories(settings: ResolvedPermissionSettings): string[] {
  const roots = [getProjectWorkdir(), ...settings.additionalDirectories];
  return roots.map((r) => toPosix(path.resolve(r)));
}

/** Is `p` inside the workspace root or one of the additional directories? */
export function isInsideWorkspace(p: string | undefined, settings?: ResolvedPermissionSettings): boolean {
  if (!p) return true;
  const s = settings ?? resolvePermissionSettings();
  const abs = toPosix(path.resolve(getProjectWorkdir(), p));
  return workingDirectories(s).some((root) => abs === root || abs.startsWith(`${root}/`));
}

export function classifyAction(toolName: string, extraInfo?: string): ActionClass {
  if (isExternalEffect(toolName, extraInfo)) return "irreversible";
  if (IRREVERSIBLE_TOOLS.has(toolName)) return "irreversible";
  if (READONLY_TOOLS.has(toolName)) return "readonly";

  if (toolName === "delete_file" || toolName === "delete_folder") {
    return isInsideWorkspace(extraInfo) ? "reversible" : "irreversible";
  }
  if (REVERSIBLE_TOOLS.has(toolName)) {
    return isInsideWorkspace(extraInfo) ? "reversible" : "irreversible";
  }
  if (toolName === "execute_bash") {
    const risk = extraInfo ? analyzeBashRisk(extraInfo) : "moderate";
    return risk === "moderate" ? "reversible" : "irreversible";
  }
  return "reversible";
}

// ─────────────────────────────────────────────────────────────────────────────
// Protected and critical paths
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Files a command could edit to grant itself more permission on the next run:
 * settings, hooks, MCP wiring, shell startup, git's own config. Nothing
 * auto-approves a write here — not an allow rule, not `auto` mode. Only an
 * explicit answer from you, or `bypassPermissions`, gets through.
 */
const PROTECTED_SUFFIXES = [
  ".cowrangler/settings.json",
  ".cowrangler/settings.local.json",
  ".cowrangler/config.yaml",
  ".cowrangler/hooks",
  ".cowrangler/agents",
  ".cowrangler/skills",
  ".cowrangler/commands",
  ".mcp.json",
  ".git/config",
  ".git/hooks",
  ".bashrc",
  ".zshrc",
  ".profile",
  ".bash_profile",
  ".gitconfig",
];

export function isProtectedPath(target: string | undefined): boolean {
  if (!target) return false;
  const abs = toPosix(path.resolve(getProjectWorkdir(), target));
  const home = toPosix(os.homedir());

  // Everything under the global Co-Wrangler home, plus its credential store.
  if (abs === `${home}/.cowrangler` || abs.startsWith(`${home}/.cowrangler/`)) return true;
  if (abs === `${home}/.cowrangler.json`) return true;

  return PROTECTED_SUFFIXES.some((suffix) => abs === `/${suffix}` || abs.endsWith(`/${suffix}`) || abs.includes(`/${suffix}/`));
}

/**
 * Paths a recursive delete must never be handed without a human saying so,
 * regardless of mode: filesystem root, the home directory, and the workspace
 * root itself.
 */
export function isCriticalDeleteTarget(target: string | undefined): boolean {
  if (!target) return false;
  const abs = toPosix(path.resolve(getProjectWorkdir(), target)).replace(/\/+$/, "");
  const roots = new Set(
    ["/", toPosix(os.homedir()), toPosix(path.resolve(getProjectWorkdir()))].map((r) => r.replace(/\/+$/, "")),
  );
  return roots.has(abs) || abs === "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Read-only shell commands
// ─────────────────────────────────────────────────────────────────────────────

const READONLY_COMMANDS = new Set([
  "ls", "cat", "head", "tail", "wc", "file", "stat", "pwd", "echo", "printf",
  "which", "type", "whoami", "id", "date", "uname", "hostname", "env",
  "grep", "egrep", "fgrep", "rg", "ag", "find", "fd", "tree", "du", "df",
  "sort", "uniq", "cut", "tr", "column", "jq", "yq", "basename", "dirname",
  "realpath", "readlink", "diff", "cmp", "md5sum", "shasum", "sha256sum",
  "ps", "top", "uptime", "man", "help", "true", "false", "test",
]);

const READONLY_SUBCOMMANDS: Record<string, Set<string>> = {
  git: new Set(["status", "log", "diff", "show", "branch", "remote", "config", "describe", "blame", "ls-files", "rev-parse", "shortlog", "tag"]),
  npm: new Set(["ls", "list", "view", "outdated", "why", "config"]),
  docker: new Set(["ps", "images", "logs", "inspect", "version"]),
  kubectl: new Set(["get", "describe", "logs", "version"]),
  cargo: new Set(["tree", "metadata"]),
};

/**
 * Programs whose first bare argument is a subcommand. A saved rule keeps that
 * word so "always allow `npm run build`" becomes `Bash(npm run *)` rather than
 * handing over every npm command.
 */
const SUBCOMMAND_PROGRAMS = new Set([
  "git", "npm", "npx", "yarn", "pnpm", "bun", "deno", "cargo", "go", "pip",
  "pip3", "poetry", "uv", "docker", "kubectl", "helm", "terraform", "gh",
  "brew", "apt", "dotnet", "gradle", "mvn", "make", "aws", "gcloud", "flutter",
]);

/** Filesystem commands `acceptEdits` treats like a file edit. */
const EDIT_LIKE_COMMANDS = new Set(["mkdir", "touch", "mv", "cp", "ln", "rmdir"]);

/**
 * isReadOnlyCommand — every segment of the pipeline is a known read-only
 * program, and nothing redirects or substitutes. A single unrecognised
 * program, redirect or backtick makes the whole command not read-only.
 */
export function isReadOnlyCommand(command: string): boolean {
  const cmd = String(command ?? "").trim();
  if (!cmd) return false;
  if (/[>`]|\$\(|<\(/.test(cmd)) return false;

  const segments = cmd.split(/\|\||&&|[|;]/).map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return false;

  for (const segment of segments) {
    const tokens = segment.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return false;
    let program = tokens[0];
    // Strip a leading env assignment such as `FOO=bar ls`.
    let idx = 0;
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(program) && idx + 1 < tokens.length) {
      idx += 1;
      program = tokens[idx];
    }
    const base = program.split("/").pop() ?? program;

    const subcommands = READONLY_SUBCOMMANDS[base];
    if (subcommands) {
      const sub = tokens.slice(idx + 1).find((t) => !t.startsWith("-"));
      if (!sub || !subcommands.has(sub)) return false;
      // `git config --global x y` writes; only the read form is safe.
      if (base === "git" && sub === "config" && tokens.slice(idx + 2).filter((t) => !t.startsWith("-")).length > 1) {
        return false;
      }
      continue;
    }
    if (!READONLY_COMMANDS.has(base)) return false;
    // `sed`/`awk` are excluded above; `find -delete`/`-exec` is not read-only.
    if (base === "find" && tokens.some((t) => t === "-delete" || t === "-exec" || t === "-execdir")) return false;
  }
  return true;
}

/** Does this command only touch the filesystem the way a file edit would? */
function isEditLikeCommand(command: string): boolean {
  const cmd = String(command ?? "").trim();
  if (/[`]|\$\(|<\(/.test(cmd)) return false;
  const segments = cmd.split(/\|\||&&|[|;]/).map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return false;
  return segments.every((segment) => {
    const base = (segment.split(/\s+/)[0] ?? "").split("/").pop() ?? "";
    return EDIT_LIKE_COMMANDS.has(base) || READONLY_COMMANDS.has(base);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// The decision
// ─────────────────────────────────────────────────────────────────────────────

export type PermissionBehavior = "allow" | "ask" | "deny";

export type DecisionSource =
  | "deny-rule"
  | "ask-rule"
  | "allow-rule"
  | "critical-command"
  | "critical-path"
  | "protected-path"
  | "outside-workspace"
  | "sandbox"
  | "readonly"
  | "mode";

export interface PermissionDecision {
  behavior: PermissionBehavior;
  /** One sentence, written for the person answering the prompt. */
  reason: string;
  source: DecisionSource;
  mode: PermissionMode;
  matchedRule?: string;
  matchedRuleType?: RuleType;
  riskLevel: RiskLevel;
  actionClass: ActionClass;
  externalEffect: boolean;
  /** Run this through the OS sandbox when it executes. */
  useSandbox: boolean;
  /** The rule to persist if the answer is "yes, and don't ask again". */
  suggestedRule?: string;
  /** The subject of the call: the command, path or URL. */
  subject?: string;
}

export interface PermissionRequest {
  tool: string;
  /** Raw tool input, used for path/command/domain extraction and param rules. */
  input?: Record<string, unknown>;
  mode?: string;
  /** Session-scoped rules and mode, layered above the settings files. */
  session?: SessionOverrides;
  /** Pre-resolved settings, when the caller already has them. */
  settings?: ResolvedPermissionSettings;
}

/** The command, path or URL a rule specifier matches against. */
export function subjectOf(tool: string, input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return undefined;
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = input[k];
      if (typeof v === "string" && v.trim()) return v;
    }
    return undefined;
  };
  if (tool === "execute_bash") return pick("command");
  if (tool === "fetch_webpage" || tool === "http_request") return pick("url");
  if (tool === "web_search") return pick("query");
  if (tool === "spawn_subagent" || tool === "spawn_subagent_parallel") return pick("agent", "subagent_type", "name");
  return pick("path", "file_path", "destination", "target", "notebook_path");
}

function specifierMatches(
  rule: ParsedRule,
  ruleType: RuleType,
  req: PermissionRequest,
  subject: string | undefined,
  settingsDir: string,
): boolean {
  if (rule.param) return matchParamRule(rule, req.input);
  if (rule.specifier === undefined) return true; // bare tool name matches everything

  const capability = toolCapability(req.tool);
  const aliases = toolAliases(req.tool);

  // Bash: command patterns.
  if (aliases.includes("Bash") || rule.tool === "Bash") {
    return subject ? matchBashPattern(rule.specifier, subject) : false;
  }

  // WebFetch: `domain:` specifiers.
  if (capability === "WebFetch" || rule.tool === "WebFetch") {
    const spec = rule.specifier.startsWith("domain:") ? rule.specifier.slice(7) : rule.specifier;
    const host = subject ? hostnameOf(subject) : null;
    return host ? matchDomainPattern(spec, host) : false;
  }

  // Agent: the subagent's name.
  if (capability === "Agent" || rule.tool === "Agent") {
    return subject ? subject === rule.specifier || matchBashPattern(rule.specifier, subject) : false;
  }

  // Everything else with a path-shaped subject: gitignore path matching.
  if (subject) {
    return matchPathPattern(rule.specifier, subject, {
      cwd: getProjectWorkdir(),
      settingsDir,
      ruleType,
    });
  }
  return false;
}

function findMatch(
  rules: SourcedRule[],
  ruleType: RuleType,
  req: PermissionRequest,
  subject: string | undefined,
  issues: { raw: string; reason: string }[],
): SourcedRule | null {
  for (const sourced of rules) {
    const { rule, issue } = parseRule(sourced.raw);
    if (!rule) {
      if (issue) issues.push({ raw: issue.raw, reason: issue.reason });
      continue;
    }
    if (!matchToolName(rule, req.tool, ruleType)) continue;
    if (specifierMatches(rule, ruleType, req, subject, sourced.settingsDir)) return sourced;
  }
  return null;
}

/** The rule a "don't ask again" answer should save. */
export function suggestRule(tool: string, subject: string | undefined): string | undefined {
  const capability = toolCapability(tool);
  if (!subject) return capability;
  if (capability === "Bash") {
    const tokens = subject.trim().split(/\s+/);
    const base = tokens[0];
    const sub = tokens[1];
    if (sub && !sub.startsWith("-") && SUBCOMMAND_PROGRAMS.has(base)) return `Bash(${base} ${sub} *)`;
    return `Bash(${base} *)`;
  }
  if (capability === "WebFetch") {
    const host = hostnameOf(subject);
    return host ? `WebFetch(domain:${host})` : "WebFetch";
  }
  if (capability === "Agent") return `Agent(${subject})`;
  // Escape gitignore metacharacters so the saved rule matches only this path.
  const escaped = subject.replace(/[[\]*?]/g, (c) => `\\${c}`);
  return `${capability === "Read" ? "Read" : "Edit"}(${escaped})`;
}

/**
 * evaluatePermission — the whole decision, in one pass.
 *
 * Layers are evaluated in a fixed order and the first that speaks wins:
 *   1. critical commands (never allowed by anything)
 *   2. deny rules
 *   3. protected and critical paths
 *   4. ask rules
 *   5. allow rules
 *   6. the mode, with the sandbox able to auto-allow Bash
 */
export function evaluatePermission(req: PermissionRequest): PermissionDecision {
  const settings = req.settings ?? resolvePermissionSettings(req.session);
  let mode = normalizePermissionMode(req.mode ?? settings.defaultMode);

  // A managed policy can take the riskiest modes off the table entirely.
  if (mode === "bypassPermissions" && settings.disableBypassPermissionsMode) mode = "default";
  if (mode === "auto" && settings.disableAutoMode) mode = "default";

  const subject = subjectOf(req.tool, req.input);
  const isBash = req.tool === "execute_bash";
  const riskLevel = isBash && subject ? worstRisk(getToolRiskLevel(req.tool), analyzeBashRisk(subject)) : getToolRiskLevel(req.tool);
  const actionClass = classifyAction(req.tool, subject);
  const externalEffect = isExternalEffect(req.tool, subject);
  const capability = toolCapability(req.tool);
  const issues: { raw: string; reason: string }[] = [];

  const base = {
    mode,
    riskLevel,
    actionClass,
    externalEffect,
    subject,
    useSandbox: false,
  };

  // ── 1. Critical commands ────────────────────────────────────────────────
  // These are refused in every mode, `bypassPermissions` included. A fork bomb
  // or `mkfs` is never what anyone meant, and no sandbox makes it recoverable.
  if (isBash && subject && riskLevel === "critical") {
    return {
      ...base,
      behavior: "deny",
      source: "critical-command",
      reason: "This command matches a destructive pattern that is blocked in every permission mode.",
    };
  }

  // ── 2. Deny rules ───────────────────────────────────────────────────────
  const denied = findMatch(settings.deny, "deny", req, subject, issues);
  if (denied) {
    return {
      ...base,
      behavior: "deny",
      source: "deny-rule",
      matchedRule: denied.raw,
      matchedRuleType: "deny",
      reason: `Blocked by the deny rule \`${denied.raw}\` from ${denied.scope} settings.`,
    };
  }

  if (mode === "bypassPermissions") {
    return {
      ...base,
      behavior: "allow",
      source: "mode",
      reason: "Bypass permissions mode — checks beyond deny rules are skipped.",
    };
  }

  // ── 3. The unsandboxed escape hatch ─────────────────────────────────────
  // When a command fails because the sandbox blocked it, the model may retry
  // with `dangerouslyDisableSandbox`. That retry is sanctioned but never
  // silent: it always comes back to you.
  //
  // Anthropic's own build hands this to a classifier in `auto` mode instead of
  // prompting. We have no classifier, so the conservative reading applies —
  // running outside the sandbox is a decision only a person makes.
  if (req.input?.dangerouslyDisableSandbox === true) {
    if (!settings.sandbox.allowUnsandboxedCommands) {
      return {
        ...base,
        behavior: "deny",
        source: "sandbox",
        reason:
          "Strict sandbox mode: `allowUnsandboxedCommands` is off, so commands must run sandboxed or be listed in `sandbox.excludedCommands`.",
      };
    }
    if (mode === "dontAsk") {
      return {
        ...base,
        behavior: "deny",
        source: "sandbox",
        reason: "Running outside the sandbox needs an answer, and don't-ask mode never prompts.",
      };
    }
    return {
      ...base,
      behavior: "ask",
      source: "sandbox",
      useSandbox: false,
      reason:
        "This would run outside the sandbox, with no filesystem or network boundary around it.",
      // Deliberately not persistable: "always run this unsandboxed" is not a
      // rule anyone should be able to save by clicking through a prompt.
      suggestedRule: undefined,
    };
  }

  // ── 4. Paths nothing auto-approves ──────────────────────────────────────
  const writesFiles = capability === "Edit" || capability === "Write";
  if (writesFiles && isProtectedPath(subject)) {
    return {
      ...base,
      behavior: "ask",
      source: "protected-path",
      reason:
        "This path holds settings, hooks or credentials that decide what Claude may do next, so a write here always needs your approval.",
      suggestedRule: undefined, // deliberately not persistable
    };
  }
  if ((req.tool === "delete_folder" || req.tool === "delete_file") && isCriticalDeleteTarget(subject)) {
    return {
      ...base,
      behavior: "ask",
      source: "critical-path",
      reason: "This would delete a filesystem root, your home directory or the workspace itself.",
    };
  }
  if (isBash && subject && /\brm\b/.test(subject)) {
    const targets = subject.split(/\s+/).filter((t) => !t.startsWith("-") && t !== "rm");
    if (targets.some((t) => isCriticalDeleteTarget(t))) {
      return {
        ...base,
        behavior: "ask",
        source: "critical-path",
        reason: "This delete targets a critical path, so it goes through the normal approval flow even when sandboxed.",
      };
    }
  }

  // ── 5. Ask rules ────────────────────────────────────────────────────────
  const asked = findMatch(settings.ask, "ask", req, subject, issues);
  if (asked) {
    return {
      ...base,
      behavior: "ask",
      source: "ask-rule",
      matchedRule: asked.raw,
      matchedRuleType: "ask",
      reason: `The ask rule \`${asked.raw}\` requires confirmation for this action.`,
      suggestedRule: suggestRule(req.tool, subject),
    };
  }

  // ── 6. Allow rules ──────────────────────────────────────────────────────
  const allowed = findMatch(settings.allow, "allow", req, subject, issues);
  if (allowed) {
    return {
      ...base,
      behavior: "allow",
      source: "allow-rule",
      matchedRule: allowed.raw,
      matchedRuleType: "allow",
      useSandbox: shouldSandbox(settings, req.tool, subject, actionClass),
      reason: `Allowed by \`${allowed.raw}\` from ${allowed.scope} settings.`,
    };
  }

  // Hosts this call would reach that nobody has approved. Checked after the
  // rule lists, so an explicit `WebFetch(domain:…)` allow rule still wins.
  const reachedHosts = isBash && subject
    ? extractHosts(subject)
    : capability === "WebFetch" && subject
      ? [hostnameOf(subject)].filter((h): h is string => !!h)
      : [];
  const unapproved = unapprovedHosts(settings, reachedHosts);

  // ── 7. Reads inside the working directories ─────────────────────────────
  if (actionClass === "readonly") {
    // A fetch is read-only for your filesystem, not for the network. An
    // un-approved host asks once, and the answer is savable as a domain rule.
    if (unapproved.length > 0) {
      if (mode === "dontAsk") {
        return {
          ...base,
          behavior: "deny",
          source: "outside-workspace",
          reason: `No allow rule covers ${unapproved[0]}, and don't-ask mode never prompts.`,
        };
      }
      return {
        ...base,
        behavior: "ask",
        source: "outside-workspace",
        reason: `This reaches ${unapproved.join(", ")}, which is not on your allowed-domain list.`,
        suggestedRule: suggestRule(req.tool, subject),
      };
    }
    const readsFiles = capability === "Read";
    if (!readsFiles || isInsideWorkspace(subject, settings)) {
      return { ...base, behavior: "allow", source: "readonly", reason: "Read-only action inside your working directories." };
    }
    if (mode === "dontAsk") {
      return { ...base, behavior: "deny", source: "outside-workspace", reason: "Reading outside the working directories, and no allow rule covers it." };
    }
    return {
      ...base,
      behavior: "ask",
      source: "outside-workspace",
      reason: "This reads a path outside your working directories.",
      suggestedRule: suggestRule(req.tool, subject),
    };
  }

  // ── 8. The sandbox can auto-allow Bash ──────────────────────────────────
  // Sandboxing is an independent axis: when a command can be confined to the
  // workspace and the allowed domains, the OS enforces the boundary and no
  // prompt is needed. Plan mode is the exception — it gates commands itself.
  if (isBash && subject && mode !== "plan" && canAutoAllowSandboxed(settings, subject, actionClass, externalEffect)) {
    return {
      ...base,
      behavior: "allow",
      source: "sandbox",
      useSandbox: true,
      reason: "Runs inside the sandbox, confined to your workspace and allowed domains.",
    };
  }

  // ── 9. Mode ─────────────────────────────────────────────────────────────
  const useSandbox = shouldSandbox(settings, req.tool, subject, actionClass);
  const outsideWorkspace = (writesFiles || req.tool === "delete_file" || req.tool === "delete_folder") &&
    !isInsideWorkspace(subject, settings);

  if (mode === "dontAsk") {
    return {
      ...base,
      behavior: "deny",
      source: "mode",
      reason: "Don't-ask mode — this action is not covered by an allow rule.",
    };
  }

  if (mode === "plan") {
    if (isBash && subject && isReadOnlyCommand(subject)) {
      return { ...base, behavior: "allow", source: "readonly", useSandbox, reason: "Read-only command, allowed while planning." };
    }
    return {
      ...base,
      behavior: "deny",
      source: "mode",
      reason: "Plan mode — Claude explores and proposes, but does not change anything. Approve the plan to continue.",
    };
  }

  if (mode === "acceptEdits") {
    const editLikeBash = isBash && subject && isEditLikeCommand(subject);
    const isWorkspaceEdit =
      (writesFiles || editLikeBash) && !outsideWorkspace && !externalEffect && unapproved.length === 0;
    if (isWorkspaceEdit) {
      return { ...base, behavior: "allow", source: "mode", useSandbox, reason: "Accept-edits mode — workspace edits apply without asking." };
    }
  }

  if (mode === "auto") {
    if (actionClass === "reversible" && !externalEffect && !outsideWorkspace && unapproved.length === 0) {
      return {
        ...base,
        behavior: "allow",
        source: "mode",
        useSandbox,
        reason: "Auto mode — reversible work inside the workspace, checkpointed before it runs.",
      };
    }
    return {
      ...base,
      behavior: "ask",
      source: "mode",
      useSandbox,
      reason: unapproved.length > 0
        ? `Auto mode stops here: this reaches ${unapproved.join(", ")}, which is not on your allowed-domain list.`
        : externalEffect
          ? "Auto mode stops for external effects — this leaves your machine and can't be rolled back."
          : outsideWorkspace
            ? "Auto mode stops for writes outside your working directories."
            : "Auto mode stops for irreversible actions.",
      suggestedRule: suggestRule(req.tool, subject),
    };
  }

  return {
    ...base,
    behavior: "ask",
    source: "mode",
    useSandbox,
    reason: unapproved.length > 0
      ? `This reaches ${unapproved.join(", ")}, which is not on your allowed-domain list.`
      : outsideWorkspace
        ? "This writes outside your working directories."
        : externalEffect
          ? "This has an effect outside your machine."
          : `Approval needed before running ${req.tool}.`,
    suggestedRule: suggestRule(req.tool, subject),
  };
}

function worstRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  const order: RiskLevel[] = ["safe", "moderate", "dangerous", "critical"];
  return order[Math.max(order.indexOf(a), order.indexOf(b))];
}

function shouldSandbox(
  settings: ResolvedPermissionSettings,
  tool: string,
  subject: string | undefined,
  actionClass: ActionClass,
): boolean {
  if (!settings.sandbox.enabled) return false;
  if (actionClass === "readonly") return false;
  if (tool === "execute_bash" && subject && isExcludedFromSandbox(settings, subject)) return false;
  return true;
}

function isExcludedFromSandbox(settings: ResolvedPermissionSettings, command: string): boolean {
  return settings.sandbox.excludedCommands.some((pattern) => matchBashPattern(pattern, command));
}

/**
 * canAutoAllowSandboxed — would the sandbox contain this command well enough
 * to skip the prompt? It must be confinable (no external effect, no excluded
 * command), and any network it needs must already be on the allowlist.
 */
function canAutoAllowSandboxed(
  settings: ResolvedPermissionSettings,
  command: string,
  actionClass: ActionClass,
  externalEffect: boolean,
): boolean {
  const sb = settings.sandbox;
  if (!sb.enabled || !sb.autoAllowBash) return false;
  if (externalEffect || actionClass === "irreversible") return false;
  if (isExcludedFromSandbox(settings, command)) return false;
  if (analyzeBashRisk(command) !== "moderate") return false;

  // A command that reaches the network only runs unprompted when every host it
  // names is already allowed.
  const hosts = extractHosts(command);
  if (hosts.length > 0) {
    const allowed = effectiveAllowedDomains(sb);
    const denied = sb.network.deniedDomains;
    for (const host of hosts) {
      if (denied.some((d) => matchDomainPattern(d, host))) return false;
      if (!allowed.some((d) => matchDomainPattern(d, host))) return false;
    }
  }
  return true;
}

/**
 * unapprovedHosts — hosts this call would reach that are not on the allowlist.
 *
 * The sandbox's allowlist is the single source of truth for "which hosts may we
 * talk to", and it applies to more than sandboxed commands: a host nobody
 * approved is a host nobody approved, whether the request comes from `curl`,
 * from WebFetch, or from a script the command spawns. Without this, a mode that
 * auto-approves reversible work would happily run `curl https://attacker.test`
 * outside the sandbox — reversible on this machine, and a data-exfiltration
 * path everywhere else.
 */
function unapprovedHosts(settings: ResolvedPermissionSettings, hosts: string[]): string[] {
  if (hosts.length === 0) return [];
  const allowed = effectiveAllowedDomains(settings.sandbox);
  const denied = settings.sandbox.network.deniedDomains;
  return hosts.filter(
    (host) =>
      denied.some((d) => matchDomainPattern(d, host)) ||
      !allowed.some((d) => matchDomainPattern(d, host)),
  );
}

/** Hosts named in a command, so network-touching commands can be checked. */
export function extractHosts(command: string): string[] {
  const out = new Set<string>();
  const urlRe = /\bhttps?:\/\/([^\s/"'`)]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(command))) {
    const host = m[1].split("@").pop()?.split(":")[0];
    if (host) out.add(host.toLowerCase());
  }
  return [...out];
}

// ─────────────────────────────────────────────────────────────────────────────
// Presentation helpers
// ─────────────────────────────────────────────────────────────────────────────

export function riskBadge(level: RiskLevel): string {
  switch (level) {
    case "safe": return "✓";
    case "moderate": return "◎";
    case "dangerous": return "⚠";
    case "critical": return "✗";
  }
}

/** Hex colours matching the desktop design tokens, for CLI output. */
export function riskColor(level: RiskLevel): string {
  switch (level) {
    case "safe": return "#4FBF88";
    case "moderate": return "#9C8E82";
    case "dangerous": return "#E0AC4A";
    case "critical": return "#F0796C";
  }
}

/**
 * isOptionSelected — did the user's answer choose `option`?
 *
 * Answers arrive as JSON from the desktop prompt and as free text from the
 * CLI, in either English or Turkish, so all three shapes are accepted.
 */
export function isOptionSelected(answer: string, option: string): boolean {
  if (!answer) return false;
  const normalizedOption = option.toLowerCase().trim();
  const positives = ["go ahead", "allow", "yes", "y", "devam", "devam et", "onay", "onayla", "evet", "ok", "proceed"];
  const isPositiveOption = normalizedOption === "go ahead" || normalizedOption === "allow";
  const wanted = isPositiveOption ? positives : [normalizedOption];

  try {
    const parsed = JSON.parse(answer);
    if (parsed && typeof parsed === "object") {
      if (parsed.kind === "choice" && Array.isArray(parsed.selected)) {
        return parsed.selected.some((sel: string) => wanted.includes(String(sel).toLowerCase().trim()));
      }
      if (parsed.kind === "text" && typeof parsed.customText === "string") {
        return wanted.includes(parsed.customText.toLowerCase().trim());
      }
    }
  } catch {
    // Not JSON — fall through to the text forms.
  }

  const normalizedAnswer = answer.toLowerCase().trim();
  if (wanted.includes(normalizedAnswer)) return true;

  for (const line of answer.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("A:")) continue;
    const val = trimmed.slice(2).trim().toLowerCase();
    if (wanted.some((w) => val.includes(w))) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Persisting an answer
// ─────────────────────────────────────────────────────────────────────────────

export type WritableScope = "local" | "project" | "user";

export function settingsFileFor(scope: WritableScope): string {
  if (scope === "user") return path.join(os.homedir(), ".cowrangler", "settings.json");
  const dir = path.join(getProjectWorkdir(), ".cowrangler");
  return path.join(dir, scope === "local" ? "settings.local.json" : "settings.json");
}

/** Read one scope's settings file verbatim, without merging anything into it. */
export function readScopeSettings(scope: WritableScope): any {
  const target = settingsFileFor(scope);
  try {
    if (!fs.existsSync(target)) return {};
    return JSON.parse(fs.readFileSync(target, "utf-8") || "{}");
  } catch {
    return {};
  }
}

/**
 * updateScopeSettings — read-modify-write one scope's settings file.
 * The mutator receives the parsed document and edits it in place.
 */
export function updateScopeSettings(scope: WritableScope, mutate: (json: any) => void): void {
  const target = settingsFileFor(scope);
  const json = readScopeSettings(scope);
  mutate(json);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(json, null, 2)}\n`, "utf-8");
  invalidatePermissionSettings();
}

/**
 * saveRule — add a rule to a scope, creating the file if needed. Used by
 * "yes, and don't ask again" and by the settings UI.
 */
export function saveRule(rule: string, type: RuleType, scope: WritableScope = "local"): void {
  updateScopeSettings(scope, (json) => {
    json.permissions = json.permissions ?? {};
    const list: string[] = Array.isArray(json.permissions[type]) ? json.permissions[type] : [];
    if (!list.includes(rule)) list.push(rule);
    json.permissions[type] = list;
  });
}

/** Remove a rule from a scope. A rule the scope never held is a no-op. */
export function removeRule(rule: string, type: RuleType, scope: WritableScope = "local"): void {
  updateScopeSettings(scope, (json) => {
    const list: string[] = Array.isArray(json.permissions?.[type]) ? json.permissions[type] : [];
    json.permissions = json.permissions ?? {};
    json.permissions[type] = list.filter((r) => r !== rule);
  });
}

/** Persist the mode a session starts in. */
export function saveDefaultMode(mode: PermissionMode, scope: WritableScope = "local"): void {
  updateScopeSettings(scope, (json) => {
    json.permissions = json.permissions ?? {};
    json.permissions.defaultMode = mode;
  });
}

/** Add or drop a directory Claude may treat as part of the workspace. */
export function setAdditionalDirectories(dirs: string[], scope: WritableScope = "local"): void {
  updateScopeSettings(scope, (json) => {
    json.permissions = json.permissions ?? {};
    json.permissions.additionalDirectories = Array.from(new Set(dirs.filter(Boolean)));
  });
}

/** Merge a partial sandbox configuration into a scope. */
export function saveSandboxSettings(patch: Record<string, unknown>, scope: WritableScope = "local"): void {
  updateScopeSettings(scope, (json) => {
    const current = json.sandbox ?? {};
    json.sandbox = {
      ...current,
      ...patch,
      filesystem: { ...(current.filesystem ?? {}), ...((patch as any).filesystem ?? {}) },
      network: { ...(current.network ?? {}), ...((patch as any).network ?? {}) },
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy surface
// ─────────────────────────────────────────────────────────────────────────────

export interface PermissionPolicy {
  allow?: string[];
  ask?: string[];
  deny?: string[];
}

export interface PermissionResult {
  allowed: boolean;
  requiresApproval?: boolean;
  reason?: string;
  mode: PermissionMode;
  riskLevel: RiskLevel;
  actionClass?: ActionClass;
  externalEffect?: boolean;
  useSandbox?: boolean;
  matchedRule?: string;
  suggestedRule?: string;
}

/**
 * checkPermission — the pre-rewrite signature, kept so existing call sites and
 * plugins keep working. New code should call `evaluatePermission` directly and
 * read the richer decision.
 */
export function checkPermission(
  toolName: string,
  rawMode: string,
  extraInfo?: string,
  policy?: PermissionPolicy,
): PermissionResult {
  const input: Record<string, unknown> = {};
  if (extraInfo !== undefined) {
    if (toolName === "execute_bash") input.command = extraInfo;
    else if (toolName === "fetch_webpage" || toolName === "http_request") input.url = extraInfo;
    else input.path = extraInfo;
  }

  let legacyConfig: Record<string, any> = {};
  try {
    legacyConfig = getConfig() ?? {};
  } catch {
    legacyConfig = {};
  }

  const decision = evaluatePermission({
    tool: toolName,
    input,
    mode: rawMode,
    session: {
      allow: policy?.allow,
      ask: policy?.ask,
      deny: policy?.deny,
      legacyConfig: policy ? {} : legacyConfig,
    },
  });

  return {
    allowed: decision.behavior === "allow",
    requiresApproval: decision.behavior === "ask",
    reason: decision.reason,
    mode: decision.mode,
    riskLevel: decision.riskLevel,
    actionClass: decision.actionClass,
    externalEffect: decision.externalEffect,
    useSandbox: decision.useSandbox,
    matchedRule: decision.matchedRule,
    suggestedRule: decision.suggestedRule,
  };
}
