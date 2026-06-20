/**
 * Gateway Base — platform-bağımsız mesajlaşma altyapısı.
 *
 *
 * Her platform bu abstract sınıfı implement eder:
 * - Gelen mesajları kuyruğa al (agent meşgulken)
 * - Platform'a özel mesaj gönder
 * - Dosya upload/download yönet
 * - Konuşma bazlı session izolasyonu sağla
 */

import { Agent } from "../core/agent.js";
import { LLM } from "../core/llm.js";
import { getConfig } from "../core/init.js";
import { getLogger } from "../core/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface IncomingMessage {
  id: string;
  conversationId: string; // chat ID, channel ID, etc.
  userId: string;
  text: string;
  platform: string;
  timestamp: number;
  replyToId?: string;
  attachments?: GatewayAttachment[];
}

export interface GatewayAttachment {
  type: "image" | "document" | "audio" | "video";
  url?: string;
  data?: Buffer;
  filename?: string;
  mimeType?: string;
}

export interface OutgoingMessage {
  conversationId: string;
  text: string;
  replyToId?: string;
  parseMode?: "markdown" | "html" | "plain";
}

export type GatewayCommand =
  | "/stop" // aktif agent'ı durdur
  | "/new" // yeni oturum başlat
  | "/queue" // bekleyen mesajları listele
  | "/approve" // onay bekleyen işlemi onayla
  | "/deny" // onay bekleyen işlemi reddet
  | "/status" // oturum durumu
  | "/help"; // yardım

export interface ConversationSession {
  conversationId: string;
  agent: Agent;
  isRunning: boolean;
  pendingMessages: IncomingMessage[];
  lastActivity: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// PLATFORM ABSTRACT
// ─────────────────────────────────────────────────────────────────────────────

export abstract class GatewayPlatform {
  protected sessions = new Map<string, ConversationSession>();
  protected platformName: string;

  constructor(platformName: string) {
    this.platformName = platformName;
  }

  /** Platform başlat */
  abstract start(): Promise<void>;

  /** Platform durdur */
  abstract stop(): Promise<void>;

  /** Mesaj gönder */
  abstract sendMessage(msg: OutgoingMessage): Promise<void>;

  /** Uzun mesajı böl — platform limitine göre */
  protected abstract getMaxMessageLength(): number;

  // ── Session Yönetimi ────────────────────────────────────────────────────────

  protected getOrCreateSession(conversationId: string): ConversationSession {
    if (this.sessions.has(conversationId)) {
      return this.sessions.get(conversationId)!;
    }

    const config = getConfig();
    const llm = new LLM(config.model, config.temperature);
    const agent = new Agent(
      llm,
      config.system_prompt,
      config.max_iterations,
      undefined,
      this.platformName,
    );

    const session: ConversationSession = {
      conversationId,
      agent,
      isRunning: false,
      pendingMessages: [],
      lastActivity: Date.now(),
    };

    this.sessions.set(conversationId, session);
    return session;
  }

  protected async handleIncoming(msg: IncomingMessage): Promise<void> {
    const log = getLogger();
    log.info("gateway", "Incoming message", {
      platform: msg.platform,
      conversationId: msg.conversationId,
      userId: msg.userId,
      textLength: msg.text.length,
    });

    // Slash komutları kontrolü
    if (msg.text.startsWith("/") && this._isGatewayCommand(msg.text)) {
      await this._handleGatewayCommand(msg);
      return;
    }

    const session = this.getOrCreateSession(msg.conversationId);
    session.lastActivity = Date.now();

    // Agent meşgulse mesajı kuyruğa al
    if (session.isRunning) {
      session.pendingMessages.push(msg);
      log.info("gateway", "Message queued (agent busy)", {
        conversationId: msg.conversationId,
        queueDepth: session.pendingMessages.length,
      });
      await this.sendMessage({
        conversationId: msg.conversationId,
        text: `⏳ Agent is busy. Your message has been queued (${session.pendingMessages.length} pending).`,
        replyToId: msg.id,
      });
      return;
    }

    await this._runAgent(session, msg);
  }

  private async _runAgent(
    session: ConversationSession,
    msg: IncomingMessage,
  ): Promise<void> {
    session.isRunning = true;

    try {
      const result = await session.agent.chat(
        msg.text,
        async (toolName, args) => {
          // Tool çağrısını kullanıcıya bildir (opsiyonel — platform'a göre konfigüre edilebilir)
        },
      );

      // Uzun mesajı böl
      const maxLen = this.getMaxMessageLength();
      const chunks = this._splitMessage(result.text, maxLen);

      for (const chunk of chunks) {
        await this.sendMessage({
          conversationId: msg.conversationId,
          text: chunk,
          parseMode: "markdown",
        });
      }
    } catch (err: any) {
      await this.sendMessage({
        conversationId: msg.conversationId,
        text: `❌ Error: ${err.message ?? String(err)}`,
      });
    } finally {
      session.isRunning = false;

      // Kuyruktaki mesajları işle
      if (session.pendingMessages.length > 0) {
        const next = session.pendingMessages.shift()!;
        await this._runAgent(session, next);
      }
    }
  }

  private _isGatewayCommand(text: string): boolean {
    const cmd = text.split(/\s+/)[0].toLowerCase();
    const gatewayCommands: GatewayCommand[] = [
      "/stop",
      "/new",
      "/queue",
      "/approve",
      "/deny",
      "/status",
      "/help",
    ];
    return gatewayCommands.includes(cmd as GatewayCommand);
  }

  private async _handleGatewayCommand(msg: IncomingMessage): Promise<void> {
    const session = this.sessions.get(msg.conversationId);
    const [cmd, ...args] = msg.text.trim().split(/\s+/);

    switch (cmd.toLowerCase() as GatewayCommand) {
      case "/stop":
        if (session?.agent) {
          session.agent.requestInterrupt();
          await this.sendMessage({
            conversationId: msg.conversationId,
            text: "⛔ Stop signal sent to agent.",
          });
        }
        break;

      case "/new":
        if (session) {
          session.agent.reset();
          session.pendingMessages = [];
          await this.sendMessage({
            conversationId: msg.conversationId,
            text: "🆕 New session started.",
          });
        }
        break;

      case "/queue":
        const count = session?.pendingMessages.length ?? 0;
        await this.sendMessage({
          conversationId: msg.conversationId,
          text:
            count > 0
              ? `📬 ${count} message(s) in queue.`
              : "📭 No messages queued.",
        });
        break;

      case "/status":
        const running = session?.isRunning ?? false;
        await this.sendMessage({
          conversationId: msg.conversationId,
          text: running ? "🟡 Agent is running..." : "🟢 Agent is idle.",
        });
        break;

      case "/help":
        await this.sendMessage({
          conversationId: msg.conversationId,
          text: [
            "**Cowrangler Gateway Commands:**",
            "/stop — Stop the running agent",
            "/new — Start a new session",
            "/queue — Show pending messages",
            "/status — Show agent status",
            "/help — Show this help",
          ].join("\n"),
          parseMode: "markdown",
        });
        break;
    }
  }

  protected _splitMessage(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLen) {
        chunks.push(remaining);
        break;
      }

      // Satır sonunda böl
      let splitAt = maxLen;
      const lastNewline = remaining.lastIndexOf("\n", maxLen);
      if (lastNewline > maxLen * 0.5) splitAt = lastNewline + 1;

      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt);
    }

    return chunks;
  }

  // ── Temizlik ────────────────────────────────────────────────────────────────

  /** Eski oturumları temizle (24 saat işlem görmemiş) */
  protected cleanStaleSessions(): void {
    const staleThreshold = Date.now() - 24 * 3_600_000;
    for (const [id, session] of this.sessions.entries()) {
      if (!session.isRunning && session.lastActivity < staleThreshold) {
        this.sessions.delete(id);
      }
    }
  }

  get activeSessions(): number {
    return this.sessions.size;
  }
}
