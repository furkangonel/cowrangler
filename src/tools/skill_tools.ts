import { z } from "zod";
import fs from "fs";
import path from "path";
import { registerTool } from "./registry.js";
import { SkillManager } from "../core/skills.js";
import { DIRS } from "../core/init.js";

const skillManager = new SkillManager();

// ─────────────────────────────────────────────────────────────────────────────
// UTILIZE SKILL — read a skill's SOP before starting a task
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "utilize_skill",
  "Load the Standard Operating Procedure (SOP) for a skill. Call this BEFORE starting any complex task that matches an available skill.",
  z.object({
    skill_name: z.string().describe("Exact ID of the skill to load (from the AVAILABLE SKILLS list)"),
  }),
  async ({ skill_name }: { skill_name: string }) => {
    const content = skillManager.readSkill(skill_name);
    return `═══ SKILL LOADED: ${skill_name.toUpperCase()} ═══\n${content}\n═══ END OF SOP ═══\n\nFollow the above SOP carefully as you complete the task.`;
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// CREATE SKILL — author a new skill/SOP
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "create_skill",
  "Create a new project-local skill (SOP) in .cowrangler/skills/. The skill will be immediately available for future use.",
  z.object({
    skill_id: z.string().describe("Short, kebab-case identifier (e.g., 'deploy-process', 'data-pipeline')"),
    description: z.string().describe("One-sentence description shown in the skill list"),
    content: z.string().describe("Full SOP content in markdown format"),
    scope: z.enum(["local", "global"]).optional().default("local")
      .describe("'local' = project only (.cowrangler/skills/), 'global' = all projects (~/.cowrangler/skills/)"),
  }),
  async ({ skill_id, description, content, scope }: {
    skill_id: string; description: string; content: string; scope: string;
  }) => {
    const cleanId = skill_id
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    if (!cleanId) return "ERROR: Invalid skill_id. Use kebab-case (e.g., 'my-workflow').";

    const baseDir = scope === "global" ? DIRS.global.skills : DIRS.local.skills;
    const skillDir = path.join(baseDir, cleanId);

    if (fs.existsSync(skillDir)) {
      return `ERROR: Skill '${cleanId}' already exists in ${scope} skills. Delete the folder first to recreate it.`;
    }

    try {
      fs.mkdirSync(skillDir, { recursive: true });
      const fileContent = [
        "---",
        `name: ${cleanId}`,
        `description: ${description}`,
        "---",
        "",
        content.trim(),
      ].join("\n");

      fs.writeFileSync(path.join(skillDir, "SKILL.md"), fileContent, "utf-8");
      return `OK: Skill '${cleanId}' created in ${scope} skills (${skillDir}).\nIt is now available — use /skill ${cleanId} <task> to invoke it.`;
    } catch (e: any) {
      return `ERROR creating skill: ${e.message}`;
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// LIST SKILLS — list available skills programmatically
// ─────────────────────────────────────────────────────────────────────────────
registerTool(
  "list_skills",
  "List all available skills (SOPs) with their IDs, descriptions, and source (bundled/global/local).",
  z.object({}),
  async () => {
    const skills = skillManager.getAvailableSkills();
    if (!skills.length) return "No skills available.";
    return skills
      .map((s) => `[${s.source.toUpperCase()}] ${s.id}: ${s.description}`)
      .join("\n");
  },
);
