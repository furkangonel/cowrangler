/**
 * isSkillStale — kürasyon (arşivleme) karar mantığı birim testleri (WP-1).
 * Saf fonksiyon — disk yok, yan etki yok.
 */

import { describe, it, expect } from "vitest";
import {
  isSkillStale,
  type SkillUsageStats,
} from "@cowrangler/core/skill_usage.js";

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;

function stats(overrides: Partial<SkillUsageStats>): SkillUsageStats {
  return {
    use_count: 0,
    view_count: 0,
    patch_count: 0,
    last_activity_at: NOW,
    state: "active",
    created_by: "agent",
    first_seen_at: NOW,
    ...overrides,
  };
}

describe("isSkillStale", () => {
  it("90 gün hiç kullanılmayan agent skill'i bayattır (kullanım sayısından bağımsız)", () => {
    const s = stats({ last_activity_at: NOW - 91 * DAY, use_count: 100 });
    expect(isSkillStale(s, NOW)).toBe(true);
  });

  it("89 gün boşta ama çok kullanılmış skill henüz bayat değildir", () => {
    const s = stats({ last_activity_at: NOW - 89 * DAY, use_count: 100 });
    expect(isSkillStale(s, NOW)).toBe(false);
  });

  it("30 gün boşta ve az kullanılmış (use_count < 3) skill bayattır", () => {
    const s = stats({ last_activity_at: NOW - 31 * DAY, use_count: 2 });
    expect(isSkillStale(s, NOW)).toBe(true);
  });

  it("pinned skill 90 gün geçse de asla bayat sayılmaz", () => {
    const s = stats({
      last_activity_at: NOW - 200 * DAY,
      state: "pinned",
    });
    expect(isSkillStale(s, NOW)).toBe(false);
  });

  it("user'ın oluşturduğu skill'e dokunulmaz", () => {
    const s = stats({
      last_activity_at: NOW - 200 * DAY,
      created_by: "user",
    });
    expect(isSkillStale(s, NOW)).toBe(false);
  });

  it("zaten arşivlenmiş skill tekrar bayat sayılmaz", () => {
    const s = stats({
      last_activity_at: NOW - 200 * DAY,
      state: "archived",
    });
    expect(isSkillStale(s, NOW)).toBe(false);
  });

  it("yeni ve aktif kullanılan skill bayat değildir", () => {
    const s = stats({ last_activity_at: NOW - 1 * DAY, use_count: 5 });
    expect(isSkillStale(s, NOW)).toBe(false);
  });
});
