/**
 * Task Manager — Yapılandırılmış oturum görevi yönetimi.
 *
 * AGENT_TODO.md markdown checklist'in yerine geçer.
 * JSON tabanlı, kalıcı, model-dostu tasarım.
 *
 * Tasarım ilkesi:
 *   Her session için ayrı klasör, her task için ayrı JSON dosyası (örn: 1.json)
 *   Model task ID'leri ezberlemek zorunda kalmaz — index veya keyword ile erişir.
 *
 * Depolama: .cowrangler/tasks/<session_id>/<task_id>.json
 */

import fs from "fs";
import path from "path";
import { getProjectTasksDir } from "./project_context.js";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type TaskStatus = "todo" | "in_progress" | "completed" | "blocked";

export interface SessionTask {
  id: string; // "1", "2", vb. (Dosya adı ile eşleşir: 1.json)
  subject: string;
  description?: string;
  activeForm?: string;
  status: TaskStatus;
  blocks?: string[];
  blockedBy?: string[];
  
  // Internal fields
  createdAt?: number;
  updatedAt?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_ICON: Record<TaskStatus, string> = {
  todo: "○",
  in_progress: "◉",
  completed: "✓",
  blocked: "✗",
};

// ─────────────────────────────────────────────────────────────────────────────
// TASK MANAGER
// ─────────────────────────────────────────────────────────────────────────────

export class TaskManager {
  
  // ── File System ─────────────────────────────────────────────────────────────

  private _getDir(): string {
    const dir = getProjectTasksDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  private _loadAll(): SessionTask[] {
    // Salt-okuma: dizin yoksa oluşturma (UI göstergesi 800ms'de yoklar; global
    // depoyu boş yere yaratmasın). Yalnızca yazma yolları (_save) dizini oluşturur.
    const dir = getProjectTasksDir();
    if (!fs.existsSync(dir)) return [];
    const tasks: SessionTask[] = [];
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      try {
        const p = path.join(dir, file);
        const raw = fs.readFileSync(p, "utf-8");
        const parsed = JSON.parse(raw) as SessionTask;
        tasks.push(parsed);
      } catch {
        // Corrupt file, ignore
      }
    }

    // Numarik sıralama (ID'ler string ama numara gibi artıyor)
    return tasks.sort((a, b) => {
      const numA = parseInt(a.id, 10);
      const numB = parseInt(b.id, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.id.localeCompare(b.id);
    });
  }

  private _save(task: SessionTask): void {
    try {
      const dir = this._getDir();
      const p = path.join(dir, `${task.id}.json`);
      fs.writeFileSync(p, JSON.stringify(task, null, 2), "utf-8");
    } catch {
      // Non-fatal
    }
  }

  private _delete(id: string): void {
    try {
      const dir = this._getDir();
      const p = path.join(dir, `${id}.json`);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      // Non-fatal
    }
  }

  // ── Lookup ──────────────────────────────────────────────────────────────────

  /**
   * Görev bul: ID (string "1", "2"...) veya başlık (subject) keyword ile.
   */
  private _find(ref: string): SessionTask | null {
    const tasks = this._loadAll();
    const trimmed = ref.trim();

    // ID match
    const byId = tasks.find((t) => t.id === trimmed);
    if (byId) return byId;

    // Text match (case-insensitive, partial on subject)
    const lower = trimmed.toLowerCase();
    return tasks.find((t) => t.subject.toLowerCase().includes(lower)) ?? null;
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  private _render(filter?: TaskStatus[]): string {
    const allTasks = this._loadAll();
    const tasks = filter
      ? allTasks.filter((t) => filter.includes(t.status))
      : allTasks;

    if (tasks.length === 0) {
      return filter
        ? `No tasks with status: ${filter.join(", ")}.`
        : "Task list is empty.";
    }

    const lines = tasks.map((t) => {
      const icon = STATUS_ICON[t.status];
      const desc = t.description ? ` — ${t.description}` : "";
      const form = t.activeForm ? ` [Active: ${t.activeForm}]` : "";
      const blocked = t.blockedBy && t.blockedBy.length > 0 ? ` (Blocked by: ${t.blockedBy.join(',')})` : "";
      return `  ${t.id}. ${icon} ${t.subject}${form}${blocked}${desc}`;
    });

    const active = tasks.filter((t) =>
      ["todo", "in_progress"].includes(t.status)
    ).length;
    const completed = tasks.filter((t) => t.status === "completed").length;

    lines.push("");
    lines.push(`  Active: ${active}  Completed: ${completed}  Total: ${tasks.length}`);

    return lines.join("\n");
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  create(opts: {
    subject: string;
    description?: string;
    activeForm?: string;
    blocks?: string[];
    blockedBy?: string[];
  }): string {
    const tasks = this._loadAll();
    
    // Find next numeric ID
    let maxId = 0;
    for (const t of tasks) {
      const num = parseInt(t.id, 10);
      if (!isNaN(num) && num > maxId) maxId = num;
    }
    const nextId = (maxId + 1).toString();

    const task: SessionTask = {
      id: nextId,
      subject: opts.subject,
      description: opts.description,
      activeForm: opts.activeForm,
      status: "todo",
      blocks: opts.blocks || [],
      blockedBy: opts.blockedBy || [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    this._save(task);

    return `Created task #${task.id}: "${task.subject}"\n\n${this._render()}`;
  }

  start(ref: string, activeForm?: string): string {
    const task = this._find(ref);
    if (!task) return `ERROR: Task not found: "${ref}".\n\n${this._render()}`;

    task.status = "in_progress";
    if (activeForm) task.activeForm = activeForm;
    task.updatedAt = Date.now();
    this._save(task);

    return `Started #${task.id}: "${task.subject}"\n\n${this._render()}`;
  }

  done(ref: string, description?: string): string {
    const task = this._find(ref);
    if (!task) return `ERROR: Task not found: "${ref}".\n\n${this._render()}`;

    task.status = "completed";
    task.updatedAt = Date.now();
    if (description) task.description = description;
    this._save(task);

    return `Completed #${task.id}: "${task.subject}"\n\n${this._render()}`;
  }

  block(ref: string, blockedBy?: string[]): string {
    const task = this._find(ref);
    if (!task) return `ERROR: Task not found: "${ref}".\n\n${this._render()}`;

    task.status = "blocked";
    if (blockedBy && blockedBy.length > 0) {
      task.blockedBy = Array.from(new Set([...(task.blockedBy || []), ...blockedBy]));
    }
    task.updatedAt = Date.now();
    this._save(task);

    return `Blocked #${task.id}: "${task.subject}"\n\n${this._render()}`;
  }

  unblock(ref: string): string {
    const task = this._find(ref);
    if (!task) return `ERROR: Task not found: "${ref}".\n\n${this._render()}`;

    task.status = "todo";
    task.blockedBy = [];
    task.updatedAt = Date.now();
    this._save(task);

    return `Unblocked #${task.id}: "${task.subject}"\n\n${this._render()}`;
  }

  list(filter?: TaskStatus[]): string {
    return this._render(filter);
  }

  /**
   * Üzerinde çalışılan görevi döndürür: öncelik in_progress, yoksa ilk todo.
   * UI göstergeleri için (aktif task etiketi). Görev yoksa null.
   */
  getActive(): SessionTask | null {
    try {
      const tasks = this._loadAll();
      return (
        tasks.find((t) => t.status === "in_progress") ??
        tasks.find((t) => t.status === "todo") ??
        null
      );
    } catch {
      return null;
    }
  }

  /**
   * Tamamlanan görevleri temizle. Aktif görevlere dokunmaz.
   */
  clear(): string {
    const tasks = this._loadAll();
    let removed = 0;
    
    for (const t of tasks) {
      if (t.status === "completed") {
        this._delete(t.id);
        removed++;
      }
    }

    return `Cleared ${removed} completed task(s).\n\n${this._render()}`;
  }

  /**
   * Tüm görevleri sil.
   */
  reset(): string {
    const tasks = this._loadAll();
    for (const t of tasks) {
      this._delete(t.id);
    }
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
