import { describe, it, expect, afterEach } from "vitest";
import {
  isOSKeychainAvailable,
  osKeychainSet,
  osKeychainGet,
  osKeychainDelete,
} from "@cowrangler/core/os_keychain.js";

// Bu testler yalnızca macOS/Linux'ta gerçek bir OS keychain aracı (security /
// secret-tool) kuruluysa anlamlıdır — CI/geliştirme makinesine göre atlanır.
const available = isOSKeychainAvailable();
const d = available ? describe : describe.skip;

d("os_keychain (gerçek OS keychain entegrasyonu)", () => {
  const accounts: string[] = [];

  afterEach(() => {
    for (const a of accounts.splice(0)) osKeychainDelete(a);
  });

  it("round-trips a secret through the real OS keychain", () => {
    const account = `cowrangler-test-${process.pid}-${Date.now()}`;
    accounts.push(account);

    expect(osKeychainSet(account, "s3cr3t-value")).toBe(true);
    expect(osKeychainGet(account)).toBe("s3cr3t-value");
  });

  it("returns null for a non-existent account", () => {
    expect(osKeychainGet(`cowrangler-nonexistent-${Date.now()}`)).toBeNull();
  });

  it("overwrites an existing entry on a second set (upsert)", () => {
    const account = `cowrangler-test-upsert-${process.pid}-${Date.now()}`;
    accounts.push(account);

    osKeychainSet(account, "first");
    osKeychainSet(account, "second");
    expect(osKeychainGet(account)).toBe("second");
  });

  it("delete removes the entry", () => {
    const account = `cowrangler-test-delete-${process.pid}-${Date.now()}`;
    osKeychainSet(account, "to-be-deleted");
    osKeychainDelete(account);
    expect(osKeychainGet(account)).toBeNull();
  });
});

describe("os_keychain availability probe", () => {
  it("is a boolean and is cached across calls", () => {
    const a = isOSKeychainAvailable();
    const b = isOSKeychainAvailable();
    expect(typeof a).toBe("boolean");
    expect(a).toBe(b);
  });
});
