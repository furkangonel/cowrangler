/**
 * circuit_breaker — provider seviyesinde ardışık hata sayacı.
 *
 * runAgentLoop zaten tek bir turun içinde 429/5xx için retry+backoff yapıyor
 * (bkz. loop.ts). Bu modül bir üst katmanda durur: aynı provider ardışık
 * `maxConsecutiveFailures` TUR boyunca hata üretirse, provider'ı bir süreliğine
 * "açık" (circuit open) işaretler ki her yeni istek retry zincirini baştan
 * yaşayıp zaman kaybetmesin — hemen ve net bir hatayla geri dönülür.
 */

interface BreakerState {
  consecutiveFailures: number;
  openUntil: number;
}

const DEFAULT_MAX_CONSECUTIVE_FAILURES = 3;
const DEFAULT_COOLDOWN_MS = 30_000;

const state = new Map<string, BreakerState>();

export interface CircuitBreakerOptions {
  maxConsecutiveFailures?: number;
  cooldownMs?: number;
}

export function isCircuitOpen(providerId: string): boolean {
  const s = state.get(providerId);
  if (!s) return false;
  if (s.openUntil === 0) return false;
  if (Date.now() >= s.openUntil) {
    // Cooldown doldu — bir sonraki denemeye izin ver (half-open).
    s.openUntil = 0;
    return false;
  }
  return true;
}

export function circuitOpenUntil(providerId: string): number {
  return state.get(providerId)?.openUntil ?? 0;
}

export function recordFailure(providerId: string, opts: CircuitBreakerOptions = {}): void {
  const maxFailures = opts.maxConsecutiveFailures ?? DEFAULT_MAX_CONSECUTIVE_FAILURES;
  const cooldownMs = opts.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const s = state.get(providerId) ?? { consecutiveFailures: 0, openUntil: 0 };
  s.consecutiveFailures += 1;
  if (s.consecutiveFailures >= maxFailures) {
    s.openUntil = Date.now() + cooldownMs;
  }
  state.set(providerId, s);
}

export function recordSuccess(providerId: string): void {
  state.set(providerId, { consecutiveFailures: 0, openUntil: 0 });
}

/** Yalnızca testler için — global sayaç durumunu sıfırlar. */
export function resetCircuitBreakers(): void {
  state.clear();
}
