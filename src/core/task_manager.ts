/**
 * Task Manager — Yapılandırılmış oturum görevi yönetimi.
 *
 * AGENT_TODO.md markdown checklist'in yerine geçer.
 * JSON tabanlı, kalıcı, model-dostu tasarım.
 *
 * Tasarım ilkesi:
 *   Her action sonucunda model numaralı, okunabilir bir liste görür.
 *   Model task ID'leri ezberlemek zorunda kalmaz — index veya keyword ile erişir.
 *
 * Depolama: .cowrangler/tasks.json (human-readable, git-ignorable)
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { LOCAL_DIR } from "./init.js";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type TaskStatus = "todo" | "in_progress" | "done" | "blocked";
export type TaskPriority = "low" | "normal" | "high";

export interface SessionTask {
  id: string;
  index: number; // 1-based, stable within session
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

interface TaskStore {
  version: 1;
  tasks: SessionTask[];
  nextIndex: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const TASKS_FILE = path.join(LOCAL_DIR, "tasks.json");

const STATUS_ICON: Record<TaskStatus, string> = {
  todo: "○",
  in_progress: "◉",
  done: "✓",
  blocked: "✗",
};

const PRIORITY_BADGE: Record<TaskPriority, string> = {
  low: "",
  normal: "",
  high: " [HIGH]",
};

// ─────────────────────────────────────────────────────────────────────────────
// TASK MANAGER
// ─────────────────────────────────────────────────────────────────────────────

export class TaskManager {
  private store: TaskStore;

  constructor() {
    this.store = this._load();
  }

  // ── Persistence ─────────────────────────────────────────────────────────────

  private _load(): TaskStore {
    try {
      if (fs.existsSync(TASKS_FILE)) {
        const raw = fs.readFileSync(TASKS_FILE, "utf-8");
        const parsed = JSON.parse(raw) as TaskStore;
        if (parsed.version === 1 && Array.isArray(parsed.tasks)) {
          return parsed;
        }
      }
    } catch {
      // Corrupt file — start fresh
    }
    return { version: 1, tasks: [], nextIndex: 1 };
  }

  private _save(): void {
    try {
      fs.mkdirSync(LOCAL_DIR, { recursive: true });
      fs.writeFileSync(TASKS_FILE, JSON.stringify(this.store, null, 2), "utf-8");
    } catch {
      // Non-fatal
    }
  }

  // ── Lookup ──────────────────────────────────────────────────────────────────

  /**
   * Görev bul: 1-based index (string "1", "2"...) veya başlık keyword ile.
   */
  private _find(ref: string): SessionTask | null {
    const trimmed = ref.trim();

    // Numeric index
    if (/^\d+$/.test(trimmed)) {
      const idx = parseInt(trimmed, 10);
      return this.store.tasks.find((t) => t.index === idx) ?? null;
    }

    // Text match (case-insensitive, partial)
    const lower = trimmed.toLowerCase();
    return (
      this.store.tasks.find((t) => t.title.toLowerCase().includes(lower)) ??
      null
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  private _render(filter?: TaskStatus[]): string {
    const tasks = filter
      ? this.store.tasks.filter((t) => filter.includes(t.status))
      : this.store.tasks;

    if (tasks.length === 0) {
      return filter
        ? `No tasks with status: ${filter.join(", ")}.`
        : "Task list is empty.";
    }

    const lines = tasks.map((t) => {
      const icon = STATUS_ICON[t.status];
      const badge = PRIORITY_BADGE[t.priority];
      const notes = t.notes ? ` — ${t.notes}` : "";
      return `  ${t.index}. ${icon} ${t.title}${badge}${notes}`;
    });

    const active = tasks.filter((t) =>
      ["todo", "in_progress"].includes(t.status)
    ).length;
    const done = tasks.filter((t) => t.status === "done").length;

    lines.push("");
    lines.push(`  Active: ${active}  Done: ${done}  Total: ${tasks.length}`);

    return lines.join("\n");
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  create(opts: {
    title: string;
    priority?: TaskPriority;
    notes?: string;
  }): string {
    const task: SessionTask = {
      id: crypto.randomUUID().slice(0, 8),
      index: this.store.nextIndex++,
      title: opts.title,
      status: "todo",
      priority: opts.priority ?? "normal",
      notes: opts.notes,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.store.tasks.push(task);
    this._save();

    return `Created task #${task.index}: "${task.title}"\n\n${this._render()}`;
  }

  start(ref: string): string {
    const task = this._find(ref);
    if (!task) return `ERROR: Task not found: "${ref}".\n\n${this._render()}`;

    task.status = "in_progress";
    task.updatedAt = Date.now();
    this._save();

    return `Started #${task.index}: "${task.title}"\n\n${this._render()}`;
  }

  done(ref: string, notes?: string): string {
    const task = this._find(ref);
    if (!task) return `ERROR: Task not found: "${ref}".\n\n${this._render()}`;

    task.status = "done";
    task.updatedAt = Date.now();
    task.completedAt = Date.now();
    if (notes) task.notes = notes;
    this._save();

    return `Completed #${task.index}: "${task.title}"\n\n${this._render()}`;
  }

  block(ref: string, reason?: string): string {
    const task = this._find(ref);
    if (!task) return `ERROR: Task not found: "${ref}".\n\n${this._render()}`;

    task.status = "blocked";
    task.updatedAt = Date.now();
    if (reason) task.notes = reason;
    this._save();

    return `Blocked #${task.index}: "${task.title}"${reason ? ` — ${reason}` : ""}\n\n${this._render()}`;
  }

  unblock(ref: string): string {
    const task = this._find(ref);
    if (!task) return `ERROR: Task not found: "${ref}".\n\n${this._render()}`;

    task.status = "todo";
    task.updatedAt = Date.now();
    this._save();

    return `Unblocked #${task.index}: "${task.title}"\n\n${this._render()}`;
  }

  list(filter?: TaskStatus[]): string {
    return this._render(filter);
  }

  /**
   * Tamamlanan görevleri temizle. Aktif görevlere dokunmaz.
   */
  clear(): string {
    const before = this.store.tasks.length;
    this.store.tasks = this.store.tasks.filter((t) => t.status !== "done");
    const removed = before - this.store.tasks.length;
    this._save();

    return `Cleared ${removed} completed task(s).\n\n${this._render()}`;
  }

  /**
   * Tüm görevleri sil. Yeni oturum başlangıcında kullanılır.
   */
  reset(): string {
    this.store = { version: 1, tasks: [], nextIndex: 1 };
    this._save();
    return "Task list reset.";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLETON
// ─────────────────────────────────────────────────────────────────────────────

let _manager: TaskManager | null = null;
export function getTaskManager(): TaskManager {
  if (!_manager) _manager = new TaskManager();
  return _manager;
}
