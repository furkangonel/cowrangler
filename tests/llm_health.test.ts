/**
 * llm_health — birim testleri (WP-8: provider hata eşleme).
 */

import { describe, it, expect } from "vitest";
import { mapProviderError } from "@cowrangler/core/llm_health.js";

describe("mapProviderError", () => {
  it("MISSING_KEY → net yönerge", () => {
    const m = mapProviderError("MISSING_KEY:ANTHROPIC_API_KEY");
    expect(m).toContain("ANTHROPIC_API_KEY");
    expect(m.toLowerCase()).toContain("login");
  });

  it("UNSUPPORTED_MODEL → model adı", () => {
    expect(mapProviderError("UNSUPPORTED_MODEL:foobar")).toContain("foobar");
  });

  it("401 → kimlik doğrulama", () => {
    expect(mapProviderError("Request failed: 401 Unauthorized")).toContain(
      "Kimlik doğrulama",
    );
  });

  it("invalid api key → kimlik doğrulama", () => {
    expect(mapProviderError("Invalid API key provided")).toContain(
      "Kimlik doğrulama",
    );
  });

  it("404 / not found → model bulunamadı", () => {
    expect(mapProviderError("404 model not found")).toContain("bulunamadı");
  });

  it("429 → hız limiti", () => {
    expect(mapProviderError("429 Too Many Requests")).toContain("limit");
  });

  it("ECONNREFUSED → ağ hatası", () => {
    expect(mapProviderError("fetch failed: ECONNREFUSED")).toContain("Ağ");
  });

  it("500 → sunucu hatası", () => {
    expect(mapProviderError("503 Service Unavailable")).toContain("sunucu");
  });

  it("bilinmeyen → ilk satır", () => {
    expect(mapProviderError("weird thing\nsecond line")).toBe("weird thing");
  });
});
