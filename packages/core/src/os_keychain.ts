/**
 * os_keychain — CLI (Electron dışı) bağlamda gerçek OS-destekli gizli değer
 * saklama. `credential_vault.ts`'in "plain" (base64 obfuscation, şifreleme
 * DEĞİL) düşüşünü, mümkün olan platformlarda gerçek bir OS deposuna
 * yönlendirir:
 *
 *   - macOS:   `security` (Keychain) — her Mac'te varsayılan olarak mevcut.
 *   - Linux:   `secret-tool` (libsecret / GNOME Keyring) — kurulu değilse yok
 *              sayılır, çağıran taraf mevcut base64 düşüşüne devam eder.
 *   - Windows: Keychain-eşdeğeri bir CLI aracı yok; bunun yerine `icacls` ile
 *              secrets.json dosyasını yalnızca mevcut kullanıcıya kilitler
 *              (bkz. `restrictFileToCurrentUserWindows`). Gerçek şifreleme
 *              değil ama audit maddesinin "Windows ACL support" kısmına karşılık gelir.
 *
 * Hiçbir platformda araç mevcut değilse veya bir çağrı başarısız olursa,
 * çağıran taraf (credential_vault.ts) sessizce mevcut base64 moduna düşer —
 * bu modül asla sert bir hataya neden olmaz.
 */

import { execFileSync } from "child_process";

const SERVICE_NAME = "cowrangler";

let _availableCache: boolean | undefined;

function binaryExists(bin: string): boolean {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [bin], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Bu platformda gerçek bir OS gizli-değer deposu (Keychain/libsecret) var mı? */
export function isOSKeychainAvailable(): boolean {
  if (_availableCache !== undefined) return _availableCache;
  if (process.platform === "darwin") {
    _availableCache = binaryExists("security");
  } else if (process.platform === "linux") {
    _availableCache = binaryExists("secret-tool");
  } else {
    // Windows'ta eşdeğer bir CLI aracı yok — icacls ayrı bir güvenlik katmanı,
    // "gerçek keychain" saklaması sağlamaz.
    _availableCache = false;
  }
  return _availableCache;
}

/** Yalnızca testler için — platform/binary probe önbelleğini sıfırlar. */
export function _resetOSKeychainCacheForTests(): void {
  _availableCache = undefined;
}

export function osKeychainSet(account: string, value: string): boolean {
  try {
    if (process.platform === "darwin") {
      execFileSync(
        "security",
        ["add-generic-password", "-s", SERVICE_NAME, "-a", account, "-w", value, "-U"],
        { stdio: "ignore" },
      );
      return true;
    }
    if (process.platform === "linux") {
      execFileSync(
        "secret-tool",
        ["store", "--label", "Cowrangler credential", "service", SERVICE_NAME, "account", account],
        { input: value, stdio: ["pipe", "ignore", "ignore"] },
      );
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function osKeychainGet(account: string): string | null {
  try {
    if (process.platform === "darwin") {
      const out = execFileSync(
        "security",
        ["find-generic-password", "-s", SERVICE_NAME, "-a", account, "-w"],
        { stdio: ["ignore", "pipe", "ignore"] },
      );
      return out.toString("utf-8").replace(/\n$/, "");
    }
    if (process.platform === "linux") {
      const out = execFileSync("secret-tool", ["lookup", "service", SERVICE_NAME, "account", account], {
        stdio: ["ignore", "pipe", "ignore"],
      });
      return out.toString("utf-8").replace(/\n$/, "");
    }
    return null;
  } catch {
    return null;
  }
}

export function osKeychainDelete(account: string): void {
  try {
    if (process.platform === "darwin") {
      execFileSync("security", ["delete-generic-password", "-s", SERVICE_NAME, "-a", account], {
        stdio: "ignore",
      });
    } else if (process.platform === "linux") {
      execFileSync("secret-tool", ["clear", "service", SERVICE_NAME, "account", account], { stdio: "ignore" });
    }
  } catch {
    /* best-effort — kayıt zaten yoksa sessizce geç */
  }
}

/**
 * Windows'ta secrets.json'ı yalnızca mevcut kullanıcıya kilitler (NTFS ACL).
 * Unix'teki `chmod 600`'ün Windows karşılığı — gerçek şifreleme değil, ama
 * dosyayı aynı makinedeki diğer kullanıcı hesaplarından korur.
 */
export function restrictFileToCurrentUserWindows(filePath: string): void {
  if (process.platform !== "win32") return;
  try {
    execFileSync("icacls", [filePath, "/inheritance:r", "/grant:r", `${process.env.USERNAME}:F`], {
      stdio: "ignore",
    });
  } catch {
    /* best-effort */
  }
}
