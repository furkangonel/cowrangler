/**
 * Adapters — public yüzey.
 *
 * Arayüzler (CLI/Design/Code) core'u BURADAN tüketir; core'un derin
 * modüllerini doğrudan import etmez. Fiziksel monorepo split'inde bu klasör
 * `packages/adapters/*` olur.
 */

export {
  createCoreServices,
  type CoreServices,
  type ModelService,
  type AgentService,
  type ContextService,
} from "./core_facade.js";

export {
  createAdapter,
  createAllAdapters,
  INTERFACE_POLICIES,
  type InterfaceKind,
  type InterfaceAdapter,
  type InterfacePolicy,
} from "./interface_adapters.js";
