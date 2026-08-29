/**
 * credential_vault — kimlik bilgileri için şifreli yerel kasa.
 *
 * Connector API anahtarları / token'ları artık config.yaml içinde DÜZ METİN
 * olarak tutulmaz. Bunun yerine bu kasa, üç kademeli bir öncelik sırasıyla
 * yazar (bkz. `encryptCell`):
 *
 *   1. Electron `safeStorage` (desktop, OS keychain destekli) → mode "safe".
 *   2. CLI (Electron dışı) bağlamda gerçek OS deposu varsa (macOS Keychain
 *      `security`, Linux libsecret `secret-tool` — bkz. os_keychain.ts) →
 *      mode "os". Gerçek değer secrets.json'a YAZILMAZ, yalnızca keychain
 *      kaydının "account" adı tutulur.
 *   3. Hiçbiri yoksa (ör. Windows CLI, ya da yukarıdakiler başarısız olursa)
 *      base64 obfuscation'a düşülür (şifreleme DEĞİL) ve dosya 0600 izinle
 *      (Windows'ta icacls ile mevcut kullanıcıya kilitlenerek) yazılır.
 *
 * Hangi modun kullanıldığı `isEncrypted()` ile UI'a bildirilir.
 *
 * Şema (~/.cowrangler/secrets.json):
 *   {
 *     "slack":        { "SLACK_BOT_TOKEN": { "m": "safe", "d": "<b64>" } },
 *     "oauth:notion": { "tokens": { "m": "os", "d": "oauth:notion.tokens" } }
 *   }
 */

import path from "path";
import os from "os";
import fs from "fs";
import { createRequire } from "module";
import { isOSKeychainAvailable, osKeychainDelete, osKeychainGet, osKeychainSet, restrictFileToCurrentUserWindows } from "./os_keychain.js";

const require_ = createRequire(import.meta.url);

const GLOBAL_DIR = path.join(os.homedir(), ".cowrangler");
let SECRETS_FILE = path.join(GLOBAL_DIR, "secrets.json");

/** Yalnızca testler için — gerçek kullanıcının ~/.cowrangler/secrets.json'ından izole çalışmak amacıyla. */
export function _setSecretsFileForTests(p: string): void {
  SECRETS_FILE = p;
}

// "os" hücreleri: gerçek değer secrets.json'da DEĞİL, OS keychain/libsecret'ta
// tutulur — `d` burada yalnızca keychain'deki kaydı bulmak için kullanılan
// "account" tanımlayıcısını taşır (bkz. os_keychain.ts).
type Mode = "safe" | "plain" | "os";
interface Cell {
  m: Mode;
  d: string; // "safe"/"plain": base64 payload — "os": keychain account adı
}
type Store = Record<string, Record<string, Cell>>;

function keychainAccount(namespace: string, key: string): string {
  return `${namespace}.${key}`;
}

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

/** Şifreleme gerçekten OS-destekli mi (UI ipucu için) — Electron safeStorage veya CLI'da OS keychain. */
export function isEncrypted(): boolean {
  return safeStorage() != null || isOSKeychainAvailable();
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
  fs.mkdirSync(path.dirname(SECRETS_FILE), { recursive: true });
  fs.writeFileSync(SECRETS_FILE, JSON.stringify(store, null, 2), "utf-8");
  try {
    fs.chmodSync(SECRETS_FILE, 0o600);
  } catch {
    /* best effort */
  }
}

function encryptCell(plain: string, account: string, forcePlain = false, crossProcess = false): Cell {
  if (!forcePlain) {
    // Provider API keys must be readable by both Electron and the terminal CLI.
    // Prefer the real OS keychain before Electron safeStorage for that case.
    if (crossProcess) {
      if (isOSKeychainAvailable() && osKeychainSet(account, plain)) {
        return { m: "os", d: account };
      }
      restrictFileToCurrentUserWindows(SECRETS_FILE);
      return { m: "plain", d: Buffer.from(plain, "utf-8").toString("base64") };
    }
    const ss = safeStorage();
    if (ss) {
      try {
        return { m: "safe", d: ss.encryptString(plain).toString("base64") };
      } catch {
        /* düşüş */
      }
    }
    // Electron safeStorage yok (CLI bağlamı) — gerçek OS keychain dene.
    if (isOSKeychainAvailable() && osKeychainSet(account, plain)) {
      return { m: "os", d: account };
    }
  }
  restrictFileToCurrentUserWindows(SECRETS_FILE);
  return { m: "plain", d: Buffer.from(plain, "utf-8").toString("base64") };
}

function decryptCell(cell: Cell): string {
  try {
    if (cell.m === "safe") {
      const ss = safeStorage();
      if (!ss) return "";
      return ss.decryptString(Buffer.from(cell.d, "base64"));
    }
    if (cell.m === "os") {
      return osKeychainGet(cell.d) ?? "";
    }
    return Buffer.from(cell.d, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

interface SetSecretsOpts {
  /**
   * true ise `electron.safeStorage` (OS keychain) mevcut olsa bile kullanılmaz;
   * her zaman taşınabilir "plain" (base64 + 0600 dosya izni) modunda yazılır.
   *
   * Neden gerekli: safeStorage yalnızca Electron (desktop) sürecinde çalışır.
   * "safe" modda yazılan bir hücre, plain Node CLI sürecinden ASLA çözülemez
   * (decryptCell "" döner) — aynı ~/.cowrangler/secrets.json dosyasını
   * paylaşsalar bile. Desktop + CLI arasında paylaşılması GEREKEN kayıtlar
   * (ör. `oauth_subscriptions.ts`'in abonelik token'ları — desktop'ta login
   * olup CLI'da da API anahtarsız çalışması beklenir) bu yüzden her zaman
   * forcePlain:true ile yazılmalı.
   */
  forcePlain?: boolean;
  /** Store where both Electron and the standalone CLI can read it. */
  crossProcess?: boolean;
}

/** Bir namespace (ör. connector id) için verilen anahtarları şifreleyip yazar (merge). */
export function setSecrets(
  namespace: string,
  secrets: Record<string, string | null | undefined>,
  opts?: SetSecretsOpts,
): void {
  const store = readStore();
  const bucket = { ...(store[namespace] ?? {}) };
  for (const [k, v] of Object.entries(secrets)) {
    const previous = bucket[k];
    if (v == null || v === "") {
      if (previous?.m === "os") osKeychainDelete(previous.d);
      delete bucket[k];
      continue;
    }
    const account = keychainAccount(namespace, k);
    const next = encryptCell(v, account, opts?.forcePlain, opts?.crossProcess);
    // Mod değiştiyse (ör. os → plain), keychain'de yetim kayıt kalmasın.
    if (previous?.m === "os" && previous.d !== next.d) osKeychainDelete(previous.d);
    bucket[k] = next;
  }
  store[namespace] = bucket;
  writeStore(store);
}

/** Tek bir gizli değeri yazar. */
export function setSecret(
  namespace: string,
  key: string,
  value: string | null | undefined,
  opts?: SetSecretsOpts,
): void {
  setSecrets(namespace, { [key]: value }, opts);
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

/**
 * Bir hücrenin şifreleme modunu (deşifre ETMEDEN) döndürür — "safe" ise
 * yalnızca Electron sürecinde, safeStorage ile açılabilir; CLI'dan asla değil.
 * Çağıranlar bunu (ör. `oauth_subscriptions.ts`) desktop'ta yazılmış bir
 * kaydı otomatik olarak taşınabilir "plain" moda geçirmek (self-heal) için
 * kullanır. Kayıt yoksa null.
 */
export function getSecretMode(namespace: string, key: string): Mode | null {
  const store = readStore();
  return store[namespace]?.[key]?.m ?? null;
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
  const bucket = store[namespace];
  if (bucket) {
    for (const cell of Object.values(bucket)) {
      if (cell.m === "os") osKeychainDelete(cell.d);
    }
    delete store[namespace];
    writeStore(store);
  }
}

/** Hangi namespace'lerin kaydı var (UI rozetleri için). */
export function listSecretNamespaces(): string[] {
  return Object.keys(readStore());
}
