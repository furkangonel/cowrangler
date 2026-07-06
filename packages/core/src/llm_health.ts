/**
 * llm_health — sağlayıcı/model bağlantısı gerçekten çalışıyor mu? (WP-8)
 *
 * `checkModelHealth` küçük bir "ping" (1 token generateText) atarak modelin
 * gerçekten çağrılabilir olduğunu doğrular. Hem CLI (`/model test`,
 * setup/login sonrası) hem desktop (ModelsTab test butonu) aynı çekirdeği
 * çağırır → tek kaynak, tutarlı sonuç.
 *
 * Hatalar `mapProviderError` ile net, uygulanabilir mesajlara çevrilir.
 */

import { generateText } from "ai";
import { LLM } from "./llm.js";
import { generateOnce, nativeProvidersEnabled } from "./model/native/index.js";

export interface HealthResult {
  ok: boolean;
  /** İnsan-okur, uygulanabilir hata mesajı (ok=false ise). */
  error?: string;
  /** Ham hata (debug için). */
  raw?: string;
  /** Başarılı ping gecikmesi (ms). */
  latencyMs?: number;
}

/**
 * Ham sağlayıcı/SDK hata mesajını net, uygulanabilir bir mesaja çevirir.
 * Pure fonksiyon — birim testli.
 */
export function mapProviderError(raw: string): string {
  const m = raw || "";

  // Bizim fırlattığımız sınıflandırılmış hatalar.
  const missing = m.match(/MISSING_KEY:([A-Z_0-9]+)/);
  if (missing) {
    return `Eksik kimlik: ${missing[1]}. Anahtar ekleyin (/key set ${missing[1]}) veya abonelikle bağlanın (cowrangler login).`;
  }
  const unsupported = m.match(/UNSUPPORTED_MODEL:(.+)/);
  if (unsupported) {
    return `Desteklenmeyen model: ${unsupported[1].trim()}. Sağlayıcı önekini kontrol edin (ör. anthropic/…, openai/…, google/…).`;
  }

  const low = m.toLowerCase();

  if (/\b401\b|\b403\b|unauthor|invalid api key|invalid_api_key|authentication|permission denied/.test(low)) {
    return "Kimlik doğrulama başarısız — API anahtarı/token geçersiz veya süresi dolmuş.";
  }
  if (/\b404\b|not found|does not exist|no such model|model_not_found/.test(low)) {
    return "Model bulunamadı — ad yanlış olabilir ya da bu hesabın erişimi yok.";
  }
  if (/\b429\b|rate.?limit|quota|too many requests/.test(low)) {
    return "Hız limiti/kota aşıldı — biraz sonra tekrar deneyin.";
  }
  if (/econnrefused|enotfound|etimedout|fetch failed|network|socket hang up|and_the_request_timed_out|timeout/.test(low)) {
    return "Ağ hatası — sağlayıcıya ulaşılamadı (bağlantı/DNS/timeout).";
  }
  if (/\b5\d\d\b|internal server error|service unavailable|overloaded/.test(low)) {
    return "Sağlayıcı sunucu hatası — geçici olabilir, tekrar deneyin.";
  }

  // Bilinmeyen → ham mesajın ilk satırı.
  const firstLine = m.split("\n")[0].slice(0, 200);
  return firstLine || "Bilinmeyen hata.";
}

/**
 * Bir modelin gerçekten çağrılabilir olduğunu tek token ile doğrular.
 * @param model  Sağlayıcı-önekli model adı (ör. "anthropic/claude-sonnet-5").
 * @param timeoutMs  Ping için üst süre (varsayılan 15s).
 */
export async function checkModelHealth(
  model: string,
  timeoutMs = 15_000,
): Promise<HealthResult> {
  const started = Date.now();
  try {
    // Kimlik/format doğrulaması (MISSING_KEY/UNSUPPORTED_MODEL burada fırlar).
    const llm = new LLM(model);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      if (nativeProvidersEnabled()) {
        await generateOnce({ modelId: model, prompt: "ping", maxTokens: 1, abortSignal: controller.signal });
      } else {
        await generateText({
          model: llm.getModel(),
          prompt: "ping",
          maxTokens: 1,
          abortSignal: controller.signal,
        });
      }
    } finally {
      clearTimeout(timer);
    }

    return { ok: true, latencyMs: Date.now() - started };
  } catch (e: any) {
    const raw = e?.message ? String(e.message) : String(e);
    // Abort → timeout olarak sınıflandır.
    const normalized = /abort/i.test(raw) ? "network timeout (aborted)" : raw;
    return { ok: false, error: mapProviderError(normalized), raw };
  }
}
