import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { DIRS } from "./init.js";

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
      } catch (e) {
        return { metadata: {}, body: content };
      }
    }
    return { metadata: {}, body: content };
  }

  private loadSkillsFromDir(
    dirPath: string,
    source: "global" | "local",
  ): Map<string, SkillDef> {
    const map = new Map<string, SkillDef>();
    if (!fs.existsSync(dirPath)) return map;

    const items = fs.readdirSync(dirPath);
    for (const item of items) {
      const skillPath = path.join(dirPath, item);
      if (fs.statSync(skillPath).isDirectory()) {
        const skillFile = path.join(skillPath, "SKILL.md");
        if (fs.existsSync(skillFile)) {
          const content = fs.readFileSync(skillFile, "utf-8");
          const { metadata, body } = this._parseFrontmatter(content);
          if (metadata.name) {
            map.set(item, {
              id: item,
              name: metadata.name,
              description: metadata.description || "Açıklama bulunamadı.",
              source,
              content: body,
            });
          }
        }
      }
    }
    return map;
  }

  public getAvailableSkills(): SkillDef[] {
    const merged = new Map<string, SkillDef>();

    // 1. Önce Global yetenekleri yükle
    const globalSkills = this.loadSkillsFromDir(DIRS.global.skills, "global");
    globalSkills.forEach((val, key) => merged.set(key, val));

    // 2. Local yetenekleri yükle (Aynı ID varsa Global'i ezer)
    const localSkills = this.loadSkillsFromDir(DIRS.local.skills, "local");
    localSkills.forEach((val, key) => merged.set(key, val));

    return Array.from(merged.values());
  }

  public readSkill(skillId: string): string {
    const skills = this.getAvailableSkills();
    const target = skills.find((s) => s.id === skillId);

    if (target) {
      return `---\nname: ${target.name}\ndescription: ${target.description}\n---\n\n${target.content}`;
    }

    return `HATA: '${skillId}' yeteneği bulunamadı.`;
  }
}
