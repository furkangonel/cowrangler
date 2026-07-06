/**
 * hooks — yaşam döngüsü olaylarında kullanıcı tanımlı shell komutları.
 *
 * `.cowrangler/hooks.yaml` (proje) veya `~/.cowrangler/hooks.yaml` (global):
 *
 *   pre_tool_call:
 *     - match: "execute_bash"        # opsiyonel: araç adı regex
 *       run: "echo running $TOOL"
 *   post_tool_call:
 *     - run: "npm run lint --silent" # her araç sonrası
 *   session_start:
 *     - run: "git status --short"
 *   session_end:
 *     - run: "echo done"
 *
 * Ortam değişkenleri: TOOL (araç adı), COWRANGLER_EVENT.
 * Best-effort: hook hatası ana akışı ASLA bozmaz.
 */

import fs from "fs";
import path from "path";
import os from "os";
import yaml from "js-yaml";
import { execFile } from "child_process";

export type HookEvent = "pre_tool_call" | "post_tool_call" | "session_start" | "session_end";

interface HookDef {
  match?: string;
  run: string;
}

let _cache: Record<string, HookDef[]> | null = null;
let _base = process.cwd();

export function setHooksBase(dir: string): void {
  _base = path.resolve(dir);
  _cache = null;
}

function loadHooks(): Record<string, HookDef[]> {
  if (_cache) return _cache;
  const merged: Record<string, HookDef[]> = {};
  const files = [
    path.join(os.homedir(), ".cowrangler", "hooks.yaml"),
    path.join(_base, ".cowrangler", "hooks.yaml"),
  ];
  for (const file of files) {
    try {
      if (!fs.existsSync(file)) continue;
      const doc = (yaml.load(fs.readFileSync(file, "utf-8")) as any) || {};
      for (const ev of Object.keys(doc)) {
        const list = Array.isArray(doc[ev]) ? doc[ev] : [];
        merged[ev] = [...(merged[ev] ?? []), ...list.filter((h: any) => h && typeof h.run === "string")];
      }
    } catch {
      /* bozuk hooks.yaml sessizce atlanır */
    }
  }
  _cache = merged;
  return merged;
}

export function hasHooks(): boolean {
  return Object.keys(loadHooks()).length > 0;
}

/** Bir olay için tanımlı hook'ları çalıştırır (best-effort, sıralı, non-throwing). */
export async function runHooks(event: HookEvent, ctx: { tool?: string } = {}): Promise<void> {
  const defs = loadHooks()[event];
  if (!defs || defs.length === 0) return;
  for (const def of defs) {
    if (def.match && ctx.tool && !new RegExp(def.match).test(ctx.tool)) continue;
    await new Promise<void>((resolve) => {
      try {
        const child = execFile(
          process.platform === "win32" ? "cmd" : "sh",
          process.platform === "win32" ? ["/c", def.run] : ["-c", def.run],
          {
            cwd: _base,
            timeout: 30_000,
            env: { ...process.env, TOOL: ctx.tool ?? "", COWRANGLER_EVENT: event },
          },
          () => resolve(),
        );
        child.on("error", () => resolve());
      } catch {
        resolve();
      }
    });
  }
}
