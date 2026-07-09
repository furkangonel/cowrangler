import { describe, it, expect } from "vitest";
import {
  runInSandbox,
  ensureBundle,
  configureSandbox,
  selectBackend,
  shouldUseSandbox,
  binaryExists,
} from "@cowrangler/core/sandbox.js";
import fs from "fs";
import path from "path";
import os from "os";

describe("Sandbox Engine", () => {
  it("successfully resolves and copies cowrangler-sandbox.bundle", () => {
    const bundlePath = ensureBundle();
    expect(bundlePath).toContain("cowrangler-sandbox.bundle");
  });

  it("executes basic shell commands asynchronously in explicit low-trust mode", async () => {
    configureSandbox({ 
      enabled: true, 
      workspaceRoot: process.cwd(),
      maxOutputBytes: 512 * 1024,
      maxTimeoutMs: 5000,
      networkRestricted: false,
      allowedPaths: [os.homedir(), "/tmp", "/var/tmp"],
      blockedBinaries: ["dd", "nc"],
      provider: "fallback",
      allowUnsandboxed: true,
    });
    const result = await runInSandbox("echo 'hello sandbox'", process.cwd());
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("hello sandbox");
    expect(result.sandboxed).toBe(false);
    expect(result.isolated).toBe(false);
    expect(result.warning).toContain("NOT isolated");
  });

  it("blocks dangerous critical pattern commands", async () => {
    configureSandbox({ 
      enabled: true, 
      workspaceRoot: process.cwd(),
      maxOutputBytes: 512 * 1024,
      maxTimeoutMs: 30000,
      networkRestricted: false,
      allowedPaths: [os.homedir(), "/tmp", "/var/tmp"],
      blockedBinaries: ["dd", "nc"]
    });
    const result = await runInSandbox("rm -rf /", process.cwd());
    expect(result.blocked).toBe(true);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("SANDBOX BLOCKED");
  });

  it("respects path restrictions", async () => {
    configureSandbox({ 
      enabled: true, 
      workspaceRoot: process.cwd(),
      maxOutputBytes: 512 * 1024,
      maxTimeoutMs: 30000,
      networkRestricted: false,
      allowedPaths: [], // Block all extra allowed paths
      blockedBinaries: []
    });
    // Try running in root directory which is outside the workspace root
    const result = await runInSandbox("pwd", "/");
    expect(result.blocked).toBe(true);
    expect(result.output).toContain("outside the allowed sandbox paths");
  });
});

describe("Sandbox Backend Factory (selectBackend)", () => {
  const yes = () => true;
  const no = () => false;
  const only = (...bins: string[]) => (b: string) => bins.includes(b);

  it("macOS prefers Seatbelt when sandbox-exec exists", () => {
    const be = selectBackend("darwin", only("sandbox-exec"));
    expect(be.kind).toBe("mac_seatbelt");
    expect(be.isolated).toBe(true);
  });

  it("Linux prefers bubblewrap, then firejail", () => {
    expect(selectBackend("linux", only("bwrap")).kind).toBe("linux_bwrap");
    expect(selectBackend("linux", only("firejail")).kind).toBe("linux_firejail");
  });

  it("returns 'none' (not isolated) when no backend present", () => {
    const be = selectBackend("linux", no);
    expect(be.kind).toBe("none");
    expect(be.isolated).toBe(false);
  });

  it("Windows falls back to a Job Object (weak) when WSL/Docker absent", () => {
    const be = selectBackend("win32", no);
    expect(be.kind).toBe("win_jobobject");
  });

  it("honors forced 'fallback' provider -> no isolation", () => {
    expect(selectBackend("darwin", yes, "fallback").kind).toBe("none");
  });
});

describe("shouldUseSandbox classification", () => {
  it("read-only commands run directly", () => {
    expect(shouldUseSandbox("ls -la")).toBe(false);
    expect(shouldUseSandbox("cat package.json")).toBe(false);
    expect(shouldUseSandbox("git status")).toBe(false);
  });

  it("destructive / risky commands require sandbox", () => {
    expect(shouldUseSandbox("rm -rf build")).toBe(true);
    expect(shouldUseSandbox("git push --force")).toBe(true);
    expect(shouldUseSandbox("echo hi > file.txt")).toBe(true); // redirect = write
  });
});

describe("No silent fall-through when isolation missing", () => {
  const baseCfg = {
    enabled: true,
    workspaceRoot: process.cwd(),
    maxOutputBytes: 512 * 1024,
    maxTimeoutMs: 30000,
    networkRestricted: false,
    allowedPaths: [os.homedir(), "/tmp", "/var/tmp"],
    blockedBinaries: [],
  };

  it("blocks execution when no backend and no user consent", async () => {
    configureSandbox({ ...baseCfg, provider: "fallback", allowUnsandboxed: false });
    const result = await runInSandbox("echo hi", process.cwd());
    expect(result.blocked).toBe(true);
    expect(result.isolated).toBe(false);
    expect(result.warning).toContain("NOT isolated");
  });

  it("runs in low-trust mode only with explicit consent, flagged isolated:false", async () => {
    configureSandbox({ ...baseCfg, provider: "fallback", allowUnsandboxed: true });
    const result = await runInSandbox("echo low-trust", process.cwd());
    expect(result.blocked).toBe(false);
    expect(result.isolated).toBe(false);
    expect(result.warning).toBeTruthy();
    expect(result.output).toContain("low-trust");
  });
});

describe("Real isolation prevents workspace escape (macOS Seatbelt)", () => {
  const canSeatbelt = process.platform === "darwin" && binaryExists("sandbox-exec");
  it.runIf(canSeatbelt)("cannot write outside the workspace root", async () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "cowr-ws-"));
    const escapeTarget = path.join(os.homedir(), `cowrangler_escape_${Date.now()}.txt`);
    configureSandbox({
      enabled: true,
      workspaceRoot: ws,
      maxOutputBytes: 512 * 1024,
      maxTimeoutMs: 30000,
      networkRestricted: false,
      allowedPaths: [], // only the workspace is writable
      blockedBinaries: [],
      provider: "mac_seatbelt",
    });
    const result = await runInSandbox(`echo escaped > "${escapeTarget}"`, ws);
    expect(result.isolated).toBe(true);
    // Seatbelt denies the write -> file must NOT exist outside workspace.
    expect(fs.existsSync(escapeTarget)).toBe(false);
    if (fs.existsSync(escapeTarget)) fs.rmSync(escapeTarget);
    fs.rmSync(ws, { recursive: true, force: true });
  });
});
