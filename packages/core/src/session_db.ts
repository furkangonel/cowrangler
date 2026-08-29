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
  last_active_at?: number;
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
    // A desktop app may keep several agents alive. A bounded 16 MB page cache
    // is enough for the chat workload without multiplying memory pressure.
    this.db.pragma("cache_size = -16000");
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

      CREATE TABLE IF NOT EXISTS usage_events (
        id                 TEXT PRIMARY KEY,
        session_id         TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        surface            TEXT NOT NULL DEFAULT 'unknown',
        model              TEXT NOT NULL DEFAULT '',
        input_tokens       INTEGER NOT NULL DEFAULT 0,
        output_tokens      INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
        cache_write_tokens INTEGER NOT NULL DEFAULT 0,
        tool_call_count    INTEGER NOT NULL DEFAULT 0,
        status             TEXT NOT NULL DEFAULT 'success',
        timestamp          INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_usage_events_session ON usage_events(session_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_usage_events_surface ON usage_events(surface, timestamp);
      CREATE INDEX IF NOT EXISTS idx_usage_events_model ON usage_events(model, timestamp);

      INSERT INTO usage_events (
        id, session_id, surface, model, input_tokens, output_tokens,
        cache_read_tokens, cache_write_tokens, tool_call_count, status, timestamp
      )
      SELECT lower(hex(randomblob(16))), s.id, s.source, s.model,
        s.input_tokens, s.output_tokens, s.cache_read_tokens, s.cache_write_tokens,
        s.tool_call_count, 'success',
        COALESCE((SELECT MAX(m.timestamp) FROM messages m WHERE m.session_id = s.id), s.started_at)
      FROM sessions s
      WHERE NOT EXISTS (SELECT 1 FROM usage_events e WHERE e.session_id = s.id);
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

    // Bakım muhasebesi (son VACUUM/arşivleme zamanı gibi tekil değerler)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // İzin kararlarının makine tarafından okunabilir denetim kaydı.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS permission_decisions (
        id          TEXT PRIMARY KEY,
        session_id  TEXT REFERENCES sessions(id) ON DELETE CASCADE,
        tool_name   TEXT NOT NULL,
        risk_level  TEXT NOT NULL,
        decision    TEXT NOT NULL, -- 'allowed' | 'denied'
        source      TEXT NOT NULL, -- 'auto' | 'user' | 'bypass'
        reason      TEXT,
        extra_info  TEXT,
        timestamp   INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_permission_decisions_session ON permission_decisions(session_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_permission_decisions_tool ON permission_decisions(tool_name);
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
        | "workdir"
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

  // ── Bakım: arşivleme + VACUUM ───────────────────────────────────────────────

  private _getMeta(key: string): string | null {
    const row = this.db.prepare(`SELECT value FROM meta WHERE key = ?`).get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  private _setMeta(key: string, value: string): void {
    this.db.prepare(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
  }

  /**
   * Pinlenmemiş, belirtilen yaştan eski oturumları `archiveDir`'e JSON olarak
   * dışa aktarır ve DB'den siler. Geriye arşivlenen oturum sayısını döner.
   */
  archiveOldSessions(opts: { olderThanMs: number; archiveDir: string; limit?: number } = { olderThanMs: 90 * 24 * 60 * 60 * 1000, archiveDir: path.join(DIRS.global.base, "archive") }): number {
    const cutoff = Date.now() - opts.olderThanMs;
    const candidates = this.db
      .prepare(
        `SELECT id FROM sessions WHERE pinned = 0 AND ended_at IS NOT NULL AND ended_at < ? ORDER BY ended_at ASC LIMIT ?`,
      )
      .all(cutoff, opts.limit ?? 500) as { id: string }[];

    if (candidates.length === 0) return 0;

    fs.mkdirSync(opts.archiveDir, { recursive: true });

    let archived = 0;
    for (const { id } of candidates) {
      const session = this.getSession(id);
      if (!session) continue;
      const messages = this.getMessages(id, { limit: 100_000 });
      const outPath = path.join(opts.archiveDir, `session-${id}.json`);
      fs.writeFileSync(outPath, JSON.stringify({ session, messages }, null, 2), "utf8");
      this.deleteSession(id);
      archived++;
    }
    return archived;
  }

  /** `PRAGMA optimize` + `VACUUM` çalıştırır (WAL checkpoint dahil). */
  vacuum(): void {
    try {
      this.db.pragma("optimize");
    } catch {
      // optimize best-effort — sürüm desteklemiyorsa yok say
    }
    this.db.exec("VACUUM");
  }

  /**
   * Eski oturumları arşivler, DB dosya boyutu üst sınırı aşıyorsa pinlenmemiş
   * en eski oturumları (yaşına bakmaksızın) sınırın altına inene kadar
   * arşivlemeye devam eder, sonunda VACUUM çalıştırır.
   */
  runMaintenance(
    opts: { olderThanMs?: number; maxSizeBytes?: number; archiveDir?: string } = {},
  ): { archivedCount: number; sizeBeforeBytes: number; sizeAfterBytes: number } {
    const olderThanMs = opts.olderThanMs ?? 90 * 24 * 60 * 60 * 1000;
    const maxSizeBytes = opts.maxSizeBytes ?? 500 * 1024 * 1024; // 500MB
    const archiveDir = opts.archiveDir ?? path.join(DIRS.global.base, "archive");

    const sizeBeforeBytes = fs.existsSync(this.dbPath) ? fs.statSync(this.dbPath).size : 0;

    let archivedCount = this.archiveOldSessions({ olderThanMs, archiveDir });

    // Boyut hâlâ sınırın üzerindeyse, yaşa bakmaksızın en eski pinlenmemiş
    // oturumları toplu halde arşivlemeye devam et.
    let guard = 0;
    while (fs.existsSync(this.dbPath) && fs.statSync(this.dbPath).size > maxSizeBytes && guard < 20) {
      const more = this.archiveOldSessions({ olderThanMs: 0, archiveDir, limit: 100 });
      if (more === 0) break;
      archivedCount += more;
      guard++;
    }

    // VACUUM rewrites the whole database and can stall startup. Only pay that
    // cost when rows were removed or the file is meaningfully large.
    if (archivedCount > 0 || sizeBeforeBytes > 100 * 1024 * 1024) this.vacuum();
    else {
      try { this.db.pragma("optimize") } catch { /* best effort */ }
    }
    const sizeAfterBytes = fs.existsSync(this.dbPath) ? fs.statSync(this.dbPath).size : 0;
    this._setMeta("last_maintenance_at", String(Date.now()));

    return { archivedCount, sizeBeforeBytes, sizeAfterBytes };
  }

  /** `runMaintenance`'ı yalnızca son çalışmadan bu yana `minIntervalMs` geçtiyse tetikler. */
  maybeRunMaintenance(
    opts: { olderThanMs?: number; maxSizeBytes?: number; archiveDir?: string; minIntervalMs?: number } = {},
  ): { archivedCount: number; sizeBeforeBytes: number; sizeAfterBytes: number } | null {
    const minIntervalMs = opts.minIntervalMs ?? 24 * 60 * 60 * 1000; // 24 saat
    const last = Number(this._getMeta("last_maintenance_at") ?? 0);
    if (Date.now() - last < minIntervalMs) return null;
    return this.runMaintenance(opts);
  }

  // ── İzin kararı denetim kayıtları ───────────────────────────────────────────

  recordPermissionDecision(opts: {
    sessionId: string | null;
    toolName: string;
    riskLevel: string;
    decision: "allowed" | "denied";
    source: "auto" | "user" | "bypass";
    reason?: string;
    extraInfo?: string;
  }): void {
    const id = crypto.randomUUID();
    this.db
      .prepare(
        `INSERT INTO permission_decisions
           (id, session_id, tool_name, risk_level, decision, source, reason, extra_info, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        opts.sessionId,
        opts.toolName,
        opts.riskLevel,
        opts.decision,
        opts.source,
        opts.reason ?? null,
        opts.extraInfo ?? null,
        Date.now(),
      );
  }

  listPermissionDecisions(
    opts: { sessionId?: string; toolName?: string; limit?: number; offset?: number } = {},
  ): Array<{
    id: string;
    session_id: string | null;
    tool_name: string;
    risk_level: string;
    decision: string;
    source: string;
    reason: string | null;
    extra_info: string | null;
    timestamp: number;
  }> {
    let query = `SELECT * FROM permission_decisions WHERE 1=1`;
    const params: any[] = [];
    if (opts.sessionId) {
      query += ` AND session_id = ?`;
      params.push(opts.sessionId);
    }
    if (opts.toolName) {
      query += ` AND tool_name = ?`;
      params.push(opts.toolName);
    }
    query += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
    params.push(opts.limit ?? 100, opts.offset ?? 0);
    return this.db.prepare(query).all(...params) as any;
  }

  getLastActiveAt(sessionId: string): number {
    const row = this.db
      .prepare(`SELECT MAX(timestamp) as ts FROM messages WHERE session_id = ?`)
      .get(sessionId) as { ts: number | null } | undefined;
    if (row && row.ts !== null) {
      return row.ts;
    }
    const sess = this.getSession(sessionId);
    return sess ? sess.started_at : 0;
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

  appendUsageEvent(opts: {
    sessionId: string;
    surface: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    toolCallCount?: number;
    status?: "success" | "failed" | "interrupted";
    timestamp?: number;
  }): string {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO usage_events (
        id, session_id, surface, model, input_tokens, output_tokens,
        cache_read_tokens, cache_write_tokens, tool_call_count, status, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, opts.sessionId, opts.surface, opts.model,
      opts.inputTokens, opts.outputTokens,
      opts.cacheReadTokens ?? 0, opts.cacheWriteTokens ?? 0,
      opts.toolCallCount ?? 0, opts.status ?? "success", opts.timestamp ?? Date.now(),
    );
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

  getDashboardStats(sinceMs?: number, sessionIds?: string[]): {
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
    const scopedIds = sessionIds ? [...new Set(sessionIds)] : undefined;
    if (scopedIds && scopedIds.length === 0) {
      return {
        totals: { sessions: 0, messages: 0, tokens: 0 }, active_days: 0,
        current_streak: 0, longest_streak: 0, peak_hour: null,
        favorite_model: null, by_day: [], by_model: [],
      };
    }
    const scopeSql = scopedIds ? ` AND s.id IN (${scopedIds.map(() => "?").join(",")})` : "";
    const scopeParams = scopedIds ?? [];

    // 1. Totals — "messages" kullanıcı promptlarını ifade eder. Ara assistant,
    // reasoning ve tool kayıtları kullanıcı mesajı gibi şişirilmez.
    const sessionsRow = this.db.prepare(`
      SELECT COUNT(DISTINCT s.id) as sessions
      FROM sessions s JOIN messages m ON m.session_id = s.id
      WHERE m.timestamp >= ?${scopeSql}
    `).get(since, ...scopeParams) as { sessions: number } | undefined;
    const messagesRow = this.db.prepare(`
      SELECT COUNT(*) as messages
      FROM messages m JOIN sessions s ON s.id = m.session_id
      WHERE m.role = 'user' AND m.timestamp >= ?${scopeSql}
    `).get(since, ...scopeParams) as { messages: number } | undefined;
    const tokensRow = this.db.prepare(`
      SELECT SUM(e.input_tokens + e.output_tokens) as tokens
      FROM usage_events e JOIN sessions s ON s.id = e.session_id
      WHERE e.timestamp >= ?${scopeSql}
    `).get(since, ...scopeParams) as { tokens: number } | undefined;

    const totals = {
      sessions: sessionsRow?.sessions ?? 0,
      messages: messagesRow?.messages ?? 0,
      tokens: tokensRow?.tokens ?? 0,
    };

    // 2. Daily token usage & active days
    const dailyRows = this.db
      .prepare(
        `SELECT
          strftime('%Y-%m-%d', e.timestamp / 1000, 'unixepoch', 'localtime') as date,
          SUM(e.input_tokens + e.output_tokens) as tokens
        FROM usage_events e JOIN sessions s ON s.id = e.session_id
        WHERE e.timestamp >= ?${scopeSql}
        GROUP BY date
        ORDER BY date ASC`,
      )
      .all(since, ...scopeParams) as Array<{ date: string; tokens: number }>;

    const active_days = dailyRows.filter((r) => r.tokens > 0).length;

    // Streaks
    const allActiveDays = this.db
      .prepare(
        `SELECT DISTINCT strftime('%Y-%m-%d', e.timestamp / 1000, 'unixepoch', 'localtime') as date
        FROM usage_events e JOIN sessions s ON s.id = e.session_id
        WHERE (e.input_tokens + e.output_tokens) > 0${scopeSql}
        ORDER BY date DESC`,
      )
      .all(...scopeParams) as Array<{ date: string }>;

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
          CAST(strftime('%H', m.timestamp / 1000, 'unixepoch', 'localtime') AS INTEGER) as hour,
          COUNT(*) as cnt
        FROM messages m JOIN sessions s ON s.id = m.session_id
        WHERE m.role = 'user' AND m.timestamp >= ?${scopeSql}
        GROUP BY hour
        ORDER BY cnt DESC, hour ASC
        LIMIT 1`,
      )
      .get(since, ...scopeParams) as { hour: number } | undefined;

    const peak_hour = peakHourRow !== undefined ? peakHourRow.hour : null;

    // 4. Favorite model & Model stats
    const modelStatsRows = this.db
      .prepare(
        `SELECT
          e.model,
          SUM(e.input_tokens) as input_tokens,
          SUM(e.output_tokens) as output_tokens
        FROM usage_events e JOIN sessions s ON s.id = e.session_id
        WHERE e.timestamp >= ? AND e.model IS NOT NULL AND e.model != ''${scopeSql}
        GROUP BY e.model
        ORDER BY (SUM(e.input_tokens) + SUM(e.output_tokens)) DESC`,
      )
      .all(since, ...scopeParams) as Array<{ model: string; input_tokens: number; output_tokens: number }>;

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
    try {
      _instance.maybeRunMaintenance();
    } catch {
      // Bakım en fazla günde bir kez best-effort çalışır — hata oturumu engellemesin.
    }
  }
  return _instance;
}

export function closeSessionDB(): void {
  if (_instance) {
    _instance.close();
    _instance = null;
  }
}
