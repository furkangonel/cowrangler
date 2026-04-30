import { z } from "zod";

export const TOOL_SCHEMAS: Record<string, any> = {};

export function registerTool(
  name: string,
  description: string,
  parameters: any,
  execute: Function,
) {
  TOOL_SCHEMAS[name] = {
    description,
    parameters,
    execute,
  };
}
