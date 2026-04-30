import readline from "readline";
import fs from "fs";
import path from "path";
import { Agent } from "../core/agent.js";
import { SkillManager } from "../core/skills.js";
import { CommandRouter, CommandContext } from "./commands.js";
import { Theme, UI } from "./theme.js";
import { TaskSpinner } from "./spinner.js";

const HISTORY_FILE = path.resolve(".wrangler_history");

export class InteractiveRepl {
  private rl!: readline.Interface;
  private agent: Agent;
  private skillManager: SkillManager;
  private router: CommandRouter;
  private isProcessing: boolean = false;

  constructor(agent: Agent) {
    this.agent = agent;
    this.skillManager = new SkillManager();
    this.router = new CommandRouter();
  }

  public start() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: Theme.accent.dim("❯ "),
      completer: this.completer.bind(this),
      historySize: 100,
    });

    try {
      if (fs.existsSync(HISTORY_FILE)) {
        const h = fs
          .readFileSync(HISTORY_FILE, "utf-8")
          .split("\n")
          .filter(Boolean)
          .reverse();
        (this.rl as any).history = h.slice(0, 100);
      }
    } catch {}

    this.rl.on("line", this.handleLine.bind(this));
    this.rl.on("close", () => {
      UI.warn("Terminating session...");
      process.exit(0);
    });
    this.prompt();
  }

  private completer(line: string) {
    const cmds = this.router.getCommandNames();
    const skills = this.skillManager
      .getAvailableSkills()
      .map((s) => `/skill ${s.id}`);

    const allCompletions = [...cmds, ...skills];

    const hits = allCompletions.filter((c) => c.startsWith(line));

    // Tab'a basıldığında, birden fazla seçenek varsa standart terminal gibi alt satırda listeler.
    // Tek seçenek varsa satırı tamamlar.
    return [hits.length ? hits : allCompletions, line];
  }

  private prompt() {
    if (!this.isProcessing) this.rl.prompt();
  }

  private async handleLine(line: string) {
    if (this.isProcessing) return;
    const input = line.trim();
    if (!input) return this.prompt();

    this.isProcessing = true;
    this.rl.pause();

    try {
      fs.appendFileSync(HISTORY_FILE, input + "\n", "utf-8");
    } catch {}

    const ctx: CommandContext = {
      agent: this.agent,
      skillManager: this.skillManager,
      executeAgentDirective: this.processAgentRequest.bind(this),
    };

    try {
      if (input.startsWith("/")) {
        // Skill kullanımına şık bir görünüm katmak için input'u terminalde yeniden boyuyoruz
        const skillMatch = input.match(/^\/skill\s+([a-zA-Z0-9_-]+)/);
        if (skillMatch && skillMatch[1]) {
          const skillName = skillMatch[1];
          // İşlem commands.ts'e devredilmeden önce terminalde yetenek ismini vurgula
        }

        const handled = await this.router.route(input, ctx);
        if (!handled) UI.error("Unknown command. Press Tab to view options.");
      } else {
        await this.processAgentRequest(input);
      }
    } catch (err: any) {
      UI.error(`Exception: ${err.message}`);
    } finally {
      this.isProcessing = false;
      this.rl.resume();
      this.prompt();
    }
  }

  private async processAgentRequest(input: string) {
    const spinner = new TaskSpinner();
    spinner.start("Analyzing...");

    try {
      const reply = await this.agent.chat(input, (toolName, args) => {
        spinner.update(
          toolName === "utilize_skill" ? args?.skill_name : toolName,
          toolName === "utilize_skill" ? "skill" : "tool",
        );
      });
      spinner.stop();
      const formatted = await UI.renderMarkdown(reply);
      console.log("\n" + formatted + "\n");
    } catch (e) {
      spinner.stop();
      throw e;
    }
  }
}
