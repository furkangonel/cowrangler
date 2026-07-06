/**
 * @cowrangler/core — çekirdek public API barrel (WP-C1).
 *
 * "Miras" mimarisinin somut yüzeyi: CLI Code (ink), Desktop Code (electron) ve
 * Cowork bu tek noktadan tüketir — böylece core değişince üçü de kazanır, biri
 * değişince öteki etkilenmez. `core/` kuralı: burası hiçbir surface'i (electron/
 * ink/react) import ETMEZ; yalnızca çekirdek modülleri dışa açar.
 *
 * Not: geçiş kademeli — mevcut derin importlar (`../core/x.js`) çalışmaya devam
 * eder; yeni kod bu barrel'ı tercih etmeli. İleride `packages/core`'a ayırmaya
 * hazırlık.
 */

// ── Ajan + LLM ────────────────────────────────────────────────────────────────
export { Agent } from "./agent.js";
export type { AgentChatResult } from "./agent.js";
export { LLM } from "./llm.js";

// ── Git çekirdeği (WP-B1) ─────────────────────────────────────────────────────
export * as git from "./git.js";

// ── Bellek + init ─────────────────────────────────────────────────────────────
export { getMemoryManager, initDefaultMemory, MemoryManager } from "./memory_provider.js";
export { DIRS, getConfig, initEnvironment } from "./init.js";
