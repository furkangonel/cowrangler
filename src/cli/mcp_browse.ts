/**
 * MCP Browse — cowrangler mcp browse
 *
 * Küratörlüğü yapılmış MCP server'larını interaktif terminal arayüzünde
 * listeler. Kullanıcı seçim yaptığında sunucu otomatik olarak
 * yapılandırılır ve ~/.cowrangler/config.yaml'a kaydedilir.
 *
 * Kontroller:
 *   ↑ / ↓       — listede gezin
 *   ← / →       — kategori geç
 *   Enter / i   — seçili server'ı kur
 *   /           — arama moduna gir
 *   q / Esc     — çık
 */

import readline from "readline";
import fs from "fs";
import { execSync, spawnSync } from "child_process";
import yaml from "js-yaml";
import chalk from "chalk";
import { DIRS } from "../core/init.js";

// ─────────────────────────────────────────────────────────────────────────────
// Marketplace Verisi
// ─────────────────────────────────────────────────────────────────────────────

export interface McpServerEntry {
  id: string;           // config.yaml'daki anahtar adı
  name: string;         // Gösterim adı
  category: Category;
  description: string;  // Kısa açıklama (liste satırı)
  details: string;      // Uzun açıklama (detay paneli)
  tools: string[];      // Sunucunun sunduğu araçlar
  package?: string;     // npm paketi (npx ile kurulur)
  command?: string;     // Özel komut (package yoksa)
  args?: string[];      // Komut argümanları ({{PLACEHOLDER}} şablonları desteklenir)
  envVars?: Array<{     // Gerekli ortam değişkenleri
    key: string;
    label: string;
    required: boolean;
    example?: string;
  }>;
  configArgs?: Array<{  // Kullanıcıdan alınacak ek argümanlar (dizin yolu vb.)
    key: string;
    label: string;
    default?: string;
    required: boolean;
  }>;
  stars?: string;       // Popülerlik göstergesi (★★★★☆ gibi)
  official?: boolean;   // Anthropic/MCP resmi paketi mi?
}

type Category =
  | "🗂  Dosya & Depolama"
  | "🔍  Arama & Web"
  | "💻  Geliştirme"
  | "🗄  Veritabanları"
  | "💬  İletişim"
  | "🧠  AI & Bellek"
  | "📝  Üretkenlik";

const CATEGORIES: Category[] = [
  "🗂  Dosya & Depolama",
  "🔍  Arama & Web",
  "💻  Geliştirme",
  "🗄  Veritabanları",
  "💬  İletişim",
  "🧠  AI & Bellek",
  "📝  Üretkenlik",
];

const REGISTRY: McpServerEntry[] = [
  // ── 🗂 Dosya & Depolama ────────────────────────────────────────────────────
  {
    id: "filesystem",
    name: "Filesystem",
    category: "🗂  Dosya & Depolama",
    description: "Yerel dosya sistemi okuma, yazma, arama",
    details:
      "Dosyaları okur, yazar, listeler ve arar. Belirtilen dizinlere erişimi kısıtlayarak güvenli çalışır. Herhangi bir dizini erişilebilir kılabilirsin.",
    tools: ["read_file", "write_file", "list_directory", "search_files", "get_file_info"],
    package: "@modelcontextprotocol/server-filesystem",
    args: ["{{ALLOWED_DIR}}"],
    configArgs: [
      { key: "ALLOWED_DIR", label: "Erişim izni verilecek dizin", default: process.env.HOME + "/Documents", required: true },
    ],
    stars: "★★★★★",
    official: true,
  },
  {
    id: "google-drive",
    name: "Google Drive",
    category: "🗂  Dosya & Depolama",
    description: "Google Drive'daki dosyaları oku ve arama yap",
    details:
      "Google Drive'daki dokümanları okur, listeler ve içlerinde arama yapar. Google OAuth2 kimlik doğrulaması gerektirir.",
    tools: ["search_drive", "read_file", "list_files"],
    package: "@modelcontextprotocol/server-google-drive",
    envVars: [
      { key: "GDRIVE_CLIENT_ID", label: "Google OAuth Client ID", required: true },
      { key: "GDRIVE_CLIENT_SECRET", label: "Google OAuth Client Secret", required: true },
    ],
    stars: "★★★★☆",
    official: true,
  },
  {
    id: "s3",
    name: "AWS S3",
    category: "🗂  Dosya & Depolama",
    description: "S3 bucket'larında dosya oku/yaz/listele",
    details:
      "Amazon S3 bucket'larına erişir. Dosya okuma, yazma, listeleme ve silme işlemleri yapar. AWS kimlik bilgileri gerektirir.",
    tools: ["s3_get_object", "s3_put_object", "s3_list_objects", "s3_delete_object"],
    package: "mcp-server-aws-s3",
    envVars: [
      { key: "AWS_ACCESS_KEY_ID", label: "AWS Access Key ID", required: true },
      { key: "AWS_SECRET_ACCESS_KEY", label: "AWS Secret Access Key", required: true },
      { key: "AWS_REGION", label: "AWS Region", required: false, example: "us-east-1" },
    ],
    stars: "★★★☆☆",
  },

  // ── 🔍 Arama & Web ─────────────────────────────────────────────────────────
  {
    id: "brave-search",
    name: "Brave Search",
    category: "🔍  Arama & Web",
    description: "Brave arama motoru ile web ve haber araması",
    details:
      "Brave Search API'yi kullanarak web araması, haber araması ve yerel yer araması yapar. Reklamsız ve gizlilik odaklı.",
    tools: ["brave_web_search", "brave_news_search", "brave_local_search"],
    package: "@modelcontextprotocol/server-brave-search",
    envVars: [
      { key: "BRAVE_API_KEY", label: "Brave Search API Key", required: true, example: "BSA..." },
    ],
    stars: "★★★★★",
    official: true,
  },
  {
    id: "fetch",
    name: "Fetch",
    category: "🔍  Arama & Web",
    description: "Web sayfası içeriklerini çek ve dönüştür",
    details:
      "Herhangi bir URL'yi çeker ve içeriğini Markdown'a dönüştürür. JavaScript gerektiren sayfalar için Playwright kullabilir.",
    tools: ["fetch_url", "fetch_markdown"],
    package: "@modelcontextprotocol/server-fetch",
    stars: "★★★★★",
    official: true,
  },
  {
    id: "puppeteer",
    name: "Puppeteer",
    category: "🔍  Arama & Web",
    description: "Tarayıcı otomasyonu — tıkla, doldur, ekran görüntüsü al",
    details:
      "Headless Chrome üzerinden tam tarayıcı otomasyonu sağlar. Form doldurma, tıklama, screenshot alma ve JavaScript çalıştırma destekler.",
    tools: ["puppeteer_navigate", "puppeteer_click", "puppeteer_type", "puppeteer_screenshot", "puppeteer_evaluate"],
    package: "@modelcontextprotocol/server-puppeteer",
    stars: "★★★★☆",
    official: true,
  },
  {
    id: "perplexity",
    name: "Perplexity",
    category: "🔍  Arama & Web",
    description: "Perplexity AI ile kaynaklı web araması",
    details:
      "Perplexity AI API'si üzerinden alıntılı, kaynaklı web araması yapar. Güncel bilgilere erişmek için idealdir.",
    tools: ["perplexity_search", "perplexity_ask"],
    package: "mcp-perplexity",
    envVars: [
      { key: "PERPLEXITY_API_KEY", label: "Perplexity API Key", required: true, example: "pplx-..." },
    ],
    stars: "★★★★☆",
  },

  // ── 💻 Geliştirme ──────────────────────────────────────────────────────────
  {
    id: "github",
    name: "GitHub",
    category: "💻  Geliştirme",
    description: "GitHub repo, PR, issue ve gist yönetimi",
    details:
      "GitHub API'si üzerinden repo okuma/yazma, PR oluşturma/inceleme, issue yönetimi, kod arama ve gist işlemleri yapar.",
    tools: ["create_or_update_file", "search_repositories", "create_repository", "get_file_contents", "push_files", "create_issue", "create_pull_request", "search_code"],
    package: "@modelcontextprotocol/server-github",
    envVars: [
      { key: "GITHUB_PERSONAL_ACCESS_TOKEN", label: "GitHub Personal Access Token", required: true, example: "ghp_..." },
    ],
    stars: "★★★★★",
    official: true,
  },
  {
    id: "gitlab",
    name: "GitLab",
    category: "💻  Geliştirme",
    description: "GitLab repo, MR, pipeline ve issue yönetimi",
    details:
      "GitLab API'si üzerinden proje yönetimi, merge request, pipeline ve CI/CD işlemleri yapar.",
    tools: ["get_project", "list_merge_requests", "create_merge_request", "get_pipeline", "create_issue"],
    package: "@modelcontextprotocol/server-gitlab",
    envVars: [
      { key: "GITLAB_PERSONAL_ACCESS_TOKEN", label: "GitLab Personal Access Token", required: true, example: "glpat-..." },
      { key: "GITLAB_API_URL", label: "GitLab API URL (self-hosted için)", required: false, example: "https://gitlab.example.com/api/v4" },
    ],
    stars: "★★★★☆",
    official: true,
  },
  {
    id: "linear",
    name: "Linear",
    category: "💻  Geliştirme",
    description: "Linear'daki issue, proje ve sprint yönetimi",
    details:
      "Linear'daki issue okuma/yazma, sprint planlama, proje durumu sorgulama ve yorum ekleme işlemleri yapar.",
    tools: ["linear_get_issues", "linear_create_issue", "linear_update_issue", "linear_list_projects"],
    package: "mcp-linear",
    envVars: [
      { key: "LINEAR_API_KEY", label: "Linear API Key", required: true, example: "lin_api_..." },
    ],
    stars: "★★★★☆",
  },
  {
    id: "jira",
    name: "Jira",
    category: "💻  Geliştirme",
    description: "Jira ticket, sprint ve proje yönetimi",
    details:
      "Atlassian Jira API'si üzerinden ticket oluşturma, güncelleme, sprint yönetimi ve proje durumu takibi yapar.",
    tools: ["jira_get_issue", "jira_create_issue", "jira_update_issue", "jira_search_issues"],
    package: "mcp-jira",
    envVars: [
      { key: "JIRA_HOST", label: "Jira Host URL", required: true, example: "https://your-org.atlassian.net" },
      { key: "JIRA_EMAIL", label: "Jira hesap e-postası", required: true },
      { key: "JIRA_API_TOKEN", label: "Jira API Token", required: true },
    ],
    stars: "★★★☆☆",
  },

  // ── 🗄 Veritabanları ───────────────────────────────────────────────────────
  {
    id: "sqlite",
    name: "SQLite",
    category: "🗄  Veritabanları",
    description: "SQLite veritabanında sorgu çalıştır",
    details:
      "Yerel SQLite dosyalarında SELECT, INSERT, UPDATE, DELETE sorguları çalıştırır. Tablo şeması ve istatistiklerini gösterir.",
    tools: ["read_query", "write_query", "create_table", "list_tables", "describe_table"],
    package: "@modelcontextprotocol/server-sqlite",
    configArgs: [
      { key: "DB_PATH", label: "SQLite veritabanı dosya yolu", default: "./db.sqlite", required: true },
    ],
    args: ["--db-path", "{{DB_PATH}}"],
    stars: "★★★★★",
    official: true,
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    category: "🗄  Veritabanları",
    description: "PostgreSQL veritabanında sorgu çalıştır",
    details:
      "PostgreSQL veritabanına bağlanır, tablo listesi ve şema bilgisi alır, güvenli read-only sorgular çalıştırır.",
    tools: ["query", "list_tables", "describe_table"],
    package: "@modelcontextprotocol/server-postgres",
    envVars: [
      { key: "POSTGRES_CONNECTION_STRING", label: "PostgreSQL bağlantı dizesi", required: true, example: "postgresql://user:pass@localhost/dbname" },
    ],
    stars: "★★★★★",
    official: true,
  },
  {
    id: "mysql",
    name: "MySQL / MariaDB",
    category: "🗄  Veritabanları",
    description: "MySQL veritabanında sorgu çalıştır",
    details:
      "MySQL veya MariaDB veritabanına bağlanır ve sorgu çalıştırır. Read-only modda güvenli çalışır.",
    tools: ["query", "list_tables", "describe_table"],
    package: "mcp-server-mysql",
    envVars: [
      { key: "MYSQL_HOST", label: "MySQL Host", required: true, example: "localhost" },
      { key: "MYSQL_USER", label: "MySQL Kullanıcı Adı", required: true },
      { key: "MYSQL_PASSWORD", label: "MySQL Şifresi", required: true },
      { key: "MYSQL_DATABASE", label: "Veritabanı Adı", required: true },
    ],
    stars: "★★★☆☆",
  },

  // ── 💬 İletişim ────────────────────────────────────────────────────────────
  {
    id: "slack",
    name: "Slack",
    category: "💬  İletişim",
    description: "Slack mesajları gönder, oku ve kanal yönet",
    details:
      "Slack workspace'ine bağlanır. Mesaj gönderme/okuma, kanal listeleme, kullanıcı bilgisi ve dosya paylaşımı yapar.",
    tools: ["slack_post_message", "slack_get_channel_history", "slack_list_channels", "slack_get_users"],
    package: "@modelcontextprotocol/server-slack",
    envVars: [
      { key: "SLACK_BOT_TOKEN", label: "Slack Bot Token", required: true, example: "xoxb-..." },
      { key: "SLACK_TEAM_ID", label: "Slack Team ID", required: false, example: "T0123456" },
    ],
    stars: "★★★★★",
    official: true,
  },
  {
    id: "gmail",
    name: "Gmail",
    category: "💬  İletişim",
    description: "Gmail üzerinden e-posta oku ve gönder",
    details:
      "Gmail API'si üzerinden e-posta okuma, gönderme, arama ve etiket yönetimi yapar. OAuth2 kimlik doğrulaması gerektirir.",
    tools: ["gmail_search", "gmail_read", "gmail_send", "gmail_reply", "gmail_list_labels"],
    package: "mcp-gmail",
    envVars: [
      { key: "GMAIL_CLIENT_ID", label: "Google OAuth Client ID", required: true },
      { key: "GMAIL_CLIENT_SECRET", label: "Google OAuth Client Secret", required: true },
    ],
    stars: "★★★★☆",
  },

  // ── 🧠 AI & Bellek ─────────────────────────────────────────────────────────
  {
    id: "memory",
    name: "Memory (Bilgi Grafiği)",
    category: "🧠  AI & Bellek",
    description: "Kalıcı bilgi grafiği — varlık ve ilişki yönetimi",
    details:
      "Oturumlar arası kalıcı bellek sağlar. Varlık (entity), ilişki (relation) ve gözlem (observation) tabanlı bilgi grafiği kullanır. Kullanıcı tercihlerini ve projesini hatırlar.",
    tools: ["create_entities", "create_relations", "add_observations", "search_nodes", "open_nodes"],
    package: "@modelcontextprotocol/server-memory",
    stars: "★★★★★",
    official: true,
  },
  {
    id: "sequential-thinking",
    name: "Sequential Thinking",
    category: "🧠  AI & Bellek",
    description: "Adım adım yapılandırılmış düşünme aracı",
    details:
      "Karmaşık problemleri yapılandırılmış düşünme adımlarına böler. Revizyona ve dallanmaya izin verir. Zor görevlerde düşünme kalitesini artırır.",
    tools: ["sequentialthinking"],
    package: "@modelcontextprotocol/server-sequential-thinking",
    stars: "★★★★★",
    official: true,
  },
  {
    id: "obsidian",
    name: "Obsidian",
    category: "🧠  AI & Bellek",
    description: "Obsidian vault notlarını oku ve yaz",
    details:
      "Obsidian not deposuna erişir. Not okuma, yazma, arama ve bağlantı takibi yapar. Kişisel bilgi tabanıyla entegrasyon için idealdir.",
    tools: ["read_note", "write_note", "search_notes", "list_notes", "get_backlinks"],
    package: "mcp-obsidian",
    configArgs: [
      { key: "VAULT_PATH", label: "Obsidian vault dizin yolu", required: true },
    ],
    args: ["{{VAULT_PATH}}"],
    stars: "★★★★☆",
  },

  // ── 📝 Üretkenlik ──────────────────────────────────────────────────────────
  {
    id: "notion",
    name: "Notion",
    category: "📝  Üretkenlik",
    description: "Notion sayfaları, veritabanları ve blokları yönet",
    details:
      "Notion API'si üzerinden sayfa okuma/yazma, veritabanı sorgulama, blok ekleme ve arama işlemleri yapar.",
    tools: ["notion_get_page", "notion_create_page", "notion_update_page", "notion_query_database", "notion_search"],
    package: "mcp-notion-server",
    envVars: [
      { key: "NOTION_API_TOKEN", label: "Notion Integration Token", required: true, example: "secret_..." },
    ],
    stars: "★★★★☆",
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    category: "📝  Üretkenlik",
    description: "Takvim etkinliklerini oku, oluştur ve güncelle",
    details:
      "Google Calendar API'si üzerinden etkinlik okuma, oluşturma, güncelleme ve silme işlemleri yapar. Birden fazla takvim desteklenir.",
    tools: ["list_events", "create_event", "update_event", "delete_event", "list_calendars"],
    package: "mcp-google-calendar",
    envVars: [
      { key: "GCAL_CLIENT_ID", label: "Google OAuth Client ID", required: true },
      { key: "GCAL_CLIENT_SECRET", label: "Google OAuth Client Secret", required: true },
    ],
    stars: "★★★★☆",
  },
  {
    id: "todoist",
    name: "Todoist",
    category: "📝  Üretkenlik",
    description: "Todoist görev ve proje yönetimi",
    details:
      "Todoist API'si üzerinden görev oluşturma, tamamlama, proje ve etiket yönetimi yapar.",
    tools: ["get_tasks", "create_task", "complete_task", "get_projects"],
    package: "mcp-todoist",
    envVars: [
      { key: "TODOIST_API_TOKEN", label: "Todoist API Token", required: true },
    ],
    stars: "★★★☆☆",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Config Yardımcıları
// ─────────────────────────────────────────────────────────────────────────────

function loadConfig(): any {
  try {
    if (fs.existsSync(DIRS.global.config)) {
      return (yaml.load(fs.readFileSync(DIRS.global.config, "utf-8")) as any) || {};
    }
  } catch {}
  return {};
}

function saveConfig(cfg: any): void {
  fs.mkdirSync(DIRS.global.base, { recursive: true });
  fs.writeFileSync(DIRS.global.config, yaml.dump(cfg));
}

function isInstalled(serverId: string): boolean {
  const cfg = loadConfig();
  return !!(cfg.mcp_servers && cfg.mcp_servers[serverId]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Terminal Boyutu
// ─────────────────────────────────────────────────────────────────────────────

function termSize(): { cols: number; rows: number } {
  return {
    cols: process.stdout.columns ?? 120,
    rows: process.stdout.rows ?? 30,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// UI Render
// ─────────────────────────────────────────────────────────────────────────────

const ACCENT = "#FF4C00";
const DIM = "#555555";

function pad(str: string, len: number): string {
  const visible = str.replace(/\x1b\[[0-9;]*m/g, "");
  const diff = len - visible.length;
  return str + " ".repeat(Math.max(0, diff));
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len - 1) + "…";
}

function renderScreen(
  state: BrowseState,
  searchMode: boolean,
  searchQuery: string,
): void {
  const { cols, rows } = termSize();
  const { selectedCategory, selectedIndex, scrollOffset } = state;

  // Ekranı temizle
  process.stdout.write("\x1b[2J\x1b[H");

  const lines: string[] = [];

  // ── Başlık ──────────────────────────────────────────────────────────────
  const title = " ◆ Co-Wrangler MCP Marketplace ";
  const titlePad = Math.max(0, Math.floor((cols - title.length) / 2));
  lines.push(
    chalk.hex(ACCENT).bold(" ".repeat(titlePad) + title),
  );
  lines.push(chalk.dim("─".repeat(cols)));

  // ── Kategori sekmeleri ───────────────────────────────────────────────────
  const tabLine = CATEGORIES.map((cat, i) => {
    const isActive = !searchMode && i === selectedCategory;
    const short = cat.split("  ")[0]; // sadece emoji + boşluk
    const label = ` ${short} `;
    return isActive
      ? chalk.hex(ACCENT).bold(`[${label}]`)
      : chalk.dim(`[${label}]`);
  }).join(" ");
  lines.push(" " + tabLine);
  lines.push(chalk.dim("─".repeat(cols)));

  // ── İçerik alanı: sol liste + sağ detay ─────────────────────────────────
  const LIST_W = Math.floor(cols * 0.4);
  const DETAIL_W = cols - LIST_W - 3;

  // Gösterilecek server'lar
  const displayList = searchMode
    ? REGISTRY.filter(
        (s) =>
          s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.category.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : REGISTRY.filter((s) => s.category === CATEGORIES[selectedCategory]);

  const selected = displayList[selectedIndex];

  // Sol: liste satırları
  const VISIBLE_ROWS = rows - 10;
  const windowStart = Math.max(
    0,
    Math.min(selectedIndex - Math.floor(VISIBLE_ROWS / 2), displayList.length - VISIBLE_ROWS),
  );
  const visibleItems = displayList.slice(windowStart, windowStart + VISIBLE_ROWS);

  // Sağ: detay satırları
  const detailLines: string[] = [];
  if (selected) {
    const installed = isInstalled(selected.id);

    detailLines.push(chalk.hex(ACCENT).bold(`  ${selected.name}`) + (selected.official ? chalk.hex("#34C759")(" ✦ resmi") : "") + (installed ? chalk.hex("#34C759")("  ✓ kurulu") : ""));
    detailLines.push(chalk.dim("  " + "─".repeat(DETAIL_W - 4)));
    detailLines.push("");

    // Açıklama
    const descWords = selected.details.split(" ");
    let line = "  ";
    for (const word of descWords) {
      if (line.length + word.length > DETAIL_W - 2) {
        detailLines.push(chalk.dim(line));
        line = "  " + word + " ";
      } else {
        line += word + " ";
      }
    }
    if (line.trim()) detailLines.push(chalk.dim(line));
    detailLines.push("");

    // Stars
    if (selected.stars) {
      detailLines.push(`  ${chalk.yellow(selected.stars)}`);
    }

    // Araçlar
    detailLines.push("");
    detailLines.push(chalk.bold("  Araçlar:"));
    const toolChunks: string[] = [];
    let toolLine = "  ";
    for (const tool of selected.tools) {
      const chunk = chalk.dim(tool) + "  ";
      if (toolLine.replace(/\x1b\[[0-9;]*m/g, "").length + tool.length + 2 > DETAIL_W - 2) {
        toolChunks.push(toolLine);
        toolLine = "  " + chunk;
      } else {
        toolLine += chunk;
      }
    }
    if (toolLine.trim()) toolChunks.push(toolLine);
    detailLines.push(...toolChunks);

    // Env vars
    if (selected.envVars && selected.envVars.length > 0) {
      detailLines.push("");
      detailLines.push(chalk.bold("  Gerekli env değişkenleri:"));
      for (const ev of selected.envVars) {
        const req = ev.required ? chalk.red(" *") : chalk.dim(" ?");
        const example = ev.example ? chalk.dim(`  (örn: ${ev.example})`) : "";
        const hasKey = !!process.env[ev.key];
        const keyIcon = hasKey ? chalk.green("✓") : chalk.dim("○");
        detailLines.push(`  ${keyIcon} ${chalk.bold(ev.key)}${req}  ${chalk.dim(ev.label)}${example}`);
      }
    }

    // Paket
    if (selected.package) {
      detailLines.push("");
      detailLines.push(chalk.bold("  Paket:"));
      detailLines.push(`  ${chalk.dim("npx -y")} ${chalk.cyan(selected.package)}`);
    }

    detailLines.push("");
    detailLines.push(chalk.dim("─".repeat(DETAIL_W - 2)));
    if (installed) {
      detailLines.push(chalk.hex("#34C759")("  ✓ Zaten yapılandırılmış"));
      detailLines.push(chalk.dim("  Tekrar kurmak için Enter'a bas"));
    } else {
      detailLines.push(chalk.hex(ACCENT).bold("  Enter / i  →  Kur ve yapılandır"));
    }
  } else {
    detailLines.push(chalk.dim("  Bir sunucu seç"));
  }

  // Satırları yan yana birleştir
  const maxRows = Math.max(visibleItems.length, detailLines.length, VISIBLE_ROWS);

  for (let i = 0; i < maxRows; i++) {
    const leftEntry = visibleItems[i];
    let leftStr = "";

    if (leftEntry) {
      const realIdx = windowStart + i;
      const isSel = realIdx === selectedIndex;
      const inst = isInstalled(leftEntry.id);
      const instIcon = inst ? chalk.hex("#34C759")("✓") : " ";
      const prefix = isSel ? chalk.hex(ACCENT).bold(" ▶ ") : "   ";
      const name = truncate(leftEntry.name, 18);
      const desc = truncate(leftEntry.description, LIST_W - 24);

      leftStr = prefix +
        instIcon + " " +
        (isSel ? chalk.hex(ACCENT).bold(name) : chalk.white(name)) +
        "  " +
        chalk.dim(desc);
    }

    const rightStr = detailLines[i] || "";
    const leftPadded = pad(leftStr, LIST_W);
    const sep = chalk.dim("│");

    lines.push(leftPadded + sep + " " + rightStr);
  }

  // ── Alt bar ──────────────────────────────────────────────────────────────
  lines.push(chalk.dim("─".repeat(cols)));

  if (searchMode) {
    lines.push(
      chalk.cyan("  🔍 Arama: ") +
      chalk.white(searchQuery) +
      chalk.hex(ACCENT)("█") +
      chalk.dim("   Esc → normal mod"),
    );
  } else {
    const count = displayList.length;
    const installed = REGISTRY.filter((s) => isInstalled(s.id)).length;
    lines.push(
      chalk.dim("  ↑↓ gez  ·  ←→ kategori  ·  ") +
      chalk.hex(ACCENT).bold("Enter") +
      chalk.dim(" kur  ·  ") +
      chalk.hex(ACCENT).bold("/") +
      chalk.dim(" ara  ·  ") +
      chalk.hex(ACCENT).bold("q") +
      chalk.dim(" çık") +
      chalk.dim(`   ${count} server · ${installed} kurulu`),
    );
  }

  process.stdout.write(lines.join("\n") + "\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Kurulum Akışı
// ─────────────────────────────────────────────────────────────────────────────

async function installServer(server: McpServerEntry): Promise<void> {
  // Raw mod'dan çık
  process.stdin.setRawMode(false);
  process.stdin.pause();
  process.stdout.write("\x1b[2J\x1b[H");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const ask = (q: string, def?: string): Promise<string> =>
    new Promise((resolve) => {
      const prompt = def ? `  ${q} ${chalk.dim(`[${def}]`)}: ` : `  ${q}: `;
      rl.question(prompt, (a) => resolve(a.trim() || def || ""));
    });

  console.log(chalk.hex(ACCENT).bold(`\n  ◆ ${server.name} Kurulumu\n`));
  if (server.official) console.log(chalk.hex("#34C759")("  ✦ Resmi Anthropic/MCP paketi\n"));
  console.log(chalk.dim(`  ${server.description}\n`));

  const envValues: Record<string, string> = {};
  const argValues: Record<string, string> = {};

  // Env var'ları topla
  if (server.envVars && server.envVars.length > 0) {
    console.log(chalk.bold("  API Anahtarları ve Ortam Değişkenleri:\n"));
    for (const ev of server.envVars) {
      const existing = process.env[ev.key];
      if (existing) {
        console.log(chalk.green(`  ✓ ${ev.key} zaten mevcut`));
        envValues[ev.key] = existing;
        continue;
      }
      const hint = ev.example ? chalk.dim(` (örn: ${ev.example})`) : "";
      const req = ev.required ? chalk.red(" *zorunlu") : chalk.dim(" (opsiyonel)");
      console.log(`  ${chalk.bold(ev.key)}${req}${hint}`);
      console.log(chalk.dim(`  ${ev.label}`));
      const val = await ask("  Değer");
      if (val) envValues[ev.key] = val;
      console.log();
    }
  }

  // Ek argümanları topla
  if (server.configArgs && server.configArgs.length > 0) {
    console.log(chalk.bold("  Yapılandırma Parametreleri:\n"));
    for (const ca of server.configArgs) {
      console.log(chalk.dim(`  ${ca.label}:`));
      const val = await ask("  Değer", ca.default);
      argValues[ca.key] = val;
      console.log();
    }
  }

  // Args'taki şablonları doldur
  const resolvedArgs = (server.args || []).map((arg) =>
    arg.replace(/\{\{(\w+)\}\}/g, (_, key) => argValues[key] || arg),
  );

  // Config nesnesi oluştur
  const serverConfig: any = {};
  if (server.package) {
    serverConfig.command = "npx";
    serverConfig.args = ["-y", server.package, ...resolvedArgs].filter(Boolean);
  } else if (server.command) {
    serverConfig.command = server.command;
    if (resolvedArgs.length) serverConfig.args = resolvedArgs;
  }
  if (Object.keys(envValues).length > 0) {
    serverConfig.env = envValues;
  }
  serverConfig.timeout = 120;

  // Bağlantı testi (opsiyonel — package yüklemesi gerekebilir)
  console.log(chalk.cyan("  Bağlantı testi yapılıyor..."));
  let testOk = false;
  try {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
    if (serverConfig.command) {
      const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args || [],
        env: { ...process.env, ...serverConfig.env },
      });
      const client = new Client({ name: "cowrangler-test", version: "1.0.0" }, { capabilities: {} });
      const connectPromise = client.connect(transport);
      const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000));
      await Promise.race([connectPromise, timeout]);
      const toolsList = await client.listTools();
      await client.close();
      console.log(chalk.green(`  ✓ Bağlantı başarılı — ${toolsList.tools.length} araç bulundu`));
      testOk = true;
    }
  } catch {
    console.log(chalk.yellow("  ⚠ Bağlantı testi başarısız (paket henüz indirilmemiş olabilir, ilk çalıştırmada indirilecek)"));
  }

  // Config'e kaydet
  const cfg = loadConfig();
  if (!cfg.mcp_servers) cfg.mcp_servers = {};
  cfg.mcp_servers[server.id] = serverConfig;

  // Env var'ları credentials.env'e de yaz
  if (Object.keys(envValues).length > 0) {
    const credPath = DIRS.global.credentials;
    let existing = "";
    try { existing = fs.readFileSync(credPath, "utf-8"); } catch {}
    const newLines: string[] = [];
    for (const [k, v] of Object.entries(envValues)) {
      if (!existing.includes(k + "=")) {
        newLines.push(`${k}=${v}`);
      }
    }
    if (newLines.length > 0) {
      fs.appendFileSync(credPath, "\n" + newLines.join("\n") + "\n");
      console.log(chalk.green(`  ✓ API anahtarları ~/.cowrangler/credentials.env'e eklendi`));
    }
  }

  saveConfig(cfg);

  console.log(chalk.green(`\n  ✓ '${server.name}' başarıyla yapılandırıldı!\n`));
  console.log(chalk.dim("  Bir sonraki cowrangler oturumunda otomatik olarak bağlanır."));
  console.log(chalk.dim("  Durum kontrolü: /mcp (oturum içi)\n"));

  rl.close();

  // Raw moda geri dön — browse'a devam et
  process.stdin.setRawMode(true);
  process.stdin.resume();

  await new Promise((r) => setTimeout(r, 1500));
}

// ─────────────────────────────────────────────────────────────────────────────
// State ve Ana Döngü
// ─────────────────────────────────────────────────────────────────────────────

interface BrowseState {
  selectedCategory: number;
  selectedIndex: number;
  scrollOffset: number;
}

export async function runMcpBrowse(): Promise<void> {
  if (!process.stdin.isTTY) {
    console.error(chalk.red("\n  ✗ Bu komut interaktif terminal gerektirir.\n"));
    return;
  }

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  const state: BrowseState = { selectedCategory: 0, selectedIndex: 0, scrollOffset: 0 };
  let searchMode = false;
  let searchQuery = "";

  const currentList = () =>
    searchMode
      ? REGISTRY.filter(
          (s) =>
            s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.category.toLowerCase().includes(searchQuery.toLowerCase()),
        )
      : REGISTRY.filter((s) => s.category === CATEGORIES[state.selectedCategory]);

  renderScreen(state, searchMode, searchQuery);

  return new Promise((resolve) => {
    const handleKey = async (str: string, key: any) => {
      // Çıkış
      if ((!searchMode && (str === "q" || str === "Q")) || (key.ctrl && key.name === "c")) {
        process.stdin.removeListener("keypress", handleKey);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write("\x1b[2J\x1b[H");
        resolve();
        return;
      }

      if (!searchMode) {
        if (key.name === "escape") {
          // Zaten normal mod
        } else if (str === "/") {
          // Arama moduna gir
          searchMode = true;
          searchQuery = "";
          state.selectedIndex = 0;
          renderScreen(state, searchMode, searchQuery);
          return;
        } else if (key.name === "left") {
          state.selectedCategory = Math.max(0, state.selectedCategory - 1);
          state.selectedIndex = 0;
          renderScreen(state, searchMode, searchQuery);
          return;
        } else if (key.name === "right") {
          state.selectedCategory = Math.min(CATEGORIES.length - 1, state.selectedCategory + 1);
          state.selectedIndex = 0;
          renderScreen(state, searchMode, searchQuery);
          return;
        } else if (key.name === "up") {
          state.selectedIndex = Math.max(0, state.selectedIndex - 1);
          renderScreen(state, searchMode, searchQuery);
          return;
        } else if (key.name === "down") {
          const list = currentList();
          state.selectedIndex = Math.min(list.length - 1, state.selectedIndex + 1);
          renderScreen(state, searchMode, searchQuery);
          return;
        } else if (key.name === "return" || str === "i" || str === "I") {
          const list = currentList();
          const server = list[state.selectedIndex];
          if (server) {
            process.stdin.removeListener("keypress", handleKey);
            await installServer(server);
            // Geri ekle
            process.stdin.on("keypress", handleKey);
            renderScreen(state, searchMode, searchQuery);
          }
          return;
        }
      } else {
        // Arama modu
        if (key.name === "escape") {
          searchMode = false;
          searchQuery = "";
          state.selectedIndex = 0;
          renderScreen(state, searchMode, searchQuery);
          return;
        } else if (key.name === "return") {
          // Arama modundan çık, seçiyi kur
          const list = currentList();
          const server = list[state.selectedIndex];
          if (server) {
            searchMode = false;
            process.stdin.removeListener("keypress", handleKey);
            await installServer(server);
            process.stdin.on("keypress", handleKey);
            renderScreen(state, searchMode, searchQuery);
          }
          return;
        } else if (key.name === "up") {
          state.selectedIndex = Math.max(0, state.selectedIndex - 1);
          renderScreen(state, searchMode, searchQuery);
          return;
        } else if (key.name === "down") {
          const list = currentList();
          state.selectedIndex = Math.min(list.length - 1, state.selectedIndex + 1);
          renderScreen(state, searchMode, searchQuery);
          return;
        } else if (key.name === "backspace") {
          searchQuery = searchQuery.slice(0, -1);
          state.selectedIndex = 0;
          renderScreen(state, searchMode, searchQuery);
          return;
        } else if (str && !key.ctrl && !key.meta && str.length === 1) {
          searchQuery += str;
          state.selectedIndex = 0;
          renderScreen(state, searchMode, searchQuery);
          return;
        }
      }
    };

    process.stdin.on("keypress", handleKey);

    // Resize desteği
    process.stdout.on("resize", () => {
      renderScreen(state, searchMode, searchQuery);
    });
  });
}
