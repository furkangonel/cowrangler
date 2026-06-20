/**
 * Gateway Runner — tüm platform gateway'lerini başlatır.
 *
 * Kullanım:
 *   cowrangler gateway setup    # interaktif kurulum
 *   cowrangler gateway start    # gateway'leri başlat
 *   cowrangler gateway status   # aktif bağlantıları göster
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { DIRS } from "../core/init.js";
import { GatewayPlatform } from "./base.js";
import { startTelegramGateway, TelegramConfig } from "./platforms/telegram.js";
import { startDiscordGateway, DiscordConfig } from "./platforms/discord.js";

export interface GatewayConfig {
  telegram?: TelegramConfig;
  discord?: DiscordConfig;
}

export async function startGateway(config: GatewayConfig): Promise<GatewayPlatform[]> {
  const platforms: GatewayPlatform[] = [];
  const errors: string[] = [];

  if (config.telegram?.token) {
    try {
      const tg = await startTelegramGateway(config.telegram);
      platforms.push(tg);
      console.log("[gateway] Telegram connected");
    } catch (err: any) {
      errors.push(`Telegram: ${err.message}`);
      console.error("[gateway] Telegram failed:", err.message);
    }
  }

  if (config.discord?.token) {
    try {
      const dc = await startDiscordGateway(config.discord);
      platforms.push(dc);
      console.log("[gateway] Discord connected");
    } catch (err: any) {
      errors.push(`Discord: ${err.message}`);
      console.error("[gateway] Discord failed:", err.message);
    }
  }

  if (platforms.length === 0) {
    const errList = errors.length > 0
      ? `\nErrors:\n${errors.map((e) => `  - ${e}`).join("\n")}`
      : "";
    throw new Error(`No gateway platforms started. Configure tokens in ~/.cowrangler/config.yaml.${errList}`);
  }

  console.log(`[gateway] ${platforms.length} platform(s) active`);

  // Process sinyallerini yakala
  process.on("SIGINT", () => stopGateway(platforms));
  process.on("SIGTERM", () => stopGateway(platforms));

  return platforms;
}

export async function stopGateway(platforms: GatewayPlatform[]): Promise<void> {
  for (const p of platforms) {
    try {
      await p.stop();
    } catch { /* sessizce */ }
  }
  process.exit(0);
}

export function loadGatewayConfig(): GatewayConfig {
  const configPath = DIRS.global.config;
  if (!fs.existsSync(configPath)) return {};

  try {
    const raw = yaml.load(fs.readFileSync(configPath, "utf-8")) as any;
    return raw?.gateway ?? {};
  } catch {
    return {};
  }
}

/**
 * cowrangler gateway start — CLI entrypoint
 */
export async function gatewayMain(): Promise<void> {
  console.log("\n  Cowrangler Gateway\n");

  const config = loadGatewayConfig();

  if (!config.telegram && !config.discord) {
    console.error("  No gateway platforms configured.");
    console.error("  Add to ~/.cowrangler/config.yaml:");
    console.error("    gateway:");
    console.error("      telegram:");
    console.error("        token: YOUR_BOT_TOKEN");
    process.exit(1);
  }

  const platforms = await startGateway(config);

  // Daemon olarak çalış
  console.log(`\n  Gateway running with ${platforms.length} platform(s). Press Ctrl+C to stop.\n`);
  await new Promise<void>(() => {}); // sonsuza çalış
}
