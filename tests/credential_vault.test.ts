import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  _setSecretsFileForTests,
  deleteSecrets,
  getSecret,
  getSecretMode,
  getSecrets,
  hasSecrets,
  isEncrypted,
  listSecretNamespaces,
  setSecret,
  setSecrets,
} from "@cowrangler/core/credential_vault.js";
import { isOSKeychainAvailable, osKeychainDelete, osKeychainGet } from "@cowrangler/core/os_keychain.js";

let currentSecretsFile: string | null = null;
const tmpDirs: string[] = [];

// Bir "os" mod hücresi yazılırsa gerçek OS keychain'e dokunulur (izole
// secrets.json yalnızca "account" referansını tutar) — testin ürettiği
// secrets.json'ı okuyup içindeki "os" hücrelerini gerçek keychain'den de
// temizliyoruz; aksi halde geliştiricinin Keychain'inde kalıntı kalır.
afterEach(() => {
  if (currentSecretsFile && fs.existsSync(currentSecretsFile)) {
    try {
      const store = JSON.parse(fs.readFileSync(currentSecretsFile, "utf-8"));
      for (const bucket of Object.values(store) as Record<string, { m: string; d: string }>[]) {
        for (const cell of Object.values(bucket)) {
          if (cell.m === "os") osKeychainDelete(cell.d);
        }
      }
    } catch {
      /* ignore */
    }
  }
  currentSecretsFile = null;
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function isolate(): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cowrangler-vault-"));
  tmpDirs.push(dir);
  currentSecretsFile = path.join(dir, "secrets.json");
  _setSecretsFileForTests(currentSecretsFile);
}

describe("credential_vault", () => {
  it("round-trips a secret", () => {
    isolate();
    setSecret("test-ns", "API_KEY", "shh-its-a-secret");
    expect(getSecret("test-ns", "API_KEY")).toBe("shh-its-a-secret");
  });

  it("in a plain Node process, uses the OS keychain when writable and safely falls back otherwise", () => {
    isolate();
    setSecret("test-ns", "TOKEN", "value-1");
    const mode = getSecretMode("test-ns", "TOKEN");
    // Availability only proves that the platform helper exists. Headless CI or
    // a locked keychain may still reject the write, in which case the vault's
    // documented 0600 file fallback is the correct behavior.
    if (mode === "os") {
      expect(isOSKeychainAvailable()).toBe(true);
      expect(mode).toBe("os");
      expect(osKeychainGet("test-ns.TOKEN")).toBe("value-1");
    } else {
      expect(mode).toBe("plain");
    }
  });

  it("forcePlain always writes base64 mode, even if OS keychain is available", () => {
    isolate();
    setSecret("test-ns", "SHARED_TOKEN", "value-2", { forcePlain: true });
    expect(getSecretMode("test-ns", "SHARED_TOKEN")).toBe("plain");
    expect(getSecret("test-ns", "SHARED_TOKEN")).toBe("value-2");
  });

  it("setSecrets merges multiple keys and getSecrets returns all decrypted", () => {
    isolate();
    setSecrets("test-ns", { A: "1", B: "2" });
    expect(getSecrets("test-ns")).toEqual({ A: "1", B: "2" });
  });

  it("setting a key to null/empty removes it (and cleans up any OS keychain entry)", () => {
    isolate();
    setSecret("test-ns", "GONE", "value");
    expect(hasSecrets("test-ns")).toBe(true);
    const wasOS = getSecretMode("test-ns", "GONE") === "os";

    setSecret("test-ns", "GONE", null);

    expect(getSecret("test-ns", "GONE")).toBeUndefined();
    if (wasOS) expect(osKeychainGet("test-ns.GONE")).toBeNull();
  });

  it("deleteSecrets removes the whole namespace and cleans up any OS keychain entries", () => {
    isolate();
    setSecret("cleanup-ns", "KEY", "value-3");
    const wasOS = getSecretMode("cleanup-ns", "KEY") === "os";

    deleteSecrets("cleanup-ns");

    expect(hasSecrets("cleanup-ns")).toBe(false);
    expect(listSecretNamespaces()).not.toContain("cleanup-ns");
    if (wasOS) expect(osKeychainGet("cleanup-ns.KEY")).toBeNull();
  });

  it("listSecretNamespaces reports namespaces with at least one secret", () => {
    isolate();
    setSecret("ns-a", "K", "v");
    setSecret("ns-b", "K", "v");
    expect(listSecretNamespaces().sort()).toEqual(["ns-a", "ns-b"]);
  });

  it("isEncrypted reflects OS-backed storage availability", () => {
    isolate();
    expect(isEncrypted()).toBe(isOSKeychainAvailable());
  });
});
