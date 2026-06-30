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

import { exec } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { analyzeBashRisk, RiskLevel } from "./permissions.js";

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
}

export interface SandboxResult {
  output: string;
  exitCode: number;
  sandboxed: boolean;
  riskLevel: RiskLevel;
  blocked: boolean;
  blockReason?: string;
  durationMs: number;
  auditId?: string;
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
  workspaceRoot: process.cwd(),
  maxOutputBytes: 512 * 1024,  // 512KB
  maxTimeoutMs: 30_000,         // 30s
  networkRestricted: false,
  allowedPaths: [os.homedir(), "/tmp", "/var/tmp"],
  blockedBinaries: DEFAULT_BLOCKED_BINARIES,
  provider: "auto",
};

let _config: SandboxConfig = { ...DEFAULT_CONFIG };

const GLOBAL_BUNDLE_PATH = path.join(os.homedir(), ".cowrangler", "cowrangler-sandbox.bundle");

/**
 * Sandboxing paketini dinamik dizinlerde bulur ve gerekirse kullanıcının ana dizinine kopyalar.
 */
export function ensureBundle(): string {
  if (fs.existsSync(GLOBAL_BUNDLE_PATH)) {
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
  ];

  for (const localPath of possiblePaths) {
    if (fs.existsSync(localPath)) {
      try {
        fs.mkdirSync(path.dirname(GLOBAL_BUNDLE_PATH), { recursive: true });
        fs.cpSync(localPath, GLOBAL_BUNDLE_PATH, { recursive: true });
        
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

  // Electron resources path control
  // @ts-ignore
  if (process.resourcesPath) {
    // @ts-ignore
    const electronPath = path.join(process.resourcesPath, "cowrangler-sandbox.bundle");
    if (fs.existsSync(electronPath)) {
      return electronPath;
    }
  }

  return GLOBAL_BUNDLE_PATH;
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

  if (resolved.startsWith(workspaceResolved)) return true;

  for (const allowed of _config.allowedPaths) {
    if (resolved.startsWith(path.resolve(allowed))) return true;
  }

  return false;
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

  // ── 1. Sandbox kapalıysa direkt asenkron çalıştır ──────────────────────────
  if (!_config.enabled) {
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
    return Promise.resolve({ output: blockReason, exitCode: 1, sandboxed: true, riskLevel, blocked: true, blockReason, durationMs, auditId });
  }

  // ── 3. Blocked binary check ────────────────────────────────────────────────
  const blockedBin = containsBlockedBinary(command);
  if (blockedBin) {
    const durationMs = Date.now() - start;
    const blockReason = `SANDBOX BLOCKED: Binary '${blockedBin}' is not allowed in sandbox mode.`;
    writeAuditLog({ id: auditId, command, cwd, riskLevel, blocked: true, blockReason, durationMs, outputBytes: 0 });
    return Promise.resolve({ output: blockReason, exitCode: 1, sandboxed: true, riskLevel, blocked: true, blockReason, durationMs, auditId });
  }

  // ── 4. Network restriction ─────────────────────────────────────────────────
  if (_config.networkRestricted && containsNetworkCommand(command)) {
    const durationMs = Date.now() - start;
    const blockReason = `SANDBOX BLOCKED: Network commands are restricted in this sandbox configuration.`;
    writeAuditLog({ id: auditId, command, cwd, riskLevel, blocked: true, blockReason, durationMs, outputBytes: 0 });
    return Promise.resolve({ output: blockReason, exitCode: 1, sandboxed: true, riskLevel, blocked: true, blockReason, durationMs, auditId });
  }

  // ── 5. Path check ──────────────────────────────────────────────────────────
  if (!isPathAllowed(cwd)) {
    const durationMs = Date.now() - start;
    const blockReason = `SANDBOX BLOCKED: Working directory '${cwd}' is outside the allowed sandbox paths.`;
    writeAuditLog({ id: auditId, command, cwd, riskLevel, blocked: true, blockReason, durationMs, outputBytes: 0 });
    return Promise.resolve({ output: blockReason, exitCode: 1, sandboxed: true, riskLevel, blocked: true, blockReason, durationMs, auditId });
  }

  // ── 6. Execute via Bundle Runner (Asenkron & Non-blocking) ─────────────────
  const bundlePath = ensureBundle();
  const provider = _config.provider ?? "auto";
  const networkRestrictedStr = _config.networkRestricted ? "true" : "false";

  let runCmd = "";
  if (process.platform === "win32") {
    const runnerPath = path.join(bundlePath, "Contents", "Resources", "scripts", "runner.ps1");
    const providerArg = provider === "docker" ? "docker" : "fallback";
    runCmd = `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${runnerPath}" -Provider "${providerArg}" -Cwd "${cwd}" -NetworkRestricted "${networkRestrictedStr}" -Command ${JSON.stringify(command)}`;
  } else {
    const runnerPath = path.join(bundlePath, "Contents", "Resources", "scripts", "runner.sh");
    const providerArg = provider === "docker" ? "docker" : (process.platform === "darwin" ? "mac_seatbelt" : "linux_bwrap");
    runCmd = `bash "${runnerPath}" "${providerArg}" "${cwd}" "${networkRestrictedStr}" ${JSON.stringify(command)}`;
  }

  return new Promise<SandboxResult>((resolve) => {
    exec(runCmd, {
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
        resolve({ output: blockReason, exitCode: 124, sandboxed: true, riskLevel, blocked: true, blockReason, durationMs, auditId });
        return;
      }

      const exitCode = error ? (error.status ?? error.code ?? 1) : 0;
      writeAuditLog({ id: auditId, command, cwd, riskLevel, blocked: false, durationMs, outputBytes: out.length });

      resolve({
        output: out || "Command succeeded with no output.",
        exitCode: typeof exitCode === "number" ? exitCode : 1,
        sandboxed: true,
        riskLevel,
        blocked: false,
        durationMs,
        auditId,
      });
    });
  });
}
