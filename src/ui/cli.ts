import path from "path";
import { Agent } from "../core/agent.js";
import { UI } from "./theme.js";
import { InteractiveRepl } from "./repl.js";

export async function runCLI(agent: Agent) {
  // Print the dashboard with the active model and current working directory
  UI.printDashboard(agent.llm.model, process.cwd());

  // Initialize and start our robust, interactive terminal loop
  const repl = new InteractiveRepl(agent);
  repl.start();
}
