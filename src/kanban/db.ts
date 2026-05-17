/**
 * Kanban DB — SQLite tabanlı çok-ajanlı iş kuyruğu.
 *
 *
 * Mimari:
 *   Kullanıcı → cowrangler kanban <fiil>
 *       ↓
 *   SQLite kanban.db
 *       ↓
 *   Dispatcher (her 60s'de bir döngü)
 *     ↙           ↘
 *   Worker A      Worker B
 *   (profile_1)  (profile_2)
 *
 * İzolasyon modeli:
 * - Board  — sert sınır (COWRANGLER_KANBAN_BOARD env var)
 * - Tenant — pano içinde yumuşak ad alanı
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { DIRS } from "../core/init.js";

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
  assigned_to: string | null; // profil adı
  parent_id: string | null; // sub-task için
  created_at: number;
  updated_at: number;
  claimed_at: number | null;
  completed_at: number | null;
  output: string | null;
  error: string | null;
  fail_count: number;
  tags: string[];
}

export interface KanbanComment {
  id: string;
  task_id: string;
  author: string;
  content: string;
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
}

const DEFAULT_BOARD = process.env.COWRANGLER_KANBAN_BOARD ?? "default";
const MAX_FAIL_COUNT = 5; // Bu kadar ardışık hata → otomatik engelle

// ─────────────────────────────────────────────────────────────────────────────
// KANBAN DB
// ─────────────────────────────────────────────────────────────────────────────

export class KanbanDB {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const p = dbPath ?? path.join(DIRS.global.base, "kanban.db");
    fs.mkdirSync(path.dirname(p), { recursive: true });
    this.db = new Database(p);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this._migrate();
  }

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

      CREATE INDEX IF NOT EXISTS idx_kanban_board_status ON kanban_tasks(board, status);
      CREATE INDEX IF NOT EXISTS idx_kanban_assigned ON kanban_tasks(assigned_to);
      CREATE INDEX IF NOT EXISTS idx_kanban_parent ON kanban_tasks(parent_id);
    `);
  }

  // ── Task CRUD ────────────────────────────────────────────────────────────────

  create(opts: CreateTaskOpts): KanbanTask {
    const id = crypto.randomUUID();
    const now = Date.now();

    this.db
      .prepare(
        `
      INSERT INTO kanban_tasks (id, board, tenant, title, description, priority, parent_id, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
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
        now,
        now,
      );

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

    sql += ` ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, created_at ASC`;
    sql += ` LIMIT ?`;
    params.push(opts.limit ?? 100);

    return (this.db.prepare(sql).all(...params) as any[]).map(
      this._deserialize,
    );
  }

  /** Bir sonraki atanabilir görevi atomik olarak talep et */
  claim(profileName: string, board?: string): KanbanTask | null {
    const b = board ?? DEFAULT_BOARD;

    // Engelli olmayan, blocker'ı tamamlanmış, pending görevleri bul
    const claimable = this.db
      .prepare(
        `
      SELECT t.* FROM kanban_tasks t
      WHERE t.board = ? AND t.status = 'pending' AND t.fail_count < ?
      AND NOT EXISTS (
        SELECT 1 FROM kanban_links l
        JOIN kanban_tasks blocker ON blocker.id = l.blocker_id
        WHERE l.blocked_id = t.id AND blocker.status != 'done'
      )
      ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, t.created_at ASC
      LIMIT 1
    `,
      )
      .get(b, MAX_FAIL_COUNT) as any;

    if (!claimable) return null;

    const now = Date.now();
    this.db
      .prepare(
        `
      UPDATE kanban_tasks SET status = 'claimed', assigned_to = ?, claimed_at = ?, updated_at = ?
      WHERE id = ? AND status = 'pending'
    `,
      )
      .run(profileName, now, now, claimable.id);

    return this.get(claimable.id);
  }

  markRunning(id: string): void {
    this.db
      .prepare(
        `UPDATE kanban_tasks SET status = 'running', updated_at = ? WHERE id = ?`,
      )
      .run(Date.now(), id);
  }

  markDone(id: string, output: string): void {
    this.db
      .prepare(
        `UPDATE kanban_tasks SET status = 'done', output = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
      )
      .run(output.slice(0, 50_000), Date.now(), Date.now(), id);
  }

  markFailed(id: string, error: string): void {
    const task = this.get(id);
    if (!task) return;

    const newFailCount = task.fail_count + 1;
    const newStatus = newFailCount >= MAX_FAIL_COUNT ? "blocked" : "pending";

    this.db
      .prepare(
        `UPDATE kanban_tasks SET status = ?, error = ?, fail_count = ?, updated_at = ?, assigned_to = NULL WHERE id = ?`,
      )
      .run(newStatus, error.slice(0, 2000), newFailCount, Date.now(), id);
  }

  block(id: string): void {
    this.db
      .prepare(
        `UPDATE kanban_tasks SET status = 'blocked', updated_at = ? WHERE id = ?`,
      )
      .run(Date.now(), id);
  }

  unblock(id: string): void {
    this.db
      .prepare(
        `UPDATE kanban_tasks SET status = 'pending', fail_count = 0, updated_at = ? WHERE id = ?`,
      )
      .run(Date.now(), id);
  }

  addComment(taskId: string, author: string, content: string): void {
    this.db
      .prepare(
        `INSERT INTO kanban_comments (id, task_id, author, content, timestamp) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(crypto.randomUUID(), taskId, author, content, Date.now());
  }

  getComments(taskId: string): KanbanComment[] {
    return this.db
      .prepare(
        `SELECT * FROM kanban_comments WHERE task_id = ? ORDER BY timestamp ASC`,
      )
      .all(taskId) as KanbanComment[];
  }

  link(blockerId: string, blockedId: string): void {
    try {
      this.db
        .prepare(
          `INSERT OR IGNORE INTO kanban_links (blocker_id, blocked_id) VALUES (?, ?)`,
        )
        .run(blockerId, blockedId);
    } catch {
      /* sessizce */
    }
  }

  unlink(blockerId: string, blockedId: string): void {
    this.db
      .prepare(
        `DELETE FROM kanban_links WHERE blocker_id = ? AND blocked_id = ?`,
      )
      .run(blockerId, blockedId);
  }

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

  private _deserialize(row: any): KanbanTask {
    return { ...row, tags: JSON.parse(row.tags ?? "[]") };
  }

  close(): void {
    this.db.close();
  }
}

// Singleton
let _db: KanbanDB | null = null;
export function getKanbanDB(): KanbanDB {
  if (!_db) _db = new KanbanDB();
  return _db;
}
