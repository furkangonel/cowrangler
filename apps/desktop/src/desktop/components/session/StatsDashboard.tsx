/**
 * StatsDashboard — Code Home "What's up next" istatistik panosu.
 *

 *   • All / 30d / 7d aralık filtresi (sessions:dashboardStats IPC).
 *
 * Veri: session_db.getDashboardStats() → ipc.sessions.dashboardStats(sinceMs).
 */
import React, { useEffect, useMemo, useState } from 'react'
import { ipc, DashboardStats } from '../../lib/ipc'

const CHART_BLUE = '#5b8def'
const DAY_MS = 86_400_000
// War and Peace ≈ 560k kelime ≈ ~750k token (kaba tahmin, eğlence amaçlı).
const WAR_AND_PEACE_TOKENS = 750_000

type Range = 'all' | '30d' | '7d'
type Tab = 'overview' | 'models'

/** "openrouter/anthropic/claude-opus-4-8" → "Opus 4.8" */
export function prettyModel(id: string): string {
  if (!id) return 'Unknown'
  const last = id.split('/').pop() ?? id
  const m = last.replace(/^claude-/, '')
  const fam = m.match(/(opus|sonnet|haiku)/i)?.[1]
  const ver = m.match(/(\d+(?:-\d+)*)$/)?.[1]?.replace(/-/g, '.')
  if (fam) {
    const name = fam.charAt(0).toUpperCase() + fam.slice(1).toLowerCase()
    return ver ? `${name} ${ver}` : name
  }
  return last
}

/** 1234 → "1.2k", 2_100_000 → "2.1M" */
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function fmtCount(n: number): string {
  return n.toLocaleString('en-US')
}

function fmtHour(h: number | null): string {
  if (h === null) return '—'
  const period = h < 12 ? 'AM' : 'PM'
  const hr = h % 12 === 0 ? 12 : h % 12
  return `${hr} ${period}`
}

function rangeSince(r: Range): number | undefined {
  if (r === 'all') return undefined
  const days = r === '30d' ? 30 : 7
  return Date.now() - days * DAY_MS
}

export function StatsDashboard({ userName }: { userName?: string | null }) {
  const [tab, setTab] = useState<Tab>('overview')
  const [range, setRange] = useState<Range>('all')
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ipc.sessions
      .dashboardStats(rangeSince(range))
      .then((s) => { if (!cancelled) { setStats(s); setLoading(false) } })
      .catch(() => { if (!cancelled) { setStats(null); setLoading(false) } })
    return () => { cancelled = true }
  }, [range])

  const greeting = userName ? `What's up next, ${userName}?` : "What's up next?"

  return (
    <div className="w-full max-w-3xl mx-auto">
      <h1 className="flex items-center gap-2.5 text-[22px] font-medium text-text-primary brand-serif mb-6">
        <span className="text-accent text-xl leading-none">✳</span>
        {greeting}
      </h1>

      <div className="rounded-2xl border border-border-subtle bg-bg-secondary/60 overflow-hidden shadow-sm">
        {/* Tabs + range */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border-subtle/60">
          <div className="flex items-center gap-1">
            <TabBtn active={tab === 'overview'} onClick={() => setTab('overview')}>Overview</TabBtn>
            <TabBtn active={tab === 'models'} onClick={() => setTab('models')}>Models</TabBtn>
          </div>
          <div className="flex items-center gap-1">
            {(['all', '30d', '7d'] as Range[]).map((r) => (
              <RangeBtn key={r} active={range === r} onClick={() => setRange(r)}>
                {r === 'all' ? 'All' : r}
              </RangeBtn>
            ))}
          </div>
        </div>

        <div className="p-4">
          {loading || !stats ? (
            <div className="h-56 flex items-center justify-center text-xs text-text-muted">
              {loading ? 'Loading…' : 'No activity yet.'}
            </div>
          ) : tab === 'overview' ? (
            <OverviewTab stats={stats} />
          ) : (
            <ModelsTab stats={stats} />
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Overview ─────────────────────────────────────────────────────────────── */
function OverviewTab({ stats }: { stats: DashboardStats }) {
  const kpis: Array<{ label: string; value: string }> = [
    { label: 'Sessions', value: fmtCount(stats.totals.sessions) },
    { label: 'Messages', value: fmtCount(stats.totals.messages) },
    { label: 'Total tokens', value: fmtTokens(stats.totals.tokens) },
    { label: 'Active days', value: fmtCount(stats.active_days) },
    { label: 'Current streak', value: `${stats.current_streak}d` },
    { label: 'Longest streak', value: `${stats.longest_streak}d` },
    { label: 'Peak hour', value: fmtHour(stats.peak_hour) },
    { label: 'Favorite model', value: stats.favorite_model ? prettyModel(stats.favorite_model) : '—' },
  ]

  const ratio = stats.totals.tokens / WAR_AND_PEACE_TOKENS

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 rounded-lg border border-border-subtle/70 overflow-hidden">
        {kpis.map((k, i) => (
          <div
            key={k.label}
            className={`px-3 py-2.5 bg-bg-tertiary/30 border-border-subtle/50 ${i % 4 !== 3 ? 'border-r' : ''} ${i < 4 ? 'border-b' : ''}`}
          >
            <div className="text-[10px] text-text-muted uppercase tracking-wide truncate">{k.label}</div>
            <div className="text-[15px] font-semibold text-text-primary mt-0.5 truncate">{k.value}</div>
          </div>
        ))}
      </div>

      <Heatmap byDay={stats.by_day} />

      {ratio >= 0.1 && (
        <p className="text-[11px] text-text-muted">
          You've used ~{ratio >= 1 ? ratio.toFixed(0) : ratio.toFixed(1)}× more tokens than{' '}
          <span className="italic">War and Peace</span>.
        </p>
      )}
    </div>
  )
}

/* ── Contribution heatmap — son 18 hafta ──────────────────────────────────── */
function Heatmap({ byDay }: { byDay: DashboardStats['by_day'] }) {
  const WEEKS = 18
  const { cells, max } = useMemo(() => {
    const map = new Map(byDay.map((d) => [d.date, d.tokens]))
    const today = new Date()
    // Grid'in son sütunu bu haftanın günleriyle bitsin; Pazar başlangıçlı.
    const end = new Date(today)
    end.setHours(0, 0, 0, 0)
    // En sağ üstteki hücreye kadar geri git (WEEKS*7 gün).
    const start = new Date(end.getTime() - (WEEKS * 7 - 1) * DAY_MS)
    // Pazar'a hizala
    start.setDate(start.getDate() - start.getDay())
    const list: Array<{ key: string; v: number }> = []
    let mx = 0
    const cur = new Date(start)
    while (cur <= end) {
      const key = cur.toLocaleDateString('en-CA')
      const v = map.get(key) ?? 0
      if (v > mx) mx = v
      list.push({ key, v })
      cur.setTime(cur.getTime() + DAY_MS)
    }
    return { cells: list, max: mx }
  }, [byDay])

  // Sütunlara böl (7 satır, haftalar sütun)
  const cols: Array<Array<{ key: string; v: number }>> = []
  for (let i = 0; i < cells.length; i += 7) cols.push(cells.slice(i, i + 7))

  const intensity = (v: number): string => {
    if (v <= 0 || max <= 0) return 'rgb(var(--bg-tertiary-rgb, 40 40 44) / 0.5)'
    const t = Math.min(1, v / max)
    const alpha = 0.25 + t * 0.75
    return `rgba(91, 141, 239, ${alpha.toFixed(2)})`
  }

  return (
    <div className="flex gap-[3px] overflow-hidden">
      {cols.map((col, ci) => (
        <div key={ci} className="flex flex-col gap-[3px]">
          {col.map((c) => (
            <div
              key={c.key}
              title={`${c.key}: ${fmtTokens(c.v)} tokens`}
              className="w-[11px] h-[11px] rounded-[2px]"
              style={{ backgroundColor: intensity(c.v) }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/* ── Models ───────────────────────────────────────────────────────────────── */
function ModelsTab({ stats }: { stats: DashboardStats }) {
  return (
    <div className="space-y-4">
      <TokenBarChart byDay={stats.by_day} />
      <div className="space-y-1.5">
        {stats.by_model.length === 0 && (
          <div className="text-xs text-text-muted">No model usage yet.</div>
        )}
        {stats.by_model.map((m) => (
          <div key={m.model} className="flex items-center gap-2 text-[11px]">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: CHART_BLUE }} />
            <span className="text-text-primary font-medium w-24 truncate">{prettyModel(m.model)}</span>
            <span className="text-text-muted flex-1 truncate">
              {fmtTokens(m.input_tokens)} in · {fmtTokens(m.output_tokens)} out
            </span>
            <span className="text-text-primary font-semibold tabular-nums">{m.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Günlük token bar grafiği ─────────────────────────────────────────────── */
function TokenBarChart({ byDay }: { byDay: DashboardStats['by_day'] }) {
  // En çok token üreten son ~8 günü göster (aktif günler).
  const days = byDay.filter((d) => d.tokens > 0).slice(-8)
  const max = Math.max(1, ...days.map((d) => d.tokens))
  // Y ekseni tick'leri (0 → üst yuvarlanmış)
  const top = niceCeil(max)
  const ticks = [0, top * 0.25, top * 0.5, top * 0.75, top]

  const fmtDay = (iso: string) => {
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="flex gap-2 h-40">
      {/* Y axis */}
      <div className="flex flex-col justify-between text-[9px] text-text-muted text-right w-10 py-0.5">
        {ticks.slice().reverse().map((t, i) => (
          <span key={i}>{t === 0 ? '0' : fmtTokens(t)}</span>
        ))}
      </div>
      {/* Bars */}
      <div className="flex-1 flex items-end justify-around gap-3 border-l border-b border-border-subtle/60 pl-2 pb-0">
        {days.length === 0 && (
          <div className="self-center text-xs text-text-muted mx-auto">No usage in range.</div>
        )}
        {days.map((d) => (
          <div key={d.date} className="flex flex-col items-center justify-end flex-1 h-full">
            <div
              className="w-full max-w-[52px] rounded-t-sm transition-all"
              style={{ height: `${(d.tokens / top) * 100}%`, backgroundColor: CHART_BLUE }}
              title={`${fmtDay(d.date)}: ${fmtTokens(d.tokens)} tokens`}
            />
            <span className="text-[9px] text-text-muted mt-1 whitespace-nowrap">{fmtDay(d.date)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function niceCeil(n: number): number {
  if (n <= 0) return 1
  const mag = Math.pow(10, Math.floor(Math.log10(n)))
  const norm = n / mag
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 4 ? 4 : norm <= 8 ? 8 : 10
  return step * mag
}

/* ── Small buttons ────────────────────────────────────────────────────────── */
function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
        active ? 'bg-bg-tertiary text-text-primary' : 'text-text-muted hover:text-text-secondary'
      }`}
    >
      {children}
    </button>
  )
}

function RangeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
        active ? 'bg-bg-tertiary text-text-primary' : 'text-text-muted hover:text-text-secondary'
      }`}
    >
      {children}
    </button>
  )
}
