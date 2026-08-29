/**
 * permission_settings — layered permission configuration.
 *
 * Co-Wrangler reads permission policy from five scopes, highest authority
 * first. This mirrors Claude Code's settings precedence so an organisation can
 * lock a policy down centrally and a developer can still widen their own
 * machine without being able to override the lock:
 *
 *   1. managed   — machine-wide policy an administrator installs
 *   2. session   — flags passed to this run (CLI `--permission-mode`, desktop)
 *   3. local     — `<project>/.cowrangler/settings.local.json` (git-ignored)
 *   4. project   — `<project>/.cowrangler/settings.json` (checked in)
 *   5. user      — `~/.cowrangler/settings.json`
 *
 * Scalars take the value from the highest scope that sets them. Rule lists are
 * the union of every scope: a `deny` written anywhere is always enforced, and
 * no lower scope can subtract from a higher one. Each rule remembers the
 * directory of the file that declared it so `/path` patterns anchor correctly.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { LOCAL_DIR, GLOBAL_DIR } from "./init.js";
import { getProjectWorkdir } from "./project_context.js";
import type { RuleType } from "./permission_rules.js";

export type SettingsScope = "managed" | "session" | "local" | "project" | "user" | "legacy";

/** A rule string plus where it came from. */
export interface SourcedRule {
  raw: string;
  scope: SettingsScope;
  /** Directory a `/pattern` anchors at. */
  settingsDir: string;
}

export interface SandboxNetworkSettings {
  allowedDomains: string[];
  deniedDomains: string[];
  /** Deny anything off the allowlist instead of prompting. */
  strictAllowlist: boolean;
  /** Managed lockdown — only managed-scope domains count. */
  allowManagedDomainsOnly: boolean;
}

export interface SandboxFilesystemSettings {
  allowWrite: string[];
  denyWrite: string[];
  allowRead: string[];
  denyRead: string[];
  /** Skip filesystem isolation but keep network isolation. */
  disabled: boolean;
}

export interface SandboxSettings {
  enabled: boolean;
  /** Auto-allow: run sandboxable commands without asking. */
  autoAllowBash: boolean;
  /** Commands that always run outside the sandbox. */
  excludedCommands: string[];
  /** Allow the `dangerouslyDisableSandbox` retry escape hatch. */
  allowUnsandboxedCommands: boolean;
  filesystem: SandboxFilesystemSettings;
  network: SandboxNetworkSettings;
  credentials: { files: { path: string; mode: "deny" | "mask" }[]; envVars: { name: string; mode: "deny" | "mask" }[] };
}

export interface ResolvedPermissionSettings {
  defaultMode: string;
  allow: SourcedRule[];
  ask: SourcedRule[];
  deny: SourcedRule[];
  /** Extra roots treated as in-workspace for file access. */
  additionalDirectories: string[];
  disableBypassPermissionsMode: boolean;
  disableAutoMode: boolean;
  sandbox: SandboxSettings;
  /** Rules that could not be parsed, surfaced by `cowrangler doctor`. */
  issues: { raw: string; scope: SettingsScope; reason: string }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Scope locations
// ─────────────────────────────────────────────────────────────────────────────

/** Machine-wide managed policy, installed by an administrator. */
export function managedSettingsPath(): string {
  if (process.env.COWRANGLER_MANAGED_SETTINGS) return process.env.COWRANGLER_MANAGED_SETTINGS;
  switch (process.platform) {
    case "darwin":
      return "/Library/Application Support/Cowrangler/managed-settings.json";
    case "win32":
      return path.join(process.env.PROGRAMDATA ?? "C:\\ProgramData", "Cowrangler", "managed-settings.json");
    default:
      return "/etc/cowrangler/managed-settings.json";
  }
}

function projectDir(): string {
  try {
    return getProjectWorkdir();
  } catch {
    return process.cwd();
  }
}

function scopeFiles(): { scope: SettingsScope; file: string; dir: string }[] {
  const proj = projectDir();
  const localDir = path.join(proj, ".cowrangler");
  return [
    { scope: "managed", file: managedSettingsPath(), dir: path.dirname(managedSettingsPath()) },
    { scope: "local", file: path.join(localDir, "settings.local.json"), dir: proj },
    { scope: "project", file: path.join(localDir, "settings.json"), dir: proj },
    { scope: "user", file: path.join(GLOBAL_DIR, "settings.json"), dir: GLOBAL_DIR },
  ];
}

function readJson(file: string): any {
  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, "utf-8").trim();
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolution
// ─────────────────────────────────────────────────────────────────────────────

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
}

const DEFAULT_SANDBOX: SandboxSettings = {
  enabled: true,
  autoAllowBash: true,
  excludedCommands: [],
  allowUnsandboxedCommands: true,
  filesystem: { allowWrite: [], denyWrite: [], allowRead: [], denyRead: [], disabled: false },
  network: { allowedDomains: [], deniedDomains: [], strictAllowlist: false, allowManagedDomainsOnly: false },
  credentials: { files: [], envVars: [] },
};

export interface SessionOverrides {
  mode?: string;
  allow?: string[];
  ask?: string[];
  deny?: string[];
  additionalDirectories?: string[];
  /** Legacy `config.yaml` block, folded in at the lowest authority. */
  legacyConfig?: Record<string, any>;
}

let cache: { key: string; value: ResolvedPermissionSettings } | null = null;

/** Drop the memoised policy — call after settings are written at runtime. */
export function invalidatePermissionSettings(): void {
  cache = null;
}

/**
 * resolvePermissionSettings — merge every scope into one policy.
 *
 * Session overrides are not cached, since they are per-call by nature; the
 * file scopes are, keyed by project directory and mtimes.
 */
export function resolvePermissionSettings(overrides: SessionOverrides = {}): ResolvedPermissionSettings {
  const files = scopeFiles();
  const key = JSON.stringify([
    projectDir(),
    files.map((f) => {
      try {
        return `${f.file}:${fs.statSync(f.file).mtimeMs}`;
      } catch {
        return `${f.file}:-`;
      }
    }),
  ]);

  let base: ResolvedPermissionSettings;
  if (cache && cache.key === key) {
    base = cloneSettings(cache.value);
  } else {
    base = buildFromFiles(files);
    cache = { key, value: cloneSettings(base) };
  }

  return applyOverrides(base, overrides);
}

function cloneSettings(s: ResolvedPermissionSettings): ResolvedPermissionSettings {
  return JSON.parse(JSON.stringify(s));
}

function buildFromFiles(files: { scope: SettingsScope; file: string; dir: string }[]): ResolvedPermissionSettings {
  const out: ResolvedPermissionSettings = {
    defaultMode: "default",
    allow: [],
    ask: [],
    deny: [],
    additionalDirectories: [],
    disableBypassPermissionsMode: false,
    disableAutoMode: false,
    sandbox: JSON.parse(JSON.stringify(DEFAULT_SANDBOX)),
    issues: [],
  };

  // Lowest authority first so higher scopes overwrite scalars.
  const ordered = [...files].reverse();
  let modeSetBy: SettingsScope | null = null;

  for (const { scope, file, dir } of ordered) {
    const json = readJson(file);
    if (!json) continue;
    const perms = json.permissions ?? {};

    for (const type of ["allow", "ask", "deny"] as RuleType[]) {
      for (const raw of asStringArray(perms[type])) {
        out[type].push({ raw, scope, settingsDir: dir });
      }
    }

    for (const d of asStringArray(perms.additionalDirectories)) {
      out.additionalDirectories.push(path.resolve(dir, expandHome(d)));
    }

    if (typeof perms.defaultMode === "string") {
      out.defaultMode = perms.defaultMode;
      modeSetBy = scope;
    }
    if (perms.disableBypassPermissionsMode === "disable" || perms.disableBypassPermissionsMode === true) {
      out.disableBypassPermissionsMode = true;
    }
    if (perms.disableAutoMode === "disable" || perms.disableAutoMode === true) {
      out.disableAutoMode = true;
    }

    mergeSandbox(out.sandbox, json.sandbox, scope);
  }

  void modeSetBy;
  return out;
}

function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function mergeSandbox(target: SandboxSettings, raw: any, scope: SettingsScope): void {
  if (!raw || typeof raw !== "object") return;

  if (typeof raw.enabled === "boolean") target.enabled = raw.enabled;
  if (typeof raw.autoAllowBash === "boolean") target.autoAllowBash = raw.autoAllowBash;
  if (typeof raw.allowUnsandboxedCommands === "boolean") {
    target.allowUnsandboxedCommands = raw.allowUnsandboxedCommands;
  }
  target.excludedCommands.push(...asStringArray(raw.excludedCommands));

  const fs_ = raw.filesystem;
  if (fs_ && typeof fs_ === "object") {
    target.filesystem.allowWrite.push(...asStringArray(fs_.allowWrite));
    target.filesystem.denyWrite.push(...asStringArray(fs_.denyWrite));
    target.filesystem.allowRead.push(...asStringArray(fs_.allowRead));
    target.filesystem.denyRead.push(...asStringArray(fs_.denyRead));
    // Widening the sandbox is only honoured from scopes a developer cannot
    // slip past review: managed policy and the user's own settings.
    if (fs_.disabled === true && (scope === "managed" || scope === "user")) {
      target.filesystem.disabled = true;
    }
  }

  const net = raw.network;
  if (net && typeof net === "object") {
    target.network.allowedDomains.push(
      ...asStringArray(net.allowedDomains).map((d) => `${scope}\u0000${d}`),
    );
    target.network.deniedDomains.push(...asStringArray(net.deniedDomains));
    // Tightening is honoured from user/managed/session only, per the same rule
    // in reverse: a repository must not be able to relax or impose network
    // policy on whoever clones it.
    if (net.strictAllowlist === true && (scope === "managed" || scope === "user")) {
      target.network.strictAllowlist = true;
    }
    if (net.allowManagedDomainsOnly === true && scope === "managed") {
      target.network.allowManagedDomainsOnly = true;
    }
  }

  const creds = raw.credentials;
  if (creds && typeof creds === "object") {
    if (Array.isArray(creds.files)) {
      for (const f of creds.files) {
        if (f && typeof f.path === "string") {
          target.credentials.files.push({ path: f.path, mode: f.mode === "mask" ? "mask" : "deny" });
        }
      }
    }
    if (Array.isArray(creds.envVars)) {
      for (const v of creds.envVars) {
        if (v && typeof v.name === "string") {
          target.credentials.envVars.push({ name: v.name, mode: v.mode === "mask" ? "mask" : "deny" });
        }
      }
    }
  }
}

/** Strip the scope tag network domains carry while merging. */
export function effectiveAllowedDomains(s: SandboxSettings): string[] {
  return s.network.allowedDomains
    .filter((d) => !s.network.allowManagedDomainsOnly || d.startsWith("managed\u0000"))
    .map((d) => d.split("\u0000").pop() as string);
}

function applyOverrides(base: ResolvedPermissionSettings, o: SessionOverrides): ResolvedPermissionSettings {
  const dir = projectDir();

  // Legacy config.yaml keys keep working, at the lowest authority.
  const legacy = o.legacyConfig ?? {};
  for (const [key, type] of [
    ["permissions.allow", "allow"],
    ["permissions.deny", "deny"],
    ["permissions.ask", "ask"],
  ] as [string, RuleType][]) {
    for (const raw of asStringArray(legacy[key])) {
      // Bare command strings in the old format meant "a Bash pattern".
      const normalized = /^[A-Za-z_][A-Za-z0-9_]*(\(|$)/.test(raw) && raw.includes("(")
        ? raw
        : `Bash(${raw})`;
      base[type].push({ raw: normalized, scope: "legacy", settingsDir: dir });
    }
  }

  for (const type of ["allow", "ask", "deny"] as RuleType[]) {
    for (const raw of asStringArray(o[type])) {
      base[type].push({ raw, scope: "session", settingsDir: dir });
    }
  }
  for (const d of o.additionalDirectories ?? []) {
    base.additionalDirectories.push(path.resolve(dir, expandHome(d)));
  }
  if (o.mode) base.defaultMode = o.mode;

  base.additionalDirectories = Array.from(new Set(base.additionalDirectories));
  return base;
}
