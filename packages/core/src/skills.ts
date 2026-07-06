import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import { DIRS, getConfig } from "./init.js";
import { getProjectLocalSkillsDir, getProjectContextSkillsDir } from "./project_context.js";
import { PluginManager } from "./plugins.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Bundled skills'in çalışma zamanındaki kök dizinini çözer.
 * Birden fazla çalışma moduyla uyumlu olması için aday yolları sırayla dener:
 *   - tsc build (dist/bundled_skills) veya kaynaktan çalıştırma   → ../bundled_skills
 *   - electron-vite dev (main out/main'den çalışır)               → ../../src/bundled_skills
 *   - paketlenmiş electron (extraResources)                       → resourcesPath/bundled_skills
 *   - dev fallback (cwd = proje kökü)                             → src/bundled_skills
 * İlk var olan dizin seçilir; hiçbiri yoksa ilk aday döndürülür.
 */
function resolveBundledSkillsDir(): string {
  const candidates = [
    path.resolve(__dirname, "../bundled_skills"),
    path.resolve(__dirname, "../../src/bundled_skills"),
    path.resolve(__dirname, "../../../bundled_skills"),
    path.resolve(__dirname, "../../../../bundled_skills"),
    (process as any).resourcesPath
      ? path.join((process as any).resourcesPath, "bundled_skills")
      : "",
    path.resolve(process.cwd(), "bundled_skills"),
    path.resolve(process.cwd(), "../../bundled_skills"),
    path.resolve(process.cwd(), "src/bundled_skills"),
    path.resolve(process.cwd(), "dist/bundled_skills"),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // erişilemeyen aday → sonrakini dene
    }
  }
  return candidates[0];
}

const BUNDLED_SKILLS_DIR = resolveBundledSkillsDir();

export interface SkillDef {
  id: string;
  name: string;
  description: string;
  source: "bundled" | "global" | "local";
  content: string;
  /** Skill'in diskteki kök klasörü (SKILL.md'nin bulunduğu dizin). Dosya ağacı görünümü için. */
  dir?: string;
}

export class SkillManager {
  private _parseFrontmatter(content: string): { metadata: any; body: string } {
    if (!content.startsWith("---")) return { metadata: {}, body: content };
    const parts = content.split("---");
    if (parts.length >= 3) {
      try {
        const metadata = yaml.load(parts[1]) || {};
        const body = parts.slice(2).join("---").trim();
        return { metadata, body };
      } catch {
        return { metadata: {}, body: content };
      }
    }
    return { metadata: {}, body: content };
  }

  private loadSkillsFromDir(
    dirPath: string,
    source: "bundled" | "global" | "local",
  ): Map<string, SkillDef> {
    const map = new Map<string, SkillDef>();
    if (!fs.existsSync(dirPath)) return map;

    const items = fs.readdirSync(dirPath);
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      try {
        if (!fs.statSync(itemPath).isDirectory()) continue;

        const skillFile = path.join(itemPath, "SKILL.md");
        if (fs.existsSync(skillFile)) {
          // Direct skill folder (flat structure)
          const content = fs.readFileSync(skillFile, "utf-8");
          const { metadata, body } = this._parseFrontmatter(content);
          const id = item;
          const name = metadata.name || id;
          const description = metadata.description || "No description.";
          map.set(id, { id, name, description, source, content: body, dir: itemPath });
        } else {
          // Category folder — recurse one level deeper
          const subItems = fs.readdirSync(itemPath);
          for (const subItem of subItems) {
            const subSkillPath = path.join(itemPath, subItem);
            try {
              if (!fs.statSync(subSkillPath).isDirectory()) continue;
              const subSkillFile = path.join(subSkillPath, "SKILL.md");
              if (!fs.existsSync(subSkillFile)) continue;

              const content = fs.readFileSync(subSkillFile, "utf-8");
              const { metadata, body } = this._parseFrontmatter(content);
              const id = subItem;
              const name = metadata.name || id;
              const description = metadata.description || "No description.";
              map.set(id, { id, name, description, source, content: body, dir: subSkillPath });
            } catch {
              // Skip malformed nested skill directories silently
            }
          }
        }
      } catch {
        // Skip malformed skill directories silently
      }
    }
    return map;
  }

  /**
   * Returns all available skills, merged in priority order:
   * bundled (lowest) → global → local (highest)
   * Higher-priority skills override lower-priority ones with the same ID.
   */
  public getAvailableSkills(): SkillDef[] {
    const merged = new Map<string, SkillDef>();

    // 1. Bundled skills (lowest priority — shipped with the package)
    const bundledSkills = this.loadSkillsFromDir(BUNDLED_SKILLS_DIR, "bundled");
    bundledSkills.forEach((val, key) => merged.set(key, val));

    // 2. Global skills (~/.cowrangler/skills) — override bundled
    const globalSkills = this.loadSkillsFromDir(DIRS.global.skills, "global");
    globalSkills.forEach((val, key) => merged.set(key, val));

    // 3. Local project skills (.cowrangler/skills) — highest priority
    const localSkills = this.loadSkillsFromDir(getProjectLocalSkillsDir(), "local");
    localSkills.forEach((val, key) => merged.set(key, val));

    // 4. Plugin-registered skills (local priority)
    try {
      const pluginPaths = PluginManager.getInstance().getPluginSkillPaths();
      for (const pPath of pluginPaths) {
        const pluginSkills = this.loadSkillsFromDir(pPath, "local");
        pluginSkills.forEach((val, key) => merged.set(key, val));
      }
    } catch (e) {
      console.error("Failed to load plugin skills:", e);
    }

    return Array.from(merged.values()).sort((a, b) => a.id.localeCompare(b.id));
  }

  /** config.yaml'daki disabled_skills listesi. */
  private getDisabledSkillIds(): string[] {
    try {
      const cfg = getConfig() as any;
      return Array.isArray(cfg?.disabled_skills) ? cfg.disabled_skills : [];
    } catch {
      return [];
    }
  }

  /**
   * Kullanıcının ETKİN bıraktığı skill'ler (disabled_skills hariç).
   * Agent hem system prompt listesini hem de otomatik eşleştirmeyi bunun
   * üzerinden yapar — devre dışı bırakılmış skill asla enjekte edilmez.
   */
  public getEnabledSkills(): SkillDef[] {
    const disabled = new Set(this.getDisabledSkillIds());
    return this.getAvailableSkills().filter((s) => !disabled.has(s.id));
  }

  /**
   * Bir kullanıcı mesajına en güçlü eşleşen ETKİN skill'i döndürür (yoksa null).
   * Deterministik anahtar-kelime skoru: skill id'sinin tümü geçerse (5p) veya
   * id kelimelerinden ikisi tam-kelime olarak geçerse (2p+2p) eşik (4) aşılır.
   * Tek yaygın kelimeyle (2p) tetiklenmez → yanlış-pozitif düşük.
   */
  public matchSkill(message: string): SkillDef | null {
    const msg = (message || "").toLowerCase();
    if (!msg.trim()) return null;
    let best: SkillDef | null = null;
    let bestScore = 0;
    for (const s of this.getEnabledSkills()) {
      const idLower = s.id.toLowerCase();
      const idSpaced = idLower.replace(/[-_]+/g, " ");
      let score = 0;
      if (msg.includes(idLower) || msg.includes(idSpaced)) score += 5;
      const idWords = idLower.split(/[-_\s]+/).filter((w) => w.length >= 4);
      for (const w of idWords) {
        const esc = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (new RegExp(`\\b${esc}\\b`).test(msg)) score += 2;
      }
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return bestScore >= 4 ? best : null;
  }

  public readSkill(skillId: string): string {
    const skills = this.getAvailableSkills();
    const target = skills.find((s) => s.id === skillId);

    if (!target) return `ERROR: Skill '${skillId}' not found. Use /skills to list available skills.`;

    return [
      `---`,
      `id: ${target.id}`,
      `name: ${target.name}`,
      `description: ${target.description}`,
      `source: ${target.source}`,
      `---`,
      ``,
      target.content,
    ].join("\n");
  }

  public listSkillIds(): string[] {
    return this.getAvailableSkills().map((s) => s.id);
  }

  /**
   * Bir SKILL'i (global/bundled/local) aktif projenin CONTEXT alanına kopyalar:
   *   {workdir}/.cowrangler/context/skills/<id>/SKILL.md
   *
   * Spec: "SKILL her zaman global; bir projede çağrılınca o projenin CONTEXT
   * alanına kopyalanmalı." Bu fonksiyon `utilize_skill` çağrısında tetiklenir.
   * Idempotent — varsa üzerine yazar (en güncel sürüm).
   */
  public copySkillToContext(skillId: string): { ok: boolean; path?: string; error?: string } {
    const target = this.getAvailableSkills().find((s) => s.id === skillId);
    if (!target) return { ok: false, error: `Skill '${skillId}' not found.` };

    const destDir = path.join(getProjectContextSkillsDir(), target.id);
    try {
      fs.mkdirSync(destDir, { recursive: true });
      const full = [
        `---`,
        `id: ${target.id}`,
        `name: ${target.name}`,
        `description: ${target.description}`,
        `source: ${target.source}`,
        `copied_at: ${new Date().toISOString()}`,
        `---`,
        ``,
        target.content,
      ].join("\n");
      fs.writeFileSync(path.join(destDir, "SKILL.md"), full, "utf-8");
      return { ok: true, path: destDir };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  }

  /**
   * Aktif projenin CONTEXT'ine kopyalanmış SKILL'leri (tam içerikleriyle) döndürür.
   * Agent system prompt'u yalnız bunları "aktif" SOP olarak tam metinle enjekte eder.
   */
  public getContextSkills(): SkillDef[] {
    const dir = getProjectContextSkillsDir();
    const out: SkillDef[] = [];
    if (!fs.existsSync(dir)) return out;
    for (const item of fs.readdirSync(dir)) {
      const skillFile = path.join(dir, item, "SKILL.md");
      if (!fs.existsSync(skillFile)) continue;
      try {
        const raw = fs.readFileSync(skillFile, "utf-8");
        const { metadata, body } = this._parseFrontmatter(raw);
        out.push({
          id: item,
          name: metadata.name || item,
          description: metadata.description || "",
          source: "local",
          content: body,
        });
      } catch { /* bozuk skill atla */ }
    }
    return out;
  }

  /** CONTEXT'ten bir SKILL'i kaldırır. */
  public removeContextSkill(skillId: string): boolean {
    const destDir = path.join(getProjectContextSkillsDir(), skillId);
    try {
      if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  }
}
