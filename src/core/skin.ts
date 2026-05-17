/**
 * Skin/Tema Motoru — YAML tabanlı görsel özelleştirme.
 *
 * Skin dosyaları: ~/.cowrangler/skins/<name>.yaml
 *
 * Özelleştirilebilen unsurlar:
 *   - Renk paleti (banner, prompt, vb.)
 *   - Spinner yüzleri ve fiilleri
 *   - Tool emoji eşleştirmeleri
 *   - Marka adı ve hoş geldiniz mesajı
 *   - Prompt sembolü
 *
 * Built-in skin'ler: default | mono | slate | matrix
 * Kullanıcı skin'i: /skin <name> → ~/.cowrangler/skins/<name>.yaml
 */

import fs from "fs";
import path from "path";
import os from "os";
import { DIRS } from "./init.js";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface SkinColors {
  /** Banner/başlık kenarlık rengi (hex veya named) */
  bannerBorder?: string;
  /** Banner başlık rengi */
  bannerTitle?: string;
  /** Prompt sembolü rengi */
  promptSymbol?: string;
  /** Kullanıcı girdisi rengi */
  userInput?: string;
  /** Araç çağrısı rengi */
  toolCall?: string;
  /** Başarı mesajı rengi */
  success?: string;
  /** Hata rengi */
  error?: string;
  /** Uyarı rengi */
  warning?: string;
  /** Dim/soluk metin rengi */
  dim?: string;
  /** Status bar rengi (normal) */
  statusBar?: string;
}

export interface SkinSpinner {
  /** Düşünme aşaması yüzleri */
  thinkingFaces?: string[];
  /** Araç çağrısı yüzleri */
  toolFaces?: string[];
  /** Düşünme fiilleri */
  thinkingVerbs?: string[];
  /** Kanatlar — [left, right] çiftleri */
  wings?: [string, string][];
}

export interface SkinBranding {
  /** Agent görüntü adı */
  agentName?: string;
  /** Hoş geldiniz mesajı */
  welcome?: string;
  /** Prompt sembolü */
  promptSymbol?: string;
  /** Banner ASCII art (satır dizisi) */
  banner?: string[];
}

export interface SkinConfig {
  name: string;
  description?: string;
  colors?: SkinColors;
  spinner?: SkinSpinner;
  branding?: SkinBranding;
  /** Tool adı → emoji eşleştirmesi */
  toolEmojis?: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILT-IN SKINS
// ─────────────────────────────────────────────────────────────────────────────

const BUILTIN_SKINS: Record<string, SkinConfig> = {
  default: {
    name: "default",
    description: "Co-wrangler varsayılan teması — mor/beyaz",
    colors: {
      bannerBorder: "#8B5CF6",
      bannerTitle: "#A78BFA",
      promptSymbol: "#8B5CF6",
      userInput: "#E5E7EB",
      toolCall: "#60A5FA",
      success: "#34D399",
      error: "#F87171",
      warning: "#FBBF24",
      statusBar: "#6B7280",
    },
    spinner: {
      thinkingFaces: ["(°▽°)", "(^‿^)", "(◕‿◕)", "(≧◡≦)", "(✿◠‿◠)"],
      toolFaces: ["[⚙]", "[▶]", "[◈]", "[◆]", "[▸]"],
      thinkingVerbs: [
        "thinking", "planning", "analyzing", "reasoning", "processing",
        "considering", "evaluating", "computing", "synthesizing",
      ],
      wings: [["< ", " >"], ["[ ", " ]"], ["{ ", " }"]],
    },
    branding: {
      agentName: "Co-Wrangler",
      welcome: "Ready to wrangle your code and files.",
      promptSymbol: "❯",
    },
    toolEmojis: {
      read_file: "📄", write_file: "✏️", edit_file: "🔧",
      execute_bash: "💻", web_search: "🔍", fetch_webpage: "🌐",
      git_status: "🔀", git_commit: "📦",
      send_message: "💬", utilize_skill: "📚",
      read_pdf: "📑", read_docx: "📝", read_xlsx: "📊",
    },
  },

  mono: {
    name: "mono",
    description: "Gri tonlamalı minimal tema",
    colors: {
      bannerBorder: "#6B7280",
      bannerTitle: "#9CA3AF",
      promptSymbol: "#9CA3AF",
      userInput: "#E5E7EB",
      toolCall: "#9CA3AF",
      success: "#D1D5DB",
      error: "#9CA3AF",
      warning: "#D1D5DB",
      statusBar: "#4B5563",
    },
    spinner: {
      thinkingFaces: ["[·]", "[·.]", "[·..]", "[·...]", "[·..]", "[·.]"],
      toolFaces: ["[>]", "[>>]", "[>>>]", "[>>]", "[>]"],
      thinkingVerbs: ["processing", "running", "computing", "executing"],
      wings: [["[ ", " ]"]],
    },
    branding: {
      agentName: "co-wrangler",
      welcome: "Ready.",
      promptSymbol: ">",
    },
  },

  slate: {
    name: "slate",
    description: "Soğuk mavi geliştirici teması",
    colors: {
      bannerBorder: "#3B82F6",
      bannerTitle: "#60A5FA",
      promptSymbol: "#3B82F6",
      userInput: "#E2E8F0",
      toolCall: "#38BDF8",
      success: "#4ADE80",
      error: "#F87171",
      warning: "#FB923C",
      statusBar: "#475569",
    },
    spinner: {
      thinkingFaces: ["◌", "◎", "●", "◎", "◌"],
      toolFaces: ["▷", "▶", "▷", "▶", "▷"],
      thinkingVerbs: ["analyzing", "wrangling", "processing", "resolving", "computing"],
      wings: [["‹ ", " ›"], ["« ", " »"]],
    },
    branding: {
      agentName: "Co-Wrangler",
      welcome: "Slate mode — developer focused.",
      promptSymbol: "❯",
    },
  },

  matrix: {
    name: "matrix",
    description: "Yeşil terminal matrix teması",
    colors: {
      bannerBorder: "#22C55E",
      bannerTitle: "#4ADE80",
      promptSymbol: "#22C55E",
      userInput: "#86EFAC",
      toolCall: "#4ADE80",
      success: "#86EFAC",
      error: "#F87171",
      warning: "#FDE68A",
      statusBar: "#166534",
    },
    spinner: {
      thinkingFaces: ["[|]", "[/]", "[-]", "[\\]"],
      toolFaces: ["[!]", "[>]", "[*]", "[+]"],
      thinkingVerbs: ["hacking", "decrypting", "infiltrating", "compiling", "executing"],
      wings: [["| ", " |"]],
    },
    branding: {
      agentName: "CW://SYSTEM",
      welcome: "ACCESS GRANTED. READY FOR INPUT.",
      promptSymbol: "$>",
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SKIN MANAGER
// ─────────────────────────────────────────────────────────────────────────────

const SKINS_DIR = path.join(
  process.env.COWRANGLER_HOME ?? path.join(os.homedir(), ".cowrangler"),
  "skins",
);

let _activeSkin: SkinConfig = BUILTIN_SKINS.default;
let _activeSkinName = "default";

/**
 * Skin yükle — built-in veya kullanıcı YAML dosyasından.
 * YAML ayrıştırma için basit key:value parser kullanır (yaml bağımlılığı yok).
 */
export function loadSkin(name: string): { ok: boolean; error?: string } {
  // 1. Built-in kontrol
  if (BUILTIN_SKINS[name]) {
    _activeSkin = BUILTIN_SKINS[name];
    _activeSkinName = name;
    _persistSkinChoice(name);
    return { ok: true };
  }

  // 2. Kullanıcı YAML dosyası
  const yamlPath = path.join(SKINS_DIR, `${name}.yaml`);
  if (!fs.existsSync(yamlPath)) {
    return { ok: false, error: `Skin '${name}' bulunamadı. Built-in: ${listSkins().join(", ")}` };
  }

  try {
    const raw = fs.readFileSync(yamlPath, "utf-8");
    const parsed = _parseSimpleYaml(raw);
    _activeSkin = { name, ...parsed } as SkinConfig;
    _activeSkinName = name;
    _persistSkinChoice(name);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: `YAML ayrıştırma hatası: ${e.message}` };
  }
}

/** Mevcut aktif skin'i döndür */
export function getActiveSkin(): SkinConfig {
  return _activeSkin;
}

/** Aktif skin adını döndür */
export function getActiveSkinName(): string {
  return _activeSkinName;
}

/** Kullanılabilir skin'leri listele (built-in + kullanıcı) */
export function listSkins(): string[] {
  const builtin = Object.keys(BUILTIN_SKINS);
  let user: string[] = [];
  try {
    if (fs.existsSync(SKINS_DIR)) {
      user = fs.readdirSync(SKINS_DIR)
        .filter((f) => f.endsWith(".yaml"))
        .map((f) => f.replace(".yaml", ""))
        .filter((n) => !builtin.includes(n));
    }
  } catch { /* yok say */ }
  return [...builtin, ...user];
}

/** Uygulama başlangıcında son seçilen skin'i yükle */
export function initSkin(): void {
  const choiceFile = path.join(
    process.env.COWRANGLER_HOME ?? path.join(os.homedir(), ".cowrangler"),
    ".skin",
  );
  if (fs.existsSync(choiceFile)) {
    const saved = fs.readFileSync(choiceFile, "utf-8").trim();
    if (saved) loadSkin(saved);
  }
}

/** Skin seçimini diske kaydet */
function _persistSkinChoice(name: string): void {
  try {
    const dir = process.env.COWRANGLER_HOME ?? path.join(os.homedir(), ".cowrangler");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, ".skin"), name + "\n");
  } catch { /* yok say */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// SIMPLE YAML PARSER (bağımlılık gerektirmez)
// Yalnızca basit key: value ve string dizileri desteklenir.
// ─────────────────────────────────────────────────────────────────────────────

function _parseSimpleYaml(text: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const indent = line.match(/^(\s*)/)?.[1].length ?? 0;

    // Yorum veya boş satır
    if (line.trim().startsWith("#") || !line.trim()) { i++; continue; }

    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) { i++; continue; }

    const key = _camelCase(line.slice(indent, colonIdx).trim());
    const valuePart = line.slice(colonIdx + 1).trim();

    if (!valuePart) {
      // Nesne ya da dizi bloğu
      const children: Record<string, any> = {};
      const arr: string[] = [];
      i++;
      while (i < lines.length) {
        const child = lines[i];
        const childIndent = child.match(/^(\s*)/)?.[1].length ?? 0;
        if (child.trim() === "" || child.trim().startsWith("#")) { i++; continue; }
        if (childIndent <= indent) break;

        if (child.trim().startsWith("- ")) {
          arr.push(child.trim().slice(2).replace(/^["']|["']$/g, ""));
          i++;
        } else {
          const ci = child.indexOf(":");
          if (ci >= 0) {
            const ck = _camelCase(child.slice(childIndent, ci).trim());
            const cv = child.slice(ci + 1).trim().replace(/^["']|["']$/g, "");
            children[ck] = cv;
          }
          i++;
        }
      }
      result[key] = arr.length > 0 ? arr : children;
    } else {
      result[key] = valuePart.replace(/^["']|["']$/g, "");
      i++;
    }
  }

  return result;
}

function _camelCase(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
