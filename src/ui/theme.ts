import os from "os";
import chalk from "chalk";
import boxen from "boxen";
import Table from "cli-table3";
import { marked } from "marked";
// @ts-ignore
import { markedTerminal } from "marked-terminal";

marked.use(markedTerminal() as unknown as any);

export const Theme = {
  // Claude Code tarzı şık bir mavi tonu (DodgerBlue/Sky)
  main: chalk.hex("#FF4C00"),
  accent: chalk.hex("#F8F2E5"),
  dim: chalk.hex("#6B6B6B"),
  success: chalk.hex("#A5C27C"),
  fail: chalk.hex("#D62926"),
  info: chalk.hex("#5CA4D4"),
};

export const UI = {
  renderMarkdown: async (text: string): Promise<string> => {
    return marked.parse(text) as string;
  },

  success: (msg: string) => console.log(Theme.success(`✓ ${msg}`)),
  error: (msg: string) => console.log(Theme.fail(`✗ ${msg}`)),
  warn: (msg: string) => console.log(Theme.main(`⚠ ${msg}`)),
  info: (msg: string) => console.log(Theme.dim(`ℹ ${msg}`)),

  printDashboard: (modelName: string, workspacePath: string) => {
    const homeDir = os.homedir();
    const displayPath = workspacePath.startsWith(homeDir)
      ? workspacePath.replace(homeDir, "~")
      : workspacePath;

    const safeModelName = modelName || "unknown-engine";

    // Görseldeki gibi dar ve sabit bir tablo yapısı
    const table = new Table({
      chars: {
        top: "",
        "top-mid": "",
        "top-left": "",
        "top-right": "",
        bottom: "",
        "bottom-mid": "",
        "bottom-left": "",
        "bottom-right": "",
        left: "",
        "left-mid": "",
        mid: "",
        "mid-mid": "",
        right: "",
        "right-mid": "",
        middle: " │ ",
      },
      style: { "padding-left": 2, "padding-right": 2 },
      // Sütunları daralttık: Toplam ~65 karakter genişlik (Claude tarzı)
      colWidths: [32, 33],
      wordWrap: true,
    });

    // Mavi Ahtapot Logosu (Octo) - Claude Crab'in kardeşi
    const badge = `
  ${Theme.main("▄▄▄▄▄▄▄")}
  ${Theme.main("█ ███ █")}
  ${Theme.main("███████")}
  ${Theme.main("█▄█     █▄█")}
`;

    const left = [
      Theme.dim("Welcome back, Partner!"),
      "",
      badge,
      "",
      `${Theme.accent.dim(modelName.split("/").pop() || safeModelName)}`,
      `${Theme.accent.dim(displayPath)}`,
    ];

    const right = [
      Theme.main.bold("System Directives"),
      "",
      `${Theme.dim("/help")}    ${Theme.accent("Documentation")}`,
      `${Theme.dim("/skills")}  ${Theme.accent("SOP Library")}`,
      `${Theme.dim("/tools")}   ${Theme.accent("Capabilities")}`,
      `${Theme.dim("/model")}   ${Theme.accent("Switch Engine")}`,
      `${Theme.dim("/reset")}   ${Theme.accent("Clear Memory")}`,
      `${Theme.dim("/exit")}    ${Theme.accent("Quit")}`,
    ];

    const maxRows = Math.max(left.length, right.length);
    for (let i = 0; i < maxRows; i++) {
      table.push([
        { content: left[i] || "", hAlign: "center" },
        { content: right[i] || "", hAlign: "left" },
      ]);
    }

    console.log(
      "\n" +
        boxen(table.toString(), {
          padding: { top: 1, bottom: 1, left: 1, right: 1 },
          borderStyle: "round",
          borderColor: "#FF4C00",
          title: Theme.main(" Co-Wrangler v1.0.0 "),
          titleAlignment: "left",
          // Terminal ne kadar geniş olursa olsun kutunun yayılmasını engeller
          width: 75,
        }) +
        "\n",
    );
  },

  box: (content: string, title: string) => {
    console.log(
      boxen(content, {
        title: Theme.accent(title),
        padding: 1,
        borderColor: "#FF4C00",
        titleAlignment: "left",
        width: 75, // Alt kutuları da aynı genişlikte sabitledik
      }),
    );
  },
};
