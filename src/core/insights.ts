/**
 * Insights Engine — kullanım analizi ve maliyet takibi.
 *
 *
 *
 * /usage   — son oturumun özeti
 * /insights — kapsamlı dashboard (ASCII grafikleri)
 */

import { getSessionDB } from "./session_db.js";
import { estimateCost, formatTokenCount } from "./model_metadata.js";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface UsageSummary {
  sessionId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  toolCallCount: number;
  estimatedCostUsd: number;
  durationMs: number;
  compressionCount: number;
}

export interface InsightsDashboard {
  period: string; // "last 7 days"
  totalSessions: number;
  totalMessages: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  byModel: ModelStats[];
  bySource: SourceStats[];
  topTools: ToolStats[];
  activityByDay: DayStats[];
  averageSessionDurationMs: number;
  averageTokensPerSession: number;
}

export interface ModelStats {
  model: string;
  sessions: number;
  tokens: number;
  costUsd: number;
  percentage: number;
}

export interface SourceStats {
  source: string;
  sessions: number;
  percentage: number;
}

export interface ToolStats {
  tool: string;
  callCount: number;
}

export interface DayStats {
  date: string; // YYYY-MM-DD
  sessions: number;
  tokens: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// INSIGHTS ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export class InsightsEngine {
  /**
   * /usage komutu — son oturumun özeti
   */
  formatUsageSummary(summary: UsageSummary): string {
    const cost =
      summary.estimatedCostUsd > 0
        ? `$${summary.estimatedCostUsd.toFixed(4)}`
        : "< $0.0001";

    const duration = _formatDuration(summary.durationMs);
    const cacheNote = "";

    const lines = [
      `┌─ Session Usage ─────────────────────────────────────┐`,
      `│  Model:       ${summary.model.padEnd(38)}│`,
      `│  Duration:    ${duration.padEnd(38)}│`,
      `│  ─────────────────────────────────────────────────  │`,
      `│  Input:       ${formatTokenCount(summary.inputTokens).padStart(8)} tokens                         │`,
      `│  Output:      ${formatTokenCount(summary.outputTokens).padStart(8)} tokens                         │`,
      `│  Total:       ${formatTokenCount(summary.totalTokens).padStart(8)} tokens                         │`,
      `│  ─────────────────────────────────────────────────  │`,
      `│  Tool calls:  ${String(summary.toolCallCount).padStart(8)}                              │`,
      `│  Compressions:${String(summary.compressionCount).padStart(8)}                              │`,
      `│  Est. cost:   ${cost.padEnd(38)}│`,
      `└────────────────────────────────────────────────────┘`,
    ];

    return lines.join("\n");
  }

  /**
   * /insights komutu — kapsamlı dashboard
   */
  getDashboard(days: number = 7): InsightsDashboard {
    const db = getSessionDB();
    const since = Date.now() - days * 86_400_000;
    const stats = db.getStats(since);

    // Model istatistikleri
    const totalSessions = stats.total_sessions || 1;
    const byModel: ModelStats[] = Object.entries(stats.by_model)
      .map(([model, data]) => ({
        model,
        sessions: data.sessions,
        tokens: data.tokens,
        costUsd: data.cost,
        percentage: Math.round((data.sessions / totalSessions) * 100),
      }))
      .sort((a, b) => b.sessions - a.sessions);

    // Kaynak istatistikleri
    const bySource: SourceStats[] = Object.entries(stats.by_source)
      .map(([source, count]) => ({
        source,
        sessions: count,
        percentage: Math.round((count / totalSessions) * 100),
      }))
      .sort((a, b) => b.sessions - a.sessions);

    // Günlük aktivite (basit hesaplama)
    const activityByDay = this._getActivityByDay(days, since);

    return {
      period: `Last ${days} day${days !== 1 ? "s" : ""}`,
      totalSessions: stats.total_sessions,
      totalMessages: stats.total_messages,
      totalInputTokens: stats.total_input_tokens,
      totalOutputTokens: stats.total_output_tokens,
      totalCostUsd: stats.total_cost_usd,
      byModel,
      bySource,
      topTools: [], // Tool takibi için ayrı tablo gerekiyor — v2'de eklenecek
      activityByDay,
      averageSessionDurationMs: 0, // Hesaplanacak
      averageTokensPerSession:
        stats.total_sessions > 0
          ? Math.round(
              (stats.total_input_tokens + stats.total_output_tokens) /
                stats.total_sessions,
            )
          : 0,
    };
  }

  private _getActivityByDay(days: number, since: number): DayStats[] {
    const result: DayStats[] = [];
    const db = getSessionDB();
    const sessions = db.listSessions({ since, limit: 1000 });

    const byDay = new Map<string, { sessions: number; tokens: number }>();

    for (const s of sessions) {
      const date = new Date(s.started_at).toISOString().slice(0, 10);
      const existing = byDay.get(date) ?? { sessions: 0, tokens: 0 };
      existing.sessions++;
      existing.tokens += s.input_tokens + s.output_tokens;
      byDay.set(date, existing);
    }

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000);
      const date = d.toISOString().slice(0, 10);
      const data = byDay.get(date) ?? { sessions: 0, tokens: 0 };
      result.push({ date, ...data });
    }

    return result;
  }

  /**
   * ASCII dashboard render
   */
  formatDashboard(dashboard: InsightsDashboard): string {
    const lines: string[] = [
      `╔══ Co-Wrangler Insights ══ ${dashboard.period} ══╗`,
      ``,
      `  Sessions:  ${dashboard.totalSessions}`,
      `  Messages:  ${dashboard.totalMessages}`,
      `  Input:     ${formatTokenCount(dashboard.totalInputTokens)} tokens`,
      `  Output:    ${formatTokenCount(dashboard.totalOutputTokens)} tokens`,
      `  Total cost: $${dashboard.totalCostUsd.toFixed(4)}`,
      `  Avg tokens/session: ${formatTokenCount(dashboard.averageTokensPerSession)}`,
    ];

    if (dashboard.byModel.length > 0) {
      lines.push(``, `  ── By Model ──────────────────────`);
      for (const m of dashboard.byModel.slice(0, 5)) {
        const bar = "█".repeat(Math.round(m.percentage / 5)).padEnd(20);
        lines.push(
          `  ${m.model.slice(0, 25).padEnd(25)} ${bar} ${m.sessions} sessions`,
        );
      }
    }

    if (dashboard.bySource.length > 0) {
      lines.push(``, `  ── By Source ─────────────────────`);
      for (const s of dashboard.bySource) {
        lines.push(
          `  ${s.source.padEnd(12)} ${s.sessions} sessions (${s.percentage}%)`,
        );
      }
    }

    if (dashboard.activityByDay.length > 0) {
      lines.push(
        ``,
        `  ── Daily Activity (last ${dashboard.activityByDay.length}d) ──`,
      );
      const maxSessions = Math.max(
        ...dashboard.activityByDay.map((d) => d.sessions),
        1,
      );
      for (const day of dashboard.activityByDay) {
        const barLen = Math.round((day.sessions / maxSessions) * 20);
        const bar = "▪".repeat(barLen).padEnd(20);
        const tokens =
          day.sessions > 0 ? ` (${formatTokenCount(day.tokens)})` : "";
        lines.push(`  ${day.date.slice(5)} ${bar} ${day.sessions}${tokens}`);
      }
    }

    lines.push(``, `  ─────────────────────────────────────`);
    return lines.join("\n");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function _formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

// Singleton
let _engine: InsightsEngine | null = null;
export function getInsightsEngine(): InsightsEngine {
  if (!_engine) _engine = new InsightsEngine();
  return _engine;
}
