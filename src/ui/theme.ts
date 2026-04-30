import os from "os";
import { execSync } from "child_process";
import chalk from "chalk";
import boxen from "boxen";
import Table from "cli-table3";
import { marked } from "marked";
// @ts-ignore
import { markedTerminal } from "marked-terminal";
import { getConfig } from "../core/init.js";

marked.use(markedTerminal() as unknown as any);

// 1. Koyu ve Açık Tema Paletleri
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

// 2. İşletim Sisteminin Temasını Otomatik Algılayan Fonksiyon
function detectSystemTheme(): "dark" | "light" {
  try {
    const platform = os.platform();

    if (platform === "darwin") {
      // macOS: Eğer sistem Dark moddaysa bu komut başarılı olur ve "Dark" döner.
      // Light moddaysa komut hata fırlatır (catch bloğuna düşer).
      execSync("defaults read -g AppleInterfaceStyle", { stdio: "ignore" });
      return "dark";
    }

    if (platform === "win32") {
      // Windows: Kayıt defterinden uygulamanın açık/koyu tema durumunu okuruz
      const result = execSync(
        'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" /v AppsUseLightTheme',
        { encoding: "utf-8", stdio: "pipe" },
      );
      return result.includes("0x0") ? "dark" : "light";
    }

    // Linux ve diğerleri için terminal arkaplan env değişkeni kontrolü (Fallback)
    if (process.env.COLORFGBG && process.env.COLORFGBG.endsWith(";15")) {
      return "light";
    }

    return "dark"; // Bilinmeyen bir ortamdaysa varsayılan olarak koyu kullan
  } catch (error) {
    // macOS'ta 'defaults' komutu hata fırlattıysa sistem kesinlikle Açık Temadadır.
    return "light";
  }
}

// 3. Tema Belirleme Mantığı (Config > Auto > Fallback)
const config = getConfig();
let currentThemeMode: "dark" | "light" = "dark";

if (config.theme === "light" || config.theme === "dark") {
  // Kullanıcı özellikle bir tema zorunlu kıldıysa onu kullan
  currentThemeMode = config.theme;
} else {
  // Config dosyasında ayar yoksa (veya 'auto' yazıyorsa) sistemi otomatik kokla!
  currentThemeMode = detectSystemTheme();
}

export const Theme = palettes[currentThemeMode];

// --- UI OBMESI (Değişiklik yok) ---
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
      colWidths: [32, 33],
      wordWrap: true,
    });

    const badge = `
  ${Theme.main("▄▄▄▄▄▄▄")}
  ${Theme.main("█ ███ █")}
  ${Theme.main("███████")}
  ${Theme.main("█▄█    █▄█")}
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
        width: 75,
      }),
    );
  },
};
