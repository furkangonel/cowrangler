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
 *
 * Sandbox, bir "hard isolation" değildir (container/VM yok) ama
 * pattern-based + path-based + resource-based korumayla enterprise
 * ortamlarda yeterli güvenlik sağlar.
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { analyzeBashRisk, RiskLevel } from "./permissions.js";

export interface SandboxConfig {
  enabled: boolean;
  workspaceRoot: string;
  maxOutputBytes: number;   // default: 512KB
  maxTimeoutMs: number;     // default: 30s
  networkRestricted: boolean;
  auditLogPath?: string;    // undefined = no audit log
  allowedPaths: string[];   // explicit allowlist (beyond workspaceRoot)
  blockedBinaries: string[]; // always blocked regardless of mode
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
};

let _config: SandboxConfig = { ...DEFAULT_CONFIG };

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

  // Workspace root içinde mi?
  if (resolved.startsWith(workspaceResolved)) return true;

  // Açıkça izin verilmiş path'lerde mi?
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
    const re = new RegExp(`(^|[;|&\\s])${bin}(\\s|$)`);
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
    // Audit log yazılamasa bile işlemi engelleme
  }
}

/**
 * runInSandbox — Ana sandbox çalıştırma fonksiyonu.
 *
 * Sandbox devre dışıysa doğrudan çalıştırır.
 * Aktifse: statik analiz → path kontrolü → kaynak limiti → audit log.
 */
export function runInSandbox(
  command: string,
  cwd: string,
  timeoutMs?: number,
): SandboxResult {
  const start = Date.now();
  const auditId = `sbox-${Date.now()}-${++_auditCounter}`;

  const effectiveTimeout = Math.min(
    timeoutMs ?? _config.maxTimeoutMs,
    _config.maxTimeoutMs,
  );

  // ── 1. Risk analizi ────────────────────────────────────────────────────────
  const riskLevel = analyzeBashRisk(command);

  // ── 2. Sandbox kapalıysa direkt çalıştır ──────────────────────────────────
  if (!_config.enabled) {
    try {
      const output = execSync(command, {
        cwd,
        encoding: "utf-8",
        timeout: effectiveTimeout,
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: _config.maxOutputBytes,
      });
      const durationMs = Date.now() - start;
      return {
        output: output.trim(),
        exitCode: 0,
        sandboxed: false,
        riskLevel,
        blocked: false,
        durationMs,
      };
    } catch (e: any) {
      const durationMs = Date.now() - start;
      const out = [e.stdout?.toString().trim(), e.stderr?.toString().trim()]
        .filter(Boolean)
        .join("\n");
      return {
        output: out || e.message,
        exitCode: e.status ?? 1,
        sandboxed: false,
        riskLevel,
        blocked: false,
        durationMs,
      };
    }
  }

  // ── 3. Critical pattern blocker ────────────────────────────────────────────
  if (riskLevel === "critical") {
    const durationMs = Date.now() - start;
    const blockReason = `SANDBOX BLOCKED: Critical destructive pattern detected in command. This operation is permanently blocked.`;
    writeAuditLog({ id: auditId, command, cwd, riskLevel, blocked: true, blockReason, durationMs, outputBytes: 0 });
    return { output: blockReason, exitCode: 1, sandboxed: true, riskLevel, blocked: true, blockReason, durationMs, auditId };
  }

  // ── 4. Blocked binary check ────────────────────────────────────────────────
  const blockedBin = containsBlockedBinary(command);
  if (blockedBin) {
    const durationMs = Date.now() - start;
    const blockReason = `SANDBOX BLOCKED: Binary '${blockedBin}' is not allowed in sandbox mode.`;
    writeAuditLog({ id: auditId, command, cwd, riskLevel, blocked: true, blockReason, durationMs, outputBytes: 0 });
    return { output: blockReason, exitCode: 1, sandboxed: true, riskLevel, blocked: true, blockReason, durationMs, auditId };
  }

  // ── 5. Network restriction ─────────────────────────────────────────────────
  if (_config.networkRestricted && containsNetworkCommand(command)) {
    const durationMs = Date.now() - start;
    const blockReason = `SANDBOX BLOCKED: Network commands are restricted in this sandbox configuration.`;
    writeAuditLog({ id: auditId, command, cwd, riskLevel, blocked: true, blockReason, durationMs, outputBytes: 0 });
    return { output: blockReason, exitCode: 1, sandboxed: true, riskLevel, blocked: true, blockReason, durationMs, auditId };
  }

  // ── 6. Path check ──────────────────────────────────────────────────────────
  if (!isPathAllowed(cwd)) {
    const durationMs = Date.now() - start;
    const blockReason = `SANDBOX BLOCKED: Working directory '${cwd}' is outside the allowed sandbox paths.`;
    writeAuditLog({ id: auditId, command, cwd, riskLevel, blocked: true, blockReason, durationMs, outputBytes: 0 });
    return { output: blockReason, exitCode: 1, sandboxed: true, riskLevel, blocked: true, blockReason, durationMs, auditId };
  }

  // ── 7. Execute with resource limits ───────────────────────────────────────
  try {
    const output = execSync(command, {
      cwd,
      encoding: "utf-8",
      timeout: effectiveTimeout,
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: _config.maxOutputBytes,
    });

    const trimmed = output.trim();
    const durationMs = Date.now() - start;

    writeAuditLog({
      id: auditId, command, cwd, riskLevel, blocked: false,
      durationMs, outputBytes: trimmed.length,
    });

    return {
      output: trimmed || "Command succeeded with no output.",
      exitCode: 0,
      sandboxed: true,
      riskLevel,
      blocked: false,
      durationMs,
      auditId,
    };
  } catch (e: any) {
    const durationMs = Date.now() - start;
    const stdout = e.stdout?.toString().trim() || "";
    const stderr = e.stderr?.toString().trim() || "";
    const out = [stdout, stderr].filter(Boolean).join("\n") || e.message;

    if (e.code === "ETIMEDOUT") {
      const blockReason = `SANDBOX TIMEOUT: Command exceeded ${effectiveTimeout}ms limit.`;
      writeAuditLog({ id: auditId, command, cwd, riskLevel, blocked: true, blockReason, durationMs, outputBytes: 0 });
      return { output: blockReason, exitCode: 124, sandboxed: true, riskLevel, blocked: true, blockReason, durationMs, auditId };
    }

    writeAuditLog({ id: auditId, command, cwd, riskLevel, blocked: false, durationMs, outputBytes: out.length });

    return {
      output: `COMMAND FAILED:\n${out}`,
      exitCode: e.status ?? 1,
      sandboxed: true,
      riskLevel,
      blocked: false,
      durationMs,
      auditId,
    };
  }
}
