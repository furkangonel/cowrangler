import fs from "node:fs";
import path from "node:path";

const targetDir = path.resolve("packages/core/src/model");
const maxAnyCount = 14;
const ignoredDirs = new Set(["dist", "node_modules"]);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (entry.isFile() && fullPath.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

const matches = [];
for (const file of walk(targetDir)) {
  const source = fs.readFileSync(file, "utf8");
  const regex = /\bany\b/g;
  let match;
  while ((match = regex.exec(source))) {
    const line = source.slice(0, match.index).split("\n").length;
    matches.push(`${path.relative(process.cwd(), file)}:${line}`);
  }
}

if (matches.length > maxAnyCount) {
  console.error(
    `packages/core/src/model has ${matches.length} "any" usages; budget is ${maxAnyCount}.`,
  );
  console.error(matches.join("\n"));
  process.exit(1);
}

console.log(`Any budget OK: ${matches.length}/${maxAnyCount} in packages/core/src/model`);
