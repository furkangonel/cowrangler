import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import { DIRS } from "./init.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Bundled skills live next to this file in src/bundled_skills/
// After build they will be at dist/bundled_skills/
const BUNDLED_SKILLS_DIR = path.resolve(__dirname, "../bundled_skills");

export interface SkillDef {
  id: string;
  name: string;
  description: string;
  source: "bundled" | "global" | "local";
  content: string;
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
      const skillPath = path.join(dirPath, item);
      try {
        if (!fs.statSync(skillPath).isDirectory()) continue;
        const skillFile = path.join(skillPath, "SKILL.md");
        if (!fs.existsSync(skillFile)) continue;

        const content = fs.readFileSync(skillFile, "utf-8");
        const { metadata, body } = this._parseFrontmatter(content);

        // Use folder name as fallback id if frontmatter name is missing
        const id = item;
        const name = metadata.name || id;
        const description = metadata.description || "No description.";

        map.set(id, { id, name, description, source, content: body });
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
    const localSkills = this.loadSkillsFromDir(DIRS.local.skills, "local");
    localSkills.forEach((val, key) => merged.set(key, val));

    return Array.from(merged.values()).sort((a, b) => a.id.localeCompare(b.id));
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
}
