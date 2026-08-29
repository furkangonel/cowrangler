/**
 * Sandbox Adapter — Enterprise-level güvenli bash çalıştırma katmanı.
 *
 * GENERAL_CONV.md sandbox mimarisine göre tasarlandı.
 *
 * Özellikler:
 * - Tehlikeli pattern'leri statik analiz ile engeller
 * - Çalışma dizinini kısıtlar (workspace dışına çıkamaz)
 * - Kaynak limitlerini uygular (timeout, output boyutu)
 * - Her çalıştırmayı audit log'a yazar
 * - Network erişimini kısıtlayabilir (network_restricted=true)
 * - Platforma özel gerçek sanal ve izole sandbox ortamları kullanır (macOS Seatbelt, Linux Bubblewrap, Windows AppContainer/Docker)
 * - Asenkron (non-blocking) çalıştırma ile Electron UI donmalarını engeller.
 */

import { exec, execFile, execSync, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { analyzeBashRisk, RiskLevel } from "./permissions.js";
import { getProjectWorkdir } from "./project_context.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SandboxConfig {
  enabled: boolean;
  workspaceRoot: string;
  maxOutputBytes: number;   // default: 512KB
  maxTimeoutMs: number;     // default: 30s
  networkRestricted: boolean;
  auditLogPath?: string;    // undefined = no audit log
  allowedPaths: string[];   // explicit allowlist (beyond workspaceRoot)
  blockedBinaries: string[]; // always blocked regardless of mode
  provider?: "auto" | "docker" | "mac_seatbelt" | "linux_bwrap" | "fallback";
  /**
   * Gerçek izolasyon backend'i bulunamadığında (none) kullanıcı düşük-güven
   * modunda çalıştırmayı onayladıysa true. Sessiz düşme yerine bilinçli onay.
   */
  allowUnsandboxed?: boolean;
}

export interface SandboxResult {
  output: string;
  exitCode: number;
  sandboxed: boolean;
  /** Komut gerçekten izole bir backend içinde mi çalıştı (direct exec ise false). */
  isolated: boolean;
  /** Seçilen izolasyon backend'i (none = izolasyon yok). */
  backend: SandboxBackendKind;
  riskLevel: RiskLevel;
  blocked: boolean;
  blockReason?: string;
  /** İzolasyon yoksa ama çalıştırıldıysa gösterilecek uyarı. */
  warning?: string;
  durationMs: number;
  auditId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Platforma göre izolasyon backend seçimi (SandboxBackend arayüzü + fabrika)
// ─────────────────────────────────────────────────────────────────────────────

export type SandboxBackendKind =
  | "mac_seatbelt"    // macOS Seatbelt (sandbox-exec)
  | "linux_bwrap"     // Linux Bubblewrap
  | "linux_firejail"  // Linux Firejail (fallback)
  | "docker"          // Docker konteyner (üç platform)
  | "wsl_bwrap"       // Windows: WSL2 içinde bubblewrap
  | "win_jobobject"   // Windows: kısıtlı Job Object + geçici dizin (zayıf fallback)
  | "none";           // Hiçbir izolasyon yok — düşük güven

export interface SandboxBackend {
  kind: SandboxBackendKind;
  /** Gerçek dosya sistemi/ağ izolasyonu sağlıyor mu? */
  isolated: boolean;
  /** runner.sh / runner.ps1'e geçirilecek provider argümanı. */
  providerArg: string;
  /** İnsan-okunur açıklama. */
  label: string;
}

type NodePlatform = NodeJS.Platform;

/**
 * Bir binary'nin PATH'te olup olmadığını kontrol eder (senkron, cache'lenir).
 */
const _binaryCache = new Map<string, boolean>();
export function binaryExists(bin: string): boolean {
  if (_binaryCache.has(bin)) return _binaryCache.get(bin)!;
  let exists = false;
  try {
    const probe =
      process.platform === "win32"
        ? `where ${bin}`
        : `command -v ${bin}`;
    execSync(probe, { stdio: "ignore" });
    exists = true;
  } catch {
    exists = false;
  }
  _binaryCache.set(bin, exists);
  return exists;
}

/** WSL2 + içinde bwrap kullanılabilir mi (Windows). */
function wslBwrapAvailable(probe: (bin: string) => boolean): boolean {
  if (!probe("wsl")) return false;
  try {
    execSync("wsl -e sh -c \"command -v bwrap\"", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Docker kuruluysa VE daemon çalışıyorsa true. */
function dockerRunning(probe: (bin: string) => boolean): boolean {
  if (!probe("docker")) return false;
  try {
    execSync("docker info", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const BACKEND_META: Record<SandboxBackendKind, Omit<SandboxBackend, "kind">> = {
  mac_seatbelt:   { isolated: true,  providerArg: "mac_seatbelt",   label: "macOS Seatbelt" },
  linux_bwrap:    { isolated: true,  providerArg: "linux_bwrap",    label: "Linux Bubblewrap" },
  linux_firejail: { isolated: true,  providerArg: "linux_firejail", label: "Linux Firejail" },
  docker:         { isolated: true,  providerArg: "docker",         label: "Docker container" },
  wsl_bwrap:      { isolated: true,  providerArg: "wsl_bwrap",      label: "WSL2 + Bubblewrap" },
  // A Job Object limits process lifetime/resources; it is not a filesystem or
  // network security boundary. Treating it as isolated silently overstated the
  // protection on Windows machines without WSL2/Docker.
  win_jobobject:  { isolated: false, providerArg: "win_jobobject",  label: "Windows Job Object (low-trust)" },
  none:           { isolated: false, providerArg: "fallback",       label: "No isolation (low-trust)" },
};

function makeBackend(kind: SandboxBackendKind): SandboxBackend {
  return { kind, ...BACKEND_META[kind] };
}

/**
 * Platforma ve mevcut araçlara göre en yüksek öncelikli backend'i seçer (fabrika).
 *
 * @param platform  process.platform değeri.
 * @param probe     Bir binary'nin varlığını kontrol eden fonksiyon (test için enjekte edilebilir).
 * @param forced    Kullanıcı belirli bir provider zorladıysa (config.provider).
 */
export function selectBackend(
  platform: NodePlatform,
  probe: (bin: string) => boolean = binaryExists,
  forced?: SandboxConfig["provider"],
): SandboxBackend {
  // Kullanıcı docker'ı zorladıysa ve gerçekten hazırsa onu kullan.
  if (forced === "docker" && dockerRunning(probe)) return makeBackend("docker");
  if (forced === "fallback") return makeBackend("none");

  if (platform === "darwin") {
    if (probe("sandbox-exec")) return makeBackend("mac_seatbelt");
    if (dockerRunning(probe)) return makeBackend("docker");
    return makeBackend("none");
  }

  if (platform === "win32") {
    if (wslBwrapAvailable(probe)) return makeBackend("wsl_bwrap");
    if (dockerRunning(probe)) return makeBackend("docker");
    // Son çare: kısıtlı Job Object + geçici dizin — daima mevcut, zayıf izolasyon.
    return makeBackend("win_jobobject");
  }

  // Linux (ve diğer POSIX)
  if (probe("bwrap")) return makeBackend("linux_bwrap");
  if (probe("firejail")) return makeBackend("linux_firejail");
  if (dockerRunning(probe)) return makeBackend("docker");
  return makeBackend("none");
}

/**
 * shouldUseSandbox — bir komut için izolasyon zorunlu mu?
 *
 * Yıkıcı/riskli komutlar (dangerous/critical) → zorunlu sandbox.
 * Salt-okunur / güvenli komutlar → doğrudan çalıştırılabilir.
 */
const READONLY_COMMAND = /^\s*(ls|cat|pwd|echo|head|tail|grep|find|which|git\s+(status|log|diff|show|branch)|wc|stat|file|env|whoami|date|node\s+-v|npm\s+(ls|list|-v|view|outdated))\b/;
export function shouldUseSandbox(command: string): boolean {
  const risk = analyzeBashRisk(command);
  if (risk === "dangerous" || risk === "critical") return true;
  // Tek satırlık, borusuz, salt-okunur komutlar doğrudan çalışabilir.
  if (!/[;&|><`$()]/.test(command) && READONLY_COMMAND.test(command)) return false;
  return true;
}

const DEFAULT_BLOCKED_BINARIES = [
  "mkfs", "fdisk", "parted", "gdisk",   // disk tools
  "dd",                                   // disk overwrite
  "nc", "ncat", "socat",                  // raw network
  "python2",                              // legacy, unpatched
  "tcpdump", "wireshark", "tshark",       // packet capture
  "strace", "ptrace",                     // process tracing
  "insmod", "rmmod", "modprobe",          // kernel modules
];

const DEFAULT_CONFIG: SandboxConfig = {
  enabled: true,
  workspaceRoot: getProjectWorkdir(),
  maxOutputBytes: 512 * 1024,  // 512KB
  maxTimeoutMs: 30_000,         // 30s
  networkRestricted: false,
  // The home directory is deliberately not a default execution root. Commands
  // may read selected user configuration inside the OS sandbox, but being able
  // to choose any directory under $HOME as cwd would turn "workspace confined"
  // into "whole home directory writable".
  allowedPaths: [os.tmpdir(), "/tmp", "/var/tmp"],
  blockedBinaries: DEFAULT_BLOCKED_BINARIES,
  provider: "auto",
};

let _config: SandboxConfig = { ...DEFAULT_CONFIG };

const GLOBAL_BUNDLE_PATH = path.join(os.homedir(), ".cowrangler", "cowrangler-sandbox.bundle");

/**
 * Bundle sürümü. Runner script'leri her değiştiğinde ARTIR — böylece eski
 * kopyalar (stale cache) otomatik olarak yeniden kopyalanır.
 */
const SANDBOX_BUNDLE_VERSION = "5";
const BUNDLE_VERSION_FILE = path.join(GLOBAL_BUNDLE_PATH, ".bundle_version");

/** The runner script a bundle must actually contain to be usable. */
function runnerScriptPath(bundlePath: string): string {
  return path.join(
    bundlePath,
    "Contents",
    "Resources",
    "scripts",
    process.platform === "win32" ? "runner.ps1" : "runner.sh",
  );
}

/**
 * A bundle is only usable if the runner script is really there. Checking the
 * version file alone was not enough: an interrupted copy, a deleted file or a
 * quarantined script leaves a directory that looks current but cannot run
 * anything, and the failure surfaces much later as "runner.sh doesn't exist"
 * on every single command.
 */
export function isSandboxBundleUsable(bundlePath: string): boolean {
  try {
    return fs.existsSync(runnerScriptPath(bundlePath));
  } catch {
    return false;
  }
}

/** Global bundle güncel sürümde VE bütün mü? */
function globalBundleIsCurrent(): boolean {
  try {
    const versionMatches =
      fs.readFileSync(BUNDLE_VERSION_FILE, "utf-8").trim() === SANDBOX_BUNDLE_VERSION;
    return versionMatches && isSandboxBundleUsable(GLOBAL_BUNDLE_PATH);
  } catch {
    return false;
  }
}

/**
 * Sandboxing paketini dinamik dizinlerde bulur ve gerekirse kullanıcının ana dizinine kopyalar.
 * Eski sürüm bir kopya varsa (stale), kaynaktan yeniden kopyalar.
 */
export function ensureBundle(): string {
  if (fs.existsSync(GLOBAL_BUNDLE_PATH) && globalBundleIsCurrent()) {
    if (process.platform !== "win32") {
      const globalRunner = path.join(GLOBAL_BUNDLE_PATH, "Contents", "Resources", "scripts", "runner.sh");
      try {
        if (fs.existsSync(globalRunner)) {
          fs.chmodSync(globalRunner, 0o755);
        }
      } catch { /* ignore */ }
    }
    return GLOBAL_BUNDLE_PATH;
  }

  const possiblePaths = [
    path.resolve(__dirname, "cowrangler-sandbox.bundle"),
    path.resolve(__dirname, "../../src/core/cowrangler-sandbox.bundle"),
    path.resolve(__dirname, "../core/cowrangler-sandbox.bundle"),
    // In a packaged Electron app the bundle ships in extraResources. This has
    // to be a candidate for copying, not just a last-resort return value —
    // otherwise a packaged build never populates the global copy.
    ...((process as any).resourcesPath
      ? [path.join((process as any).resourcesPath, "cowrangler-sandbox.bundle")]
      : []),
  ];

  for (const localPath of possiblePaths) {
    if (isSandboxBundleUsable(localPath)) {
      try {
        // Eski/stale bir kopya varsa tamamen kaldır, sonra taze kopyala.
        fs.rmSync(GLOBAL_BUNDLE_PATH, { recursive: true, force: true });
        fs.mkdirSync(path.dirname(GLOBAL_BUNDLE_PATH), { recursive: true });
        fs.cpSync(localPath, GLOBAL_BUNDLE_PATH, { recursive: true });
        fs.writeFileSync(BUNDLE_VERSION_FILE, SANDBOX_BUNDLE_VERSION, "utf-8");

        if (process.platform !== "win32") {
          const globalRunner = path.join(GLOBAL_BUNDLE_PATH, "Contents", "Resources", "scripts", "runner.sh");
          if (fs.existsSync(globalRunner)) {
            fs.chmodSync(globalRunner, 0o755);
          }
        }
        return GLOBAL_BUNDLE_PATH;
      } catch (err) {
        return localPath;
      }
    }
  }

  // Nothing usable anywhere. Returning GLOBAL_BUNDLE_PATH here — a path that
  // does not exist — is what produced the old failure mode: every command died
  // with a confusing "runner.sh doesn't exist", and the agent, given no way
  // forward, started improvising its way around the sandbox. Say so instead.
  throw new SandboxBundleMissingError(
    `The sandbox runner could not be found. Looked in:\n` +
      possiblePaths.map((p) => `  - ${p}`).join("\n") +
      `\n  - ${GLOBAL_BUNDLE_PATH}\n` +
      `Reinstall Co-Wrangler, or run with sandboxing disabled if you trust this workspace.`,
  );
}

/** Raised when no usable sandbox bundle exists on this machine. */
export class SandboxBundleMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxBundleMissingError";
  }
}

export interface SandboxHealth {
  platform: NodeJS.Platform;
  kind: SandboxBackendKind;
  label: string;
  isolated: boolean;
  bundleUsable: boolean;
  bundlePath?: string;
  error?: string;
}

/**
 * Live health for Desktop/doctor. `ensureBundle` intentionally runs here: a
 * stale global copy missing runner.sh is repaired before the next command, not
 * merely reported as broken.
 */
export function inspectSandboxHealth(forced?: SandboxConfig["provider"]): SandboxHealth {
  const backend = selectBackend(process.platform, binaryExists, forced);
  if (!backend.isolated) {
    return {
      platform: process.platform,
      kind: backend.kind,
      label: backend.label,
      isolated: false,
      bundleUsable: false,
      error: "No OS isolation backend is available.",
    };
  }

  try {
    const bundlePath = ensureBundle();
    const bundleUsable = isSandboxBundleUsable(bundlePath);
    const probeError = bundleUsable ? probeIsolationBackend(backend, bundlePath) : undefined;
    return {
      platform: process.platform,
      kind: backend.kind,
      label: backend.label,
      isolated: backend.isolated && bundleUsable && !probeError,
      bundleUsable,
      bundlePath,
      error: !bundleUsable
        ? "Sandbox runner is missing from the resolved bundle."
        : probeError,
    };
  } catch (cause: any) {
    return {
      platform: process.platform,
      kind: backend.kind,
      label: backend.label,
      isolated: false,
      bundleUsable: false,
      error: cause?.message ?? String(cause),
    };
  }
}

/**
 * Binary presence is not enough on locked-down hosts: sandbox-exec/bwrap may
 * exist while the parent security policy rejects creating a nested sandbox.
 * Probe cheap local backends with a no-op so the UI reports usable isolation,
 * not merely a binary found on PATH. Docker/WSL have their own readiness probe.
 */
function probeIsolationBackend(backend: SandboxBackend, bundlePath: string): string | undefined {
  if (!["mac_seatbelt", "linux_bwrap", "linux_firejail"].includes(backend.kind)) return undefined;
  const runnerPath = path.join(bundlePath, "Contents", "Resources", "scripts", "runner.sh");
  const result = spawnSync(
    "/bin/bash",
    [runnerPath, backend.providerArg, os.tmpdir(), "true", "true"],
    { encoding: "utf-8", timeout: 5_000, maxBuffer: 64 * 1024 },
  );
  if (result.status === 0) return undefined;
  const detail = [result.stdout, result.stderr, result.error?.message]
    .filter(Boolean)
    .join("\n")
    .trim();
  return `Isolation backend probe failed${result.status != null ? ` (exit ${result.status})` : ""}: ${detail || "no diagnostic output"}`;
}

export function configureSandbox(partial: Partial<SandboxConfig>): void {
  _config = { ...DEFAULT_CONFIG, ...partial };
}

export function getSandboxConfig(): SandboxConfig {
  return { ..._config };
}

export function isSandboxEnabled(): boolean {
  return _config.enabled;
}

/**
 * Komutun çalışma dizininin sandbox sınırları içinde olup olmadığını kontrol eder.
 */
function isPathAllowed(cwdPath: string): boolean {
  const resolved = path.resolve(cwdPath);
  const workspaceResolved = path.resolve(_config.workspaceRoot);

  if (isSameOrDescendant(resolved, workspaceResolved)) return true;

  for (const allowed of _config.allowedPaths) {
    if (isSameOrDescendant(resolved, path.resolve(allowed))) return true;
  }

  return false;
}

function isSameOrDescendant(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * Komutta yasaklı binary kullanılıyor mu?
 */
function containsBlockedBinary(command: string): string | null {
  for (const bin of _config.blockedBinaries) {
    const re = new RegExp(`(^|[;|&\s])${bin}(\s|$)`);
    if (re.test(command)) return bin;
  }
  return null;
}

/**
 * Network kısıtlaması aktifken ağ komutlarını engelle.
 */
const NETWORK_COMMANDS = /\b(curl|wget|nc|ssh|scp|rsync|ftp|sftp|ping|traceroute|dig|nslookup)\b/;
function containsNetworkCommand(command: string): boolean {
  return NETWORK_COMMANDS.test(command);
}

let _auditCounter = 0;

function writeAuditLog(entry: {
  id: string;
  command: string;
  cwd: string;
  riskLevel: RiskLevel;
  blocked: boolean;
  blockReason?: string;
  durationMs: number;
  outputBytes: number;
}): void {
  if (!_config.auditLogPath) return;
  try {
    const line =
      JSON.stringify({
        ts: new Date().toISOString(),
        ...entry,
      }) + "\n";
    fs.appendFileSync(_config.auditLogPath, line, "utf-8");
  } catch {
    // ignore
  }
}

/**
 * runInSandbox — Ana sandbox çalıştırma fonksiyonu (Asenkron).
 *
 * Sandbox devre dışıysa doğrudan çalıştırır.
 * Aktifse: statik analiz → path kontrolü → bundle sandbox çalıştırma.
 */
export function runInSandbox(
  command: string,
  cwd: string,
  timeoutMs?: number,
): Promise<SandboxResult> {
  const start = Date.now();
  const auditId = `sbox-${Date.now()}-${++_auditCounter}`;

  const effectiveTimeout = Math.min(
    timeoutMs ?? _config.maxTimeoutMs,
    _config.maxTimeoutMs,
  );

  const riskLevel = analyzeBashRisk(command);

  // Arka planda çalıştırılan dev-server komutları için sandbox'ı devredışı bırak (process'in hayatta kalması için)
  const isDevServerCmd = /\b(npm\s+(run\s+)?dev|npm\s+start|vite|next|astro|gatsby|react-scripts|npx\s+(--no-install\s+)?vite)\b/i.test(command) && command.includes("&");

  // ── 1. Sandbox kapalıysa veya dev server arka planda çalışacaksa direkt asenkron çalıştır ──────────────────────────
  if (!_config.enabled || isDevServerCmd) {
    return new Promise<SandboxResult>((resolve) => {
      exec(command, {
        cwd,
        timeout: effectiveTimeout,
        maxBuffer: _config.maxOutputBytes,
        encoding: "utf-8",
      }, (error: any, stdout, stderr) => {
        const durationMs = Date.now() - start;
        const out = [stdout?.toString().trim(), stderr?.toString().trim()]
          .filter(Boolean)
          .join("\n");
        resolve({
          output: out || (error ? error.message : "Command succeeded with no output."),
          exitCode: error ? (error.status ?? error.code ?? 1) : 0,
          sandboxed: false,
          isolated: false,
          backend: "none",
          riskLevel,
          blocked: false,
          durationMs,
        });
      });
    });
  }

  // ── 2. Critical pattern blocker ────────────────────────────────────────────
  if (riskLevel === "critical") {
    const durationMs = Date.now() - start;
    const blockReason = `SANDBOX BLOCKED: Critical destructive pattern detected in command. This operation is permanently blocked.`;
    writeAuditLog({ id: auditId, command, cwd, riskLevel, blocked: true, blockReason, durationMs, outputBytes: 0 });
    return Promise.resolve({ output: blockReason, exitCode: 1, sandboxed: true, isolated: false, backend: "none", riskLevel, blocked: true, blockReason, durationMs, auditId });
  }

  // ── 3. Blocked binary check ────────────────────────────────────────────────
  const blockedBin = containsBlockedBinary(command);
  if (blockedBin) {
    const durationMs = Date.now() - start;
    const blockReason = `SANDBOX BLOCKED: Binary '${blockedBin}' is not allowed in sandbox mode.`;
    writeAuditLog({ id: auditId, command, cwd, riskLevel, blocked: true, blockReason, durationMs, outputBytes: 0 });
    return Promise.resolve({ output: blockReason, exitCode: 1, sandboxed: true, isolated: false, backend: "none", riskLevel, blocked: true, blockReason, durationMs, auditId });
  }

  // ── 4. Network restriction ─────────────────────────────────────────────────
  if (_config.networkRestricted && containsNetworkCommand(command)) {
    const durationMs = Date.now() - start;
    const blockReason = `SANDBOX BLOCKED: Network commands are restricted in this sandbox configuration.`;
    writeAuditLog({ id: auditId, command, cwd, riskLevel, blocked: true, blockReason, durationMs, outputBytes: 0 });
    return Promise.resolve({ output: blockReason, exitCode: 1, sandboxed: true, isolated: false, backend: "none", riskLevel, blocked: true, blockReason, durationMs, auditId });
  }

  // ── 5. Path check ──────────────────────────────────────────────────────────
  if (!isPathAllowed(cwd)) {
    const durationMs = Date.now() - start;
    const blockReason = `SANDBOX BLOCKED: Working directory '${cwd}' is outside the allowed sandbox paths.`;
    writeAuditLog({ id: auditId, command, cwd, riskLevel, blocked: true, blockReason, durationMs, outputBytes: 0 });
    return Promise.resolve({ output: blockReason, exitCode: 1, sandboxed: true, isolated: false, backend: "none", riskLevel, blocked: true, blockReason, durationMs, auditId });
  }

  // ── 6. Backend seçimi (platforma göre) ─────────────────────────────────────
  const backend = selectBackend(process.platform, binaryExists, _config.provider);

  // ── 6a. İzolasyon yoksa: sessiz düşme YOK ─────────────────────────────────
  // Gerçek izolasyon backend'i bulunamadıysa, kullanıcı açıkça onaylamadıkça
  // (allowUnsandboxed) komutu çalıştırma — düşük güven modunu bildir.
  if (!backend.isolated) {
    const warning =
      `SANDBOX WARNING: No isolation backend available on this platform ` +
      `(checked Seatbelt/Bubblewrap/Firejail/Docker/WSL). Command is NOT isolated.`;
    if (!_config.allowUnsandboxed) {
      const durationMs = Date.now() - start;
      const blockReason =
        `${warning} Refusing to run without isolation. ` +
        `Confirm low-trust execution (set allowUnsandboxed) to proceed.`;
      writeAuditLog({ id: auditId, command, cwd, riskLevel, blocked: true, blockReason, durationMs, outputBytes: 0 });
      return Promise.resolve({
        output: blockReason, exitCode: 1, sandboxed: false, isolated: false,
        backend: backend.kind, riskLevel, blocked: true, blockReason, warning,
        durationMs, auditId,
      });
    }
    // Kullanıcı düşük-güven modunu onayladı → doğrudan çalıştır, ama işaretle.
    return new Promise<SandboxResult>((resolve) => {
      exec(command, {
        cwd, timeout: effectiveTimeout, maxBuffer: _config.maxOutputBytes, encoding: "utf-8",
      }, (error: any, stdout, stderr) => {
        const durationMs = Date.now() - start;
        const out = [stdout?.toString().trim(), stderr?.toString().trim()]
          .filter(Boolean).join("\n");
        const exitCode = error ? (error.status ?? error.code ?? 1) : 0;
        writeAuditLog({ id: auditId, command, cwd, riskLevel, blocked: false, durationMs, outputBytes: out.length });
        resolve({
          output: out || (error ? error.message : "Command succeeded with no output."),
          exitCode: typeof exitCode === "number" ? exitCode : 1,
          sandboxed: false, isolated: false, backend: backend.kind, riskLevel,
          blocked: false, warning, durationMs, auditId,
        });
      });
    });
  }

  // ── 6b. Execute via Bundle Runner (Asenkron & Non-blocking) ────────────────
  let bundlePath: string;
  try {
    bundlePath = ensureBundle();
  } catch (cause: any) {
    const durationMs = Date.now() - start;
    const blockReason =
      `SANDBOX UNAVAILABLE: ${cause?.message ?? String(cause)}`;
    writeAuditLog({ id: auditId, command, cwd, riskLevel, blocked: true, blockReason, durationMs, outputBytes: 0 });
    return Promise.resolve({
      output: blockReason, exitCode: 1, sandboxed: false, isolated: false,
      backend: "none", riskLevel, blocked: true, blockReason, durationMs, auditId,
    });
  }
  const networkRestrictedStr = _config.networkRestricted ? "true" : "false";

  let executable = "";
  let runnerArgs: string[] = [];
  if (process.platform === "win32") {
    const runnerPath = path.join(bundlePath, "Contents", "Resources", "scripts", "runner.ps1");
    executable = "powershell.exe";
    runnerArgs = [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", runnerPath,
      "-Provider", backend.providerArg,
      "-Cwd", cwd,
      "-NetworkRestricted", networkRestrictedStr,
      "-Command", command,
    ];
  } else {
    const runnerPath = path.join(bundlePath, "Contents", "Resources", "scripts", "runner.sh");
    executable = "/bin/bash";
    runnerArgs = [runnerPath, backend.providerArg, cwd, networkRestrictedStr, command];
  }

  return new Promise<SandboxResult>((resolve) => {
    // Avoid constructing another shell command around the runner. execFile
    // preserves cwd/command arguments exactly (spaces, quotes, $, newlines) and
    // eliminates a second injection/escaping surface.
    execFile(executable, runnerArgs, {
      cwd,
      timeout: effectiveTimeout,
      maxBuffer: _config.maxOutputBytes,
      encoding: "utf-8",
    }, (error: any, stdout, stderr) => {
      const durationMs = Date.now() - start;
      const cleanStdout = stdout?.toString().trim() || "";
      const cleanStderr = stderr?.toString().trim() || "";
      const out = [cleanStdout, cleanStderr].filter(Boolean).join("\n") || (error ? error.message : "");

      if (error && error.code === "ETIMEDOUT") {
        const blockReason = `SANDBOX TIMEOUT: Command exceeded ${effectiveTimeout}ms limit.`;
        writeAuditLog({ id: auditId, command, cwd, riskLevel, blocked: true, blockReason, durationMs, outputBytes: 0 });
        resolve({ output: blockReason, exitCode: 124, sandboxed: true, isolated: backend.isolated, backend: backend.kind, riskLevel, blocked: true, blockReason, durationMs, auditId });
        return;
      }

      const infrastructureFailure =
        error?.code === "ENOENT" ||
        error?.code === "EACCES" ||
        error?.status === 125 ||
        /SANDBOX UNAVAILABLE:/i.test(out) ||
        /sandbox-exec:\s*(sandbox_apply|invalid|failed)/i.test(out) ||
        /bwrap:.*(operation not permitted|permission denied|creating new namespace failed)/i.test(out);
      if (infrastructureFailure) {
        const detail = out || error?.message || "Sandbox runner could not start.";
        const blockReason = detail.startsWith("SANDBOX UNAVAILABLE:")
          ? detail
          : `SANDBOX UNAVAILABLE: ${detail}`;
        writeAuditLog({ id: auditId, command, cwd, riskLevel, blocked: true, blockReason, durationMs, outputBytes: blockReason.length });
        resolve({
          output: blockReason,
          exitCode: 125,
          sandboxed: false,
          isolated: false,
          backend: backend.kind,
          riskLevel,
          blocked: true,
          blockReason,
          durationMs,
          auditId,
        });
        return;
      }

      const exitCode = error ? (error.status ?? error.code ?? 1) : 0;
      writeAuditLog({ id: auditId, command, cwd, riskLevel, blocked: false, durationMs, outputBytes: out.length });

      resolve({
        output: out || "Command succeeded with no output.",
        exitCode: typeof exitCode === "number" ? exitCode : 1,
        sandboxed: true,
        isolated: backend.isolated,
        backend: backend.kind,
        riskLevel,
        blocked: false,
        durationMs,
        auditId,
      });
    });
  });
}
