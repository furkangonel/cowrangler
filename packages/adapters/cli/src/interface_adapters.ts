/**
 * Interface adapter'ları — core facade'ı her arayüze (CLI / Design / Code)
 * bağlayan köprüler. Görseldeki "Adapters → Packages": aynı core, her
 * arayüzde kendine düşen görevi kendi politikasıyla yerine getirir.
 *
 * Her adapter:
 *   - ortak CoreServices'i alır (tek çekirdek),
 *   - o arayüze özgü politikayı uygular (tool allowlist, streaming, thinking),
 *   - arayüz paketine (package) sade bir yüzey sunar.
 *
 * Fiziksel monorepo split'inde her factory `@cowrangler/adapter-<kind>` paketi olur.
 */

import { createCoreServices, type CoreServices, type NativeTurnOptions, type NativeTurnResult } from "./core_facade.js";

export type InterfaceKind = "cli" | "design" | "code";

export interface InterfacePolicy {
  /** Bu arayüzde modele açılan tool politikası. */
  tools: string[] | "*";
  /** Token akışı (UI streaming) destekleniyor mu. */
  streaming: boolean;
  /** Bu arayüzde extended thinking varsayılanı. */
  thinkingDefault: boolean;
}

export interface InterfaceAdapter {
  kind: InterfaceKind;
  core: CoreServices;
  policy: InterfacePolicy;
  /** Arayüz politikasını uygulayarak bir ajan turu çalıştırır. */
  runTurn(opts: NativeTurnOptions): Promise<NativeTurnResult>;
}

/** Arayüz-başına varsayılan politikalar. */
export const INTERFACE_POLICIES: Record<InterfaceKind, InterfacePolicy> = {
  // CLI: tam tool erişimi, terminal streaming, thinking kapalı (hız).
  cli: { tools: "*", streaming: true, thinkingDefault: false },
  // Design: lean tool seti (dosya + tasarım araçları), streaming, thinking açık.
  design: { tools: ["read_file", "write_file", "edit_file", "web_search", "fetch_webpage"], streaming: true, thinkingDefault: true },
  // Code: tam geliştirme tool seti, streaming, thinking açık.
  code: { tools: "*", streaming: true, thinkingDefault: true },
};

/** Belirli bir arayüz için adapter kurar (ortak core facade üstünde). */
export function createAdapter(kind: InterfaceKind, core: CoreServices = createCoreServices()): InterfaceAdapter {
  const policy = INTERFACE_POLICIES[kind];
  return {
    kind,
    core,
    policy,
    runTurn(opts: NativeTurnOptions): Promise<NativeTurnResult> {
      // Arayüz politikasını turun varsayılanlarına uygula (çağıran ezebilir).
      const merged: NativeTurnOptions = {
        ...opts,
        thinking: opts.thinking ?? (policy.thinkingDefault ? { enabled: true } : undefined),
      };
      return core.agent.runTurn(merged);
    },
  };
}

/** Üç arayüz adapter'ını tek core üstünde kurar (Desktop tüm yüzeyleri yükler). */
export function createAllAdapters(core: CoreServices = createCoreServices()): Record<InterfaceKind, InterfaceAdapter> {
  return {
    cli: createAdapter("cli", core),
    design: createAdapter("design", core),
    code: createAdapter("code", core),
  };
}
