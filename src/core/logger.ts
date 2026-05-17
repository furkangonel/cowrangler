/**
 * Logger — Yapılandırılmış log sistemi.
 *
 * Üç ayrı kanal:
 *   agent   → agent.log   (konuşma döngüsü, tool çağrıları, token sayaçları)
 *   errors  → errors.log  (hatalar, stack trace'ler, retry'lar)
 *   gateway → gateway.log (platform mesajlaşma, bağlantı durumları)
 *
 * Özellikler:
 *   - DEBUG / INFO / WARN / ERROR seviyeleri (COWRANGLER_LOG_LEVEL env var)
 *   - Her satır: [ISO timestamp] [LEVEL] [channel] message {json_context}
 *   - Log rotasyonu: 10 MB max dosya boyutu, 5 yedek dosya
 *   - İlk kullanımda otomatik dizin oluşturma
 *   - Singleton — tüm modüllerin aynı Logger örneğini paylaşması
 */

import fs from "fs";
import path from "path";
import os from "os";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogChannel = "agent" | "errors" | "gateway" | "cron" | "kanban";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info:  1,
  warn:  2,
  error: 3,
};

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_BACKUPS    = 5;

// ─────────────────────────────────────────────────────────────────────────────
// ROTATING FILE WRITER
// ─────────────────────────────────────────────────────────────────────────────

class RotatingFile {
  private fd: number | null = null;
  private currentBytes = 0;

  constructor(private filePath: string) {
    this._open();
  }

  write(line: string): void {
    const buf = Buffer.from(line + "\n", "utf-8");

    if (this.currentBytes + buf.length > MAX_FILE_BYTES) {
      this._rotate();
    }

    try {
      if (this.fd === null) this._open();
      fs.writeSync(this.fd!, buf);
      this.currentBytes += buf.length;
    } catch {
      // Yazma hatası — sessizce geç (log hatası uygulama akışını durdurmamalı)
    }
  }

  private _open(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      this.fd = fs.openSync(this.filePath, "a");
      const stat = fs.fstatSync(this.fd);
      this.currentBytes = stat.size;
    } catch {
      this.fd = null;
    }
  }

  private _rotate(): void {
    // fd'yi kapat
    if (this.fd !== null) {
      try { fs.closeSync(this.fd); } catch { /* yok say */ }
      this.fd = null;
    }

    // Yedekleri kaydır: .4 → .5, .3 → .4, ..., ana → .1
    for (let i = MAX_BACKUPS - 1; i >= 1; i--) {
      const from = `${this.filePath}.${i}`;
      const to   = `${this.filePath}.${i + 1}`;
      try {
        if (fs.existsSync(from)) fs.renameSync(from, to);
      } catch { /* yok say */ }
    }
    try {
      if (fs.existsSync(this.filePath)) {
        fs.renameSync(this.filePath, `${this.filePath}.1`);
      }
    } catch { /* yok say */ }

    this.currentBytes = 0;
    this._open();
  }

  close(): void {
    if (this.fd !== null) {
      try { fs.closeSync(this.fd); } catch { /* yok say */ }
      this.fd = null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGGER
// ─────────────────────────────────────────────────────────────────────────────

export class Logger {
  private files: Map<LogChannel, RotatingFile> = new Map();
  private minLevel: number;
  private logsDir: string;
  private consoleEnabled: boolean;

  constructor() {
    const level = (process.env.COWRANGLER_LOG_LEVEL ?? "info").toLowerCase() as LogLevel;
    this.minLevel = LEVEL_PRIORITY[level] ?? LEVEL_PRIORITY.info;

    // Log dizini: ~/.cowrangler/logs/ (profil-aware)
    const home = process.env.COWRANGLER_HOME ?? path.join(os.homedir(), ".cowrangler");
    this.logsDir = path.join(home, "logs");

    // Console output sadece DEBUG modda (geliştirici deneyimi için)
    this.consoleEnabled = this.minLevel === LEVEL_PRIORITY.debug;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  debug(channel: LogChannel, message: string, ctx?: Record<string, unknown>): void {
    this._log("debug", channel, message, ctx);
  }

  info(channel: LogChannel, message: string, ctx?: Record<string, unknown>): void {
    this._log("info", channel, message, ctx);
  }

  warn(channel: LogChannel, message: string, ctx?: Record<string, unknown>): void {
    this._log("warn", channel, message, ctx);
  }

  error(channel: LogChannel, message: string, err?: unknown, ctx?: Record<string, unknown>): void {
    const errorCtx: Record<string, unknown> = { ...ctx };
    if (err instanceof Error) {
      errorCtx.error = err.message;
      if (err.stack) errorCtx.stack = err.stack.split("\n").slice(0, 5).join(" | ");
    } else if (err !== undefined) {
      errorCtx.error = String(err);
    }
    // Hatalar hem kendi kanalına hem de errors.log'a yazılır
    this._log("error", channel, message, errorCtx);
    if (channel !== "errors") {
      this._log("error", "errors", `[${channel}] ${message}`, errorCtx);
    }
  }

  /**
   * Belirli bir kanalın son N satırını döndürür (cowrangler logs komutu için).
   */
  tail(channel: LogChannel, lines = 50): string[] {
    const filePath = path.join(this.logsDir, `${channel}.log`);
    if (!fs.existsSync(filePath)) return [];
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const all = content.trimEnd().split("\n");
      return all.slice(-lines);
    } catch {
      return [];
    }
  }

  /**
   * Log dosyalarının boyutlarını döndürür (doctor/status için).
   */
  stats(): Record<LogChannel, { sizeBytes: number; exists: boolean }> {
    const channels: LogChannel[] = ["agent", "errors", "gateway", "cron", "kanban"];
    const result: any = {};
    for (const ch of channels) {
      const filePath = path.join(this.logsDir, `${ch}.log`);
      try {
        const stat = fs.statSync(filePath);
        result[ch] = { sizeBytes: stat.size, exists: true };
      } catch {
        result[ch] = { sizeBytes: 0, exists: false };
      }
    }
    return result;
  }

  close(): void {
    for (const file of this.files.values()) file.close();
    this.files.clear();
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private _log(
    level: LogLevel,
    channel: LogChannel,
    message: string,
    ctx?: Record<string, unknown>,
  ): void {
    if (LEVEL_PRIORITY[level] < this.minLevel) return;

    const ts  = new Date().toISOString();
    const lvl = level.toUpperCase().padEnd(5);
    const ctxStr = ctx && Object.keys(ctx).length > 0
      ? " " + JSON.stringify(ctx)
      : "";
    const line = `[${ts}] [${lvl}] [${channel}] ${message}${ctxStr}`;

    // Kanala özgü dosyaya yaz
    const file = this._getFile(channel);
    file.write(line);

    // Debug modda stderr'e de bas (stdout çökmesin)
    if (this.consoleEnabled) {
      process.stderr.write(line + "\n");
    }
  }

  private _getFile(channel: LogChannel): RotatingFile {
    let file = this.files.get(channel);
    if (!file) {
      const filePath = path.join(this.logsDir, `${channel}.log`);
      file = new RotatingFile(filePath);
      this.files.set(channel, file);
    }
    return file;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLETON
// ─────────────────────────────────────────────────────────────────────────────

let _logger: Logger | null = null;

export function getLogger(): Logger {
  if (!_logger) _logger = new Logger();
  return _logger;
}

/** Graceful shutdown — tüm log dosyalarını kapat */
export function closeLogger(): void {
  if (_logger) {
    _logger.close();
    _logger = null;
  }
}
