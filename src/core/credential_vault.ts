/**
 * credential_vault — kimlik bilgileri için şifreli yerel kasa.
 *
 * Connector API anahtarları / token'ları artık config.yaml içinde DÜZ METİN
 * olarak tutulmaz. Bunun yerine bu kasa, Electron `safeStorage` (OS keychain
 * destekli) ile şifreler ve `~/.cowrangler/secrets.json`'a yazar.
 *
 * Electron dışı bağlam (CLI) için safeStorage yoksa, base64 obfuscation'a
 * düşülür (şifreleme DEĞİL — sadece düz metin göz taramasını engeller) ve
 * dosya 0600 izinle yazılır. Bu durum `isEncrypted()` ile UI'a bildirilir.
 *
 * Şema (~/.cowrangler/secrets.json):
 *   {
 *     "slack":        { "SLACK_BOT_TOKEN": { "m": "safe", "d": "<b64>" } },
 *     "oauth:notion": { "tokens": { "m": "safe", "d": "<b64>" } }
 *   }
 */

import path from "path";
import os from "os";
import fs from "fs";
import { createRequire } from "module";

const require_ = createRequire(import.meta.url);

const GLOBAL_DIR = path.join(os.homedir(), ".cowrangler");
const SECRETS_FILE = path.join(GLOBAL_DIR, "secrets.json");

type Mode = "safe" | "plain";
interface Cell {
  m: Mode;
  d: string; // base64 payload
}
type Store = Record<string, Record<string, Cell>>;

// ── Electron safeStorage (yalnızca main process'te mevcut) ────────────────────
let _safe: any | null | undefined;
function safeStorage(): any | null {
  if (_safe !== undefined) return _safe;
  try {
    const electron = require_("electron");
    const ss = electron?.safeStorage;
    _safe = ss && ss.isEncryptionAvailable && ss.isEncryptionAvailable() ? ss : null;
  } catch {
    _safe = null;
  }
  return _safe;
}

/** Şifreleme gerçekten OS-destekli mi (UI ipucu için). */
export function isEncrypted(): boolean {
  return safeStorage() != null;
}

function readStore(): Store {
  try {
    if (!fs.existsSync(SECRETS_FILE)) return {};
    return (JSON.parse(fs.readFileSync(SECRETS_FILE, "utf-8")) as Store) || {};
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  fs.mkdirSync(GLOBAL_DIR, { recursive: true });
  fs.writeFileSync(SECRETS_FILE, JSON.stringify(store, null, 2), "utf-8");
  try {
    fs.chmodSync(SECRETS_FILE, 0o600);
  } catch {
    /* best effort */
  }
}

function encryptCell(plain: string): Cell {
  const ss = safeStorage();
  if (ss) {
    try {
      return { m: "safe", d: ss.encryptString(plain).toString("base64") };
    } catch {
      /* düşüş */
    }
  }
  return { m: "plain", d: Buffer.from(plain, "utf-8").toString("base64") };
}

function decryptCell(cell: Cell): string {
  try {
    if (cell.m === "safe") {
      const ss = safeStorage();
      if (!ss) return "";
      return ss.decryptString(Buffer.from(cell.d, "base64"));
    }
    return Buffer.from(cell.d, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Bir namespace (ör. connector id) için verilen anahtarları şifreleyip yazar (merge). */
export function setSecrets(namespace: string, secrets: Record<string, string | null | undefined>): void {
  const store = readStore();
  const bucket = { ...(store[namespace] ?? {}) };
  for (const [k, v] of Object.entries(secrets)) {
    if (v == null || v === "") {
      delete bucket[k];
      continue;
    }
    bucket[k] = encryptCell(v);
  }
  store[namespace] = bucket;
  writeStore(store);
}

/** Tek bir gizli değeri yazar. */
export function setSecret(namespace: string, key: string, value: string | null | undefined): void {
  setSecrets(namespace, { [key]: value });
}

/** Namespace'in tüm gizli değerlerini (çözülmüş) döndürür. */
export function getSecrets(namespace: string): Record<string, string> {
  const store = readStore();
  const bucket = store[namespace];
  if (!bucket) return {};
  const out: Record<string, string> = {};
  for (const [k, cell] of Object.entries(bucket)) {
    const v = decryptCell(cell);
    if (v) out[k] = v;
  }
  return out;
}

/** Tek bir gizli değeri (çözülmüş) döndürür. */
export function getSecret(namespace: string, key: string): string | undefined {
  const bucket = getSecrets(namespace);
  return bucket[key];
}

/** Namespace'te en az bir gizli değer var mı. */
export function hasSecrets(namespace: string): boolean {
  const store = readStore();
  const bucket = store[namespace];
  return !!bucket && Object.keys(bucket).length > 0;
}

/** Namespace'i tamamen siler. */
export function deleteSecrets(namespace: string): void {
  const store = readStore();
  if (store[namespace]) {
    delete store[namespace];
    writeStore(store);
  }
}

/** Hangi namespace'lerin kaydı var (UI rozetleri için). */
export function listSecretNamespaces(): string[] {
  return Object.keys(readStore());
}
