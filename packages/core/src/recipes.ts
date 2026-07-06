/**
 * recipes — parametrik, tekrar kullanılabilir iş akışları.
 *
 * Skill'lerden farkı: recipe PARAMETRE alır ve çalıştırılır. Adımlar
 * `{{param}}` ile enterpolasyona uğrar ve ajana tek bir yönerge olarak verilir.
 *
 * `.cowrangler/recipes/<name>.yaml` (proje) veya `~/.cowrangler/recipes/<name>.yaml`:
 *
 *   name: deploy
 *   description: Build, test and deploy to an environment
 *   params:
 *     - name: env
 *       required: true
 *   steps:
 *     - Run the test suite and stop if it fails
 *     - Build the project
 *     - Deploy to {{env}}
 */

import fs from "fs";
import path from "path";
import os from "os";
import yaml from "js-yaml";

export interface RecipeParam { name: string; required?: boolean; default?: string; description?: string; }
export interface Recipe {
  name: string;
  description?: string;
  params?: RecipeParam[];
  steps: string[];
  dir: string;
}

let _base = process.cwd();
export function setRecipesBase(dir: string): void { _base = path.resolve(dir); }

function recipeDirs(): string[] {
  return [
    path.join(os.homedir(), ".cowrangler", "recipes"),
    path.join(_base, ".cowrangler", "recipes"),
  ];
}

export function listRecipes(): Recipe[] {
  const out: Recipe[] = [];
  const seen = new Set<string>();
  for (const dir of recipeDirs()) {
    let files: string[];
    try { files = fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)); } catch { continue; }
    for (const f of files) {
      try {
        const doc = (yaml.load(fs.readFileSync(path.join(dir, f), "utf-8")) as any) || {};
        const name = String(doc.name ?? f.replace(/\.ya?ml$/, ""));
        if (seen.has(name)) continue;
        if (!Array.isArray(doc.steps)) continue;
        seen.add(name);
        out.push({
          name,
          description: doc.description,
          params: Array.isArray(doc.params) ? doc.params : [],
          steps: doc.steps.map((s: any) => String(s)),
          dir,
        });
      } catch { /* bozuk recipe atlanır */ }
    }
  }
  return out;
}

export function getRecipe(name: string): Recipe | undefined {
  return listRecipes().find((r) => r.name === name);
}

/** `key=value key2="v 2"` argümanlarını ayrıştır. */
export function parseRecipeArgs(argstr: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Za-z0-9_]+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(argstr))) out[m[1]] = m[2] ?? m[3] ?? m[4] ?? "";
  return out;
}

/** Recipe'i tek bir ajan yönergesine derler. Eksik zorunlu parametre → hata. */
export function renderRecipe(recipe: Recipe, args: Record<string, string>): { ok: boolean; directive?: string; error?: string } {
  const vals: Record<string, string> = {};
  for (const p of recipe.params ?? []) {
    const v = args[p.name] ?? p.default;
    if (v === undefined && p.required) return { ok: false, error: `Missing required parameter: ${p.name}` };
    if (v !== undefined) vals[p.name] = v;
  }
  const interp = (s: string) => s.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_, k) => vals[k] ?? `{{${k}}}`);
  const steps = recipe.steps.map((s, i) => `${i + 1}. ${interp(s)}`).join("\n");
  const directive = `Execute the "${recipe.name}" recipe. Follow these steps in order, using tools as needed:\n\n${steps}`;
  return { ok: true, directive };
}
