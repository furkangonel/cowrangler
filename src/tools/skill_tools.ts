import { z } from "zod";
import fs from "fs";
import path from "path";
import { registerTool } from "./registry.js";
import { SkillManager } from "../core/skills.js";

const skillManager = new SkillManager();
const SKILLS_DIR = path.resolve("skills");

registerTool(
  "utilize_skill",
  "Fetches the Standard Operating Procedure (SOP) or guidelines for a specific skill. Call this tool BEFORE starting a complex task if you possess the relevant skill.",
  z.object({
    skill_name: z.string().describe("The exact name of the skill to load."),
  }),
  async ({ skill_name }: { skill_name: string }) => {
    const content = skillManager.readSkill(skill_name);
    return `--- SKILL GUIDELINES: ${skill_name.toUpperCase()} ---\n${content}\n--- END OF GUIDELINES ---`;
  },
);

registerTool(
  "create_skill",
  "Creates a new Expert Skill (SOP) directly in the system's architecture.",
  z.object({
    skill_id: z.string(),
    description: z.string(),
    content: z.string(),
  }),
  async ({
    skill_id,
    description,
    content,
  }: {
    skill_id: string;
    description: string;
    content: string;
  }) => {
    const clean_id = skill_id
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!clean_id) return "HATA: Geçersiz skill_id.";

    const skillDir = path.join(SKILLS_DIR, clean_id);
    if (fs.existsSync(skillDir)) {
      return `HATA: '${clean_id}' adında bir yetenek zaten var.`;
    }

    try {
      fs.mkdirSync(skillDir, { recursive: true });
      const fileContent = `---\nname: ${clean_id}\ndescription: ${description}\n---\n\n${content.trim()}`;
      fs.writeFileSync(path.join(skillDir, "SKILL.md"), fileContent, "utf-8");
      return `OK: 🚀 '${clean_id}' yeteneği başarıyla oluşturuldu!`;
    } catch (e: any) {
      return `HATA: Yetenek oluşturulurken bir sorun oluştu: ${e.message}`;
    }
  },
);
