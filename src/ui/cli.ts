import { Agent } from "../core/agent.js";
import { UI } from "./theme.js";
import { InteractiveRepl } from "./repl.js";
import { SkillManager } from "../core/skills.js";
import { TOOL_SCHEMAS } from "../tools/registry.js";

export async function runCLI(agent: Agent) {
  UI.printDashboard(agent.llm.model, process.cwd());

  // Print a brief capability summary so the user knows what's available
  const skillCount = new SkillManager().getAvailableSkills().length;
  const toolCount = Object.keys(TOOL_SCHEMAS).length;
  UI.info(`${toolCount} tools · ${skillCount} skills loaded. Type /help to get started.\n`);

  const repl = new InteractiveRepl(agent);
  repl.start();
}
