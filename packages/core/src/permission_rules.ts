/**
 * permission_rules — rule parsing and matching for the Co-Wrangler permission
 * system.
 *
 * The rule grammar mirrors the one Anthropic ships with Claude Code, so a
 * `.cowrangler/settings.json` written by someone who already knows Claude Code
 * behaves the way they expect:
 *
 *   Tool                      → every use of the tool
 *   Tool(specifier)           → a tool-specific matcher (command, path, domain…)
 *   Tool(param:value)         → a top-level input parameter (deny/ask only)
 *   tool-name glob            → e.g. `mcp__*` (deny/ask only)
 *
 * Everything here is pure: no config reads, no filesystem writes. The engine in
 * permissions.ts feeds it resolved inputs so this module stays trivially
 * testable.
 */

import path from "path";
import os from "os";

// ─────────────────────────────────────────────────────────────────────────────
// Canonical tool names
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Co-Wrangler's runtime tools are snake_case (`execute_bash`, `read_file`).
 * Rules may be written with either those names or the Claude Code capability
 * names (`Bash`, `Read`, `Edit`, `WebFetch`, `WebSearch`, `Agent`), so a rule
 * set can be shared between the two ecosystems. A tool matches a rule when the
 * rule's tool name is any of the names this function returns.
 */
const CAPABILITY_OF: Record<string, string[]> = {
  // Shell
  execute_bash: ["Bash"],

  // Reads
  read_file: ["Read"],
  list_files: ["Read"],
  glob_files: ["Read"],
  search_in_files: ["Read"],
  file_info: ["Read"],
  repo_map: ["Read"],
  semantic_code_search: ["Read"],
  explore: ["Read"],
  analyze_image: ["Read"],

  // Writes / edits
  write_file: ["Edit", "Write"],
  edit_file: ["Edit"],
  append_to_file: ["Edit"],
  apply_patch: ["Edit"],
  notebook_edit: ["Edit", "NotebookEdit"],
  create_folder: ["Edit"],
  create_pdf: ["Edit"],
  copy_file: ["Edit"],
  move_item: ["Edit"],
  delete_file: ["Edit"],
  delete_folder: ["Edit"],
  generate_image: ["Edit"],

  // Network
  fetch_webpage: ["WebFetch"],
  http_request: ["WebFetch"],
  web_search: ["WebSearch"],

  // Sub-agents
  spawn_subagent: ["Agent"],
  spawn_subagent_parallel: ["Agent"],

  // Git — treated as their own capability so `Git(...)` rules are possible,
  // and as shell-adjacent so a blanket `Bash` deny also stops them.
  git_add: ["Git"],
  git_commit: ["Git"],
  git_status: ["Git"],
  git_diff: ["Git"],
  git_log: ["Git"],
  git_branch: ["Git"],
  git_stash: ["Git"],
  git_worktree: ["Git"],
  git_checkout_file: ["Git"],
};

/** All rule-name aliases a given runtime tool answers to, most specific first. */
export function toolAliases(toolName: string): string[] {
  return [toolName, ...(CAPABILITY_OF[toolName] ?? [])];
}

/** The capability a tool belongs to, or the tool name when it has none. */
export function toolCapability(toolName: string): string {
  return CAPABILITY_OF[toolName]?.[0] ?? toolName;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule parsing
// ─────────────────────────────────────────────────────────────────────────────

export type RuleType = "allow" | "ask" | "deny";

export interface ParsedRule {
  /** Raw text as written in settings, for diagnostics. */
  raw: string;
  /** Tool name portion, e.g. `Bash`, `mcp__github__get_issue`, `mcp__*`. */
  tool: string;
  /** Text inside the parentheses, if any. */
  specifier?: string;
  /** Set when the specifier is `param:value` rather than a tool matcher. */
  param?: { name: string; value: string };
  /** True when the tool name itself contains a glob. */
  toolIsGlob: boolean;
}

/**
 * Content fields that must never be matched via `Tool(param:value)`. A rule
 * like `Bash(command:rm *)` would be trivially bypassed by a compound command,
 * so it is rejected rather than silently under-matching.
 */
const PRIMARY_CONTENT_FIELDS: Record<string, string[]> = {
  Bash: ["command"],
  execute_bash: ["command"],
  Read: ["path", "file_path"],
  Edit: ["path", "file_path"],
  Write: ["path", "file_path"],
  WebFetch: ["url"],
};

export interface ParseIssue {
  raw: string;
  reason: string;
}

/**
 * parseRule — turn a settings string into a ParsedRule.
 * Returns `null` together with an issue when the rule can never be honoured.
 */
export function parseRule(raw: string): { rule: ParsedRule | null; issue?: ParseIssue } {
  const text = String(raw ?? "").trim();
  if (!text) return { rule: null, issue: { raw, reason: "empty rule" } };

  const open = text.indexOf("(");
  if (open === -1) {
    return {
      rule: { raw: text, tool: text, toolIsGlob: /[*?]/.test(text) },
    };
  }
  if (!text.endsWith(")")) {
    return { rule: null, issue: { raw: text, reason: "missing closing parenthesis" } };
  }

  const tool = text.slice(0, open).trim();
  const specifier = text.slice(open + 1, -1).trim();
  if (!tool) return { rule: null, issue: { raw: text, reason: "missing tool name" } };

  // MCP rules never take parentheses — Claude Code skips them, and so do we.
  if (tool.startsWith("mcp__")) {
    return {
      rule: null,
      issue: { raw: text, reason: "MCP rules do not take a specifier; use mcp__server__tool" },
    };
  }

  // `param:value` — only when the left side is a bare identifier and the tool
  // has a matcher of its own that does not already use `name:` syntax.
  const paramMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([\s\S]*)$/.exec(specifier);
  if (paramMatch && !isTypedSpecifier(tool, specifier)) {
    const name = paramMatch[1];
    const value = paramMatch[2].trim();
    const blocked = PRIMARY_CONTENT_FIELDS[tool] ?? [];
    if (blocked.includes(name)) {
      return {
        rule: null,
        issue: {
          raw: text,
          reason: `cannot match the primary content field "${name}"; use ${tool}(<pattern>) instead`,
        },
      };
    }
    return {
      rule: { raw: text, tool, specifier, param: { name, value }, toolIsGlob: false },
    };
  }

  return { rule: { raw: text, tool, specifier, toolIsGlob: /[*?]/.test(tool) } };
}

/**
 * A `domain:` specifier on WebFetch is a typed matcher, not a parameter rule.
 * Bash specifiers ending in `:*` are the trailing-wildcard shorthand.
 */
function isTypedSpecifier(tool: string, specifier: string): boolean {
  if ((tool === "WebFetch" || tool === "fetch_webpage" || tool === "http_request") &&
      specifier.startsWith("domain:")) {
    return true;
  }
  // `Bash(ls:*)` — the colon form of a trailing wildcard.
  if (specifier.endsWith(":*")) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bash command matching
// ─────────────────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * matchBashPattern — Claude Code's Bash wildcard semantics.
 *
 *  - `*` stands in for any text, spaces included.
 *  - A trailing ` *` that is the pattern's only wildcard also matches the bare
 *    command: `Bash(ls *)` matches `ls`.
 *  - The space before a trailing `*` is significant: `Bash(ls *)` does not
 *    match `lsof`, `Bash(ls*)` does.
 *  - `:*` at the end is an equivalent spelling of ` *`.
 */
export function matchBashPattern(pattern: string, command: string): boolean {
  if (pattern === undefined || pattern === null) return false;
  let pat = String(pattern).trim();
  const cmd = String(command ?? "").trim();
  if (!pat) return false;
  if (pat === "*") return true;

  // `ls:*` → `ls *`
  if (pat.endsWith(":*")) pat = pat.slice(0, -2) + " *";

  const body = pat.split("*").map(escapeRegex).join("[\\s\\S]*");
  if (new RegExp(`^${body}$`).test(cmd)) return true;

  // Trailing " *" as the only wildcard also matches the bare command.
  const wildcardCount = (pat.match(/\*/g) ?? []).length;
  if (wildcardCount === 1 && pat.endsWith(" *")) {
    const bare = pat.slice(0, -2);
    if (cmd === bare) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Path matching (gitignore-flavoured)
// ─────────────────────────────────────────────────────────────────────────────

export interface PathRuleContext {
  /** Session's primary working directory — the anchor for bare/`./` patterns. */
  cwd: string;
  /** Directory the settings file lives in — the anchor for `/pattern`. */
  settingsDir?: string;
  /** Allow rules anchor tighter than deny/ask rules for single-segment dirs. */
  ruleType: RuleType;
}

interface ResolvedPattern {
  /** Absolute directory the glob is anchored at. */
  anchor: string;
  /** Glob relative to the anchor, POSIX separators. */
  glob: string;
}

/** Normalise a filesystem path to the POSIX form matching runs against. */
export function toPosix(p: string): string {
  let out = p.replace(/\\/g, "/");
  // C:/Users/... → /c/Users/...
  const drive = /^([A-Za-z]):\//.exec(out);
  if (drive) out = `/${drive[1].toLowerCase()}/${out.slice(3)}`;
  return out;
}

function resolvePattern(pattern: string, ctx: PathRuleContext): ResolvedPattern {
  const cwd = toPosix(path.resolve(ctx.cwd));
  const settingsDir = toPosix(path.resolve(ctx.settingsDir ?? ctx.cwd));
  const home = toPosix(os.homedir());

  if (pattern.startsWith("//")) return { anchor: "/", glob: pattern.slice(2) };
  if (pattern.startsWith("~/")) return { anchor: home, glob: pattern.slice(2) };
  if (pattern.startsWith("/")) return { anchor: settingsDir, glob: pattern.slice(1) };
  if (pattern.startsWith("./")) return { anchor: cwd, glob: pattern.slice(2) };
  return { anchor: cwd, glob: pattern };
}

/**
 * Widen a pattern the way gitignore does, per rule type:
 *  - a bare filename (`\.env`) matches at any depth        → `**\/.env`
 *  - a single-segment directory (`src/**`) matches at any
 *    depth for deny/ask rules but only at the anchor for
 *    allow rules
 */
function depthVariants(glob: string, ruleType: RuleType): string[] {
  const variants = [glob];
  const segments = glob.split("/");

  if (segments.length === 1 && !glob.includes("**")) {
    variants.push(`**/${glob}`);
    return variants;
  }
  if (ruleType !== "allow" && segments.length >= 2 && !segments[0].includes("*")) {
    variants.push(`**/${glob}`);
  }
  return variants;
}

/** gitignore glob → regex. `*` stays inside one segment, `**` crosses them. */
function globToRegex(glob: string): RegExp {
  let out = "";
  let i = 0;
  while (i < glob.length) {
    const ch = glob[i];
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        // `**/` — zero or more leading segments; bare `**` — anything.
        if (glob[i + 2] === "/") {
          out += "(?:[^/]+/)*";
          i += 3;
        } else {
          out += "[\\s\\S]*";
          i += 2;
        }
        continue;
      }
      out += "[^/]*";
      i += 1;
      continue;
    }
    if (ch === "?") {
      out += "[^/]";
      i += 1;
      continue;
    }
    out += escapeRegex(ch);
    i += 1;
  }
  return new RegExp(`^${out}$`);
}

/**
 * matchPathPattern — does `target` fall under `pattern`?
 *
 * A directory pattern also matches the directory itself, so `Edit(src/**)`
 * covers `src` as well as everything under it.
 */
export function matchPathPattern(pattern: string, target: string, ctx: PathRuleContext): boolean {
  if (!pattern) return false;
  const abs = toPosix(path.resolve(ctx.cwd, target));
  const { anchor, glob } = resolvePattern(pattern.trim(), ctx);
  const anchorPrefix = anchor.endsWith("/") ? anchor : `${anchor}/`;

  if (abs !== anchor && !abs.startsWith(anchorPrefix)) return false;
  const rel = abs === anchor ? "" : abs.slice(anchorPrefix.length);

  for (const variant of depthVariants(glob, ctx.ruleType)) {
    if (globToRegex(variant).test(rel)) return true;
    // `foo/**` should also match `foo` itself.
    if (variant.endsWith("/**")) {
      if (globToRegex(variant.slice(0, -3)).test(rel)) return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain matching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * matchDomainPattern — hostname matching for `WebFetch(domain:…)`.
 *
 *  - matching is case-insensitive and ignores a trailing dot
 *  - a bare `*` matches every host
 *  - a leading `*.` matches subdomains at any depth but not the apex
 *  - a `*` anywhere else matches within a single label only, so
 *    `example.*` matches `example.org` but never `example.evil.com`
 */
export function matchDomainPattern(pattern: string, hostname: string): boolean {
  const pat = String(pattern ?? "").trim().toLowerCase().replace(/\.$/, "");
  const host = String(hostname ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!pat || !host) return false;
  if (pat === "*") return true;

  if (pat.startsWith("*.")) {
    const suffix = pat.slice(1); // ".example.com"
    return host.endsWith(suffix) && host.length > suffix.length;
  }

  const body = pat.split("*").map(escapeRegex).join("[^.]*");
  return new RegExp(`^${body}$`).test(host);
}

/** Pull the hostname out of a URL, tolerating bare hosts and IPv6 literals. */
export function hostnameOf(url: string): string | null {
  const raw = String(url ?? "").trim();
  if (!raw) return null;
  try {
    return new URL(raw).hostname.replace(/^\[|\]$/g, "");
  } catch {
    try {
      return new URL(`https://${raw}`).hostname.replace(/^\[|\]$/g, "");
    } catch {
      return null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP + tool-name glob matching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * matchToolName — does a rule's tool-name portion cover `toolName`?
 *
 *  - exact match on the runtime name or any capability alias
 *  - `mcp__server` matches every tool from that server
 *  - globs are honoured for deny/ask; for allow they must be anchored to a
 *    literal `mcp__<server>__` prefix so a rule always names a real server
 */
export function matchToolName(rule: ParsedRule, toolName: string, ruleType: RuleType): boolean {
  const aliases = toolAliases(toolName);
  if (aliases.includes(rule.tool)) return true;

  // `mcp__server` covers `mcp__server__anything`.
  if (rule.tool.startsWith("mcp__") && !rule.tool.includes("*")) {
    if (toolName.startsWith(`${rule.tool}__`)) return true;
  }

  if (!rule.toolIsGlob) return false;

  if (ruleType === "allow") {
    // Only `mcp__<literal server>__<glob>` may auto-approve.
    const m = /^mcp__([^_*][^*]*?)__(.+)$/.exec(rule.tool);
    if (!m || m[1].includes("*")) return false;
  }

  const re = globToRegex(rule.tool.replace(/\//g, "\u0000"));
  return re.test(toolName.replace(/\//g, "\u0000"));
}

/** Match a `Tool(param:value)` rule against the tool's raw input object. */
export function matchParamRule(rule: ParsedRule, input: Record<string, unknown> | undefined): boolean {
  if (!rule.param || !input) return false;
  const actual = input[rule.param.name];
  if (actual === undefined || actual === null) return false;
  if (typeof actual === "object") return false; // nested fields are not matchable
  const value = String(actual);
  if (!rule.param.value.includes("*")) return value === rule.param.value;
  const body = rule.param.value.split("*").map(escapeRegex).join("[\\s\\S]*");
  return new RegExp(`^${body}$`).test(value);
}
