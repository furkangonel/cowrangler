import { z } from "zod";

export const TOOL_SCHEMAS: Record<string, any> = {};

/**
 * Vertex AI API requires tool responses to be a google.protobuf.Struct (JSON object),
 * NOT a plain string. When @ai-sdk/google-vertex receives a raw string from an execute
 * function, it forwards it as-is and Vertex rejects it with a 400 error:
 *   "Invalid value at 'contents[x].parts[0].function_response.response'"
 *
 * Wrapping the result in { result: value } ensures the SDK always serializes it
 * as a proper Struct regardless of the model provider, while still being readable
 * by the LLM (models understand { "result": "..." } just fine).
 */
function wrapExecute(execute: Function): Function {
  return async (...args: any[]) => {
    const raw = await execute(...args);
    // Already an object → pass through (e.g., tools that already return JSON objects)
    if (typeof raw === "object" && raw !== null) return raw;
    // Plain string / number / boolean → wrap so Vertex gets a valid Struct
    return { result: String(raw) };
  };
}

export function registerTool(
  name: string,
  description: string,
  parameters: any,
  execute: Function,
) {
  TOOL_SCHEMAS[name] = {
    description,
    parameters,
    execute: wrapExecute(execute),
  };
}

/**
 * Bir aracı registry'den kaldırır. MCP sunucusunun bağlantısı kesildiğinde
 * (remove/reload) o sunucuya ait araçların temizlenmesi için kullanılır.
 * Aksi halde bağlantısı kesilmiş sunucunun araçları modele sunulmaya devam eder.
 */
export function unregisterTool(name: string): void {
  delete TOOL_SCHEMAS[name];
}

export function hasTool(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(TOOL_SCHEMAS, name);
}

export function getToolNames(): string[] {
  return Object.keys(TOOL_SCHEMAS);
}
