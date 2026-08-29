/**
 * CoreServices — çekirdeğin arayüzlere açtığı TEK yüzey (facade).
 *
 * Görseldeki "Core her bir arayüz tarafından kullanılır" ilkesi: arayüzler
 * (CLI / Design / Code) çekirdeğin derinliklerini (agent.ts, driver.ts,
 * skills.ts...) doğrudan import ETMEZ; yalnız bu facade'ı görür. Böylece:
 *   - bağımlılık tek yönlü olur (arayüz → adapter → core),
 *   - core iç yapısı değişince arayüzler kırılmaz,
 *   - her arayüz aynı core sözleşmesini paylaşır.
 *
 * Bu facade fiziksel monorepo split'inde (Faz 5) `@cowrangler/core`'un public
 * index'i olur; şimdilik tek repoda mantıksal sınırı kurar.
 */

import {
  makeNativeModel,
  nativeModelForId,
  runNativeAgentTurn,
  generateOnce,
  nativeProvidersEnabled,
  isSupportedWire,
  type ChatModel,
  type NativeTurnOptions,
  type NativeTurnResult,
} from "@cowrangler/core/model/native/index.js";
import { resolveEndpoint } from "@cowrangler/core/model/driver.js";
import { providerOf } from "@cowrangler/core/model/catalog.js";
import {
  getScopePaths,
  orderedScopePaths,
  describeContextScopes,
  type ContextKind,
} from "@cowrangler/core/context_scopes.js";

/** Model / provider / anahtar / oauth yüzeyi. */
export interface ModelService {
  /** model string → native ChatModel (providerOf + resolveEndpoint + fabrika). */
  modelForId(modelId: string, env?: NodeJS.ProcessEnv): ChatModel;
  /** providerId + baseURL + apiKey + (oauth/copilot) çözer. */
  resolveEndpoint: typeof resolveEndpoint;
  /** modelId → providerId. */
  providerOf: typeof providerOf;
  /** Wire desteği (anthropic/openai/gemini). */
  isSupportedWire: typeof isSupportedWire;
  /** Native katman etkin mi (COWRANGLER_LEGACY_SDK kaçış kapağı). */
  nativeEnabled: typeof nativeProvidersEnabled;
}

/** Ajan (çok-adım tool loop) + tek-atış üretim yüzeyi. */
export interface AgentService {
  /** Bir ajan turu çalıştırır (streamText+maxSteps karşılığı). */
  runTurn(opts: NativeTurnOptions): Promise<NativeTurnResult>;
  /** Tool'suz tek-atış metin üretimi (özet/ping). */
  generateOnce: typeof generateOnce;
}

/** Context (skills/agents/memory/instructions) scope yüzeyi. */
export interface ContextService {
  scopePaths(kind: ContextKind, sessionId?: string): ReturnType<typeof getScopePaths>;
  orderedScopePaths: typeof orderedScopePaths;
  describe(sessionId?: string): ReturnType<typeof describeContextScopes>;
}

export interface CoreServices {
  model: ModelService;
  agent: AgentService;
  context: ContextService;
}

/** Tek core facade örneği kurar. Arayüz adapter'ları bunu tüketir. */
export function createCoreServices(): CoreServices {
  return {
    model: {
      modelForId: nativeModelForId,
      resolveEndpoint,
      providerOf,
      isSupportedWire,
      nativeEnabled: nativeProvidersEnabled,
    },
    agent: {
      runTurn: runNativeAgentTurn,
      generateOnce,
    },
    context: {
      scopePaths: getScopePaths,
      orderedScopePaths,
      describe: describeContextScopes,
    },
  };
}

export { makeNativeModel };
export type { ChatModel, NativeTurnOptions, NativeTurnResult, ContextKind };
