/**
 * Curator — Skill yaşam döngüsü yöneticisi.
 *
 *
 *
 * Korunan değişmezler:
 * - Yalnızca created_by: "agent" provenanceli skill'lere dokunur
 * - Hiçbir zaman silmez; en yıkıcı eylem arşivlemedir
 * - Sabitlenmiş (pinned) skill'ler her otomatik geçişten muaftır
 * - Arşivleme → ~/.cowrangler/skills/archived/<skill-id>/
 */

import fs from "fs";
import path from "path";
import { DIRS } from "./init.js";
import { getSkillUsageTracker, SkillState } from "./skill_usage.js";

const ARCHIVE_DIR = path.join(DIRS.global.skills, "archived");

export interface CuratorReport {
  stale_candidates: string[];
  recently_archived: string[];
  active_count: number;
  archived_count: number;
  pinned_count: number;
  summary: string;
}

export class Curator {
  private tracker = getSkillUsageTracker();

  /**
   * Kürasyonu çalıştır — bayat skill'leri arşivle.
   * Günde bir kez tetiklenmelidir.
   */
  async runCurationCycle(): Promise<CuratorReport> {
    const stale = this.tracker.getStaleSkills();
    const archived: string[] = [];

    for (const skillId of stale) {
      const success = this._archiveSkill(skillId);
      if (success) {
        this.tracker.setState(skillId, "archived");
        archived.push(skillId);
      }
    }

    const allStats = this.tracker.getAllStats();
    const active = Object.values(allStats).filter(
      (s) => s.state === "active",
    ).length;
    const archivedCount = Object.values(allStats).filter(
      (s) => s.state === "archived",
    ).length;
    const pinned = Object.values(allStats).filter(
      (s) => s.state === "pinned",
    ).length;

    return {
      stale_candidates: stale,
      recently_archived: archived,
      active_count: active,
      archived_count: archivedCount,
      pinned_count: pinned,
      summary:
        archived.length > 0
          ? `Archived ${archived.length} stale skill(s): ${archived.join(", ")}`
          : "No skills needed archiving",
    };
  }

  /**
   * Skill'i arşive taşı.
   * Orijinal skill klasörünü archived/ altına kopyalar.
   */
  private _archiveSkill(skillId: string): boolean {
    const skillPath = path.join(DIRS.global.skills, skillId);
    if (!fs.existsSync(skillPath)) return false;

    const archivePath = path.join(ARCHIVE_DIR, skillId);

    try {
      fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
      // Eğer arşivde zaten varsa timestamp ekle
      const finalArchivePath = fs.existsSync(archivePath)
        ? `${archivePath}_${Date.now()}`
        : archivePath;

      fs.cpSync(skillPath, finalArchivePath, { recursive: true });

      // Orijinali sil (move = copy + delete)
      fs.rmSync(skillPath, { recursive: true, force: true });

      return true;
    } catch {
      return false;
    }
  }

  /** Arşivden geri yükle */
  restoreSkill(skillId: string): boolean {
    const archivePath = path.join(ARCHIVE_DIR, skillId);
    if (!fs.existsSync(archivePath)) return false;

    const skillPath = path.join(DIRS.global.skills, skillId);
    try {
      fs.cpSync(archivePath, skillPath, { recursive: true });
      fs.rmSync(archivePath, { recursive: true, force: true });
      this.tracker.setState(skillId, "active");
      return true;
    } catch {
      return false;
    }
  }

  /** Skill'i sabitle — otomatik arşivlemeden muaf tut */
  pinSkill(skillId: string): void {
    this.tracker.setState(skillId, "pinned");
  }

  /** Sabitlemeyi kaldır */
  unpinSkill(skillId: string): void {
    this.tracker.setState(skillId, "active");
  }

  /** Manuel arşivleme */
  archiveSkill(skillId: string): boolean {
    const success = this._archiveSkill(skillId);
    if (success) this.tracker.setState(skillId, "archived");
    return success;
  }

  /** Kürasyon durumu raporu */
  getStatus(): CuratorReport {
    const stale = this.tracker.getStaleSkills();
    const allStats = this.tracker.getAllStats();
    const active = Object.values(allStats).filter(
      (s) => s.state === "active",
    ).length;
    const archived = Object.values(allStats).filter(
      (s) => s.state === "archived",
    ).length;
    const pinned = Object.values(allStats).filter(
      (s) => s.state === "pinned",
    ).length;

    return {
      stale_candidates: stale,
      recently_archived: [],
      active_count: active,
      archived_count: archived,
      pinned_count: pinned,
      summary: this.tracker.summary(),
    };
  }

  /** Listelenen arşivlenmiş skill'ler */
  listArchived(): string[] {
    if (!fs.existsSync(ARCHIVE_DIR)) return [];
    try {
      return fs.readdirSync(ARCHIVE_DIR).filter((f) => {
        return fs.statSync(path.join(ARCHIVE_DIR, f)).isDirectory();
      });
    } catch {
      return [];
    }
  }
}

// Singleton
let _curator: Curator | null = null;
export function getCurator(): Curator {
  if (!_curator) _curator = new Curator();
  return _curator;
}
