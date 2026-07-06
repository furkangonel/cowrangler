/**
 * formatBriefTimestamp — CLI_CONVERSATION.md'de tanımlanan akıllı zaman damgası.
 *
 * Mesajlaşma uygulamaları gibi çalışır:
 *   - Bugün         → "13:45" veya "1:45 PM" (locale'ye göre)
 *   - Bu hafta      → "Pazar 13:45"
 *   - Daha eskisi   → "Pazar, 20 Şub 13:45"
 *
 * Locale, POSIX ortam değişkenlerinden (LC_ALL > LC_TIME > LANG) otomatik alınır.
 */

function getLocale(): string | undefined {
  const raw =
    process.env.LC_ALL ?? process.env.LC_TIME ?? process.env.LANG ?? "";
  // "tr_TR.UTF-8" → "tr-TR"
  const base = raw.split(".")[0];
  if (!base) return undefined;
  const tag = base.replace("_", "-");
  try {
    new Intl.DateTimeFormat(tag);
    return tag;
  } catch {
    return undefined;
  }
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Format an ISO timestamp for the brief/chat message label line.
 *
 * @param isoString - ISO 8601 timestamp
 * @param now       - Reference "now" (default: actual now; override in tests)
 */
export function formatBriefTimestamp(
  isoString: string,
  now: Date = new Date(),
): string {
  const d = new Date(isoString);

  if (Number.isNaN(d.getTime())) return "";

  const locale = getLocale();
  const dayDiff = startOfDay(now) - startOfDay(d);
  const daysAgo = Math.round(dayDiff / 86_400_000);

  if (daysAgo === 0) {
    // Bugün: sadece saat
    return d.toLocaleTimeString(locale, {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  if (daysAgo > 0 && daysAgo < 7) {
    // Bu hafta: gün adı + saat
    return d.toLocaleString(locale, {
      weekday: "long",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  // Daha eski: gün + ay + saat
  return d.toLocaleString(locale, {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Kısa süre formatlama: 0ms–59s → "0.3s", 60s–3599s → "2m 14s", 3600s+ → "1h 2m"
 */
export function formatDuration(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.floor(s % 60);
  if (m < 60) return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
}

/**
 * Token sayısı formatlama: büyük sayıları kısaltır.
 * 1234 → "1.2k", 12345 → "12k"
 */
export function formatTokenCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}
