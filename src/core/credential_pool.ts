/**
 * Credential Pool — Çoklu API anahtarı yönetimi.
 *
 *
 * TypeScript'e uyarlanmıştır.
 *
 * Özellikler:
 * - Provider başına birden fazla API anahtarı
 * - Least-used seçim stratejisi (en az kullanılan önce)
 * - Rate limit tespiti → otomatik anahtar rotasyonu
 * - Cooldown sonrası otomatik iyileşme
 * - Anahtar sağlık skoru takibi
 */

import fs from "fs";
import { DIRS } from "./init.js";
import { getLogger } from "./logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface KeyEntry {
  key: string;
  provider: string;
  /** Toplam başarılı kullanım sayısı */
  useCount: number;
  /** Son kullanım zamanı (epoch ms) */
  lastUsedAt: number;
  /** Rate limit süresi (epoch ms, 0 = sağlıklı) */
  rateLimitedUntil: number;
  /** Ardışık hata sayısı (sağlık skoru için) */
  errorCount: number;
  /** Toplam başarısız istek sayısı */
  totalErrors: number;
}

export interface PoolStatus {
  provider: string;
  total: number;
  healthy: number;
  rateLimited: number;
  keys: KeyStatusEntry[];
}

export interface KeyStatusEntry {
  masked: string;
  useCount: number;
  errorCount: number;
  status: "healthy" | "rate_limited" | "degraded";
  rateLimitedUntil?: number; // epoch ms, sadece rate_limited ise
  lastUsedAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER → ENV VAR MAPPING
// ─────────────────────────────────────────────────────────────────────────────

/** Bilinen provider'ların primary ENV var isimleri */
const PROVIDER_ENV_VARS: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  groq: "GROQ_API_KEY",
  mistral: "MISTRAL_API_KEY",
  cohere: "COHERE_API_KEY",
  github: "GITHUB_TOKEN",
  xai: "XAI_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
};

/** Rate limit cooldown süreleri (ms) */
const RATE_LIMIT_COOLDOWN_MS = 60_000; // 1 dakika
const ERROR_COOLDOWN_MS = 30_000; // 30 saniye (geçici hatalar)
/** Bu kadar ardışık hatadan sonra anahtar "degraded" sayılır */
const DEGRADED_THRESHOLD = 3;

// ─────────────────────────────────────────────────────────────────────────────
// CREDENTIAL POOL
// ─────────────────────────────────────────────────────────────────────────────

export class CredentialPool {
  /** provider adı → anahtar listesi */
  private pools: Map<string, KeyEntry[]> = new Map();

  constructor() {
    this.loadFromEnv();
  }

  // ── Yükleme ────────────────────────────────────────────────────────────────

  /**
   * ENV değişkenlerinden pool'u yükle.
   *
   * Format:
   *   ANTHROPIC_API_KEY=sk-ant-primary        ← primary anahtar
   *   ANTHROPIC_API_KEY_POOL=sk-1,sk-2,sk-3   ← havuz anahtarları (virgülle ayrılmış)
   */
  loadFromEnv(): void {
    this.pools.clear();

    for (const [provider, envVar] of Object.entries(PROVIDER_ENV_VARS)) {
      const keys: string[] = [];

      // Primary anahtar
      const primary = process.env[envVar];
      if (primary?.trim()) keys.push(primary.trim());

      // Havuz anahtarları: PROVIDER_KEY_POOL
      const poolVar = `${envVar}_POOL`;
      const poolVal = process.env[poolVar];
      if (poolVal?.trim()) {
        const poolKeys = poolVal
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean);
        for (const k of poolKeys) {
          if (!keys.includes(k)) keys.push(k);
        }
      }

      if (keys.length > 0) {
        const entries: KeyEntry[] = keys.map((key) => ({
          key,
          provider,
          useCount: 0,
          lastUsedAt: 0,
          rateLimitedUntil: 0,
          errorCount: 0,
          totalErrors: 0,
        }));
        this.pools.set(provider, entries);
      }
    }

    getLogger().info(
      "agent",
      `CredentialPool loaded: ${this.pools.size} provider(s)`,
      {
        providers: Array.from(this.pools.entries()).map(([p, keys]) => ({
          provider: p,
          keyCount: keys.length,
        })),
      },
    );
  }

  // ── Anahtar Seçimi ─────────────────────────────────────────────────────────

  /**
   * Verilen provider için en uygun anahtarı döndür.
   *
   * Strateji: Least-used (en az kullanılan) sağlıklı anahtar.
   * Tüm anahtarlar rate limit'te ise en erken kurtulacak olanı döndür.
   * Provider bilinmiyorsa veya hiç anahtar yoksa null döner.
   */
  getKey(provider: string): string | null {
    const normalised = this._normaliseProvider(provider);
    const pool = this.pools.get(normalised);
    if (!pool || pool.length === 0) return null;

    const now = Date.now();

    // Önce sağlıklı anahtarlar
    const healthy = pool.filter((e) => e.rateLimitedUntil <= now);
    if (healthy.length > 0) {
      // Least-used seçim
      const chosen = healthy.reduce((best, e) =>
        e.useCount < best.useCount ? e : best,
      );
      chosen.useCount++;
      chosen.lastUsedAt = now;
      return chosen.key;
    }

    // Tüm anahtarlar rate limit'te → en erken kurtulacak olanı döndür (fallback)
    const soonest = pool.reduce((best, e) =>
      e.rateLimitedUntil < best.rateLimitedUntil ? e : best,
    );
    getLogger().warn(
      "agent",
      `All keys rate-limited for provider '${normalised}', using soonest recovery (${Math.ceil((soonest.rateLimitedUntil - now) / 1000)}s)`,
    );
    soonest.useCount++;
    soonest.lastUsedAt = now;
    return soonest.key;
  }

  /**
   * Belirli bir anahtarı döndür (provider'ın ilk anahtarını).
   * Kullanıcının açıkça bir anahtar belirttiği durumlar için.
   */
  getPrimaryKey(provider: string): string | null {
    const normalised = this._normaliseProvider(provider);
    const pool = this.pools.get(normalised);
    if (!pool || pool.length === 0) return null;
    return pool[0].key;
  }

  // ── Sağlık Bildirimleri ─────────────────────────────────────────────────────

  /** Bir anahtarı rate limited olarak işaretle */
  markRateLimited(
    provider: string,
    key: string,
    cooldownMs = RATE_LIMIT_COOLDOWN_MS,
  ): void {
    const entry = this._findEntry(provider, key);
    if (!entry) return;
    entry.rateLimitedUntil = Date.now() + cooldownMs;
    entry.errorCount++;
    entry.totalErrors++;
    getLogger().warn(
      "agent",
      `Key rate-limited: ${this._maskKey(key)} (${provider}) — cooldown ${cooldownMs / 1000}s`,
    );
  }

  /** Geçici hata (5xx, network) — kısa cooldown */
  markError(provider: string, key: string): void {
    const entry = this._findEntry(provider, key);
    if (!entry) return;
    entry.errorCount++;
    entry.totalErrors++;
    // Ardışık hata eşiğini aşarsa geçici cooldown
    if (entry.errorCount >= DEGRADED_THRESHOLD) {
      entry.rateLimitedUntil = Date.now() + ERROR_COOLDOWN_MS;
      getLogger().warn(
        "agent",
        `Key degraded after ${entry.errorCount} errors: ${this._maskKey(key)} (${provider})`,
      );
    }
  }

  /** Başarılı istek — hata sayacını sıfırla */
  markSuccess(provider: string, key: string): void {
    const entry = this._findEntry(provider, key);
    if (!entry) return;
    entry.errorCount = 0;
    entry.rateLimitedUntil = 0;
  }

  // ── Havuz Yönetimi ──────────────────────────────────────────────────────────

  /**
   * Pool'a yeni anahtar ekle (ve credentials.env'e kaydet).
   */
  addKey(provider: string, key: string): void {
    const normalised = this._normaliseProvider(provider);
    if (!this.pools.has(normalised)) {
      this.pools.set(normalised, []);
    }
    const pool = this.pools.get(normalised)!;

    if (pool.some((e) => e.key === key)) {
      getLogger().info("agent", `Key already in pool for ${normalised}`);
      return;
    }

    pool.push({
      key,
      provider: normalised,
      useCount: 0,
      lastUsedAt: 0,
      rateLimitedUntil: 0,
      errorCount: 0,
      totalErrors: 0,
    });

    this._persistPool(normalised);
    getLogger().info(
      "agent",
      `Key added to pool: ${normalised} (${pool.length} total)`,
    );
  }

  /**
   * Pool'dan anahtar kaldır (ve credentials.env'i güncelle).
   */
  removeKey(provider: string, key: string): boolean {
    const normalised = this._normaliseProvider(provider);
    const pool = this.pools.get(normalised);
    if (!pool) return false;

    const idx = pool.findIndex((e) => e.key === key);
    if (idx === -1) return false;

    pool.splice(idx, 1);
    this._persistPool(normalised);
    getLogger().info(
      "agent",
      `Key removed from pool: ${normalised} (${pool.length} remaining)`,
    );
    return true;
  }

  // ── Durum Sorgulama ─────────────────────────────────────────────────────────

  /** Tüm provider'ların havuz durumunu döndür */
  getStatus(): PoolStatus[] {
    const now = Date.now();
    return Array.from(this.pools.entries()).map(([provider, keys]) => {
      const healthy = keys.filter((e) => e.rateLimitedUntil <= now);
      const rateLimited = keys.filter((e) => e.rateLimitedUntil > now);

      return {
        provider,
        total: keys.length,
        healthy: healthy.length,
        rateLimited: rateLimited.length,
        keys: keys.map((e) => ({
          masked: this._maskKey(e.key),
          useCount: e.useCount,
          errorCount: e.errorCount,
          status: (e.rateLimitedUntil > now
            ? "rate_limited"
            : e.errorCount >= DEGRADED_THRESHOLD
              ? "degraded"
              : "healthy") as KeyStatusEntry["status"],
          rateLimitedUntil:
            e.rateLimitedUntil > now ? e.rateLimitedUntil : undefined,
          lastUsedAt: e.lastUsedAt,
        })),
      };
    });
  }

  /** Provider'ın havuzundaki toplam anahtar sayısı */
  keyCount(provider: string): number {
    const pool = this.pools.get(this._normaliseProvider(provider));
    return pool?.length ?? 0;
  }

  /** Provider için pool var mı? (birden fazla anahtar varsa true) */
  hasPool(provider: string): boolean {
    return this.keyCount(provider) > 1;
  }

  // ── Özel Yardımcılar ────────────────────────────────────────────────────────

  private _normaliseProvider(provider: string): string {
    // "openrouter/anthropic/..." → "openrouter"
    return provider.split("/")[0].toLowerCase();
  }

  private _findEntry(provider: string, key: string): KeyEntry | undefined {
    const pool = this.pools.get(this._normaliseProvider(provider));
    return pool?.find((e) => e.key === key);
  }

  private _maskKey(key: string): string {
    if (key.length <= 10) return "••••••••";
    return `${key.slice(0, 6)}${"•".repeat(8)}${key.slice(-4)}`;
  }

  /**
   * Provider'ın pool anahtarlarını credentials.env dosyasına yaz.
   * Format: PROVIDER_API_KEY_POOL=key1,key2,key3
   */
  private _persistPool(provider: string): void {
    const pool = this.pools.get(provider);
    if (!pool || pool.length === 0) return;

    const envVar = PROVIDER_ENV_VARS[provider];
    if (!envVar) return;

    // Primary anahtar (ilk): zaten mevcut satırda
    // Pool anahtarları (ikinci+): _POOL satırına yaz
    const poolKeys = pool.slice(1).map((e) => e.key);
    const poolVar = `${envVar}_POOL`;
    const poolVal = poolKeys.join(",");

    if (!fs.existsSync(DIRS.global.credentials)) return;
    let content = fs.readFileSync(DIRS.global.credentials, "utf-8");

    if (poolKeys.length === 0) {
      // Pool anahtarları yoksa satırı kaldır
      content = content.replace(new RegExp(`^${poolVar}=.*\n?`, "m"), "");
    } else {
      const regex = new RegExp(`^${poolVar}=.*`, "m");
      content = regex.test(content)
        ? content.replace(regex, `${poolVar}=${poolVal}`)
        : content.trimEnd() + `\n${poolVar}=${poolVal}\n`;
    }

    fs.writeFileSync(DIRS.global.credentials, content, "utf-8");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER → ENV VAR (for key rotation)
// ─────────────────────────────────────────────────────────────────────────────

/** Reverse map: provider adı → ENV var adı */
const PROVIDER_TO_ENV: Record<string, string> = PROVIDER_ENV_VARS;

/** Model adından provider'ı çıkar */
function providerFromModel(model: string): string | null {
  if (model.startsWith("claude-")) return "anthropic";
  if (
    model.startsWith("gpt-") ||
    model.startsWith("o1-") ||
    model.startsWith("o3-") ||
    model.startsWith("o4-")
  )
    return "openai";
  if (model.startsWith("gemini-")) return "google";
  if (model.startsWith("vertex/")) return null; // Vertex GCP auth — key rotation desteklenmez
  if (model.startsWith("copilot/")) return "github";
  if (model.startsWith("groq/")) return "groq";
  if (model.startsWith("openrouter/") || model.includes("/"))
    return "openrouter";
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLETON
// ─────────────────────────────────────────────────────────────────────────────

let _pool: CredentialPool | null = null;

export function getCredentialPool(): CredentialPool {
  if (!_pool) {
    _pool = new CredentialPool();
  }
  return _pool;
}

/** ENV yeniden yüklendiğinde pool'u sıfırla */
export function reloadCredentialPool(): CredentialPool {
  _pool = new CredentialPool();
  return _pool;
}

// ─────────────────────────────────────────────────────────────────────────────
// KEY ROTATION HELPER (agent.ts tarafından kullanılır)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rate limit hatası sonrası otomatik anahtar rotasyonu.
 *
 * 1. Model adından provider ve ENV var adını belirler.
 * 2. Mevcut anahtarı rate limited olarak işaretler.
 * 3. Havuzdan yeni anahtar alır.
 * 4. `process.env` üzerinden yeni anahtarı aktif eder.
 *
 * Dönüş: true → rotasyon gerçekleşti, false → pool yok veya tek anahtar.
 */
export function rotateCredentialPoolKey(model: string): boolean {
  const pool = getCredentialPool();
  const provider = providerFromModel(model);
  if (!provider) return false;

  const envVar = PROVIDER_TO_ENV[provider];
  if (!envVar) return false;

  const currentKey = process.env[envVar];
  if (!currentKey) return false;

  // Pool'da birden fazla anahtar yoksa rotasyon yapılamaz
  if (!pool.hasPool(provider)) return false;

  // Mevcut anahtarı rate limited olarak işaretle
  pool.markRateLimited(provider, currentKey);

  // Yeni anahtar seç (pool içinden mevcut olmayan en az kullanılmış)
  const nextKey = pool.getKey(provider);
  if (!nextKey || nextKey === currentKey) return false;

  // process.env'i güncelle — LLM.getModel() lazy olduğu için
  // bir sonraki generateText çağrısında otomatik yansır
  process.env[envVar] = nextKey;
  const masked =
    nextKey.length > 10
      ? `${nextKey.slice(0, 6)}${"•".repeat(8)}${nextKey.slice(-4)}`
      : "••••••••";
  getLogger().info("agent", `Credential rotated: ${provider} → ${masked}`);
  return true;
}
