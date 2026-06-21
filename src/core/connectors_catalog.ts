/**
 * connectors_catalog — Kürasyonlu, gerçekten çalışan CONNECTOR (MCP) katalogu.
 *
 * Kullanıcıya "Connector" olarak sunulur; altında MCP işlevi görür.
 * Desktop "Browse" ekranı bu katalogu listeler. Bir girişe "Ekle" denildiğinde:
 *   - auth === 'none'  → doğrudan mcp_servers'a yazılır, çalışır.
 *   - auth === 'apikey'|'token' → kullanıcıdan değer istenir, env olarak geçirilir.
 *   - auth === 'oauth' → sistem tarayıcısında OAuth akışı (loopback callback).
 *
 * Buradaki stdio girişleri `npx -y ...` ile anında çalışır (ek hesap gerektirmeyenler).
 * Token/anahtar gerektirenler işaretlenmiştir.
 */

export type ConnectorAuth = "none" | "apikey" | "token" | "oauth";
export type ConnectorTransport = "stdio" | "http" | "sse";

export interface ConnectorAuthField {
  /** Kullanıcıdan istenecek değerin env anahtarı (subprocess'e geçer) */
  envKey: string;
  /** UI etiketi */
  label: string;
  /** Nasıl alınacağına dair kısa ipucu / URL */
  hint?: string;
}

export interface ConnectorCatalogEntry {
  id: string;
  name: string;
  description: string;
  category:
    | "files"
    | "dev"
    | "web"
    | "data"
    | "productivity"
    | "communication"
    | "design"
    | "business"
    | "ai";
  transport: ConnectorTransport;
  auth: ConnectorAuth;
  /** Popülerlik sırası (küçük = üstte). Tanımsız → alfabetik. */
  popular?: number;
  /**
   * Marka logosu URL'si (kutucukta gösterilir). Yüklenemezse UI otomatik olarak
   * kategori ikonuna düşer. Genellikle simpleicons CDN'i kullanılır
   * (marka renginde SVG): `https://cdn.simpleicons.org/<slug>`.
   */
  logo?: string;
  /** stdio için komut/argümanlar */
  command?: string;
  args?: string[];
  /** http/sse için uzak URL */
  url?: string;
  /** auth gerektiğinde toplanacak alanlar; toplanan değerler `env` olarak eklenir */
  authFields?: ConnectorAuthField[];
  /** Bir argümanın kullanıcı yolu/parametre alması gerekiyorsa (ör. filesystem dizini) */
  requiresPathArg?: boolean;
}

/**
 * Katalog. "none" auth'lular kutudan çıkar çalışır; diğerleri kimlik ister.
 * Not: Bu liste cowrangler tarafından kürate edilir; gerçek, bilinen MCP server'lardır.
 */
export const CONNECTORS_CATALOG: ConnectorCatalogEntry[] = [
  // ── Files / local (auth gerektirmez, anında çalışır) ──────────────────────
  {
    id: "filesystem",
    name: "Filesystem",
    description: "Yerel bir dizinde güvenli dosya okuma/yazma/listeleme.",
    category: "files",
    transport: "stdio",
    auth: "none",
    popular: 1,
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem"],
    requiresPathArg: true,
  },
  {
    id: "git",
    name: "Git",
    description: "Yerel git deposunda status, log, diff, commit okuma.",
    category: "dev",
    transport: "stdio",
    auth: "none",
    popular: 4,
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-git"],
    requiresPathArg: true,
  },
  {
    id: "fetch",
    name: "Fetch (Web)",
    description: "URL içeriğini çekip markdown'a indirger. Hesap gerektirmez.",
    category: "web",
    transport: "stdio",
    auth: "none",
    popular: 3,
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-fetch"],
  },
  {
    id: "memory",
    name: "Knowledge Graph Memory",
    description: "Kalıcı bilgi-grafiği belleği (varlıklar + ilişkiler).",
    category: "ai",
    transport: "stdio",
    auth: "none",
    popular: 8,
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
  },
  {
    id: "sequential-thinking",
    name: "Sequential Thinking",
    description: "Adım-adım yapılandırılmış akıl yürütme aracı.",
    category: "ai",
    transport: "stdio",
    auth: "none",
    popular: 9,
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
  },
  {
    id: "time",
    name: "Time & Timezone",
    description: "Geçerli saat ve saat dilimi dönüşümleri.",
    category: "productivity",
    transport: "stdio",
    auth: "none",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-time"],
  },

  // ── Token / API anahtarı gerektirenler ────────────────────────────────────
  {
    id: "github",
    name: "GitHub",
    description: "Repo, issue ve PR'larla çalış; kod ara.",
    category: "dev",
    transport: "stdio",
    auth: "token",
    popular: 2,
    logo: "https://cdn.simpleicons.org/github",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    authFields: [
      {
        envKey: "GITHUB_PERSONAL_ACCESS_TOKEN",
        label: "GitHub Personal Access Token",
        hint: "github.com/settings/tokens → repo scope",
      },
    ],
  },
  {
    id: "brave-search",
    name: "Brave Search",
    description: "Web ve yerel arama (Brave Search API).",
    category: "web",
    transport: "stdio",
    auth: "apikey",
    popular: 6,
    logo: "https://cdn.simpleicons.org/brave",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-brave-search"],
    authFields: [
      {
        envKey: "BRAVE_API_KEY",
        label: "Brave API Key",
        hint: "api.search.brave.com",
      },
    ],
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    description: "Salt-okunur şema keşfi ve sorgu (read-only).",
    category: "data",
    transport: "stdio",
    auth: "token",
    logo: "https://cdn.simpleicons.org/postgresql",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-postgres"],
    authFields: [
      {
        envKey: "POSTGRES_CONNECTION_STRING",
        label: "Connection String",
        hint: "postgresql://user:pass@host:5432/db",
      },
    ],
  },
  {
    id: "slack",
    name: "Slack",
    description: "Kanalları oku, mesaj gönder, thread'leri çek.",
    category: "communication",
    transport: "stdio",
    auth: "token",
    popular: 7,
    logo: "https://cdn.simpleicons.org/slack",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    authFields: [
      { envKey: "SLACK_BOT_TOKEN", label: "Slack Bot Token", hint: "xoxb-..." },
      { envKey: "SLACK_TEAM_ID", label: "Team ID", hint: "T..." },
    ],
  },

  // ── Remote / OAuth (uzak MCP) ─────────────────────────────────────────────
  {
    id: "notion",
    name: "Notion",
    description: "Notion çalışma alanında ara, oku, güncelle.",
    category: "productivity",
    transport: "http",
    auth: "oauth",
    popular: 5,
    logo: "https://cdn.simpleicons.org/notion",
    url: "https://mcp.notion.com/mcp",
  },
  {
    id: "linear",
    name: "Linear",
    description: "Issue, proje ve döngülerle çalış.",
    category: "productivity",
    transport: "http",
    auth: "oauth",
    popular: 10,
    logo: "https://cdn.simpleicons.org/linear",
    url: "https://mcp.linear.app/mcp",
  },

  // ── 2.0.5: Resmî remote MCP sunucuları (OAuth) ─────────────────────────────
  // Endpoint'ler doğrulanmıştır; OAuth 2.1 + dinamik kayıt ile loopback callback.
  {
    id: "sentry",
    name: "Sentry",
    description: "Hata/issue takibi; olayları ve uyarıları sorgula.",
    category: "dev",
    transport: "http",
    auth: "oauth",
    popular: 11,
    logo: "https://cdn.simpleicons.org/sentry",
    url: "https://mcp.sentry.dev/mcp",
  },
  {
    id: "vercel",
    name: "Vercel",
    description: "Dağıtımlar, projeler ve loglarla çalış.",
    category: "dev",
    transport: "http",
    auth: "oauth",
    popular: 12,
    logo: "https://cdn.simpleicons.org/vercel",
    url: "https://mcp.vercel.com",
  },
  {
    id: "supabase",
    name: "Supabase",
    description: "Veritabanı, şema ve projelerini yönet (OAuth 2.1).",
    category: "data",
    transport: "http",
    auth: "oauth",
    popular: 13,
    logo: "https://cdn.simpleicons.org/supabase",
    url: "https://mcp.supabase.com/mcp",
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Ödemeler, müşteriler ve faturalarla çalış.",
    category: "data",
    transport: "http",
    auth: "apikey",
    popular: 14,
    logo: "https://cdn.simpleicons.org/stripe",
    url: "https://mcp.stripe.com",
    authFields: [
      {
        envKey: "STRIPE_API_KEY",
        label: "Stripe Secret Key (Bearer)",
        hint: "Şu biçimde gir: Bearer sk_live_… (dashboard.stripe.com/apikeys)",
      },
    ],
  },
  {
    id: "asana",
    name: "Asana",
    description: "Görev, proje ve portföylerle çalış.",
    category: "productivity",
    transport: "http",
    auth: "oauth",
    popular: 15,
    logo: "https://cdn.simpleicons.org/asana",
    url: "https://mcp.asana.com/v2/mcp",
  },
  {
    id: "atlassian",
    name: "Atlassian (Jira & Confluence)",
    description: "Jira issue'ları ve Confluence sayfalarıyla çalış.",
    category: "productivity",
    transport: "http",
    auth: "oauth",
    popular: 16,
    logo: "https://cdn.simpleicons.org/atlassian",
    url: "https://mcp.atlassian.com/v1/mcp",
  },
  {
    id: "clickup",
    name: "ClickUp",
    description: "Görev, liste ve doc'larla çalış.",
    category: "productivity",
    transport: "http",
    auth: "oauth",
    popular: 17,
    logo: "https://cdn.simpleicons.org/clickup",
    url: "https://mcp.clickup.com/mcp",
  },
  {
    id: "intercom",
    name: "Intercom",
    description: "Konuşmaları oku, müşteri verilerini sorgula.",
    category: "communication",
    transport: "http",
    auth: "oauth",
    popular: 18,
    logo: "https://cdn.simpleicons.org/intercom",
    url: "https://mcp.intercom.com/mcp",
  },
  {
    id: "figma",
    name: "Figma",
    description: "Tasarım dosyalarını oku, bileşen ve stilleri çıkar.",
    category: "design",
    transport: "http",
    auth: "oauth",
    popular: 19,
    logo: "https://cdn.simpleicons.org/figma",
    url: "https://mcp.figma.com/mcp",
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description: "CRM kayıtları, kişiler ve fırsatlarla çalış (OAuth + PKCE).",
    category: "business",
    transport: "http",
    auth: "oauth",
    popular: 20,
    logo: "https://cdn.simpleicons.org/hubspot",
    url: "https://mcp.hubspot.com",
  },

  // ── 2.0.5: Web & AI arama (API anahtarı; header/env olarak geçer) ──────────
  {
    id: "tavily",
    name: "Tavily",
    description: "AI ajanları için gerçek zamanlı web araması ve çıkarımı.",
    category: "web",
    transport: "stdio",
    auth: "apikey",
    popular: 21,
    logo: "https://cdn.simpleicons.org/tavily",
    command: "npx",
    args: ["-y", "tavily-mcp"],
    authFields: [
      { envKey: "TAVILY_API_KEY", label: "Tavily API Key", hint: "tavily.com → API keys (tvly-…)" },
    ],
  },
  {
    id: "exa",
    name: "Exa",
    description: "Anlamsal web araması ve içerik çıkarımı.",
    category: "web",
    transport: "stdio",
    auth: "apikey",
    popular: 22,
    logo: "https://cdn.simpleicons.org/exa",
    command: "npx",
    args: ["-y", "exa-mcp-server"],
    authFields: [
      { envKey: "EXA_API_KEY", label: "Exa API Key", hint: "dashboard.exa.ai/api-keys" },
    ],
  },
  {
    id: "firecrawl",
    name: "Firecrawl",
    description: "Web kazıma, tarama ve siteden temiz içerik çıkarımı.",
    category: "web",
    transport: "stdio",
    auth: "apikey",
    popular: 23,
    logo: "https://cdn.simpleicons.org/firecrawl",
    command: "npx",
    args: ["-y", "firecrawl-mcp"],
    authFields: [
      { envKey: "FIRECRAWL_API_KEY", label: "Firecrawl API Key", hint: "firecrawl.dev → API keys (fc-…)" },
    ],
  },
];

/** Browse sırası: popular (artan) sonra alfabetik. */
export function getCatalogSorted(): ConnectorCatalogEntry[] {
  return [...CONNECTORS_CATALOG].sort((a, b) => {
    const pa = a.popular ?? 999;
    const pb = b.popular ?? 999;
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name);
  });
}

export function getCatalogEntry(id: string): ConnectorCatalogEntry | undefined {
  return CONNECTORS_CATALOG.find((c) => c.id === id);
}

/**
 * Bir katalog girişini + toplanan auth değerlerini config.yaml > mcp_servers
 * için yazılabilir MCP config nesnesine çevirir.
 *
 * Gizli DEĞERLER buraya yazılmaz — yalnızca vault referansları (`secrets`,
 * `secretsHeader`, `oauth`) üretilir. Değerler `credential_vault`'a IPC katmanında
 * yazılır ve yükleme anında mcp_client tarafından çözülür.
 *
 * @param entry   katalog girişi
 * @param pathArg requiresPathArg girişler için dizin yolu
 */
export function buildMcpServerConfig(
  entry: ConnectorCatalogEntry,
  pathArg?: string,
): Record<string, any> {
  const secretKeys = (entry.authFields ?? []).map((f) => f.envKey);

  if (entry.transport === "stdio") {
    const args = [...(entry.args ?? [])];
    if (entry.requiresPathArg && pathArg) args.push(pathArg);
    return {
      command: entry.command,
      args,
      ...(secretKeys.length ? { secrets: secretKeys } : {}),
      timeout: 120,
    };
  }

  // http / sse
  if (entry.auth === "oauth") {
    return {
      url: entry.url,
      oauth: true,
      ...(entry.transport === "sse" ? { transport: "sse" } : {}),
      timeout: 120,
    };
  }
  // token/apikey ile gelen remote'lar Authorization header'ı ister
  return {
    url: entry.url,
    ...(secretKeys.length ? { secrets: [secretKeys[0]], secretsHeader: "Authorization" } : {}),
    ...(entry.transport === "sse" ? { transport: "sse" } : {}),
    timeout: 120,
  };
}
