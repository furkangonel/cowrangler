/**
 * Permission sistemi — WP-7'de tanımlanan çok katmanlı izin mimarisi.
 *
 * Modlar (WP-7 dört mod):
 *   ask     → Her yıkıcı işlemde kullanıcıya sor (etkileşimli dialog). ("default" alias)
 *   accept  → Geri-alınabilir düzenlemeleri otomatik kabul et (diff göster);
 *             yalnızca geri-alınamaz / dış-etkili işlemlerde sor.
 *   plan    → İlk çalıştırmada onayla, sonraki benzer işlemlere izin ver.
 *   auto    → Üç katman: (1) risk sınıflandırıcı, (2) zorunlu sandbox,
 *             (3) otomatik checkpoint. Onay yalnızca geri-alınamaz veya
 *             dış-etkili işlemlerde; gerisi otomatik + geri-alınabilir akar.
 *   bypass  → Tüm izin kontrollerini atla (dikkat! sadece güvenilen ortamlarda).
 *
 * Tool risk seviyeleri:
 *   safe       → Sadece okuma, bilgi alma
 *   moderate   → Dosya yazma, ağ istekleri
 *   dangerous  → Bash çalıştırma, dosya silme, git push
 *   critical   → rm -rf, format, sistem değişikliği
 *
 * Eylem sınıfı (WP-7 katman 1 — geri-alınabilirlik ekseni):
 *   readonly       → durumu değiştirmez (checkpoint gerekmez)
 *   reversible     → checkpoint + sandbox ile geri alınabilir (workspace içi)
 *   irreversible   → geri-alınamaz veya dış-etkili → onay gerekir
 */

import path from "path";
import { getProjectWorkdir } from "./project_context.js";
import { getConfig } from "./init.js";

export type PermissionMode = "ask" | "accept" | "plan" | "auto" | "bypass" | "default";

export type RiskLevel = "safe" | "moderate" | "dangerous" | "critical";

/** WP-7 katman 1 — geri-alınabilirlik ekseninde eylem sınıfı. */
export type ActionClass = "readonly" | "reversible" | "irreversible";

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
  mode: PermissionMode;
  riskLevel: RiskLevel;
  requiresApproval?: boolean;
  /** WP-7 katman 1 — eylemin geri-alınabilirlik sınıfı. */
  actionClass?: ActionClass;
  /** Dış-etkili mi? (git push, dış API, ödeme, workspace-dışı yazma) */
  externalEffect?: boolean;
  /** WP-7 katman 2 — bu eylem izole/sandbox'ta çalıştırılmalı mı? */
  useSandbox?: boolean;
}

// Tehlikeli bash pattern'leri — otomatik olarak reddedilir veya kullanıcıya sorulur
const CRITICAL_PATTERNS = [
  /rm\s+-rf?\s+\//,              // rm -rf /
  /rm\s+-rf?\s+~\//,             // rm -rf ~/
  /\bdd\s+if=/,                  // disk overwrite
  /\bmkfs\b/,                    // format disk
  /\bfdisk\b/,                   // partition tool
  />\s*\/dev\/(sd|hd|nvme)/,     // write to block device
  /\bchmod\s+-R\s+777\s+\//,    // recursive 777 on root
  /\bsudo\s+rm\s+-rf/,           // sudo rm -rf
  /shutdown|reboot|halt/,        // system shutdown
  /\bpasswd\b.*--delete/,        // delete passwords
  /:(){:|:&};:/,                  // fork bomb
];

const DANGEROUS_PATTERNS = [
  /rm\s+-rf/,                    // recursive delete
  /git\s+push\s+.*--force/,      // force push
  /git\s+reset\s+--hard/,        // hard reset
  /\bnpm\s+publish\b/,           // publish package
  /\bcurl\b.*\|\s*bash/,         // curl pipe bash
  /\bwget\b.*\|\s*sh/,           // wget pipe sh
  /\beval\s*\(/,                 // eval execution
  /\bsudo\b/,                    // sudo
  /\bchmod\s+-R/,                // recursive chmod
  /\bchown\s+-R/,                // recursive chown
  /\bdropdb\b|\bdrop\s+database/i, // database drop
  /\btruncate\b.*--whole-file/,  // file truncation
];

// Tool'ların risk seviyeleri
const TOOL_RISK_MAP: Record<string, RiskLevel> = {
  // Güvenli — sadece okuma
  list_files: "safe",
  read_file: "safe",
  file_info: "safe",
  glob_files: "safe",
  search_in_files: "safe",
  get_current_time: "safe",
  get_system_info: "safe",
  which_command: "safe",
  git_status: "safe",
  git_log: "safe",
  git_diff: "safe",
  fetch_webpage: "safe",
  web_search: "safe",
  utilize_skill: "safe",

  // Orta risk — yazma/ağ
  write_file: "moderate",
  append_to_file: "moderate",
  edit_file: "moderate",
  copy_file: "moderate",
  move_item: "moderate",
  create_folder: "moderate",
  create_pdf: "moderate",
  git_add: "moderate",
  git_commit: "moderate",
  manage_todo: "moderate",
  send_message: "safe",

  // Tehlikeli — sistem değişikliği
  execute_bash: "dangerous",
  delete_file: "dangerous",
  delete_folder: "dangerous",
  git_push: "dangerous",
  git_checkout: "dangerous",
  spawn_subagent: "moderate",

  // Kritik — geri alınamaz
  sleep: "safe",
};

export function getToolRiskLevel(toolName: string): RiskLevel {
  return TOOL_RISK_MAP[toolName] ?? "moderate";
}

export function analyzeBashRisk(command: string): RiskLevel {
  for (const pattern of CRITICAL_PATTERNS) {
    if (pattern.test(command)) return "critical";
  }
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) return "dangerous";
  }
  return "moderate";
}

// ─────────────────────────────────────────────────────────────────────────────
// WP-7 — Eylem sınıflandırma (katman 1) + dış-etki tespiti
// ─────────────────────────────────────────────────────────────────────────────

/** Dış-etkili tool'lar: onay her modda (bypass hariç) zorunlu. */
const EXTERNAL_EFFECT_TOOLS = new Set<string>([
  "git_push",     // uzak repo'ya yazar — geri-alınamaz, dış
]);

// Bash içinde dış-etkili (uzak/ağ/yayın) desenleri.
const EXTERNAL_BASH_PATTERNS = [
  /git\s+push\b/,                 // uzak repo
  /\bnpm\s+publish\b/,            // paket yayını
  /\byarn\s+publish\b/,
  /\bpnpm\s+publish\b/,
  /\bcurl\b.*\|\s*(ba)?sh/,       // curl | bash
  /\bwget\b.*\|\s*(ba)?sh/,       // wget | sh
  /\bssh\b/,                      // uzak makine
  /\bscp\b|\brsync\b.*::?/,       // uzak kopyalama
  /\bgh\s+(pr|release)\b/,        // GitHub CLI: PR/release
  /\bdocker\s+push\b/,            // registry push
];

/** Bir yolun aktif workspace kökü içinde olup olmadığını döndürür. */
export function isInsideWorkspace(p: string | undefined): boolean {
  if (!p) return true; // yol yoksa varsayılan güvenli taraf (workspace içi kabul)
  const root = path.resolve(getProjectWorkdir());
  const abs = path.resolve(root, p);
  const rel = path.relative(root, abs);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * isExternalEffect — eylem workspace dışına / dış dünyaya etki ediyor mu?
 * git push, paket yayını, uzak makine, ağ üzerinden kod çalıştırma vb.
 */
export function isExternalEffect(toolName: string, extraInfo?: string): boolean {
  if (EXTERNAL_EFFECT_TOOLS.has(toolName)) return true;
  if (toolName === "execute_bash" && extraInfo) {
    return EXTERNAL_BASH_PATTERNS.some((re) => re.test(extraInfo));
  }
  return false;
}

// Salt-okunur tool'lar — durumu değiştirmez.
const READONLY_TOOLS = new Set<string>([
  "list_files", "read_file", "file_info", "glob_files", "search_in_files",
  "get_current_time", "get_system_info", "which_command",
  "git_status", "git_log", "git_diff",
  "fetch_webpage", "web_search", "utilize_skill", "sleep", "send_message",
]);

// Checkpoint ile geri-alınabilen workspace-içi mutasyon tool'ları.
const REVERSIBLE_TOOLS = new Set<string>([
  "write_file", "append_to_file", "edit_file", "apply_patch",
  "copy_file", "move_item", "create_folder", "create_pdf",
  "git_add", "git_commit", "manage_todo", "spawn_subagent",
]);

// Geri-alınamayan tool'lar (git geçmişini/çalışma kopyasını kalıcı bozar).
const IRREVERSIBLE_TOOLS = new Set<string>([
  "git_push",       // uzak — geri alınamaz
  "git_checkout",   // takip edilmeyen değişiklikleri kaybettirebilir
]);

/**
 * classifyAction — WP-7 katman 1. Bir eylemi geri-alınabilirlik ekseninde
 * sınıflar. Sandbox (katman 2) ve checkpoint (katman 3) kararları buna dayanır.
 */
export function classifyAction(toolName: string, extraInfo?: string): ActionClass {
  // Dış-etki her zaman geri-alınamaz sayılır.
  if (isExternalEffect(toolName, extraInfo)) return "irreversible";

  if (IRREVERSIBLE_TOOLS.has(toolName)) return "irreversible";
  if (READONLY_TOOLS.has(toolName)) return "readonly";

  // Silme: workspace içi → checkpoint geri alır (reversible);
  //        workspace dışı → geri-alınamaz.
  if (toolName === "delete_file" || toolName === "delete_folder") {
    return isInsideWorkspace(extraInfo) ? "reversible" : "irreversible";
  }

  if (REVERSIBLE_TOOLS.has(toolName)) {
    // Yol verilmişse ve workspace dışına yazıyorsa geri-alınamaz.
    return isInsideWorkspace(extraInfo) ? "reversible" : "irreversible";
  }

  // Bash: risk seviyesine göre. moderate → reversible (sandbox'ta çalışır),
  //       dangerous/critical → irreversible (onay ister).
  if (toolName === "execute_bash") {
    const risk = extraInfo ? analyzeBashRisk(extraInfo) : "moderate";
    return risk === "moderate" ? "reversible" : "irreversible";
  }

  // Bilinmeyen tool: temkinli — reversible varsay (sandbox'a düşer).
  return "reversible";
}

/**
 * normalizePermissionMode — geriye-dönük uyumluluk. Eski "default" adı "ask"a
 * eşlenir; bilinmeyen değerler güvenli varsayılan "ask"a düşer.
 */
export function normalizePermissionMode(mode: string | undefined): PermissionMode {
  switch (mode) {
    case "ask":
    case "default":
      return "ask";
    case "accept":
    case "plan":
    case "auto":
    case "bypass":
      return mode;
    default:
      return "ask";
  }
}

/**
 * checkPermission — Tool çalıştırılmadan önce izin kontrolü yapar.
 *
 * @param toolName    Tool adı
 * @param mode        Aktif permission mode
 * @param extraInfo   Bash için: komut metni; diğerleri için: dosya yolu vb.
 */
function matchesPattern(command: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (!pattern) continue;
    // Substring match case-insensitive
    if (command.toLowerCase().includes(pattern.toLowerCase())) return true;
    // Regex match case-insensitive
    try {
      const regex = new RegExp(pattern, "i");
      if (regex.test(command)) return true;
    } catch {
      // ignore invalid regex
    }
  }
  return false;
}

export interface PermissionPolicy {
  allow?: string[];
  deny?: string[];
  alwaysAskDestructive?: boolean;
}

export function checkPermission(
  toolName: string,
  rawMode: PermissionMode,
  extraInfo?: string,
  policy?: PermissionPolicy,
): PermissionResult {
  const mode = normalizePermissionMode(rawMode);

  // Read policy from config as fallback
  let config: any = {};
  try {
    config = getConfig() || {};
  } catch {
    // best-effort
  }
  const allowPatterns: string[] = policy?.allow ?? (Array.isArray(config["permissions.allow"]) ? config["permissions.allow"] : []);
  const denyPatterns: string[] = policy?.deny ?? (Array.isArray(config["permissions.deny"]) ? config["permissions.deny"] : []);
  const alwaysAskDestructive = policy?.alwaysAskDestructive ?? (config["permissions.alwaysAskDestructive"] !== false);

  // Bash için ekstra risk analizi
  let riskLevel = getToolRiskLevel(toolName);
  if (toolName === "execute_bash" && extraInfo) {
    const bashRisk = analyzeBashRisk(extraInfo);
    // En yüksek riski al
    if (bashRisk === "critical" || riskLevel === "critical") {
      riskLevel = "critical";
    } else if (bashRisk === "dangerous" || riskLevel === "dangerous") {
      riskLevel = "dangerous";
    }
  }

  const actionClass = classifyAction(toolName, extraInfo);
  const externalEffect = isExternalEffect(toolName, extraInfo);
  // Katman 2: readonly dışı her şey izole çalışır.
  const useSandbox = actionClass !== "readonly";

  // 1. Deny list check first
  if (toolName === "execute_bash" && extraInfo && matchesPattern(extraInfo, denyPatterns)) {
    return {
      allowed: false,
      reason: `Blocked by deny pattern: "${extraInfo}" matches denylist.`,
      mode,
      riskLevel,
      actionClass,
      externalEffect,
    };
  }

  // Bypass: hiçbir şeyi kontrol etme
  if (mode === "bypass") {
    return {
      allowed: true,
      reason: "bypass mode — all checks skipped",
      mode,
      riskLevel,
    };
  }

  // 2. Kritik komutlar: tüm modlarda reddedilir (bypass hariç). Desen bazlı
  // yıkıcı komutlar (rm -rf /, mkfs, fork bomb) sandbox olsa bile engellenir.
  if (riskLevel === "critical") {
    return {
      allowed: false,
      reason: `CRITICAL risk command blocked. Pattern matches a destructive operation. Use bypass mode only in fully trusted environments.`,
      mode,
      riskLevel,
      actionClass,
      externalEffect,
    };
  }

  // 3. Allow list check - only for non-critical, reversible/readonly actions
  const isNonCriticalReversible = actionClass !== "irreversible" && !externalEffect;
  if (toolName === "execute_bash" && extraInfo && matchesPattern(extraInfo, allowPatterns)) {
    if (isNonCriticalReversible) {
      return {
        allowed: true,
        reason: `Allowed by allow pattern: "${extraInfo}" matches allowlist.`,
        mode,
        riskLevel,
        actionClass,
        externalEffect,
        useSandbox,
      };
    }
  }

  // ── WP-7 Auto mode — üç katman ──────────────────────────────────────────
  // Katman 1 (sınıflandırma) + katman 2 (sandbox) + katman 3 (checkpoint,
  // file_tools/beforeMutation ile). Onay YALNIZCA geri-alınamaz veya
  // dış-etkili işlemlerde; readonly/reversible otomatik + geri-alınabilir akar.
  if (mode === "auto") {
    if (alwaysAskDestructive && (actionClass === "irreversible" || externalEffect)) {
      return {
        allowed: false,
        requiresApproval: true,
        reason: externalEffect
          ? `Auto mode: external-effect operation (${toolName}) requires approval — cannot be rolled back.`
          : `Auto mode: irreversible operation (${toolName}) requires approval.`,
        mode,
        riskLevel,
        actionClass,
        externalEffect,
        useSandbox,
      };
    }
    // readonly / reversible → otomatik izin (reversible sandbox'ta koşar).
    return { allowed: true, mode, riskLevel, actionClass, externalEffect, useSandbox };
  }

  // ── WP-7 Accept mode — düzenlemeleri otomatik kabul, diff göster ─────────
  // Geri-alınabilir düzenlemeler onaysız akar; geri-alınamaz/dış işlemler sorar.
  if (mode === "accept") {
    if (actionClass === "readonly") {
      return { allowed: true, mode, riskLevel, actionClass, externalEffect, useSandbox };
    }
    if (actionClass === "reversible" && !externalEffect) {
      return { allowed: true, mode, riskLevel, actionClass, externalEffect, useSandbox };
    }
    if (!alwaysAskDestructive) {
      return { allowed: true, mode, riskLevel, actionClass, externalEffect, useSandbox };
    }
    return {
      allowed: false,
      requiresApproval: true,
      reason: `[${riskLevel.toUpperCase()}] ${toolName} is irreversible/external — requires approval in accept mode.`,
      mode,
      riskLevel,
      actionClass,
      externalEffect,
      useSandbox,
    };
  }

  // ── Ask ve Plan modları ─────────────────────────────────────────────────
  // safe/readonly otomatik izinli.
  if (riskLevel === "safe") {
    return { allowed: true, mode, riskLevel, actionClass, externalEffect, useSandbox };
  }

  // Moderate ve Dangerous + ask/plan: kullanıcı onayı iste.
  return {
    allowed: false,
    requiresApproval: true,
    reason: `[${riskLevel.toUpperCase()}] ${toolName} requires explicit user approval.`,
    mode,
    riskLevel,
    actionClass,
    externalEffect,
    useSandbox,
  };
}

/**
 * Kullanıcıya gösterilecek risk badge'i
 */
export function riskBadge(level: RiskLevel): string {
  switch (level) {
    case "safe":      return "✓";
    case "moderate":  return "◎";
    case "dangerous": return "⚠";
    case "critical":  return "✗";
  }
}

/**
 * Risk seviyesinin rengini döndürür (chalk hex kodu)
 */
export function riskColor(level: RiskLevel): string {
  switch (level) {
    case "safe":      return "#A5C27C";
    case "moderate":  return "#F8F2E5";
    case "dangerous": return "#FF9500";
    case "critical":  return "#D62926";
  }
}
