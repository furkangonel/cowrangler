export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function formatCost(usd: number): string {
  if (usd < 0.001) return '<$0.001'
  if (usd < 1) return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}

export function contextPercent(used: number, max: number): number {
  if (!max) return 0
  return Math.min(100, Math.round((used / max) * 100))
}

export function contextBarColor(pct: number): string {
  if (pct >= 95) return '#f87171' // red
  if (pct >= 85) return '#fbbf24' // yellow
  return '#34d399'                // green
}

export function contextBarWidth(pct: number): string {
  return `${Math.min(100, pct)}%`
}
