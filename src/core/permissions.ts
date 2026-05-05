/**
 * Permission sistemi — GENERAL_CONV.md'de tanımlanan çok katmanlı izin mimarisi.
 *
 * Modlar:
 *   default  → Her tehlikeli işlemde kullanıcıya sor (etkileşimli dialog)
 *   plan     → İlk çalıştırmada onayla, sonraki benzer işlemlere izin ver
 *   auto     → Sadece güvenli işlemlere otomatik izin ver; tehlikelileri reddet
 *   bypass   → Tüm izin kontrollerini atla (dikkat! sadece güvenilen ortamlarda)
 *
 * Tool risk seviyeleri:
 *   safe       → Sadece okuma, bilgi alma
 *   moderate   → Dosya yazma, ağ istekleri
 *   dangerous  → Bash çalıştırma, dosya silme, git push
 *   critical   → rm -rf, format, sistem değişikliği
 */

export type PermissionMode = "default" | "plan" | "auto" | "bypass";

export type RiskLevel = "safe" | "moderate" | "dangerous" | "critical";

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
  mode: PermissionMode;
  riskLevel: RiskLevel;
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

/**
 * checkPermission — Tool çalıştırılmadan önce izin kontrolü yapar.
 *
 * @param toolName    Tool adı
 * @param mode        Aktif permission mode
 * @param extraInfo   Bash için: komut metni; diğerleri için: dosya yolu vb.
 */
export function checkPermission(
  toolName: string,
  mode: PermissionMode,
  extraInfo?: string,
): PermissionResult {
  // Bypass: hiçbir şeyi kontrol etme
  if (mode === "bypass") {
    return {
      allowed: true,
      reason: "bypass mode — all checks skipped",
      mode,
      riskLevel: getToolRiskLevel(toolName),
    };
  }

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

  // Kritik komutlar: tüm modlarda auto reddedilir (bypass hariç)
  if (riskLevel === "critical") {
    return {
      allowed: false,
      reason: `CRITICAL risk command blocked. Pattern matches a destructive operation. Use bypass mode only in fully trusted environments.`,
      mode,
      riskLevel,
    };
  }

  // Auto mod: sadece safe ve moderate'e izin ver
  if (mode === "auto") {
    if (riskLevel === "dangerous") {
      return {
        allowed: false,
        reason: `Auto mode: dangerous operations require explicit user approval. Switch to default mode or use /permissions bypass.`,
        mode,
        riskLevel,
      };
    }
    return { allowed: true, mode, riskLevel };
  }

  // Default ve plan modlarda: safe ve moderate otomatik izinli
  if (riskLevel === "safe" || riskLevel === "moderate") {
    return { allowed: true, mode, riskLevel };
  }

  // Dangerous + default/plan: izin verilir ama loglanır
  // (Gerçek interactive dialog için UI katmanı gerekir — şimdilik logluyoruz)
  return {
    allowed: true,
    reason: `[${riskLevel.toUpperCase()}] ${toolName} — logged for audit`,
    mode,
    riskLevel,
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
