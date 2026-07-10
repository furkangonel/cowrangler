import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  _setTrustStorePathForTests,
  checkConfigTrust,
  checkToolsTrust,
  fingerprintServerConfig,
  fingerprintToolNames,
  getTrustRecord,
  revokeServerTrust,
  trustServerConfig,
  trustServerTools,
} from "@cowrangler/core/mcp_trust.js";

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function isolate(): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cowrangler-mcp-trust-"));
  tmpDirs.push(dir);
  _setTrustStorePathForTests(path.join(dir, "mcp_trust.json"));
}

describe("mcp_trust", () => {
  it("reports a never-seen server as new", () => {
    isolate();
    expect(checkConfigTrust("filesystem", { command: "npx", args: ["-y", "x"] })).toBe("new");
  });

  it("trusts a config, then reports it trusted on the exact same config", () => {
    isolate();
    const config = { command: "npx", args: ["-y", "x"] };
    trustServerConfig("filesystem", config);
    expect(checkConfigTrust("filesystem", config)).toBe("trusted");
  });

  it("detects a config change after trust was granted", () => {
    isolate();
    const config = { command: "npx", args: ["-y", "x"] };
    trustServerConfig("filesystem", config);
    expect(checkConfigTrust("filesystem", { command: "npx", args: ["-y", "y"] })).toBe("config_changed");
  });

  it("tracks tool-list trust independently from config trust", () => {
    isolate();
    const config = { command: "npx", args: ["-y", "x"] };
    trustServerConfig("filesystem", config);

    expect(checkToolsTrust("filesystem", ["read_file", "write_file"])).toBe("new");
    trustServerTools("filesystem", ["read_file", "write_file"]);
    expect(checkToolsTrust("filesystem", ["read_file", "write_file"])).toBe("trusted");
    // Tool order shouldn't matter.
    expect(checkToolsTrust("filesystem", ["write_file", "read_file"])).toBe("trusted");
  });

  it("requires re-approval when the tool list grows", () => {
    isolate();
    const config = { command: "npx", args: ["-y", "x"] };
    trustServerConfig("filesystem", config);
    trustServerTools("filesystem", ["read_file"]);

    expect(checkToolsTrust("filesystem", ["read_file", "delete_file"])).toBe("tools_changed");
  });

  it("revoking trust makes the server look new again", () => {
    isolate();
    const config = { command: "npx", args: ["-y", "x"] };
    trustServerConfig("filesystem", config);
    revokeServerTrust("filesystem");
    expect(getTrustRecord("filesystem")).toBeNull();
    expect(checkConfigTrust("filesystem", config)).toBe("new");
  });

  it("fingerprints are stable regardless of key order", () => {
    const a = fingerprintServerConfig({ command: "npx", args: ["-y", "x"], timeout: 5 } as any);
    const b = fingerprintServerConfig({ timeout: 5, args: ["-y", "x"], command: "npx" } as any);
    expect(a).toBe(b);
  });

  it("tool-name fingerprints ignore ordering", () => {
    expect(fingerprintToolNames(["a", "b", "c"])).toBe(fingerprintToolNames(["c", "a", "b"]));
  });
});
