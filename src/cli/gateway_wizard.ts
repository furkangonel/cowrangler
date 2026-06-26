/**
 * Gateway Setup Wizard — cowrangler gateway setup
 *
 * Telegram veya Discord bot bağlantısını soru-cevap akışıyla yapılandırır
 * ve ~/.cowrangler/config.yaml dosyasına kaydeder.
 *
 * Telegram kurulumu:
 *   1. BotFather'dan token al: t.me/botfather → /newbot
 *   2. Bu wizard'da token'ı gir — Telegram API'den bot bilgileri doğrulanır
 *   3. İsteğe bağlı kullanıcı whitelist'i gir
 *
 * Discord kurulumu:
 *   1. discord.com/developers/applications → New Application → Bot → Token kopyala
 *   2. Bu wizard'da token'ı gir
 *   3. Bot'u sunucuna ekle: OAuth2 URL Generator ile MANAGE_MESSAGES + SEND_MESSAGES
 */

import readline from "readline";
import fs from "fs";
import yaml from "js-yaml";
import chalk from "chalk";
import https from "https";
import { DIRS } from "../core/init.js";
import { setSecrets } from "../core/credential_vault.js";

// ── Yardımcı fonksiyonlar ────────────────────────────────────────────────────

function createRl() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

async function ask(rl: readline.Interface, question: string, defaultVal?: string): Promise<string> {
  const prompt = defaultVal
    ? `  ${question} ${chalk.dim(`[${defaultVal}]`)}: `
    : `  ${question}: `;
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer.trim() || defaultVal || ""));
  });
}

async function askRequired(rl: readline.Interface, question: string, hidden = false): Promise<string> {
  while (true) {
    if (hidden) {
      // Token girişini maskele
      process.stdout.write(`  ${question}: `);
      const token = await new Promise<string>((resolve) => {
        let val = "";
        process.stdin.setRawMode?.(true);
        process.stdin.resume();
        process.stdin.once("data", function handler(data) {
          process.stdin.setRawMode?.(false);
          process.stdin.pause();
          resolve(data.toString().trim());
        });
        // Fallback: terminal raw mode yoksa normal soru sor
        rl.question("", (answer) => resolve(answer.trim()));
      });
      if (token) return token;
    } else {
      const answer = await ask(rl, question);
      if (answer) return answer;
    }
    console.log(chalk.yellow("    ⚠ Bu alan zorunludur."));
  }
}

async function askChoice(rl: readline.Interface, question: string, choices: string[]): Promise<string> {
  console.log(`\n  ${chalk.bold(question)}`);
  choices.forEach((c, i) => console.log(`  ${chalk.hex("#FF4C00").bold(`${i + 1}.`)} ${c}`));
  console.log();
  while (true) {
    const answer = await ask(rl, `Seçim (1-${choices.length})`);
    const idx = parseInt(answer, 10) - 1;
    if (idx >= 0 && idx < choices.length) return choices[idx];
    console.log(chalk.yellow(`    ⚠ 1 ile ${choices.length} arasında bir sayı gir.`));
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

// ── Telegram Token Doğrulama ─────────────────────────────────────────────────

interface TelegramBotInfo {
  id: number;
  username: string;
  first_name: string;
}

function validateTelegramToken(token: string): Promise<TelegramBotInfo | null> {
  return new Promise((resolve) => {
    const url = `https://api.telegram.org/bot${token}/getMe`;
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.ok && parsed.result) resolve(parsed.result);
            else resolve(null);
          } catch {
            resolve(null);
          }
        });
      })
      .on("error", () => resolve(null));
  });
}

// ── Telegram Kurulumu ────────────────────────────────────────────────────────

async function setupTelegram(rl: readline.Interface): Promise<void> {
  console.log(chalk.cyan("\n  ── Telegram Bot Kurulumu ──────────────────────────\n"));
  console.log(chalk.dim("  1. Telegram'da @BotFather'a git"));
  console.log(chalk.dim("  2. /newbot komutunu çalıştır"));
  console.log(chalk.dim("  3. Bot adını ve kullanıcı adını gir"));
  console.log(chalk.dim("  4. Aldığın token'ı buraya yapıştır\n"));

  const token = await askRequired(rl, "Bot token (örn: 1234567890:ABCdefGHIjklMNOpqrSTUVwxyz)");

  // Token'ı doğrula
  console.log(chalk.cyan("\n  Token doğrulanıyor..."));
  const botInfo = await validateTelegramToken(token);

  if (!botInfo) {
    console.log(chalk.red("  ✗ Geçersiz token. BotFather'dan aldığın token'ı kontrol et."));
    const retry = await ask(rl, "Tekrar dene?", "evet");
    if (retry.toLowerCase().startsWith("e")) {
      return setupTelegram(rl);
    }
    return;
  }

  console.log(chalk.green(`  ✓ Bot doğrulandı: @${botInfo.username} (${botInfo.first_name})`));

  // Whitelist
  console.log(chalk.dim("\n  İsteğe bağlı: Sadece belirli kullanıcılar bu bota mesaj gönderebilsin."));
  console.log(chalk.dim("  Kendi Telegram kullanıcı ID'ni bulmak için: @userinfobot'a /start gönder\n"));
  const whitelistRaw = await ask(
    rl,
    "İzin verilen kullanıcı ID'leri (boşlukla ayrılmış, herkese açık için boş bırak)",
    "",
  );
  const allowedIds = whitelistRaw
    ? whitelistRaw.split(/\s+/).map((id) => parseInt(id.trim(), 10)).filter((n) => !isNaN(n))
    : [];

  // Config'e kaydet
  const cfg = loadConfig();
  if (!cfg.gateway) cfg.gateway = {};
  cfg.gateway.telegram = {
    ...(allowedIds.length ? { allowed_user_ids: allowedIds } : {}),
  };
  saveConfig(cfg);

  // Token'ı vault'a kaydet
  setSecrets("gateway:telegram", { token });

  console.log(chalk.green("\n  ✓ Telegram gateway yapılandırıldı!\n"));
  console.log(`  Bot:     ${chalk.bold(`@${botInfo.username}`)}`);
  if (allowedIds.length) {
    console.log(`  Whitelist: ${allowedIds.join(", ")}`);
  } else {
    console.log(`  Whitelist: ${chalk.dim("herkese açık")}`);
  }
  console.log(chalk.cyan("\n  Gateway'i başlatmak için:"));
  console.log(chalk.bold("    cowrangler gateway start\n"));
  console.log(chalk.dim(`  Ardından Telegram'da @${botInfo.username}'a mesaj gönder.\n`));
}

// ── Discord Kurulumu ─────────────────────────────────────────────────────────

async function setupDiscord(rl: readline.Interface): Promise<void> {
  console.log(chalk.cyan("\n  ── Discord Bot Kurulumu ───────────────────────────\n"));
  console.log(chalk.dim("  1. discord.com/developers/applications adresine git"));
  console.log(chalk.dim("  2. New Application → Bot bölümünden token oluştur"));
  console.log(chalk.dim("  3. Gerekli izinler: SEND_MESSAGES, READ_MESSAGE_HISTORY"));
  console.log(chalk.dim("  4. OAuth2 → URL Generator ile botu sunucuna ekle\n"));

  const token = await askRequired(rl, "Bot token");
  const guildId = await ask(rl, "Sunucu (Guild) ID (opsiyonel — boş bırakırsan tüm sunuculardan mesaj alır)", "");

  // Config'e kaydet
  const cfg = loadConfig();
  if (!cfg.gateway) cfg.gateway = {};
  cfg.gateway.discord = {
    ...(guildId ? { guild_id: guildId } : {}),
  };
  saveConfig(cfg);

  // Token'ı vault'a kaydet
  setSecrets("gateway:discord", { token });

  console.log(chalk.green("\n  ✓ Discord gateway yapılandırıldı!\n"));
  console.log(chalk.cyan("  Gateway'i başlatmak için:"));
  console.log(chalk.bold("    cowrangler gateway start\n"));
  console.log(chalk.dim("  Botu Discord sunucuna ekledikten sonra mesaj gönderebilirsin.\n"));
}

// ── Ana Sihirbaz ─────────────────────────────────────────────────────────────

export async function runGatewaySetupWizard(): Promise<void> {
  const rl = createRl();

  console.log(chalk.hex("#FF4C00").bold("\n  ╔══════════════════════════════════╗"));
  console.log(chalk.hex("#FF4C00").bold("  ║   Gateway Kurulum Sihirbazı      ║"));
  console.log(chalk.hex("#FF4C00").bold("  ╚══════════════════════════════════╝\n"));
  console.log(chalk.dim("  Mesajlaşma platformunu bağla — Telegram veya Discord.\n"));

  try {
    // Mevcut config'i kontrol et
    const cfg = loadConfig();
    const existing: string[] = [];
    if (cfg.gateway?.telegram?.token) existing.push("Telegram");
    if (cfg.gateway?.discord?.token) existing.push("Discord");

    if (existing.length > 0) {
      console.log(chalk.yellow(`  ⚠ Zaten yapılandırılmış: ${existing.join(", ")}`));
      const cont = await ask(rl, "Üzerine yazmak veya yeni platform eklemek istiyor musun?", "evet");
      if (!cont.toLowerCase().startsWith("e")) {
        console.log(chalk.dim("\n  İptal edildi.\n"));
        rl.close();
        return;
      }
    }

    const platform = await askChoice(rl, "Platform seç:", ["Telegram", "Discord"]);

    if (platform === "Telegram") {
      await setupTelegram(rl);
    } else {
      await setupDiscord(rl);
    }

    // Birden fazla platform eklemek ister mi?
    const addMore = await ask(rl, "Başka bir platform da eklemek ister misin?", "hayır");
    if (addMore.toLowerCase().startsWith("e")) {
      rl.close();
      const rl2 = createRl();
      const other = platform === "Telegram" ? "Discord" : "Telegram";
      console.log(chalk.cyan(`\n  ${other} kurulumuna geçiliyor...\n`));
      if (other === "Discord") await setupDiscord(rl2);
      else await setupTelegram(rl2);
      rl2.close();
    }
  } catch (e: any) {
    console.error(chalk.red(`\n  ✗ Hata: ${e.message ?? String(e)}\n`));
  } finally {
    try { rl.close(); } catch {}
  }
}
