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
  private lastInputHeight: number = 1;

  constructor(agent: Agent) {
    this.agent = agent;
    this.skillManager = new SkillManager();
    this.router = new CommandRouter();
    this.choices = this.getMenuChoices();
  }

  public async start() {
    // 1. GÜVENLİK SİGORTALARI: Program kapanırsa veya çökerse terminali normal haline döndür
    process.on("exit", () => {
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
    });

    process.on("uncaughtException", (err) => {
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      console.error("\n[Sistem Hatası]:", err.message);
      process.exit(1);
    });

    process.on("unhandledRejection", (err) => {
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      console.error("\n[Beklenmeyen Hata]:", err);
      process.exit(1);
    });

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);

    // Klavyeyi aktif dinlemeye zorla (Kapanmayı engeller)
    process.stdin.resume();

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

        if (textToProcess) {
          await this.handleInput(textToProcess);
        }

        // 2. KRİTİK EKLEME: Ajan tool kullandıktan sonra terminal kontrolünü geri alıyoruz
        if (process.stdin.isTTY) process.stdin.setRawMode(true);
        process.stdin.resume();

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

  // Terminal genişliğini hesaba katarak girdinin kaç satır kapladığını hesaplar
  private calculateDisplayHeight(text: string): number {
    const columns = process.stdout.columns || 80; // Terminal genişliği (varsayılan 80)
    // ❯ simgesi ve boşluk (2 karakter) eklendiğini varsayıyoruz
    return Math.ceil((text.length + 2) / columns);
  }

  private clearLastRender() {
    const totalHeightToClear = this.lastMenuHeight + this.lastInputHeight - 1;

    if (totalHeightToClear > 0) {
      // Bulunduğumuz satırdan aşağı inip eski menüyü sil
      for (let i = 0; i < totalHeightToClear; i++) {
        process.stdout.write("\x1b[1B\r\x1b[2K");
      }
      // İmleci tekrar en başa (yukarı) al
      process.stdout.write(`\x1b[${totalHeightToClear}A\r`);
    }
    // Ana satırı temizle
    process.stdout.write("\r\x1b[2K");
  }

  private render() {
    this.clearLastRender();

    // Yeni girdinin yüksekliğini hesapla ve kaydet
    this.lastInputHeight = this.calculateDisplayHeight(this.input);

    // Prompt + Girdi
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

      // İmleci tam olarak yazının bittiği yere çek
      // X Ekseni hizalaması (Sütun)
      const columns = process.stdout.columns || 80;
      const cursorX = (this.cursor + 2) % columns;

      process.stdout.write(`\x1b[${this.lastMenuHeight}A\r\x1b[${cursorX}C`);
    } else {
      this.lastMenuHeight = 0;

      const columns = process.stdout.columns || 80;
      // İmlecin hangi satır ve sütunda olması gerektiğini hesapla
      const cursorY = Math.floor((this.cursor + 2) / columns);
      const cursorX = (this.cursor + 2) % columns;

      // Eğer imleç çok satırlı bir yazının ortasındaysa (backspace ile vs.) y eksenini ayarla
      const yOffset = this.lastInputHeight - 1 - cursorY;

      if (yOffset > 0) {
        process.stdout.write(`\x1b[${yOffset}A\r\x1b[${cursorX}C`);
      } else {
        process.stdout.write(`\r\x1b[${cursorX}C`);
      }
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
