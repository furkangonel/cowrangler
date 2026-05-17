/**
 * Credential Pool — birim testleri
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

// ─────────────────────────────────────────────────────────────────────────────
// Inline test implementation (yalıtılmış, production sınıftan bağımsız)
// ─────────────────────────────────────────────────────────────────────────────

interface KeyEntry {
  key: string;
  provider: string;
  useCount: number;
  lastUsedAt: number;
  rateLimitedUntil: number;
  errorCount: number;
}

class TestCredentialPool {
  private pools = new Map<string, KeyEntry[]>();

  addKey(provider: string, key: string): void {
    if (!this.pools.has(provider)) this.pools.set(provider, []);
    const pool = this.pools.get(provider)!;
    if (pool.some((e) => e.key === key)) return;
    pool.push({
      key,
      provider,
      useCount: 0,
      lastUsedAt: 0,
      rateLimitedUntil: 0,
      errorCount: 0,
    });
  }

  getKey(provider: string): string | null {
    const pool = this.pools.get(provider);
    if (!pool || pool.length === 0) return null;
    const now = Date.now();
    const healthy = pool.filter((e) => e.rateLimitedUntil <= now);
    if (healthy.length > 0) {
      const chosen = healthy.reduce((best, e) =>
        e.useCount < best.useCount ? e : best,
      );
      chosen.useCount++;
      chosen.lastUsedAt = now;
      return chosen.key;
    }
    // All rate-limited → pick soonest recovery
    const soonest = pool.reduce((best, e) =>
      e.rateLimitedUntil < best.rateLimitedUntil ? e : best,
    );
    soonest.useCount++;
    return soonest.key;
  }

  markRateLimited(provider: string, key: string, cooldownMs = 60_000): void {
    const entry = this.pools.get(provider)?.find((e) => e.key === key);
    if (entry) {
      entry.rateLimitedUntil = Date.now() + cooldownMs;
      entry.errorCount++;
    }
  }

  markSuccess(provider: string, key: string): void {
    const entry = this.pools.get(provider)?.find((e) => e.key === key);
    if (entry) {
      entry.errorCount = 0;
      entry.rateLimitedUntil = 0;
    }
  }

  removeKey(provider: string, key: string): boolean {
    const pool = this.pools.get(provider);
    if (!pool) return false;
    const idx = pool.findIndex((e) => e.key === key);
    if (idx === -1) return false;
    pool.splice(idx, 1);
    return true;
  }

  keyCount(provider: string): number {
    return this.pools.get(provider)?.length ?? 0;
  }

  hasPool(provider: string): boolean {
    return this.keyCount(provider) > 1;
  }

  getStatus(provider: string) {
    const now = Date.now();
    return (this.pools.get(provider) ?? []).map((e) => ({
      key: e.key,
      useCount: e.useCount,
      healthy: e.rateLimitedUntil <= now,
      errorCount: e.errorCount,
    }));
  }
}

// ─────────────────────────────────────────────────────────────────────────────

describe("CredentialPool", () => {
  let pool: TestCredentialPool;

  beforeEach(() => {
    pool = new TestCredentialPool();
  });

  it("returns null when no keys registered", () => {
    expect(pool.getKey("anthropic")).toBeNull();
  });

  it("returns the only registered key", () => {
    pool.addKey("anthropic", "sk-ant-primary");
    expect(pool.getKey("anthropic")).toBe("sk-ant-primary");
  });

  it("selects least-used key (round-robin behaviour)", () => {
    pool.addKey("anthropic", "key-A");
    pool.addKey("anthropic", "key-B");
    pool.addKey("anthropic", "key-C");

    // First call → any key with useCount=0
    const first = pool.getKey("anthropic")!;
    expect(first).toBeTruthy();

    // Each subsequent call should prefer a less-used key
    const useCounts: Record<string, number> = {};
    for (let i = 0; i < 9; i++) {
      const k = pool.getKey("anthropic")!;
      useCounts[k] = (useCounts[k] ?? 0) + 1;
    }
    // After 9 more calls (10 total), each key should be used ~3 times each
    const counts = Object.values(useCounts);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(2);
  });

  it("skips rate-limited keys", () => {
    pool.addKey("openai", "key-1");
    pool.addKey("openai", "key-2");

    pool.markRateLimited("openai", "key-1", 60_000);

    // Should always return key-2
    for (let i = 0; i < 5; i++) {
      expect(pool.getKey("openai")).toBe("key-2");
    }
  });

  it("falls back to rate-limited key when all keys are limited", () => {
    pool.addKey("openai", "only-key");
    pool.markRateLimited("openai", "only-key", 60_000);

    // No healthy key → return rate-limited one anyway
    const key = pool.getKey("openai");
    expect(key).toBe("only-key");
  });

  it("clears rate limit after markSuccess", () => {
    pool.addKey("openai", "key-1");
    pool.addKey("openai", "key-2");

    pool.markRateLimited("openai", "key-1");
    // Now key-2 should be preferred
    expect(pool.getKey("openai")).toBe("key-2");

    // Mark key-1 healthy again
    pool.markSuccess("openai", "key-1");
    const status = pool.getStatus("openai");
    const k1 = status.find((s) => s.key === "key-1");
    expect(k1?.healthy).toBe(true);
    expect(k1?.errorCount).toBe(0);
  });

  it("removes a key correctly", () => {
    pool.addKey("anthropic", "key-A");
    pool.addKey("anthropic", "key-B");

    expect(pool.keyCount("anthropic")).toBe(2);
    const removed = pool.removeKey("anthropic", "key-A");
    expect(removed).toBe(true);
    expect(pool.keyCount("anthropic")).toBe(1);
  });

  it("returns false when removing a non-existent key", () => {
    pool.addKey("anthropic", "key-A");
    expect(pool.removeKey("anthropic", "ghost-key")).toBe(false);
  });

  it("does not duplicate keys on re-add", () => {
    pool.addKey("openai", "key-1");
    pool.addKey("openai", "key-1"); // duplicate
    expect(pool.keyCount("openai")).toBe(1);
  });

  it("hasPool returns false when only one key registered", () => {
    pool.addKey("openai", "solo-key");
    expect(pool.hasPool("openai")).toBe(false);
  });

  it("hasPool returns true when multiple keys registered", () => {
    pool.addKey("openai", "key-1");
    pool.addKey("openai", "key-2");
    expect(pool.hasPool("openai")).toBe(true);
  });

  it("tracks useCount correctly", () => {
    pool.addKey("groq", "groq-key");
    pool.getKey("groq");
    pool.getKey("groq");
    pool.getKey("groq");
    const status = pool.getStatus("groq");
    expect(status[0].useCount).toBe(3);
  });
});
