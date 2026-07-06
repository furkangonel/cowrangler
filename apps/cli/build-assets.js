import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Copy bundled_skills
const srcSkillsDir = path.resolve(__dirname, "../../bundled_skills");
const destSkillsDir = path.resolve(__dirname, "dist/bundled_skills");

if (!fs.existsSync(destSkillsDir)) {
  fs.mkdirSync(destSkillsDir, { recursive: true });
}

if (fs.existsSync(srcSkillsDir)) {
  fs.cpSync(srcSkillsDir, destSkillsDir, { recursive: true });
}

// 2. Make dist/main.js executable
const mainJs = path.resolve(__dirname, "dist/main.js");
if (fs.existsSync(mainJs)) {
  fs.chmodSync(mainJs, 0o755);
}

console.log("✅ CLI assets copied and permissions set successfully.");
