import path from "path";
import { Agent } from "../core/agent.js";
import { UI } from "./theme.js";
import { InteractiveRepl } from "./repl.js";

export async function runCLI(agent: Agent) {
  // Ajanın modelini ve mevcut çalışma dizinini ekrana basar
  UI.printDashboard(agent.llm.model, process.cwd());

  // Yeni, saf ve güçlü terminal döngümüzü başlatır
  const repl = new InteractiveRepl(agent);
  repl.start();
}
