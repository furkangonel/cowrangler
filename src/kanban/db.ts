/**
 * Kanban DB — SQLite tabanlı çok-ajanlı iş kuyruğu.
 *
 * Mimari:
 *   Kullanıcı → cowrangler kanban <fiil>
 *       ↓
 *   SQLite kanban.db  (WAL modu — eşzamanlı okuma/yazma)
 *       ↓
 *   Dispatcher (periyodik döngü)
 *     ↙           ↘
 *   Worker A      Worker B
 *   (profile_1)  (profile_2)
 *
 * İzolasyon modeli:
 * - Board  — sert sınır (COWRANGLER_KANBAN_BOARD env var)
 * - Tenant — pano içinde yumuşak ad alanı
 *
 * Güvenlik değişmezi:
 * - claim() atomiktir: iki worker aynı görevi alamaz
 * - reclaim() MAX_CLAIM_AGE_MS aşan claimed/running görevleri serbest bırakır
 * - MAX_FAIL_COUNT ardışık hata → otomatik blocked
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { DIRS, getConfig } from "../core/init.js";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type TaskStatus =
  | "pending"
  | "claimed"
  | "running"
  | "done"
  | "failed"
  | "blocked";

export type TaskPriority = "low" | "normal" | "high" | "urgent";

export interface KanbanTask {
  id: string;
  board: string;
  tenant: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_to: string | null;
  parent_id: string | null;
  created_at: number;
  updated_at: number;
  claimed_at: number | null;
  completed_at: number | null;
  output: string | null;
  error: string | null;
  fail_count: number;
  tags: string[];
  /** Görev başına model override (null = dispatcher varsayılanı) */
  model: string | null;
  /** Görev başına yüklenecek skill id'leri */
  skills: string[];
  /** Görev başına izin verilen tool listesi ('*' veya açık liste, boş = tümü) */
  allowed_tools: string[];
}

export interface KanbanComment {
  id: string;
  task_id: string;
  author: string;
  content: string;
  timestamp: number;
}

export interface KanbanEvent {
  id: number;
  task_id: string;
  event_type: string; // created | status_changed | assigned | commented | output_updated
  payload: string; // JSON
  timestamp: number;
}

export interface CreateTaskOpts {
  board?: string;
  tenant?: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  parentId?: string;
  tags?: string[];
  assignTo?: string;
  model?: string;
  skills?: string[];
  allowedTools?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_BOARD = process.env.COWRANGLER_KANBAN_BOARD ?? "default";
const MAX_FAIL_COUNT = 5;
/** claimed/running durumunda bu süreden uzun kalan görevler reclaim ile serbest kalır */
const DEFAULT_MAX_CLAIM_AGE_MS = 10 * 60 * 1000; // 10 dakika
const DEFAULT_FAIL_BACKOFF_MS = 30 * 1000; // başarısız görev tekrar denenmeden önce bekleme

// ─────────────────────────────────────────────────────────────────────────────
// KANBAN DB
// ─────────────────────────────────────────────────────────────────────────────

export class KanbanDB {
  private db: Database.Database;
  private reclaimTimeoutMs: number = DEFAULT_MAX_CLAIM_AGE_MS;
  private failBackoffMs: number = DEFAULT_FAIL_BACKOFF_MS;

  constructor(dbPath?: string) {
    const p = dbPath ?? path.join(DIRS.global.base, "kanban.db");
    fs.mkdirSync(path.dirname(p), { recursive: true });
    this.db = new Database(p);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this._migrate();

    // Config'den dayanıklılık ayarlarını oku.
    try {
      const k = getConfig().kanban ?? {};
      if (typeof k.reclaim_timeout_ms === "number") this.reclaimTimeoutMs = k.reclaim_timeout_ms;
      if (typeof k.fail_backoff_ms === "number") this.failBackoffMs = k.fail_backoff_ms;
    } catch { /* varsayılanlar */ }
  }

  // ── Schema ──────────────────────────────────────────────────────────────────

  private _migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kanban_tasks (
        id           TEXT PRIMARY KEY,
        board        TEXT NOT NULL DEFAULT 'default',
        tenant       TEXT,
        title        TEXT NOT NULL,
        description  TEXT,
        status       TEXT NOT NULL DEFAULT 'pending',
        priority     TEXT NOT NULL DEFAULT 'normal',
        assigned_to  TEXT,
        parent_id    TEXT REFERENCES kanban_tasks(id),
        created_at   INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL,
        claimed_at   INTEGER,
        completed_at INTEGER,
        output       TEXT,
        error        TEXT,
        fail_count   INTEGER NOT NULL DEFAULT 0,
        tags         TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS kanban_comments (
        id        TEXT PRIMARY KEY,
        task_id   TEXT NOT NULL REFERENCES kanban_tasks(id) ON DELETE CASCADE,
        author    TEXT NOT NULL,
        content   TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS kanban_links (
        blocker_id TEXT NOT NULL REFERENCES kanban_tasks(id) ON DELETE CASCADE,
        blocked_id TEXT NOT NULL REFERENCES kanban_tasks(id) ON DELETE CASCADE,
        PRIMARY KEY (blocker_id, blocked_id)
      );

      CREATE TABLE IF NOT EXISTS kanban_events (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id    TEXT NOT NULL REFERENCES kanban_tasks(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        payload    TEXT NOT NULL DEFAULT '{}',
        timestamp  INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_kanban_board_status ON kanban_tasks(board, status);
      CREATE INDEX IF NOT EXISTS idx_kanban_assigned     ON kanban_tasks(assigned_to);
      CREATE INDEX IF NOT EXISTS idx_kanban_parent       ON kanban_tasks(parent_id);
      CREATE INDEX IF NOT EXISTS idx_kanban_events_task  ON kanban_events(task_id);
      CREATE INDEX IF NOT EXISTS idx_kanban_events_ts    ON kanban_events(timestamp DESC);
    `);

    // ── Additive migrations (per-task overrides) ──────────────────────────────
    // Eski DB'lerde eksik olan kolonları güvenli şekilde ekle.
    this._addColumnIfMissing("kanban_tasks", "model", "TEXT");
    this._addColumnIfMissing("kanban_tasks", "skills", "TEXT NOT NULL DEFAULT '[]'");
    this._addColumnIfMissing("kanban_tasks", "allowed_tools", "TEXT NOT NULL DEFAULT '[]'");
  }

  /** SQLite'ta kolon yoksa ekler. Varsa sessizce geçer. */
  private _addColumnIfMissing(table: string, column: string, type: string): void {
    const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as any[];
    if (cols.some((c) => c.name === column)) return;
    try {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    } catch { /* zaten var / yarış */ }
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  private _deserialize(row: any): KanbanTask {
    return {
      ...row,
      tags: JSON.parse(row.tags ?? "[]"),
      model: row.model ?? null,
      skills: JSON.parse(row.skills ?? "[]"),
      allowed_tools: JSON.parse(row.allowed_tools ?? "[]"),
    };
  }

  private _emit(
    taskId: string,
    eventType: string,
    payload: Record<string, unknown> = {},
  ): void {
    this.db
      .prepare(
        `INSERT INTO kanban_events (task_id, event_type, payload, timestamp)
         VALUES (?, ?, ?, ?)`,
      )
      .run(taskId, eventType, JSON.stringify(payload), Date.now());
  }

  // ── Task CRUD ────────────────────────────────────────────────────────────────

  create(opts: CreateTaskOpts): KanbanTask {
    const id = crypto.randomUUID();
    const now = Date.now();

    this.db
      .prepare(
        `INSERT INTO kanban_tasks
           (id, board, tenant, title, description, priority, parent_id, tags, assigned_to, created_at, updated_at, model, skills, allowed_tools)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        opts.board ?? DEFAULT_BOARD,
        opts.tenant ?? null,
        opts.title,
        opts.description ?? null,
        opts.priority ?? "normal",
        opts.parentId ?? null,
        JSON.stringify(opts.tags ?? []),
        opts.assignTo ?? null,
        now,
        now,
        opts.model ?? null,
        JSON.stringify(opts.skills ?? []),
        JSON.stringify(opts.allowedTools ?? []),
      );

    this._emit(id, "created", { title: opts.title });
    return this.get(id)!;
  }

  get(id: string): KanbanTask | null {
    const row = this.db
      .prepare(`SELECT * FROM kanban_tasks WHERE id = ?`)
      .get(id) as any;
    return row ? this._deserialize(row) : null;
  }

  list(
    opts: {
      board?: string;
      tenant?: string;
      status?: TaskStatus | TaskStatus[];
      assignedTo?: string;
      tag?: string;
      limit?: number;
    } = {},
  ): KanbanTask[] {
    let sql = `SELECT * FROM kanban_tasks WHERE 1=1`;
    const params: any[] = [];

    sql += ` AND board = ?`;
    params.push(opts.board ?? DEFAULT_BOARD);

    if (opts.tenant) {
      sql += ` AND tenant = ?`;
      params.push(opts.tenant);
    }

    if (opts.status) {
      const statuses = Array.isArray(opts.status) ? opts.status : [opts.status];
      sql += ` AND status IN (${statuses.map(() => "?").join(",")})`;
      params.push(...statuses);
    }

    if (opts.assignedTo) {
      sql += ` AND assigned_to = ?`;
      params.push(opts.assignedTo);
    }

    if (opts.tag) {
      sql += ` AND tags LIKE ?`;
      params.push(`%"${opts.tag}"%`);
    }

    sql += ` ORDER BY
      CASE priority
        WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3
      END, created_at ASC`;
    sql += ` LIMIT ?`;
    params.push(opts.limit ?? 200);

    return (this.db.prepare(sql).all(...params) as any[]).map(
      this._deserialize,
    );
  }

  /** Bir sonraki atanabilir görevi atomik olarak talep et */
  claim(profileName: string, board?: string, tenant?: string): KanbanTask | null {
    const b = board ?? DEFAULT_BOARD;
    // Başarısız görevler fail_backoff süresi geçmeden tekrar alınamaz.
    // (markFailed updated_at'i now yapar; o yüzden updated_at eşiği ile filtreliyoruz.)
    const backoffCutoff = Date.now() - this.failBackoffMs;

    const params: any[] = [b];
    let tenantClause = "";
    if (tenant) {
      tenantClause = " AND t.tenant = ?";
      params.push(tenant);
    }
    params.push(MAX_FAIL_COUNT, backoffCutoff);

    const claimable = this.db
      .prepare(
        `SELECT t.* FROM kanban_tasks t
         WHERE t.board = ?${tenantClause} AND t.status = 'pending' AND t.fail_count < ?
           AND (t.fail_count = 0 OR t.updated_at <= ?)
           AND NOT EXISTS (
             SELECT 1 FROM kanban_links l
             JOIN kanban_tasks blocker ON blocker.id = l.blocker_id
             WHERE l.blocked_id = t.id AND blocker.status != 'done'
           )
         ORDER BY
           CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
           t.created_at ASC
         LIMIT 1`,
      )
      .get(...params) as any;

    if (!claimable) return null;

    const now = Date.now();
    const result = this.db
      .prepare(
        `UPDATE kanban_tasks
         SET status = 'claimed', assigned_to = ?, claimed_at = ?, updated_at = ?
         WHERE id = ? AND status = 'pending'`,
      )
      .run(profileName, now, now, claimable.id) as any;

    if (result.changes === 0) return null; // Başka worker daha önce aldı

    this._emit(claimable.id, "claimed", { by: profileName });
    return this.get(claimable.id);
  }

  /**
   * Manuel alanları güncelle (title, description, priority, tags, assigned_to).
   * Status değişikliği için markDone/markFailed/block/unblock kullan.
   */
  update(
    id: string,
    fields: {
      title?: string;
      description?: string | null;
      priority?: TaskPriority;
      tags?: string[];
      assigned_to?: string | null;
    },
  ): void {
    const sets: string[] = [];
    const params: any[] = [];

    if (fields.title !== undefined) { sets.push("title = ?"); params.push(fields.title); }
    if (fields.description !== undefined) { sets.push("description = ?"); params.push(fields.description); }
    if (fields.priority !== undefined) { sets.push("priority = ?"); params.push(fields.priority); }
    if (fields.tags !== undefined) { sets.push("tags = ?"); params.push(JSON.stringify(fields.tags)); }
    if (fields.assigned_to !== undefined) { sets.push("assigned_to = ?"); params.push(fields.assigned_to); }

    if (sets.length === 0) return;

    sets.push("updated_at = ?");
    params.push(Date.now());
    params.push(id);

    this.db.prepare(`UPDATE kanban_tasks SET ${sets.join(", ")} WHERE id = ?`).run(...params);
    this._emit(id, "updated", { fields: Object.keys(fields) });
  }

  assign(id: string, profileName: string): void {
    this.db
      .prepare(
        `UPDATE kanban_tasks SET assigned_to = ?, updated_at = ? WHERE id = ?`,
      )
      .run(profileName, Date.now(), id);
    this._emit(id, "assigned", { to: profileName });
  }

  markRunning(id: string): void {
    this.db
      .prepare(
        `UPDATE kanban_tasks SET status = 'running', updated_at = ? WHERE id = ?`,
      )
      .run(Date.now(), id);
    this._emit(id, "status_changed", { status: "running" });
  }

  /**
   * Heartbeat — çalışan bir worker'ın görevi canlı tuttuğunu bildirir.
   * updated_at'i tazeler, böylece reclaim() uzun-süren (ama hayatta olan)
   * görevleri yanlışlıkla serbest bırakıp çift-çalıştırmaz.
   */
  heartbeat(id: string): void {
    this.db
      .prepare(
        `UPDATE kanban_tasks SET updated_at = ? WHERE id = ? AND status IN ('claimed','running')`,
      )
      .run(Date.now(), id);
  }

  markDone(id: string, output: string): void {
    const now = Date.now();
    this.db
      .prepare(
        `UPDATE kanban_tasks
         SET status = 'done', output = ?, completed_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(output.slice(0, 50_000), now, now, id);
    this._emit(id, "status_changed", { status: "done" });
  }

  markFailed(id: string, error: string): void {
    const task = this.get(id);
    if (!task) return;

    const newFailCount = task.fail_count + 1;
    const newStatus = newFailCount >= MAX_FAIL_COUNT ? "blocked" : "pending";

    this.db
      .prepare(
        `UPDATE kanban_tasks
         SET status = ?, error = ?, fail_count = ?, updated_at = ?, assigned_to = NULL, claimed_at = NULL
         WHERE id = ?`,
      )
      .run(newStatus, error.slice(0, 2000), newFailCount, Date.now(), id);

    this._emit(id, "status_changed", {
      status: newStatus,
      failCount: newFailCount,
      error: error.slice(0, 200),
    });
  }

  block(id: string, reason?: string): void {
    this.db
      .prepare(
        `UPDATE kanban_tasks SET status = 'blocked', updated_at = ? WHERE id = ?`,
      )
      .run(Date.now(), id);
    this._emit(id, "status_changed", { status: "blocked", reason });
  }

  unblock(id: string): void {
    this.db
      .prepare(
        `UPDATE kanban_tasks SET status = 'pending', fail_count = 0, updated_at = ? WHERE id = ?`,
      )
      .run(Date.now(), id);
    this._emit(id, "status_changed", { status: "pending" });
  }

  /**
   * Timeout'u aşmış claimed/running görevleri pending'e döndür.
   * Dispatcher her tick başında çağırır.
   */
  reclaim(board?: string): number {
    const b = board ?? DEFAULT_BOARD;
    const cutoff = Date.now() - this.reclaimTimeoutMs;

    const stale = this.db
      .prepare(
        `SELECT id FROM kanban_tasks
         WHERE board = ? AND status IN ('claimed', 'running') AND updated_at < ?`,
      )
      .all(b, cutoff) as any[];

    for (const row of stale) {
      this.db
        .prepare(
          `UPDATE kanban_tasks
           SET status = 'pending', assigned_to = NULL, claimed_at = NULL, updated_at = ?
           WHERE id = ?`,
        )
        .run(Date.now(), row.id);
      this._emit(row.id, "status_changed", {
        status: "pending",
        reason: "reclaimed_timeout",
      });
    }

    return stale.length;
  }

  // ── Comments ────────────────────────────────────────────────────────────────

  addComment(taskId: string, author: string, content: string): void {
    this.db
      .prepare(
        `INSERT INTO kanban_comments (id, task_id, author, content, timestamp)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(crypto.randomUUID(), taskId, author, content, Date.now());
    this._emit(taskId, "commented", { author, preview: content.slice(0, 100) });
  }

  getComments(taskId: string): KanbanComment[] {
    return this.db
      .prepare(
        `SELECT * FROM kanban_comments WHERE task_id = ? ORDER BY timestamp ASC`,
      )
      .all(taskId) as KanbanComment[];
  }

  // ── Links (bağımlılıklar) ─────────────────────────────────────────────────

  link(blockerId: string, blockedId: string): void {
    if (blockerId === blockedId) {
      throw new Error("A task cannot block itself.");
    }
    // Döngü kontrolü: blockedId zaten blockerId'yi (geçişli olarak) blokluyorsa
    // bu yeni link bir döngü oluşturur ve dispatcher'ı kilitler.
    if (this._wouldCreateCycle(blockerId, blockedId)) {
      throw new Error(
        `Refusing to link: this would create a dependency cycle ` +
          `(${blockedId.slice(0, 8)} already blocks ${blockerId.slice(0, 8)}).`,
      );
    }
    try {
      this.db
        .prepare(
          `INSERT OR IGNORE INTO kanban_links (blocker_id, blocked_id) VALUES (?, ?)`,
        )
        .run(blockerId, blockedId);
      this._emit(blockedId, "linked", { blocker: blockerId });
    } catch {
      /* sessizce */
    }
  }

  /**
   * blockerId → blockedId link'i eklenirse döngü oluşur mu?
   * blockedId'den başlayarak blokladığı görevleri BFS ile gezeriz; blockerId'ye
   * ulaşırsak döngü vardır.
   */
  private _wouldCreateCycle(blockerId: string, blockedId: string): boolean {
    const seen = new Set<string>();
    const queue: string[] = [blockedId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === blockerId) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      const next = this.db
        .prepare(`SELECT blocked_id FROM kanban_links WHERE blocker_id = ?`)
        .all(current) as any[];
      for (const row of next) queue.push(row.blocked_id);
    }
    return false;
  }

  unlink(blockerId: string, blockedId: string): void {
    this.db
      .prepare(
        `DELETE FROM kanban_links WHERE blocker_id = ? AND blocked_id = ?`,
      )
      .run(blockerId, blockedId);
  }

  getBlockers(taskId: string): KanbanTask[] {
    return (
      this.db
        .prepare(
          `SELECT t.* FROM kanban_tasks t
           JOIN kanban_links l ON l.blocker_id = t.id
           WHERE l.blocked_id = ?`,
        )
        .all(taskId) as any[]
    ).map(this._deserialize);
  }

  getBlocked(taskId: string): KanbanTask[] {
    return (
      this.db
        .prepare(
          `SELECT t.* FROM kanban_tasks t
           JOIN kanban_links l ON l.blocked_id = t.id
           WHERE l.blocker_id = ?`,
        )
        .all(taskId) as any[]
    ).map(this._deserialize);
  }

  // ── Events (SSE / tail) ──────────────────────────────────────────────────────

  tailEvents(opts: { board?: string; limit?: number; sinceId?: number } = {}): KanbanEvent[] {
    const b = opts.board ?? DEFAULT_BOARD;

    let sql = `
      SELECT e.* FROM kanban_events e
      JOIN kanban_tasks t ON t.id = e.task_id
      WHERE t.board = ?`;
    const params: any[] = [b];

    if (opts.sinceId !== undefined) {
      sql += ` AND e.id > ?`;
      params.push(opts.sinceId);
    }

    sql += ` ORDER BY e.id DESC LIMIT ?`;
    params.push(opts.limit ?? 50);

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.reverse(); // Kronolojik sıra
  }

  // ── Stats ────────────────────────────────────────────────────────────────────

  stats(board?: string): {
    pending: number;
    running: number;
    done: number;
    failed: number;
    blocked: number;
    total: number;
  } {
    const b = board ?? DEFAULT_BOARD;
    const rows = this.db
      .prepare(
        `SELECT status, COUNT(*) as cnt FROM kanban_tasks WHERE board = ? GROUP BY status`,
      )
      .all(b) as any[];

    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.status] = row.cnt;

    return {
      pending: counts.pending ?? 0,
      running: (counts.running ?? 0) + (counts.claimed ?? 0),
      done: counts.done ?? 0,
      failed: counts.failed ?? 0,
      blocked: counts.blocked ?? 0,
      total: Object.values(counts).reduce((s, n) => s + n, 0),
    };
  }

  boards(): string[] {
    return (
      this.db
        .prepare(`SELECT DISTINCT board FROM kanban_tasks ORDER BY board`)
        .all() as any[]
    ).map((r: any) => r.board);
  }

  close(): void {
    this.db.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLETON
// ─────────────────────────────────────────────────────────────────────────────

let _db: KanbanDB | null = null;
export function getKanbanDB(): KanbanDB {
  if (!_db) _db = new KanbanDB();
  return _db;
}
