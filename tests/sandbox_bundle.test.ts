import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { isSandboxBundleUsable } from "@cowrangler/core/sandbox.js";

/**
 * The failure this guards against: a sandbox bundle directory that exists and
 * carries a current version file, but whose runner script is gone. The old
 * check looked only at the version file, so a partial copy was trusted forever
 * and every command died with "runner.sh doesn't exist" — which the agent, given
 * no way forward, tried to work around by escaping the sandbox.
 */

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function makeBundle(withRunner: boolean): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cw-bundle-"));
  tmpDirs.push(dir);
  const scripts = path.join(dir, "Contents", "Resources", "scripts");
  fs.mkdirSync(scripts, { recursive: true });
  fs.writeFileSync(path.join(dir, "Contents", "Info.plist"), "<plist/>");
  fs.writeFileSync(path.join(dir, "Contents", "Resources", "sandbox.sb"), "(version 1)");
  if (withRunner) {
    fs.writeFileSync(path.join(scripts, "runner.sh"), "#!/usr/bin/env bash\nexit 0\n");
    fs.writeFileSync(path.join(scripts, "runner.ps1"), "exit 0");
  }
  return dir;
}

describe("sandbox bundle integrity", () => {
  it("accepts a bundle that has its runner script", () => {
    expect(isSandboxBundleUsable(makeBundle(true))).toBe(true);
  });

  it("rejects a bundle whose runner script is missing", () => {
    // Present directory, correct shape, no runner — the exact broken state.
    expect(isSandboxBundleUsable(makeBundle(false))).toBe(false);
  });

  it("rejects a path that does not exist at all", () => {
    expect(isSandboxBundleUsable(path.join(os.tmpdir(), "cw-bundle-does-not-exist"))).toBe(false);
  });

  it("rejects a bundle whose runner was removed after the fact", () => {
    const dir = makeBundle(true);
    fs.rmSync(path.join(dir, "Contents", "Resources", "scripts", "runner.sh"), { force: true });
    fs.rmSync(path.join(dir, "Contents", "Resources", "scripts", "runner.ps1"), { force: true });
    expect(isSandboxBundleUsable(dir)).toBe(false);
  });
});

describe("sandbox runner fail-closed behavior", () => {
  it.runIf(process.platform !== "win32")("never executes directly for an unknown provider", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cw-runner-fail-closed-"));
    tmpDirs.push(root);
    const marker = path.join(root, "must-not-exist");
    const runner = path.resolve(
      process.cwd(),
      "packages/core/src/cowrangler-sandbox.bundle/Contents/Resources/scripts/runner.sh",
    );
    const result = spawnSync(
      "/bin/bash",
      [runner, "unknown-provider", root, "false", `touch ${JSON.stringify(marker)}`],
      { encoding: "utf-8" },
    );
    expect(result.status).toBe(125);
    expect(result.stderr).toContain("SANDBOX UNAVAILABLE:");
    expect(fs.existsSync(marker)).toBe(false);
  });
});

describe("execute_bash tool schema", () => {
  it("does not expose the internal sandbox flag to the model", async () => {
    // `__useSandbox` is set on the arguments object by the permission engine.
    // When it was declared in the schema, the model saw it, reasoned about it,
    // and passed it on every call.
    const { TOOL_SCHEMAS } = await import("@cowrangler/core/tools/registry.js");
    await import("@cowrangler/core/tools/system_tools.js");
    const shape = (TOOL_SCHEMAS["execute_bash"].parameters as any).shape;
    expect(Object.keys(shape)).not.toContain("__useSandbox");
    // The sanctioned escape hatch, by contrast, must be visible.
    expect(Object.keys(shape)).toContain("dangerouslyDisableSandbox");
  });
});
