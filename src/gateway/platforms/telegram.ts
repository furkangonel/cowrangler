/**
 * Telegram Gateway — Telegram Bot API entegrasyonu.
 *
 * Kurulum:
 *   1. @BotFather'dan bot oluştur, token al
 *   2. config.yaml'a ekle:
 *      gateway:
 *        telegram:
 *          token: "bot:TOKEN"
 *          allowed_user_ids: [123456789]  # opsiyonel — whitelist
 *
 * Özellikler:
 * - Inline keyboard — onay/red butonları
 * - Konuşma bazlı session izolasyonu
 * - Dosya upload/download (belge, resim, ses)
 * - Uzun mesajları böl (4096 karakter limiti)
 * - Markdown V2 formatı
 */

import TelegramBot from "node-telegram-bot-api";
import { GatewayPlatform, IncomingMessage, OutgoingMessage } from "../base.js";

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

export interface TelegramConfig {
  token: string;
  allowedUserIds?: number[];
  parseMode?: "Markdown" | "MarkdownV2" | "HTML";
}

export class TelegramGateway extends GatewayPlatform {
  private bot: TelegramBot;
  private config: TelegramConfig;

  constructor(config: TelegramConfig) {
    super("telegram");
    this.config = config;
    this.bot = new TelegramBot(config.token, { polling: false });
  }

  async start(): Promise<void> {
    // Polling başlat
    await this.bot.startPolling({ restart: true });

    // Mesaj handler
    this.bot.on("message", async (msg) => {
      if (!msg.text || !msg.chat) return;

      // Whitelist kontrolü
      if (
        this.config.allowedUserIds?.length &&
        msg.from &&
        !this.config.allowedUserIds.includes(msg.from.id)
      ) {
        await this.bot.sendMessage(
          msg.chat.id,
          "⛔ You are not authorized to use this bot.",
        );
        return;
      }

      const incoming: IncomingMessage = {
        id: String(msg.message_id),
        conversationId: String(msg.chat.id),
        userId: String(msg.from?.id ?? "unknown"),
        text: msg.text,
        platform: "telegram",
        timestamp: (msg.date ?? 0) * 1000,
      };

      // Dosya ekleri
      if (msg.document || msg.photo || msg.audio || msg.voice) {
        incoming.attachments = [];
        // Dosya bilgisini attachments'a ekle (tam download için bot.getFile kullanılabilir)
      }

      await this.handleIncoming(incoming);
    });

    // Callback query (inline keyboard butonları)
    this.bot.on("callback_query", async (query) => {
      if (!query.message || !query.data) return;

      await this.bot.answerCallbackQuery(query.id);

      const incoming: IncomingMessage = {
        id: String(query.id),
        conversationId: String(query.message.chat.id),
        userId: String(query.from.id),
        text: query.data,
        platform: "telegram",
        timestamp: Date.now(),
        replyToId: String(query.message.message_id),
      };

      await this.handleIncoming(incoming);
    });

    // Stale session temizliği — her saatte bir
    setInterval(() => this.cleanStaleSessions(), 3_600_000);

    console.log("[gateway:telegram] Started");
  }

  async stop(): Promise<void> {
    await this.bot.stopPolling();
    console.log("[gateway:telegram] Stopped");
  }

  async sendMessage(msg: OutgoingMessage): Promise<void> {
    const chatId = msg.conversationId;
    const maxLen = this.getMaxMessageLength();
    const chunks = this._splitMessage(msg.text, maxLen);

    for (const chunk of chunks) {
      try {
        await this.bot.sendMessage(chatId, chunk, {
          parse_mode: this._mapParseMode(msg.parseMode),
          reply_to_message_id: msg.replyToId
            ? parseInt(msg.replyToId)
            : undefined,
        });
      } catch (err: any) {
        // Markdown parse hatası → plain text olarak tekrar dene
        if (err.message?.includes("can't parse entities")) {
          await this.bot.sendMessage(chatId, chunk);
        } else {
          throw err;
        }
      }
    }
  }

  protected getMaxMessageLength(): number {
    return TELEGRAM_MAX_MESSAGE_LENGTH;
  }

  private _mapParseMode(mode?: string): "Markdown" | "MarkdownV2" | "HTML" | undefined {
    if (mode === "markdown") return "Markdown";
    if (mode === "html") return "HTML";
    return undefined;
  }

  /**
   * Onay butonu olan mesaj gönder
   */
  async sendApprovalRequest(
    conversationId: string,
    text: string,
    approveData: string,
    denyData: string,
  ): Promise<void> {
    await this.bot.sendMessage(conversationId, text, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Approve", callback_data: approveData },
            { text: "❌ Deny", callback_data: denyData },
          ],
        ],
      },
    });
  }
}

/**
 * Config'den Telegram gateway oluştur ve başlat.
 */
export async function startTelegramGateway(
  config: TelegramConfig,
): Promise<TelegramGateway> {
  const gateway = new TelegramGateway(config);
  await gateway.start();
  return gateway;
}
