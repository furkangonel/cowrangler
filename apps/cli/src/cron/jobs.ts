/**
 * Cron Job Store — SQLite tabanlı zamanlanmış görev deposu.
 *
 *
 * Desteklenen zamanlama formatları:
 *   "30m"                    — 30 dakikada bir
 *   "every 2h"               — her 2 saatte bir
 *   "every monday 9am"       — her pazartesi 09:00
 *   "0 9 * * *"              — 5-alanlı cron ifadesi
 *   "2026-06-01T09:00:00Z"   — ISO timestamp (tek seferlik)
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { DIRS } from "@cowrangler/core/init.js";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface CronJob {
  id: string;
  name: string;
  schedule: string; // orijinal format
  prompt: string; // agent'a gönderilecek mesaj
  skills: string[]; // yüklenecek skill'ler
  model: string | null; // null → varsayılan model
  provider: string | null; // null → varsayılan provider
  workdir: string | null; // null → cwd
  script: string | null; // çalıştırılacak ön-script (çıktı prompt'a eklenir)
  context_from: string | null; // başka bir job'ın ID'si (output'unu context olarak kullan)
  enabled: boolean;
  run_count: number;
  last_run: number | null; // Unix ms
  last_output: string | null;
  last_error: string | null;
  next_run: number; // Unix ms
  created_at: number;
}

export interface CreateJobOpts {
  name: string;
  schedule: string;
  prompt: string;
  skills?: string[];
  model?: string;
  provider?: string;
  workdir?: string;
  script?: string;
  context_from?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULE PARSER
// ─────────────────────────────────────────────────────────────────────────────

const DAY_NAMES: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/**
 * İnsan dostu schedule string'ini bir sonraki çalışma zamanına (Unix ms) çevirir.
 * Cron ifadeler için gerçek cron parser değil — basit kurallar.
 */
export function parseScheduleToNextRun(schedule: string): number {
  const now = Date.now();
  const s = schedule.trim().toLowerCase();

  // ISO timestamp — tek seferlik
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const ts = new Date(schedule).getTime();
    return ts > now ? ts : now + 60_000; // geçmiş ise 1dk sonra
  }

  // "30m" / "2h" / "1d" şeklindeki süreler
  const durationMatch = s.match(/^(\d+)(s|m|h|d)$/);
  if (durationMatch) {
    const n = parseInt(durationMatch[1]);
    const unit = durationMatch[2];
    const multMs: Record<string, number> = {
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return now + n * multMs[unit];
  }

  // "every <n><unit>" → her N birimde bir
  const everyMatch = s.match(/^every\s+(\d+)(s|m|h|d)$/);
  if (everyMatch) {
    const n = parseInt(everyMatch[1]);
    const unit = everyMatch[2];
    const multMs: Record<string, number> = {
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return now + n * multMs[unit];
  }

  // "every <dayname> <time>" → haftalık
  const weeklyMatch = s.match(
    /^every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(\d{1,2})(?::(\d{2}))?(am|pm)?$/,
  );
  if (weeklyMatch) {
    const targetDay = DAY_NAMES[weeklyMatch[1]];
    let hour = parseInt(weeklyMatch[2]);
    const min = weeklyMatch[3] ? parseInt(weeklyMatch[3]) : 0;
    const ampm = weeklyMatch[4];
    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;

    const d = new Date();
    d.setHours(hour, min, 0, 0);
    const daysUntil = (targetDay - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + daysUntil);
    return d.getTime();
  }

  // "0 9 * * *" → 5-alanlı cron (sadece bir sonraki tetiklenmeyi hesapla)
  if (/^[\d*,/-]+ [\d*,/-]+ [\d*,/-]+ [\d*,/-]+ [\d*,/-]+$/.test(s)) {
    return parseCronExpression(s, now);
  }

  // Tanınmıyorsa 1 saat sonra
  return now + 3_600_000;
}

/**
 * Basit cron expression parser — yalnızca temel alanları destekler.
 * Gerçek üretim için `cron-parser` paketi kullanılabilir.
 */
function parseCronExpression(expr: string, from: number): number {
  const [minField, hourField] = expr.split(" ");
  const d = new Date(from + 60_000); // en az 1dk sonra

  const targetMin = minField === "*" ? null : parseInt(minField);
  const targetHour = hourField === "*" ? null : parseInt(hourField);

  if (targetHour !== null) d.setHours(targetHour, targetMin ?? 0, 0, 0);
  else if (targetMin !== null) {
    d.setMinutes(targetMin, 0, 0);
    if (d.getTime() <= from) d.setHours(d.getHours() + 1);
  }

  if (d.getTime() <= from) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/**
 * Bir job'ın periyot süresini ms cinsinden döndürür.
 * Tekrar çalışma zamanı hesaplamak için kullanılır.
 */
export function getSchedulePeriodMs(schedule: string): number {
  const s = schedule.trim().toLowerCase();

  const durationMatch = s.match(/^(\d+)(s|m|h|d)$/);
  if (durationMatch) {
    const n = parseInt(durationMatch[1]);
    const multMs: Record<string, number> = {
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return n * multMs[durationMatch[2]];
  }

  const everyMatch = s.match(/^every\s+(\d+)(s|m|h|d)$/);
  if (everyMatch) {
    const n = parseInt(everyMatch[1]);
    const multMs: Record<string, number> = {
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return n * multMs[everyMatch[2]];
  }

  if (
    /^every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/.test(
      s,
    )
  ) {
    return 7 * 86_400_000;
  }

  return 3_600_000; // varsayılan: 1 saat
}

// ─────────────────────────────────────────────────────────────────────────────
// JOB STORE
// ─────────────────────────────────────────────────────────────────────────────

export class CronJobStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const p = dbPath ?? path.join(DIRS.global.base, "cron.db");
    fs.mkdirSync(path.dirname(p), { recursive: true });
    this.db = new Database(p);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this._migrate();
  }

  private _migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cron_jobs (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL UNIQUE,
        schedule     TEXT NOT NULL,
        prompt       TEXT NOT NULL,
        skills       TEXT NOT NULL DEFAULT '[]',
        model        TEXT,
        provider     TEXT,
        workdir      TEXT,
        script       TEXT,
        context_from TEXT,
        enabled      INTEGER NOT NULL DEFAULT 1,
        run_count    INTEGER NOT NULL DEFAULT 0,
        last_run     INTEGER,
        last_output  TEXT,
        last_error   TEXT,
        next_run     INTEGER NOT NULL,
        created_at   INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cron_next_run ON cron_jobs(next_run, enabled);
    `);
  }

  create(opts: CreateJobOpts): CronJob {
    const id = crypto.randomUUID();
    const now = Date.now();
    const next_run = parseScheduleToNextRun(opts.schedule);

    this.db
      .prepare(
        `
      INSERT INTO cron_jobs (id, name, schedule, prompt, skills, model, provider, workdir, script, context_from, next_run, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        id,
        opts.name,
        opts.schedule,
        opts.prompt,
        JSON.stringify(opts.skills ?? []),
        opts.model ?? null,
        opts.provider ?? null,
        opts.workdir ?? null,
        opts.script ?? null,
        opts.context_from ?? null,
        next_run,
        now,
      );

    return this.get(id)!;
  }

  get(id: string): CronJob | null {
    const row = this.db
      .prepare(`SELECT * FROM cron_jobs WHERE id = ?`)
      .get(id) as any;
    return row ? this._deserialize(row) : null;
  }

  getByName(name: string): CronJob | null {
    const row = this.db
      .prepare(`SELECT * FROM cron_jobs WHERE name = ?`)
      .get(name) as any;
    return row ? this._deserialize(row) : null;
  }

  list(opts: { enabledOnly?: boolean } = {}): CronJob[] {
    const sql = opts.enabledOnly
      ? `SELECT * FROM cron_jobs WHERE enabled = 1 ORDER BY next_run ASC`
      : `SELECT * FROM cron_jobs ORDER BY created_at DESC`;
    return (this.db.prepare(sql).all() as any[]).map(this._deserialize);
  }

  /** Şu an çalışması gereken job'ları döndür (atomik) */
  claimDue(): CronJob[] {
    const now = Date.now();
    const due = this.db
      .prepare(
        `SELECT * FROM cron_jobs WHERE enabled = 1 AND next_run <= ? ORDER BY next_run ASC LIMIT 10`,
      )
      .all(now) as any[];

    return due.map(this._deserialize);
  }

  /** Job tamamlandığında çağrılır — bir sonraki çalışma zamanını hesapla */
  markComplete(id: string, output: string): void {
    const job = this.get(id);
    if (!job) return;

    const next = parseScheduleToNextRun(job.schedule);
    this.db
      .prepare(
        `
      UPDATE cron_jobs SET run_count = run_count + 1, last_run = ?, last_output = ?,
      last_error = NULL, next_run = ? WHERE id = ?
    `,
      )
      .run(Date.now(), output.slice(0, 10_000), next, id);
  }

  /** Job hatalı tamamlandığında */
  markFailed(id: string, error: string): void {
    const job = this.get(id);
    if (!job) return;

    const next = parseScheduleToNextRun(job.schedule);
    this.db
      .prepare(
        `
      UPDATE cron_jobs SET run_count = run_count + 1, last_run = ?, last_error = ?,
      next_run = ? WHERE id = ?
    `,
      )
      .run(Date.now(), error.slice(0, 2000), next, id);
  }

  setEnabled(id: string, enabled: boolean): void {
    this.db
      .prepare(`UPDATE cron_jobs SET enabled = ? WHERE id = ?`)
      .run(enabled ? 1 : 0, id);
  }

  delete(id: string): void {
    this.db.prepare(`DELETE FROM cron_jobs WHERE id = ?`).run(id);
  }

  private _deserialize(row: any): CronJob {
    return {
      ...row,
      skills: JSON.parse(row.skills ?? "[]"),
      enabled: Boolean(row.enabled),
    };
  }

  close(): void {
    this.db.close();
  }
}

// Singleton
let _store: CronJobStore | null = null;
export function getCronJobStore(): CronJobStore {
  if (!_store) _store = new CronJobStore();
  return _store;
}
