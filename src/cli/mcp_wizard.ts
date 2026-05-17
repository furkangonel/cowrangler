/**
 * MCP Add Wizard — cowrangler mcp add
 *
 * Soru-cevap akışıyla yeni bir MCP sunucusu yapılandırır ve
 * ~/.cowrangler/config.yaml dosyasına kaydeder.
 *
 * Desteklenen transport türleri:
 *   stdio  — command + args ile subprocess başlatır (en yaygın)
 *   http   — URL ile uzak HTTP/StreamableHTTP sunucu
 *   sse    — URL ile Server-Sent Events sunucu
 */

import readline from "readline";
import fs from "fs";
import yaml from "js-yaml";
import chalk from "chalk";
import { DIRS } from "../core/init.js";

// ── Küçük readline yardımcısı ────────────────────────────────────────────────

function createRl() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

async function ask(rl: readline.Interface, question: string, defaultVal?: string): Promise<string> {
  const prompt = defaultVal
    ? `  ${question} ${chalk.dim(`[${defaultVal}]`)}: `
    : `  ${question}: `;
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim() || defaultVal || "");
    });
  });
}

async function askRequired(rl: readline.Interface, question: string): Promise<string> {
  while (true) {
    const answer = await ask(rl, question);
    if (answer) return answer;
    console.log(chalk.yellow("    ⚠ Bu alan zorunludur, boş bırakılamaz."));
  }
}

async function askChoice(rl: readline.Interface, question: string, choices: string[]): Promise<string> {
  const choiceStr = choices
    .map((c, i) => `${chalk.dim(`${i + 1}.`)} ${c}`)
    .join("  ");
  console.log(`\n  ${chalk.bold(question)}`);
  console.log(`  ${choiceStr}\n`);
  while (true) {
    const answer = await ask(rl, `Seçim (1-${choices.length})`);
    const idx = parseInt(answer, 10) - 1;
    if (idx >= 0 && idx < choices.length) return choices[idx];
    console.log(chalk.yellow(`    ⚠ Lütfen 1 ile ${choices.length} arasında bir sayı gir.`));
  }
}

// ── Config yardımcıları ──────────────────────────────────────────────────────

function loadConfig(): any {
  try {
    if (fs.existsSync(DIRS.global.config)) {
      return (yaml.load(fs.readFileSync(DIRS.global.config, "utf-8")) as any) || {};
    }
  } catch {}
  return {};
}

function saveConfig(cfg: any): void {
  fs.mkdirSync(DIRS.global.base, { recursive: true });
  fs.writeFileSync(DIRS.global.config, yaml.dump(cfg));
}

// ── MCP Bağlantı Testi ────────────────────────────────────────────────────────

async function testMcpConnection(serverConfig: any): Promise<boolean> {
  try {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
    const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
    const { SSEClientTransport } = await import("@modelcontextprotocol/sdk/client/sse.js");

    let transport: any;
    if (serverConfig.command) {
      transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args || [],
        env: { ...process.env, ...serverConfig.env },
      });
    } else if (serverConfig.transport === "sse") {
      transport = new SSEClientTransport(new URL(serverConfig.url));
    } else {
      transport = new StreamableHTTPClientTransport(new URL(serverConfig.url));
    }

    const client = new Client({ name: "cowrangler-test", version: "1.0.0" }, { capabilities: {} });
    await client.connect(transport);
    const tools = await client.listTools();
    await client.close();
    return true;
  } catch {
    return false;
  }
}

// ── Ana Sihirbaz ─────────────────────────────────────────────────────────────

export async function runMcpAddWizard(): Promise<void> {
  const rl = createRl();

  console.log(
    chalk.hex("#FF4C00").bold("\n  ╔══════════════════════════════════╗"),
  );
  console.log(chalk.hex("#FF4C00").bold("  ║   MCP Sunucu Kurulum Sihirbazı  ║"));
  console.log(chalk.hex("#FF4C00").bold("  ╚══════════════════════════════════╝\n"));
  console.log(chalk.dim("  MCP sunucusunu yapılandır ve ~/.cowrangler/config.yaml'a ekle.\n"));

  try {
    // 1. Sunucu adı
    const serverName = await askRequired(rl, "Sunucu adı (örn: filesystem, github, searxng)");

    // Mevcut config'de bu isim var mı?
    const cfg = loadConfig();
    if (!cfg.mcp_servers) cfg.mcp_servers = {};
    if (cfg.mcp_servers[serverName]) {
      console.log(chalk.yellow(`\n  ⚠ '${serverName}' sunucusu zaten yapılandırılmış.`));
      const overwrite = await ask(rl, "Üzerine yaz?", "hayır");
      if (!overwrite.toLowerCase().startsWith("e")) {
        console.log(chalk.dim("\n  İptal edildi.\n"));
        rl.close();
        return;
      }
    }

    // 2. Transport türü
    const transport = await askChoice(rl, "Transport türü seç:", [
      "stdio  (yerel komut — en yaygın)",
      "http   (uzak HTTP/StreamableHTTP sunucu)",
      "sse    (Server-Sent Events sunucu)",
    ]);
    const transportType = transport.split(" ")[0];

    let serverConfig: any = {};

    if (transportType === "stdio") {
      // ── Stdio ─────────────────────────────────────────────────────────
      console.log(chalk.dim("\n  Örnek: npx -y @modelcontextprotocol/server-filesystem /tmp\n"));
      const command = await askRequired(rl, "Komut (örn: npx, python, node)");
      const argsRaw = await ask(rl, "Argümanlar (boşlukla ayrılmış, örn: -y @mcp/server-github)", "");
      const args = argsRaw ? argsRaw.split(/\s+/).filter(Boolean) : [];

      // Env vars
      console.log(chalk.dim("\n  Opsiyonel: Sunucuya özel ortam değişkenleri (örn: GITHUB_TOKEN=ghp_xxx)"));
      const envRaw = await ask(rl, "Env değişkenleri (KEY=VALUE KEY2=VALUE2 formatında, boş bırak gerek yoksa)", "");
      const env: Record<string, string> = {};
      if (envRaw) {
        for (const pair of envRaw.split(/\s+/)) {
          const [k, ...v] = pair.split("=");
          if (k && v.length) env[k] = v.join("=");
        }
      }

      const timeoutRaw = await ask(rl, "Araç çağrısı zaman aşımı (saniye)", "120");
      const timeout = parseInt(timeoutRaw, 10) || 120;

      serverConfig = {
        command,
        args: args.length ? args : undefined,
        env: Object.keys(env).length ? env : undefined,
        timeout,
      };
    } else {
      // ── HTTP / SSE ────────────────────────────────────────────────────
      const url = await askRequired(rl, `URL (örn: https://my-mcp-server.com/${transportType === "sse" ? "sse" : "mcp"})`);

      // Headers
      console.log(chalk.dim("\n  Opsiyonel: HTTP başlıkları (örn: Authorization=Bearer token123)"));
      const headersRaw = await ask(rl, "Başlıklar (KEY=VALUE formatında, boş bırak gerek yoksa)", "");
      const headers: Record<string, string> = {};
      if (headersRaw) {
        for (const pair of headersRaw.split(/\s+/)) {
          const [k, ...v] = pair.split("=");
          if (k && v.length) headers[k] = v.join("=");
        }
      }

      const timeoutRaw = await ask(rl, "Araç çağrısı zaman aşımı (saniye)", "120");
      const timeout = parseInt(timeoutRaw, 10) || 120;

      serverConfig = {
        url,
        headers: Object.keys(headers).length ? headers : undefined,
        transport: transportType === "sse" ? "sse" : undefined,
        timeout,
      };
    }

    // 3. Bağlantı testi
    console.log(chalk.cyan("\n  Bağlantı test ediliyor..."));
    const testResult = await testMcpConnection(serverConfig);
    if (testResult) {
      console.log(chalk.green("  ✓ Bağlantı başarılı!"));
    } else {
      console.log(chalk.yellow("  ⚠ Bağlantı testi başarısız (sunucu çalışmıyor olabilir)."));
      const save = await ask(rl, "Yine de kaydet?", "evet");
      if (!save.toLowerCase().startsWith("e")) {
        console.log(chalk.dim("\n  İptal edildi.\n"));
        rl.close();
        return;
      }
    }

    // 4. Config'e kaydet
    cfg.mcp_servers[serverName] = serverConfig;
    saveConfig(cfg);

    console.log(
      chalk.green(`\n  ✓ '${serverName}' MCP sunucusu yapılandırıldı ve kaydedildi.\n`),
    );
    console.log(chalk.dim("  Bir sonraki cowrangler oturumunda otomatik olarak bağlanır."));
    console.log(chalk.dim(`  Tüm sunucuları görmek için: cowrangler mcp list\n`));
  } finally {
    rl.close();
  }
}
