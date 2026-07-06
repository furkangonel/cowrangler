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
  pinned: number;
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
  pinned: number;
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
        parent_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
        title             TEXT,
        workdir           TEXT,
        pinned            INTEGER NOT NULL DEFAULT 0
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
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
      CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role);
    `);

    // Geriye dönük uyumluluk: pinned sütunu eklendi
    try {
      this.db.exec(`ALTER TABLE sessions ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;`);
    } catch (e) {
      // Sütun zaten varsa hata fırlatır, yok say.
    }

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
        | "pinned"
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
             input_tokens, output_tokens, estimated_cost_usd, title, pinned
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
         ORDER BY timestamp ASC, rowid ASC LIMIT ? OFFSET ?`,
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

  getDashboardStats(sinceMs?: number): {
    totals: {
      sessions: number;
      messages: number;
      tokens: number;
    };
    active_days: number;
    current_streak: number;
    longest_streak: number;
    peak_hour: number | null;
    favorite_model: string | null;
    by_day: Array<{ date: string; tokens: number }>;
    by_model: Array<{
      model: string;
      input_tokens: number;
      output_tokens: number;
      pct: number;
    }>;
  } {
    const since = sinceMs ?? 0;

    // 1. Totals
    const totalsRow = this.db
      .prepare(
        `SELECT
          COUNT(*) as sessions,
          SUM(message_count) as messages,
          SUM(input_tokens + output_tokens) as tokens
        FROM sessions
        WHERE started_at >= ?`,
      )
      .get(since) as { sessions: number; messages: number; tokens: number } | undefined;

    const totals = {
      sessions: totalsRow?.sessions ?? 0,
      messages: totalsRow?.messages ?? 0,
      tokens: totalsRow?.tokens ?? 0,
    };

    // 2. Daily token usage & active days
    const dailyRows = this.db
      .prepare(
        `SELECT
          strftime('%Y-%m-%d', started_at / 1000, 'unixepoch', 'localtime') as date,
          SUM(input_tokens + output_tokens) as tokens
        FROM sessions
        WHERE started_at >= ?
        GROUP BY date
        ORDER BY date ASC`,
      )
      .all(since) as Array<{ date: string; tokens: number }>;

    const active_days = dailyRows.filter((r) => r.tokens > 0).length;

    // Streaks
    const allActiveDays = this.db
      .prepare(
        `SELECT DISTINCT strftime('%Y-%m-%d', started_at / 1000, 'unixepoch', 'localtime') as date
        FROM sessions
        WHERE (input_tokens + output_tokens) > 0
        ORDER BY date DESC`,
      )
      .all() as Array<{ date: string }>;

    let current_streak = 0;
    let longest_streak = 0;

    if (allActiveDays.length > 0) {
      const activeDates = new Set(allActiveDays.map(r => r.date));
      const today = new Date();
      const todayStr = today.toLocaleDateString('en-CA');
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toLocaleDateString('en-CA');

      if (activeDates.has(todayStr) || activeDates.has(yesterdayStr)) {
        let cur = activeDates.has(todayStr) ? today : yesterday;
        while (activeDates.has(cur.toLocaleDateString('en-CA'))) {
          current_streak++;
          cur.setDate(cur.getDate() - 1);
        }
      }

      // Longest streak
      let tempStreak = 0;
      const sortedDates = allActiveDays
        .map(r => new Date(r.date + 'T00:00:00'))
        .sort((a, b) => a.getTime() - b.getTime());

      if (sortedDates.length > 0) {
        tempStreak = 1;
        longest_streak = 1;
        for (let i = 1; i < sortedDates.length; i++) {
          const diffTime = sortedDates[i].getTime() - sortedDates[i - 1].getTime();
          const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
          if (diffDays === 1) {
            tempStreak++;
          } else if (diffDays > 1) {
            if (tempStreak > longest_streak) {
              longest_streak = tempStreak;
            }
            tempStreak = 1;
          }
        }
        if (tempStreak > longest_streak) {
          longest_streak = tempStreak;
        }
      }
    }

    // 3. Peak Hour
    const peakHourRow = this.db
      .prepare(
        `SELECT
          CAST(strftime('%H', started_at / 1000, 'unixepoch', 'localtime') AS INTEGER) as hour,
          COUNT(*) as cnt
        FROM sessions
        WHERE started_at >= ?
        GROUP BY hour
        ORDER BY cnt DESC, hour ASC
        LIMIT 1`,
      )
      .get(since) as { hour: number } | undefined;

    const peak_hour = peakHourRow !== undefined ? peakHourRow.hour : null;

    // 4. Favorite model & Model stats
    const modelStatsRows = this.db
      .prepare(
        `SELECT
          model,
          SUM(input_tokens) as input_tokens,
          SUM(output_tokens) as output_tokens
        FROM sessions
        WHERE started_at >= ? AND model IS NOT NULL AND model != ''
        GROUP BY model
        ORDER BY (SUM(input_tokens) + SUM(output_tokens)) DESC`,
      )
      .all(since) as Array<{ model: string; input_tokens: number; output_tokens: number }>;

    const favorite_model = modelStatsRows.length > 0 ? modelStatsRows[0].model : null;
    const totalTokens = modelStatsRows.reduce((acc, r) => acc + r.input_tokens + r.output_tokens, 0);

    const by_model = modelStatsRows.map((r) => {
      const tokens = r.input_tokens + r.output_tokens;
      return {
        model: r.model,
        input_tokens: r.input_tokens,
        output_tokens: r.output_tokens,
        pct: totalTokens > 0 ? (tokens / totalTokens) * 100 : 0,
      };
    });

    return {
      totals,
      active_days,
      current_streak,
      longest_streak,
      peak_hour,
      favorite_model,
      by_day: dailyRows,
      by_model,
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
