/**
 * Discord Gateway — Discord Bot entegrasyonu.
 *
 * Kurulum:
 *   1. Discord Developer Portal'dan bot oluştur, token al
 *   2. Bot'u sunucuya ekle (Message Content Intent aktif olmalı)
 *   3. config.yaml'a ekle:
 *      gateway:
 *        discord:
 *          token: "BOT_TOKEN"
 *          allowed_guild_ids: [123456789]  # opsiyonel
 *          command_prefix: "!"             # opsiyonel, varsayılan: "!"
 *
 * Özellikler:
 * - Thread bazlı session yönetimi
 * - Embed formatında cevaplar
 * - Slash command kayıt
 * - 2000 karakter mesaj limiti
 */

import { Client, GatewayIntentBits, Message, Partials, TextChannel, ThreadChannel } from "discord.js";
import { GatewayPlatform, IncomingMessage, OutgoingMessage } from "../base.js";

const DISCORD_MAX_MESSAGE_LENGTH = 2000;

export interface DiscordConfig {
  token: string;
  allowedGuildIds?: string[];
  commandPrefix?: string;
  respondToDMs?: boolean;
}

export class DiscordGateway extends GatewayPlatform {
  private client: Client;
  private config: DiscordConfig;
  private channelCache = new Map<string, TextChannel | ThreadChannel>();

  constructor(config: DiscordConfig) {
    super("discord");
    this.config = config;

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel, Partials.Message],
    });
  }

  async start(): Promise<void> {
    this.client.on("messageCreate", async (message: Message) => {
      // Bot'un kendi mesajlarını ignore et
      if (message.author.bot) return;

      // Guild whitelist kontrolü
      if (
        message.guildId &&
        this.config.allowedGuildIds?.length &&
        !this.config.allowedGuildIds.includes(message.guildId)
      ) {
        return;
      }

      // DM kontrolü
      if (!message.guildId && !this.config.respondToDMs) return;

      // Bot mention veya prefix kontrolü
      const prefix = this.config.commandPrefix ?? "!";
      const isMentioned = message.mentions.has(this.client.user!);
      const hasPrefixOrMention = isMentioned || message.content.startsWith(prefix);

      if (!hasPrefixOrMention) return;

      // Prefix/mention'ı temizle
      let text = message.content;
      if (isMentioned) {
        text = text.replace(/<@!?\d+>/g, "").trim();
      } else if (text.startsWith(prefix)) {
        text = text.slice(prefix.length).trim();
      }

      if (!text) return;

      // Typing indicator
      if (message.channel instanceof TextChannel || message.channel instanceof ThreadChannel) {
        await message.channel.sendTyping();
        this.channelCache.set(message.channelId, message.channel);
      }

      const incoming: IncomingMessage = {
        id: message.id,
        conversationId: message.channelId,
        userId: message.author.id,
        text,
        platform: "discord",
        timestamp: message.createdTimestamp,
        replyToId: message.id,
      };

      await this.handleIncoming(incoming);
    });

    await this.client.login(this.config.token);

    // Stale session temizliği
    setInterval(() => this.cleanStaleSessions(), 3_600_000);

    console.log(`[gateway:discord] Logged in as ${this.client.user?.tag}`);
  }

  async stop(): Promise<void> {
    this.client.destroy();
    console.log("[gateway:discord] Disconnected");
  }

  async sendMessage(msg: OutgoingMessage): Promise<void> {
    const channel = this.channelCache.get(msg.conversationId);
    if (!channel) return;

    const maxLen = this.getMaxMessageLength();
    const chunks = this._splitMessage(msg.text, maxLen);

    for (const chunk of chunks) {
      await channel.send({
        content: chunk,
        reply: msg.replyToId
          ? { messageReference: msg.replyToId, failIfNotExists: false }
          : undefined,
      });
    }
  }

  protected getMaxMessageLength(): number {
    return DISCORD_MAX_MESSAGE_LENGTH;
  }
}

export async function startDiscordGateway(
  config: DiscordConfig,
): Promise<DiscordGateway> {
  const gateway = new DiscordGateway(config);
  await gateway.start();
  return gateway;
}
