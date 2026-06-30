import { describe, it, expect } from "vitest";
import { runInSandbox, ensureBundle, configureSandbox } from "../src/core/sandbox.js";
import path from "path";
import os from "os";

describe("Sandbox Engine", () => {
  it("successfully resolves and copies cowrangler-sandbox.bundle", () => {
    const bundlePath = ensureBundle();
    expect(bundlePath).toContain("cowrangler-sandbox.bundle");
  });

  it("executes basic shell commands asynchronously", async () => {
    configureSandbox({ 
      enabled: true, 
      workspaceRoot: process.cwd(),
      maxOutputBytes: 512 * 1024,
      maxTimeoutMs: 30000,
      networkRestricted: false,
      allowedPaths: [os.homedir(), "/tmp", "/var/tmp"],
      blockedBinaries: ["dd", "nc"]
    });
    const result = await runInSandbox("echo 'hello sandbox'", process.cwd());
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("hello sandbox");
    expect(result.sandboxed).toBe(true);
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
