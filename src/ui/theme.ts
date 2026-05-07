import os from "os";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import chalk from "chalk";
import boxen from "boxen";
import { marked } from "marked";
// @ts-ignore
import { markedTerminal } from "marked-terminal";
import { getConfig } from "../core/init.js";

marked.use(markedTerminal() as unknown as any);

const VERSION = "1.1.2";

// ── Color Palettes ────────────────────────────────────────────────────────────
const palettes = {
  dark: {
    main: chalk.hex("#FF4C00"),
    accent: chalk.hex("#F8F2E5"),
    dim: chalk.hex("#6B6B6B"),
    success: chalk.hex("#A5C27C"),
    fail: chalk.hex("#D62926"),
    info: chalk.hex("#5CA4D4"),
  },
  light: {
    main: chalk.hex("#FF4C00"),
    accent: chalk.hex("#1A1A1A"),
    dim: chalk.hex("#888888"),
    success: chalk.hex("#3B701E"),
    fail: chalk.hex("#B3201D"),
    info: chalk.hex("#1C6B9E"),
  },
};

// ── OS Theme Detection ────────────────────────────────────────────────────────
function detectSystemTheme(): "dark" | "light" {
  try {
    const platform = os.platform();
    if (platform === "darwin") {
      execSync("defaults read -g AppleInterfaceStyle", { stdio: "ignore" });
      return "dark";
    }
    if (platform === "win32") {
      const result = execSync(
        'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" /v AppsUseLightTheme',
        { encoding: "utf-8", stdio: "pipe" },
      );
      return result.includes("0x0") ? "dark" : "light";
    }
    if (process.env.COLORFGBG?.endsWith(";15")) return "light";
    return "dark";
  } catch {
    return "light";
  }
}

const config = getConfig();
const themeMode: "dark" | "light" =
  config.theme === "light" || config.theme === "dark"
    ? config.theme
    : detectSystemTheme();

export const Theme = palettes[themeMode];

// ── ANSI helpers ──────────────────────────────────────────────────────────────

/**
 * Visible column width of a string.
 *
 * Strips ANSI escapes and counts terminal display columns.
 * Unicode Block Elements (U+2580–U+259F) — the ▄ and █ chars used in the
 * OCTOPUS art — are counted as 2 columns because most modern monospace
 * terminal fonts render them at full-cell (double) width.
 * Everything else (ASCII, box-drawing ─ │ ╭ etc.) stays at 1 column each.
 */
function visLen(s: string): number {
  // 1. ANSI renk ve stil (escape) kodlarını metinden temizle
  // eslint-disable-next-line no-control-regex
  const bare = s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");

  // 2. Kalan saf metnin karakter sayısını döndür
  // (Spread operatörü [...] unicode emoji ve blokları doğru sayar)
  return [...bare].length;
}

function padR(s: string, width: number): string {
  const pad = Math.max(0, width - visLen(s));
  return s + " ".repeat(pad);
}

// ── Dashboard helpers ─────────────────────────────────────────────────────────

/**
 * Fetch the last `n` git commits as [{age, subject}] pairs.
 * Returns [] if not inside a git repo or git is unavailable.
 */
function recentCommits(n = 5): Array<{ age: string; subject: string }> {
  try {
    const raw = execSync(`git log --pretty=format:"%ar|%s" -${n} 2>/dev/null`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
    if (!raw) return [];
    return raw.split("\n").map((line) => {
      const sep = line.indexOf("|");
      const age = sep === -1 ? "?" : line.slice(0, sep).trim();
      const subject = sep === -1 ? line : line.slice(sep + 1).trim();
      // Abbreviate age: "3 hours ago" → "3h", "2 days ago" → "2d"
      const shortAge = age
        .replace(/(\d+) hours? ago/, "$1h")
        .replace(/(\d+) minutes? ago/, "$1m")
        .replace(/(\d+) days? ago/, "$1d")
        .replace(/(\d+) weeks? ago/, "$1w")
        .replace(/(\d+) months? ago/, "$1mo")
        .replace("an hour ago", "1h")
        .replace("a day ago", "1d")
        .replace("a minute ago", "1m")
        .replace("just now", "now");
      return { age: shortAge, subject };
    });
  } catch {
    return [];
  }
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
{
  /*
const brandLines = [
  "",
  Theme.main.bold("  ██████╗ ██╗    ██╗"),
  Theme.main.bold("  ██╔════╝██║    ██║"),
  Theme.main.bold("  ██║     ██║ █╗ ██║"),
  Theme.main.bold("  ██║     ██║███╗██║"),
  Theme.main.bold("  ╚██████╗╚███╔███╔╝"),
  Theme.main.bold("   ╚═════╝ ╚══╝╚══╝ "),
  "",
  `${Theme.dim("Co-Wrangler")} ${Theme.main.bold(`v${VERSION}`)}`,
  `  ${Theme.dim("Your personal AI agent")}`, "",
  `  ${Theme.dim("Model   ")} ${Theme.accent(modelShort)}`,
  `  ${Theme.dim("Project ")} ${Theme.accent(displayPath.length > 28 ? "..." + displayPath.slice(-25) : displayPath)}`
  ,];
  */
}

const OCTOPUS = ["  ▄▄▄▄▄▄▄  ", "  █ ███ █  ", "  ███████  ", " █▄█   █▄█ "];

export const UI = {
  renderMarkdown: async (text: string): Promise<string> =>
    marked.parse(text) as string,
  success: (msg: string) => console.log(Theme.success(`  ✓ ${msg}`)),
  error: (msg: string) => console.log(Theme.fail(`  ✗ ${msg}`)),
  warn: (msg: string) => console.log(Theme.main(`  ⚠ ${msg}`)),
  info: (msg: string) => console.log(Theme.info(`  ℹ ${msg}`)),

  box: (content: string, title: string) => {
    console.log(
      "\n" +
        boxen(content, {
          title: Theme.accent.bold(` ${title} `),
          padding: { top: 0, bottom: 0, left: 1, right: 1 },
          margin: { top: 0, bottom: 0, left: 2, right: 0 },
          borderStyle: "round",
          borderColor: "#FF4C00",
          titleAlignment: "left",
        }) +
        "\n",
    );
  },

  // ── Main dashboard ──────────────────────────────────────────────────────────
  printDashboard: (modelName: string, workspacePath: string) => {
    const homeDir = os.homedir();
    const displayPath = workspacePath.startsWith(homeDir)
      ? "~" + workspacePath.slice(homeDir.length)
      : workspacePath;
    const modelShort = modelName.split("/").pop() || modelName;

    // ── Panel widths (visible cols inside the border) ───────────────────────
    // LEFT_W must be ≥ widest left-panel line.
    // OCTOPUS[2] = "  ███████  " → widest when wide chars: 2 + 9*2 + 2 = 22 cols,
    // plus the "  " prefix in leftRaw = 24 cols.  Model/Project labels can be up
    // to LEFT_W wide so we leave generous room.
    //const LEFT_W = 44; // visible cols of left panel content
    //const RIGHT_W = 36; // visible cols of right panel content
    //const SEP = " │ ";  // 3-col visible separator

    const termWidth = process.stdout.columns || 80;

    // Kutu genişliği terminali tam kaplamasın, yanlardan 2 boşluk bırakalım. (Maksimum 90 ile sınırlayalım ki dev ekranlarda çok uzamasın)
    const maxBoxWidth = Math.min(termWidth - 2, 90);

    // Boxen kenarlıkları (2) + Padding (2) + Ortadaki ayırıcı SEP (3) = 7 karakter sabit alan
    const availableCols = maxBoxWidth - 7;

    // Kalan alanı %55 Sol, %45 Sağ olacak şekilde paylaştır
    const LEFT_W = Math.floor(availableCols * 0.55);
    const RIGHT_W = availableCols - LEFT_W;
    const SEP = " │ ";

    // ── Left panel lines ─────────────────────────────────────────────────────
    // Reserve 10 cols for the "Model  " / "Project" label prefix
    const truncPath =
      displayPath.length > LEFT_W - 10
        ? "…" + displayPath.slice(-(LEFT_W - 11))
        : displayPath;
    const truncModel =
      modelShort.length > LEFT_W - 10
        ? modelShort.slice(0, LEFT_W - 13) + "…"
        : modelShort;

    // Pad OCTOPUS art lines to uniform visual width so per-line centering
    // keeps the art pixels aligned (each row gets the same left offset).
    const maxOctopusWidth = Math.max(...OCTOPUS.map((l) => visLen(l)));
    const paddedOctopus = OCTOPUS.map((l) => padR(l, maxOctopusWidth));

    const leftRaw: Array<string> = [
      ...paddedOctopus.map((line) => Theme.main(line)),
      "",
      Theme.dim("Your personal AI agent"),
      "",
      `${Theme.accent(truncModel)}`,
      `${Theme.accent(truncPath)}`,
      "",
      `${Theme.dim("/help")}  ${Theme.dim("/skills")} ${Theme.dim("/tools")}`,
      `${Theme.dim("/model")} ${Theme.dim("/key")}    ${Theme.dim("/reset")}`,
    ];

    // ── Right panel lines ─────────────────────────────────────────────────────
    const rightRaw: Array<string> = [];

    {
      /*
    // Tips for getting started
    const hasCowrnglr = fs.existsSync(path.join(workspacePath, "COWRNGLR.md"));

    rightRaw.push(`  ${Theme.main.bold("Tips for getting started")}`);
    rightRaw.push(`  ${Theme.dim("─".repeat(RIGHT_W - 2))}`);

    if (!hasCowrnglr) {
      rightRaw.push(
        `  ${Theme.dim("Run")} ${Theme.accent("/init")} ${Theme.dim("to create a COWRNGLR.md")}`,
      );
      rightRaw.push(
        `  ${Theme.dim("file with project context for the agent")}`,
      );
    } else {
      rightRaw.push(`  ${Theme.dim("COWRNGLR.md found — agent has context")}`);
    }
    */
    }

    rightRaw.push("");

    // Tips for getting started section
    const hasCowrnglr = fs.existsSync(path.join(workspacePath, "COWRNGLR.md"));
    rightRaw.push(Theme.main.bold("Tips for getting started"));
    rightRaw.push(Theme.dim("─".repeat(RIGHT_W - 2)));
    if (hasCowrnglr) {
      rightRaw.push(Theme.success("✓ COWRNGLR.md found"));
      rightRaw.push(Theme.dim("Agent has project context."));
    } else {
      rightRaw.push(Theme.accent("Run /init to get started"));
      rightRaw.push(Theme.dim("Creates COWRNGLR.md with"));
      rightRaw.push(Theme.dim("project context for the agent."));
    }

    rightRaw.push("");

    // What's new section
    rightRaw.push(
      `${Theme.success("What's New")}  ${Theme.dim("v" + VERSION)}`,
    );
    rightRaw.push(Theme.dim("─".repeat(RIGHT_W - 2)));

    const news = [
      "+ /init  scan & index project",
      "+ /skills  list loaded SOPs  ",
      "+ /tools  list capabilities  ",
      "+ /memory  project memory    ",
      "+ @file  path completions    ",
      "+ ?  live shortcut reference ",
    ];
    for (const n of news) {
      const maxN = RIGHT_W - 2;
      const truncN = n.length > maxN ? n.slice(0, maxN - 1) + "…" : n;
      rightRaw.push(Theme.dim(truncN));
    }

    // ── Merge panels — per-line centering for both left and right ─────────────
    const rows = Math.max(leftRaw.length, rightRaw.length);
    const lines: string[] = [];

    for (let i = 0; i < rows; i++) {
      // Left: center each line individually within LEFT_W
      const leftLine = leftRaw[i] ?? "";
      const leftPad = Math.max(0, Math.floor((LEFT_W - visLen(leftLine)) / 2));
      const left = padR(" ".repeat(leftPad) + leftLine, LEFT_W);

      // Right: center each line individually within RIGHT_W
      const rightLine = rightRaw[i] ?? "";
      const rightPad = Math.max(
        0,
        Math.floor((RIGHT_W - visLen(rightLine)) / 2),
      );
      const right = padR(" ".repeat(rightPad) + rightLine, RIGHT_W);

      lines.push(left + SEP + right);
    }

    const content = lines.join("\n");

    // ── Solid border ──────────────────────────────────────────────────────────
    const totalWidth = LEFT_W + visLen(SEP) + RIGHT_W + 4; // +4 for boxen side padding

    console.log(
      "\n" +
        boxen(content, {
          title:
            Theme.main.bold(" Co-Wrangler ") + Theme.dim("v" + VERSION + " "),
          titleAlignment: "left",
          padding: { top: 0, bottom: 0, left: 0, right: 0 },
          margin: { top: 0, bottom: 0, left: 1, right: 0 },
          borderStyle: {
            topLeft: "╭",
            topRight: "╮",
            bottomLeft: "╰",
            bottomRight: "╯",
            top: "─",
            bottom: "─",
            left: "│",
            right: "│",
          },
          borderColor: "#FF4C00",
          width: totalWidth,
        }) +
        "\n",
    );
  },
};
