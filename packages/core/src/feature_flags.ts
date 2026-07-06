/**
 * feature_flags — Ortam değişkeni tabanlı özellik bayrakları.
 *
 * Çekirdek build'in dışında tutulan opsiyonel yüzeyleri (ör. gateway) çalışma
 * zamanında koşullu açar. Kod tabanı içinde kalır ancak varsayılan olarak
 * kapalıdır; yalnız ilgili bayrak set edildiğinde çalışır.
 *
 * Bu modül yalnız `process.env` okur — react/ink/electron import etmez.
 */

/** Bir ortam değişkenini boolean bayrak olarak yorumlar. Tanınan doğru
 * değerler: "1", "true", "yes", "on" (büyük/küçük harf duyarsız). */
function envFlag(name: string): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}
