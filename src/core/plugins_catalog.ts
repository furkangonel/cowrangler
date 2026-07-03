/**
 * plugins_catalog — cowrangler imzalı, önceden gelen (bundled) PLUGIN'ler.
 *
 * Bir PLUGIN; ilgili SKILL'leri, CONNECTOR önerilerini ve (varsa) tool bundle'larını
 * tek bir imzalı paket altında toplar. Bunlar kullanıcıya "cowrangler" imzasıyla sunulur.
 *
 * PluginManager.loadAll() önce bu katalogu (bundled), sonra ~/.cowrangler/plugins/'i yükler.
 * Bir plugin "etkin" ise: önerdiği SKILL'ler vurgulanır, CONNECTOR'ları Browse'da öne çıkar.
 *
 * Buradaki skill id'leri src/bundled_skills/ altındaki klasör adlarıdır.
 * connector id'leri connectors_catalog.ts'teki id'lerdir.
 */

export interface BundledPlugin {
  id: string;
  name: string;
  description: string;
  /** Her zaman 'cowrangler' — imzalı paketler */
  author: "cowrangler";
  signed: true;
  category: "dev" | "writing" | "data" | "productivity" | "ops";
  /** İçerdiği bundled skill id'leri */
  skills: string[];
  /** Önerdiği connector id'leri (connectors_catalog) */
  connectors: string[];
  /** Varsayılan olarak etkin mi */
  enabledByDefault: boolean;
}

export const BUNDLED_PLUGINS: BundledPlugin[] = [
  {
    id: "dev-toolkit",
    name: "Developer Toolkit",
    description:
      "Kod yazma, inceleme, hata ayıklama ve git akışı için skill + connector paketi.",
    author: "cowrangler",
    signed: true,
    category: "dev",
    skills: [
      "software-development",
      "code-review",
      "github-pr-workflow",
      "git-workflow",
      "debugging",
      "refactoring",
      "testing",
    ],
    connectors: ["github", "git", "filesystem"],
    enabledByDefault: true,
  },
  {
    id: "writing-suite",
    name: "Writing Suite",
    description:
      "Profesyonel iletişim, kopya düzenleme ve dokümantasyon için yazım paketi.",
    author: "cowrangler",
    signed: true,
    category: "writing",
    skills: [
      "professional-communicator",
      "copy-editor",
      "documentation",
      "executive-summarizer",
      "simplify",
      "email",
    ],
    connectors: ["fetch"],
    enabledByDefault: true,
  },
  {
    id: "data-pack",
    name: "Data Pack",
    description: "Veri bilimi ve MLOps iş akışları + veritabanı bağlantısı.",
    author: "cowrangler",
    signed: true,
    category: "data",
    skills: ["data-science", "mlops"],
    connectors: ["postgres", "filesystem"],
    enabledByDefault: false,
  },
  {
    id: "devops-pack",
    name: "DevOps Pack",
    description: "Dağıtım, altyapı ve operasyon skill'leri.",
    author: "cowrangler",
    signed: true,
    category: "ops",
    skills: ["devops", "api-design"],
    connectors: ["github", "git"],
    enabledByDefault: false,
  },
  {
    id: "productivity-pack",
    name: "Productivity Pack",
    description: "Not alma, üretkenlik ve görev yönetimi skill'leri.",
    author: "cowrangler",
    signed: true,
    category: "productivity",
    skills: ["note-taking", "productivity"],
    connectors: ["notion", "linear"],
    enabledByDefault: false,
  },
];

export function getBundledPlugins(): BundledPlugin[] {
  return [...BUNDLED_PLUGINS];
}

export function getBundledPlugin(id: string): BundledPlugin | undefined {
  return BUNDLED_PLUGINS.find((p) => p.id === id);
}

/** Varsayılan etkin plugin id'leri (ilk kurulum deneyimi bunlarla gelir). */
export function getDefaultEnabledPluginIds(): string[] {
  return BUNDLED_PLUGINS.filter((p) => p.enabledByDefault).map((p) => p.id);
}

/** Etkin plugin'lerin önerdiği benzersiz connector id listesi (Browse'da öne çıkar). */
export function getRecommendedConnectorIds(enabledPluginIds: string[]): string[] {
  const set = new Set<string>();
  for (const id of enabledPluginIds) {
    const p = getBundledPlugin(id);
    p?.connectors.forEach((c) => set.add(c));
  }
  return [...set];
}
