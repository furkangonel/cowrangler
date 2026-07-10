/**
 * mcp_trust — MCP sunucuları için ilk-kullanım güven onayı.
 *
 * Bir MCP sunucusu keyfi subprocess çalıştırabilir (stdio) veya uzak bir
 * endpoint'e bağlanabilir (http/sse); ikisi de tool listesi aracılığıyla
 * modele talimat enjekte edebilir. Bu modül her sunucu için bir "parmak izi"
 * (config hash) ve keşfedilen araç listesinin hash'ini `~/.cowrangler/mcp_trust.json`
 * içinde saklar. Config veya araç listesi ilk görülenden farklıysa, çağıran
 * taraf (MCPManager) bir onay callback'i üzerinden kullanıcıya sormak zorunda
 * kalır — sessizce yeniden bağlanıp yeni/değişmiş davranışı güvenmiş gibi
 * kabul etmez.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { DIRS } from "./init.js";
import type { MCPServerConfig } from "./mcp_client.js";

export interface TrustRecord {
  configFingerprint: string;
  toolsFingerprint: string | null;
  trustedAt: number;
}

export type TrustStatus = "new" | "trusted" | "config_changed" | "tools_changed";

let _trustStorePath = path.join(DIRS.global.base, "mcp_trust.json");

/** Yalnızca testler için — global durumdan izole çalışmak amacıyla depo yolunu değiştirir. */
export function _setTrustStorePathForTests(p: string): void {
  _trustStorePath = p;
}

function readStore(): Record<string, TrustRecord> {
  try {
    if (!fs.existsSync(_trustStorePath)) return {};
    return JSON.parse(fs.readFileSync(_trustStorePath, "utf8"));
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, TrustRecord>): void {
  fs.mkdirSync(path.dirname(_trustStorePath), { recursive: true });
  fs.writeFileSync(_trustStorePath, JSON.stringify(store, null, 2), "utf8");
}

/**
 * Config'in kararlı bir hash'i. Sunucu config'i gizli değerleri düz metin
 * TUTMAZ (bkz. `secrets`/`secretsHeader` alanları — gerçek değerler vault'ta),
 * bu yüzden config'in tamamını hash'lemek güvenlidir.
 */
export function fingerprintServerConfig(config: MCPServerConfig): string {
  const stable = JSON.stringify(config, Object.keys(config).sort());
  return crypto.createHash("sha256").update(stable).digest("hex").slice(0, 16);
}

export function fingerprintToolNames(toolNames: string[]): string {
  const stable = [...toolNames].sort().join(",");
  return crypto.createHash("sha256").update(stable).digest("hex").slice(0, 16);
}

export function getTrustRecord(serverName: string): TrustRecord | null {
  return readStore()[serverName] ?? null;
}

/** Config değişikliğine karşı durumu belirler (araç listesi henüz bilinmiyorsa göz ardı edilir). */
export function checkConfigTrust(serverName: string, config: MCPServerConfig): TrustStatus {
  const record = getTrustRecord(serverName);
  if (!record) return "new";
  if (record.configFingerprint !== fingerprintServerConfig(config)) return "config_changed";
  return "trusted";
}

/** Araç listesi keşfedildikten sonra çağrılır — kayıtlı hash'ten farklıysa yeniden onay gerektirir. */
export function checkToolsTrust(serverName: string, toolNames: string[]): TrustStatus {
  const record = getTrustRecord(serverName);
  if (!record || record.toolsFingerprint === null) return "new";
  if (record.toolsFingerprint !== fingerprintToolNames(toolNames)) return "tools_changed";
  return "trusted";
}

export function trustServerConfig(serverName: string, config: MCPServerConfig): void {
  const store = readStore();
  const existing = store[serverName];
  store[serverName] = {
    configFingerprint: fingerprintServerConfig(config),
    toolsFingerprint: existing?.toolsFingerprint ?? null,
    trustedAt: Date.now(),
  };
  writeStore(store);
}

export function trustServerTools(serverName: string, toolNames: string[]): void {
  const store = readStore();
  const existing = store[serverName];
  if (!existing) return; // config henüz onaylanmadıysa araç güveni anlamsız
  store[serverName] = {
    ...existing,
    toolsFingerprint: fingerprintToolNames(toolNames),
    trustedAt: Date.now(),
  };
  writeStore(store);
}

export function revokeServerTrust(serverName: string): void {
  const store = readStore();
  delete store[serverName];
  writeStore(store);
}

