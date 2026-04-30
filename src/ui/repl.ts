import fs from "fs";
import path from "path";
import readline from "readline";
import { Agent } from "../core/agent.js";
import { SkillManager } from "../core/skills.js";
import { CommandRouter, CommandContext } from "./commands.js";
import { Theme, UI } from "./theme.js";
import { TaskSpinner } from "./spinner.js";

const HISTORY_FILE = path.resolve(".wrangler_history");

export class InteractiveRepl {
  private agent: Agent;
  private skillManager: SkillManager;
  private router: CommandRouter;
  private input: string = "";
  private cursor: number = 0;
  private selectedIndex: number = 0;
  private menuVisible: boolean = false;
  private choices: string[] = [];
  private filteredChoices: string[] = [];
  private lastMenuHeight: number = 0;

  constructor(agent: Agent) {
    this.agent = agent;
    this.skillManager = new SkillManager();
    this.router = new CommandRouter();
    this.choices = this.getMenuChoices();
  }

  public async start() {
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);

    this.render();

    process.stdin.on("keypress", async (str, key) => {
      // 1. EXIT (CTRL+C)
      if (key.ctrl && key.name === "c") {
        console.log("\n");
        UI.warn("Session terminated.");
        process.exit(0);
      }

      // 2. NAVIGATION (Menü açıkken ok tuşlarıyla gezinme)
      if (this.menuVisible && this.filteredChoices.length > 0) {
        if (key.name === "up") {
          this.selectedIndex =
            (this.selectedIndex - 1 + this.filteredChoices.length) %
            this.filteredChoices.length;
          this.render();
          return;
        }
        if (key.name === "down") {
          this.selectedIndex =
            (this.selectedIndex + 1) % this.filteredChoices.length;
          this.render();
          return;
        }
      }

      // 3. SEÇİMİ SATIRA YAZ (TAB TUŞU) - Seçer ama hemen çalıştırmaz
      if (
        key.name === "tab" &&
        this.menuVisible &&
        this.filteredChoices.length > 0
      ) {
        const lastSlashIndex = this.input.lastIndexOf("/");
        this.input =
          this.input.substring(0, lastSlashIndex) +
          this.filteredChoices[this.selectedIndex];
        this.cursor = this.input.length;
        this.menuVisible = false;
        this.render();
        return;
      }

      // 4. ÇALIŞTIR VE GÖNDER (ENTER TUŞU)
      if (key.name === "return") {
        let finalInput = this.input;
        if (this.menuVisible && this.filteredChoices.length > 0) {
          const lastSlashIndex = this.input.lastIndexOf("/");
          finalInput =
            this.input.substring(0, lastSlashIndex) +
            this.filteredChoices[this.selectedIndex];
        }

        process.stdout.write("\n");
        const textToProcess = finalInput.trim();
        this.input = "";
        this.cursor = 0;
        this.menuVisible = false;
        this.lastMenuHeight = 0;

        if (textToProcess) await this.handleInput(textToProcess);
        this.render();
        return;
      }

      // 5. BACKSPACE & YAZIM
      if (key.name === "backspace") {
        this.input = this.input.slice(0, -1);
        this.cursor = Math.max(0, this.cursor - 1);
      } else if (str && str.length === 1) {
        this.input += str;
        this.cursor++;
      }

      // 6. INTELLISENSE TETİKLEME MANTIĞI
      const lastSlashIndex = this.input.lastIndexOf("/");
      if (lastSlashIndex !== -1) {
        this.menuVisible = true;
        const query = this.input.substring(lastSlashIndex).toLowerCase();
        this.filteredChoices = this.choices.filter((c) =>
          c.toLowerCase().startsWith(query),
        );
      } else {
        this.menuVisible = false;
      }

      if (this.selectedIndex >= this.filteredChoices.length)
        this.selectedIndex = 0;
      this.render();
    });
  }

  private clearLastRender() {
    if (this.lastMenuHeight > 0) {
      for (let i = 0; i < this.lastMenuHeight; i++) {
        process.stdout.write("\x1b[1B\r\x1b[2K");
      }
      process.stdout.write(`\x1b[${this.lastMenuHeight}A\r`);
    }
    process.stdout.write("\r\x1b[2K");
  }

  private render() {
    this.clearLastRender();

    // Prompt + Girdi (❯ simgesi 2 karakter yer kaplar)
    process.stdout.write(`${Theme.accent.dim("❯")} ${this.input}`);

    if (this.menuVisible && this.filteredChoices.length > 0) {
      const visibleCount = Math.min(this.filteredChoices.length, 8);
      this.lastMenuHeight = visibleCount + 2;

      process.stdout.write("\n" + Theme.main("  │"));
      this.filteredChoices.slice(0, visibleCount).forEach((choice, i) => {
        const isSelected = i === this.selectedIndex;
        const pointer = isSelected ? Theme.main(" ● ") : Theme.dim(" ○ ");
        const text = isSelected ? Theme.accent.bold(choice) : Theme.dim(choice);
        process.stdout.write("\n\x1b[K" + Theme.main("  │ ") + pointer + text);
      });
      process.stdout.write("\n\x1b[K" + Theme.main("  └─" + "─".repeat(50)));

      // İmleci tam olarak yazının bittiği yere çek (Mıknatıs hizalaması: + 2)
      process.stdout.write(
        `\x1b[${this.lastMenuHeight}A\r\x1b[${this.cursor + 2}C`,
      );
    } else {
      this.lastMenuHeight = 0;
      process.stdout.write(`\r\x1b[${this.cursor + 2}C`);
    }
  }

  private getMenuChoices(): string[] {
    const cmds = this.router.getCommandNames();
    const skills = this.skillManager
      .getAvailableSkills()
      .map((s) => `/skill ${s.id}`);
    return [...cmds, ...skills];
  }

  private async handleInput(input: string) {
    try {
      fs.appendFileSync(HISTORY_FILE, input + "\n", "utf-8");
    } catch {}
    const ctx: CommandContext = {
      agent: this.agent,
      skillManager: this.skillManager,
      executeAgentDirective: this.processAgentRequest.bind(this),
    };
    if (input.startsWith("/")) await this.router.route(input, ctx);
    else await this.processAgentRequest(input);
  }

  private async processAgentRequest(input: string) {
    const spinner = new TaskSpinner();
    spinner.start("Thinking...");
    try {
      const reply = await this.agent.chat(input, (toolName, args) => {
        spinner.update(
          toolName === "utilize_skill" ? args?.skill_name : toolName,
          "tool",
        );
      });
      spinner.stop();
      console.log("\n" + (await UI.renderMarkdown(reply)) + "\n");
    } catch (e: any) {
      spinner.stop();
      UI.error(e.message);
    }
  }
}
