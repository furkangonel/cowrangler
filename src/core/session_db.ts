/**
 * Session DB — SQLite tabanlı kalıcı oturum deposu.
 *
 * Özellikler:
 * - WAL modu: eşzamanlı okuyucular + tek yazıcı (gateway çok-platform)
 * - FTS5 sanal tablosu: tüm oturum mesajlarında tam metin arama (/search)
 * - Oturum branching: parent_session_id zincirleriyle
 * - Kaynak etiketleme: 'cli', 'telegram', 'discord' vb.
 * - NFS/SMB uyumluluğu: WAL desteklenmiyorsa DELETE moduna otomatik geçiş
 *
 *
 */

import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";
import crypto from "crypto";
import { DIRS } from "./init.js";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface SessionRecord {
  id: string;
  source: string; // 'cli' | 'telegram' | 'discord' | 'cron' | 'api'
  model: string;
  started_at: number; // Unix ms
  ended_at: number | null;
  message_count: number;
  tool_call_count: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  billing_provider: string;
  billing_mode: string; // 'per_token' | 'per_request'
  estimated_cost_usd: number;
  parent_session_id: string | null;
  title: string | null;
  workdir: string | null;
}

export interface MessageRecord {
  id: string;
  session_id: string;
  role: string; // 'user' | 'assistant' | 'tool'
  content: string;
  tool_name: string | null;
  tool_call_id: string | null;
  token_count: number;
  timestamp: number; // Unix ms
}

export interface SessionSummary {
  id: string;
  source: string;
  model: string;
  started_at: number;
  ended_at: number | null;
  message_count: number;
  tool_call_count: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  title: string | null;
}

export interface SearchResult {
  session_id: string;
  message_id: string;
  role: string;
  content_snippet: string;
  timestamp: number;
  session_title: string | null;
  session_model: string;
  rank: number;
}

// WAL modu ile uyumsuz dosya sistemi belirteçleri
const WAL_INCOMPAT_MARKERS = ["/afs/", "/.nfs", "/smb/", "/Volumes/"];

// ─────────────────────────────────────────────────────────────────────────────
// SESSION DB CLASS
// ─────────────────────────────────────────────────────────────────────────────

export class SessionDB {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? path.join(DIRS.global.base, "sessions.db");

    // Dizinin var olduğundan emin ol
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });

    this.db = new Database(this.dbPath);
    this._configure();
    this._migrate();
  }

  // ── Konfigürasyon ───────────────────────────────────────────────────────────

  private _configure(): void {
    // WAL modu uyumluluğunu kontrol et
    const useWAL = !WAL_INCOMPAT_MARKERS.some((m) => this.dbPath.includes(m));

    if (useWAL) {
      try {
        this.db.pragma("journal_mode = WAL");
      } catch {
        // WAL başarısız → DELETE moduna düş
        this.db.pragma("journal_mode = DELETE");
      }
    } else {
      this.db.pragma("journal_mode = DELETE");
    }

    this.db.pragma("foreign_keys = ON");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("cache_size = -64000"); // 64MB
    this.db.pragma("temp_store = MEMORY");
  }

  // ── Schema Migration ────────────────────────────────────────────────────────

  private _migrate(): void {
    // Sessions tablosu
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id                TEXT PRIMARY KEY,
        source            TEXT NOT NULL DEFAULT 'cli',
        model             TEXT NOT NULL DEFAULT '',
        started_at        INTEGER NOT NULL,
        ended_at          INTEGER,
        message_count     INTEGER NOT NULL DEFAULT 0,
        tool_call_count   INTEGER NOT NULL DEFAULT 0,
        input_tokens      INTEGER NOT NULL DEFAULT 0,
        output_tokens     INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cache_write_tokens INTEGER NOT NULL DEFAULT 0,
        billing_provider  TEXT NOT NULL DEFAULT '',
        billing_mode      TEXT NOT NULL DEFAULT 'per_token',
        estimated_cost_usd REAL NOT NULL DEFAULT 0.0,
        parent_session_id TEXT REFERENCES sessions(id),
        title             TEXT,
        workdir           TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_source ON sessions(source);
      CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_session_id);
    `);

    // Messages tablosu
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id           TEXT PRIMARY KEY,
        session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        role         TEXT NOT NULL,
        content      TEXT NOT NULL DEFAULT '',
        tool_name    TEXT,
        tool_call_id TEXT,
        token_count  INTEGER NOT NULL DEFAULT 0,
        timestamp    INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role);
    `);

    // FTS5 sanal tablosu — tam metin arama
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        content,
        role,
        session_id UNINDEXED,
        message_id UNINDEXED,
        tokenize = 'unicode61'
      );

      DROP TRIGGER IF EXISTS messages_ai;
      CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
        INSERT INTO messages_fts(content, role, session_id, message_id)
        VALUES (
          CASE WHEN new.role = 'tool' THEN SUBSTR(new.content, 1, 4000) ELSE SUBSTR(new.content, 1, 65536) END,
          new.role, new.session_id, new.id
        );
      END;

      DROP TRIGGER IF EXISTS messages_ad;
      CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
        DELETE FROM messages_fts WHERE message_id = old.id;
      END;

      DROP TRIGGER IF EXISTS messages_au;
      CREATE TRIGGER messages_au AFTER UPDATE OF content ON messages BEGIN
        DELETE FROM messages_fts WHERE message_id = old.id;
        INSERT INTO messages_fts(content, role, session_id, message_id)
        VALUES (
          CASE WHEN new.role = 'tool' THEN SUBSTR(new.content, 1, 4000) ELSE SUBSTR(new.content, 1, 65536) END,
          new.role, new.session_id, new.id
        );
      END;
    `);
  }

  // ── Session CRUD ────────────────────────────────────────────────────────────

  createSession(opts: {
    source?: string;
    model: string;
    parentSessionId?: string;
    title?: string;
    workdir?: string;
  }): string {
    const id = crypto.randomUUID();
    const now = Date.now();

    this.db
      .prepare(
        `INSERT INTO sessions (id, source, model, started_at, parent_session_id, title, workdir)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        opts.source ?? "cli",
        opts.model,
        now,
        opts.parentSessionId ?? null,
        opts.title ?? null,
        opts.workdir ?? process.cwd(),
      );

    return id;
  }

  updateSession(
    sessionId: string,
    updates: Partial<
      Pick<
        SessionRecord,
        | "ended_at"
        | "message_count"
        | "tool_call_count"
        | "input_tokens"
        | "output_tokens"
        | "cache_read_tokens"
        | "cache_write_tokens"
        | "estimated_cost_usd"
        | "title"
        | "billing_provider"
        | "billing_mode"
      >
    >,
  ): void {
    const sets = Object.keys(updates)
      .map((k) => `${k} = ?`)
      .join(", ");
    const values = Object.values(updates);
    this.db
      .prepare(`UPDATE sessions SET ${sets} WHERE id = ?`)
      .run(...values, sessionId);
  }

  closeSession(
    sessionId: string,
    stats: {
      input_tokens: number;
      output_tokens: number;
      cache_read_tokens?: number;
      cache_write_tokens?: number;
      tool_call_count: number;
      estimated_cost_usd?: number;
      title?: string;
    },
  ): void {
    const msg = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM messages WHERE session_id = ?`)
      .get(sessionId) as { cnt: number };

    this.updateSession(sessionId, {
      ended_at: Date.now(),
      message_count: msg.cnt,
      tool_call_count: stats.tool_call_count,
      input_tokens: stats.input_tokens,
      output_tokens: stats.output_tokens,
      cache_read_tokens: stats.cache_read_tokens ?? 0,
      cache_write_tokens: stats.cache_write_tokens ?? 0,
      estimated_cost_usd: stats.estimated_cost_usd ?? 0,
      ...(stats.title ? { title: stats.title } : {}),
    });
  }

  /**
   * Bir oturumu ve tüm mesajlarını kalıcı olarak siler (FTS dahil).
   * Mesajlar açıkça silinir → messages_ad trigger'ı FTS girişlerini temizler.
   * Bu oturuma parent olarak bağlı child oturumların referansı NULL'a çekilir
   * (parent_session_id FK'sinin ON DELETE eylemi yok).
   */
  deleteSession(sessionId: string): void {
    const tx = this.db.transaction((id: string) => {
      this.db
        .prepare(`UPDATE sessions SET parent_session_id = NULL WHERE parent_session_id = ?`)
        .run(id);
      this.db.prepare(`DELETE FROM messages WHERE session_id = ?`).run(id);
      this.db.prepare(`DELETE FROM sessions WHERE id = ?`).run(id);
    });
    tx(sessionId);
  }

  getSession(sessionId: string): SessionRecord | null {
    return (
      (this.db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId) as
        | SessionRecord
        | undefined) ?? null
    );
  }

  listSessions(
    opts: {
      limit?: number;
      offset?: number;
      source?: string;
      since?: number; // Unix ms
    } = {},
  ): SessionSummary[] {
    let query = `
      SELECT id, source, model, started_at, ended_at, message_count, tool_call_count,
             input_tokens, output_tokens, estimated_cost_usd, title
      FROM sessions
      WHERE 1=1
    `;
    const params: any[] = [];

    if (opts.source) {
      query += ` AND source = ?`;
      params.push(opts.source);
    }
    if (opts.since) {
      query += ` AND started_at >= ?`;
      params.push(opts.since);
    }

    query += ` ORDER BY started_at DESC LIMIT ? OFFSET ?`;
    params.push(opts.limit ?? 20, opts.offset ?? 0);

    return this.db.prepare(query).all(...params) as SessionSummary[];
  }

  // ── Message CRUD ────────────────────────────────────────────────────────────

  appendMessage(opts: {
    sessionId: string;
    role: string;
    content: string;
    toolName?: string;
    toolCallId?: string;
    tokenCount?: number;
  }): string {
    const id = crypto.randomUUID();
    const now = Date.now();

    this.db
      .prepare(
        `INSERT INTO messages (id, session_id, role, content, tool_name, tool_call_id, token_count, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        opts.sessionId,
        opts.role,
        opts.content,
        opts.toolName ?? null,
        opts.toolCallId ?? null,
        opts.tokenCount ?? 0,
        now,
      );

    // Session mesaj sayısını artır
    this.db
      .prepare(
        `UPDATE sessions SET message_count = message_count + 1 WHERE id = ?`,
      )
      .run(opts.sessionId);

    return id;
  }

  getMessages(
    sessionId: string,
    opts: { limit?: number; offset?: number } = {},
  ): MessageRecord[] {
    return this.db
      .prepare(
        `SELECT * FROM messages WHERE session_id = ?
         ORDER BY timestamp ASC LIMIT ? OFFSET ?`,
      )
      .all(sessionId, opts.limit ?? 1000, opts.offset ?? 0) as MessageRecord[];
  }

  // ── FTS5 Arama ──────────────────────────────────────────────────────────────

  searchSessions(
    query: string,
    opts: { limit?: number; sessionId?: string } = {},
  ): SearchResult[] {
    // FTS5 query güvenlik kontrolü — özel karakterleri escape et
    const safeQuery = query.replace(/['"]/g, " ").trim();

    if (!safeQuery) return [];

    let sql = `
      SELECT
        m.session_id,
        m.id as message_id,
        m.role,
        SUBSTR(m.content, 1, 200) as content_snippet,
        m.timestamp,
        s.title as session_title,
        s.model as session_model,
        fts.rank
      FROM messages_fts fts
      JOIN messages m ON m.id = fts.message_id
      JOIN sessions s ON s.id = m.session_id
      WHERE messages_fts MATCH ?
    `;
    const params: any[] = [safeQuery];

    if (opts.sessionId) {
      sql += ` AND m.session_id = ?`;
      params.push(opts.sessionId);
    }

    sql += ` ORDER BY rank LIMIT ?`;
    params.push(opts.limit ?? 20);

    try {
      return this.db.prepare(sql).all(...params) as SearchResult[];
    } catch {
      // FTS5 syntax hatası → boş sonuç döndür
      return [];
    }
  }

  // ── İstatistikler ────────────────────────────────────────────────────────────

  getStats(since?: number): {
    total_sessions: number;
    total_messages: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_cost_usd: number;
    by_model: Record<
      string,
      { sessions: number; tokens: number; cost: number }
    >;
    by_source: Record<string, number>;
  } {
    const sinceMs = since ?? 0;

    const totals = this.db
      .prepare(
        `SELECT
          COUNT(*) as total_sessions,
          SUM(message_count) as total_messages,
          SUM(input_tokens) as total_input_tokens,
          SUM(output_tokens) as total_output_tokens,
          SUM(estimated_cost_usd) as total_cost_usd
        FROM sessions WHERE started_at >= ?`,
      )
      .get(sinceMs) as any;

    const byModel = this.db
      .prepare(
        `SELECT model,
          COUNT(*) as sessions,
          SUM(input_tokens + output_tokens) as tokens,
          SUM(estimated_cost_usd) as cost
        FROM sessions WHERE started_at >= ?
        GROUP BY model ORDER BY sessions DESC`,
      )
      .all(sinceMs) as any[];

    const bySource = this.db
      .prepare(
        `SELECT source, COUNT(*) as cnt FROM sessions WHERE started_at >= ? GROUP BY source`,
      )
      .all(sinceMs) as any[];

    return {
      total_sessions: totals.total_sessions ?? 0,
      total_messages: totals.total_messages ?? 0,
      total_input_tokens: totals.total_input_tokens ?? 0,
      total_output_tokens: totals.total_output_tokens ?? 0,
      total_cost_usd: totals.total_cost_usd ?? 0,
      by_model: Object.fromEntries(
        byModel.map((r: any) => [
          r.model,
          { sessions: r.sessions, tokens: r.tokens, cost: r.cost },
        ]),
      ),
      by_source: Object.fromEntries(
        bySource.map((r: any) => [r.source, r.cnt]),
      ),
    };
  }

  // ── Yardımcı ────────────────────────────────────────────────────────────────

  close(): void {
    this.db.close();
  }

  get path(): string {
    return this.dbPath;
  }
}

// Singleton — uygulama genelinde tek örnek
let _instance: SessionDB | null = null;

export function getSessionDB(): SessionDB {
  if (!_instance) {
    _instance = new SessionDB();
  }
  return _instance;
}

export function closeSessionDB(): void {
  if (_instance) {
    _instance.close();
    _instance = null;
  }
}
