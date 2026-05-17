/**
 * Skill Usage Tracker — skill kullanım istatistiklerini izle.
 *
 *
 *
 * Her skill için izlenen alanlar:
 *   use_count         — kaç kez kullanıldı (utilize_skill çağrısı)
 *   view_count        — kaç kez görüntülendi (/skills listesi)
 *   patch_count       — kaç kez güncellendi
 *   last_activity_at  — son aktivite zamanı (Unix ms)
 *   state             — "active" | "archived" | "pinned"
 *   created_by        — "user" | "agent" (curator sadece "agent"'a dokunur)
 */

import fs from "fs";
import path from "path";
import { DIRS } from "./init.js";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type SkillState = "active" | "archived" | "pinned";
export type SkillCreatedBy = "user" | "agent";

export interface SkillUsageStats {
  use_count: number;
  view_count: number;
  patch_count: number;
  last_activity_at: number; // Unix ms
  state: SkillState;
  created_by: SkillCreatedBy;
  first_seen_at: number; // Unix ms
}

type UsageDB = Record<string, SkillUsageStats>;

const USAGE_FILE = path.join(DIRS.global.skills, ".usage.json");
const STALE_THRESHOLD_DAYS = 30;
const STALE_MIN_USE_COUNT = 3;

// ─────────────────────────────────────────────────────────────────────────────
// TRACKER
// ─────────────────────────────────────────────────────────────────────────────

export class SkillUsageTracker {
  private cache: UsageDB | null = null;

  private _load(): UsageDB {
    if (this.cache) return this.cache;
    try {
      if (fs.existsSync(USAGE_FILE)) {
        this.cache = JSON.parse(fs.readFileSync(USAGE_FILE, "utf-8"));
        return this.cache!;
      }
    } catch {
      /* dosya bozuk → sıfırla */
    }
    this.cache = {};
    return this.cache;
  }

  private _save(db: UsageDB): void {
    try {
      fs.mkdirSync(path.dirname(USAGE_FILE), { recursive: true });
      fs.writeFileSync(USAGE_FILE, JSON.stringify(db, null, 2), "utf-8");
      this.cache = db;
    } catch {
      /* disk hatası → sessizce devam */
    }
  }

  private _ensureEntry(
    db: UsageDB,
    skillId: string,
    createdBy: SkillCreatedBy = "user",
  ): SkillUsageStats {
    if (!db[skillId]) {
      db[skillId] = {
        use_count: 0,
        view_count: 0,
        patch_count: 0,
        last_activity_at: Date.now(),
        state: "active",
        created_by: createdBy,
        first_seen_at: Date.now(),
      };
    }
    return db[skillId];
  }

  recordUse(skillId: string, createdBy?: SkillCreatedBy): void {
    const db = this._load();
    const entry = this._ensureEntry(db, skillId, createdBy);
    entry.use_count++;
    entry.last_activity_at = Date.now();
    this._save(db);
  }

  recordView(skillId: string): void {
    const db = this._load();
    const entry = this._ensureEntry(db, skillId);
    entry.view_count++;
    entry.last_activity_at = Date.now();
    this._save(db);
  }

  recordPatch(skillId: string): void {
    const db = this._load();
    const entry = this._ensureEntry(db, skillId);
    entry.patch_count++;
    entry.last_activity_at = Date.now();
    this._save(db);
  }

  getStats(skillId: string): SkillUsageStats | null {
    return this._load()[skillId] ?? null;
  }

  getAllStats(): Record<string, SkillUsageStats> {
    return { ...this._load() };
  }

  setState(skillId: string, state: SkillState): void {
    const db = this._load();
    const entry = this._ensureEntry(db, skillId);
    entry.state = state;
    this._save(db);
  }

  setCreatedBy(skillId: string, createdBy: SkillCreatedBy): void {
    const db = this._load();
    const entry = this._ensureEntry(db, skillId, createdBy);
    entry.created_by = createdBy;
    this._save(db);
  }

  /** Bayat skill'leri tespit et (curator tarafından kullanılır) */
  getStaleSkills(): string[] {
    const db = this._load();
    const now = Date.now();
    const thresholdMs = STALE_THRESHOLD_DAYS * 86_400_000;

    return Object.entries(db)
      .filter(([, stats]) => {
        if (stats.state === "pinned") return false; // pinned → muaf
        if (stats.created_by !== "agent") return false; // sadece agent'ın oluşturduklarına dokunur
        if (stats.state === "archived") return false; // zaten arşivlenmiş
        const daysSinceActivity = now - stats.last_activity_at;
        return (
          daysSinceActivity >= thresholdMs &&
          stats.use_count < STALE_MIN_USE_COUNT
        );
      })
      .map(([id]) => id);
  }

  /** Kullanım özeti */
  summary(): string {
    const db = this._load();
    const total = Object.keys(db).length;
    const active = Object.values(db).filter((s) => s.state === "active").length;
    const archived = Object.values(db).filter(
      (s) => s.state === "archived",
    ).length;
    const pinned = Object.values(db).filter((s) => s.state === "pinned").length;
    return `${total} skills tracked: ${active} active, ${pinned} pinned, ${archived} archived`;
  }

  invalidateCache(): void {
    this.cache = null;
  }
}

// Singleton
let _tracker: SkillUsageTracker | null = null;
export function getSkillUsageTracker(): SkillUsageTracker {
  if (!_tracker) _tracker = new SkillUsageTracker();
  return _tracker;
}
