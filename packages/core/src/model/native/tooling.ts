/**
 * Registry köprüsü — vercel-stili tool tanımlarını port'a çevirir.
 *
 * TOOL_SCHEMAS girdileri `{ description, parameters, execute }` biçiminde;
 * `parameters` üç şekilden biri olabilir:
 *   1. zod şeması (builtin tool'lar — `z.object({...})`)
 *   2. `ai` jsonSchema() nesnesi (MCP tool'ları — `.jsonSchema` alanı taşır)
 *   3. düz JSON Schema nesnesi
 *
 * Bu köprü hepsini ToolSpec.parameters (JSON Schema) + executeTool callback'ine
 * indirger; böylece runAgentLoop registry'yi hiç bilmeden çalışır.
 */

import { zodToJsonSchema } from "zod-to-json-schema";
import type { JSONSchema, ToolSpec } from "./types.js";
import type { ToolInvocation, ToolOutcome } from "./loop.js";

export interface RegistryToolDef {
  description?: string;
  parameters?: unknown;
  execute?: (args: unknown, options: { toolCallId: string; messages: unknown[] }) => Promise<unknown> | unknown;
}

function isZodSchema(p: any): boolean {
  return !!p && typeof p === "object" && "_def" in p && typeof p.safeParse === "function";
}

/** parameters → JSON Schema. Üç şekli de handle eder. */
export function toJSONSchema(parameters: unknown): JSONSchema {
  if (!parameters || typeof parameters !== "object") {
    return { type: "object", properties: {} };
  }
  const p: any = parameters;

  // 2) ai jsonSchema() nesnesi
  if (p.jsonSchema && typeof p.jsonSchema === "object") {
    return strip(p.jsonSchema);
  }
  // 1) zod şeması
  if (isZodSchema(p)) {
    return strip(zodToJsonSchema(p, { $refStrategy: "none" }) as Record<string, unknown>);
  }
  // 3) düz JSON Schema
  return strip(p);
}

/** JSON Schema temizliği: $schema/definitions köklerini kaldır (tool API'leri istemez). */
function strip(schema: Record<string, unknown>): JSONSchema {
  const { $schema, ...rest } = schema as any;
  return rest;
}

/**
 * Registry (`Record<name, def>`) → ToolSpec[] + executeTool.
 * agent.getTools() çıktısı doğrudan buraya verilebilir.
 */
export function bindRegistry(tools: Record<string, RegistryToolDef>): {
  specs: ToolSpec[];
  executeTool: (inv: ToolInvocation) => Promise<ToolOutcome>;
} {
  const specs: ToolSpec[] = Object.entries(tools).map(([name, def]) => ({
    name,
    description: def.description ?? "",
    parameters: toJSONSchema(def.parameters),
  }));

  const executeTool = async (inv: ToolInvocation): Promise<ToolOutcome> => {
    const def = tools[inv.name];
    if (!def || typeof def.execute !== "function") {
      return { result: `Unknown tool: ${inv.name}`, isError: true };
    }
    try {
      const raw = await def.execute(inv.args, { toolCallId: inv.id, messages: [] });
      return { result: raw };
    } catch (e) {
      return { result: e instanceof Error ? e.message : String(e), isError: true };
    }
  };

  return { specs, executeTool };
}
