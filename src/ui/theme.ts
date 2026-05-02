import os from "os";
import { execSync } from "child_process";
import chalk from "chalk";
import boxen from "boxen";
import { marked } from "marked";
// @ts-ignore
import { markedTerminal } from "marked-terminal";
import { getConfig } from "../core/init.js";

marked.use(markedTerminal() as unknown as any);

const VERSION = "1.1.0";

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
function visLen(s: string): number {
  // Strip ANSI escape codes to get the visible character count
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
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
    const commits = recentCommits(5);

    // ── Panel widths (visible chars inside the border) ───────────────────────
    const LEFT_W = 40; // visible width of left panel content
    const RIGHT_W = 34; // visible width of right panel content
    const SEP = " ╎ "; // 3-char visible separator

    // ── Left panel lines ─────────────────────────────────────────────────────
    const truncPath =
      displayPath.length > LEFT_W - 12
        ? "…" + displayPath.slice(-(LEFT_W - 13))
        : displayPath;
    const truncModel =
      modelShort.length > LEFT_W - 12
        ? modelShort.slice(0, LEFT_W - 15) + "…"
        : modelShort;

    const leftRaw: Array<string> = [
      ...OCTOPUS.map((line) => "  " + Theme.main(line)),
      "",
      `  ${Theme.main.bold("Co-Wrangler")} ${Theme.dim("v" + VERSION)}`,
      `  ${Theme.dim("Your personal AI agent")}`,
      "",
      `  ${Theme.dim("Model  ")} ${Theme.accent(truncModel)}`,
      `  ${Theme.dim("Project")} ${Theme.accent(truncPath)}`,
      "",
      `  ${Theme.dim("/help")}  ${Theme.dim("/skills")}  ${Theme.dim("/tools")}`,
      `  ${Theme.dim("/model")} ${Theme.dim("/key")}     ${Theme.dim("/reset")}`,
    ];

    // ── Right panel lines ─────────────────────────────────────────────────────
    const rightRaw: Array<string> = [];

    // Recent commits section
    rightRaw.push(`  ${Theme.info("Recent Commits")}`);
    rightRaw.push(`  ${Theme.dim("─".repeat(RIGHT_W - 2))}`);

    if (commits.length > 0) {
      for (const { age, subject } of commits) {
        const ageStr = Theme.main(age.padEnd(4));
        const maxSubj = RIGHT_W - 8;
        const subjStr =
          subject.length > maxSubj
            ? subject.slice(0, maxSubj - 1) + "…"
            : subject;
        rightRaw.push(`  ${ageStr}  ${Theme.dim(subjStr)}`);
      }
    } else {
      rightRaw.push(`  ${Theme.dim("(no git history found)")}`);
    }

    rightRaw.push("");

    // What's new section
    rightRaw.push(
      `  ${Theme.success("What's New")}  ${Theme.dim("v" + VERSION)}`,
    );
    rightRaw.push(`  ${Theme.dim("─".repeat(RIGHT_W - 2))}`);

    const news = [
      "+ 9 specialized subagent types",
      "+ 7 bundled SOPs (skills)",
      "+ 25+ default tools",
      "+ Live model switching",
      "+ Step-by-step progress",
      "+ @file completions in REPL",
    ];
    for (const n of news) {
      rightRaw.push(`  ${Theme.dim(n)}`);
    }

    // ── Merge panels ─────────────────────────────────────────────────────────
    const rows = Math.max(leftRaw.length, rightRaw.length);
    const lines: string[] = [];

    for (let i = 0; i < rows; i++) {
      const left = padR(leftRaw[i] ?? "", LEFT_W);
      const right = padR(rightRaw[i] ?? "", RIGHT_W);
      lines.push(left + SEP + right);
    }

    const content = lines.join("\n");

    // ── Dashed border ─────────────────────────────────────────────────────────
    const totalWidth = LEFT_W + visLen(SEP) + RIGHT_W + 4; // +4 for boxen side padding

    console.log(
      "\n" +
        boxen(content, {
          padding: { top: 0, bottom: 0, left: 0, right: 0 },
          margin: { top: 0, bottom: 0, left: 1, right: 0 },
          borderStyle: {
            topLeft: "╭",
            topRight: "╮",
            bottomLeft: "╰",
            bottomRight: "╯",
            top: "╌",
            bottom: "╌",
            left: "╎",
            right: "╎",
          },
          borderColor: "#FF4C00",
          width: totalWidth,
        }) +
        "\n",
    );
  },
};
