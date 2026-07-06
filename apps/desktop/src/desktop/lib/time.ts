export function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}:${pad(m % 60)}:${pad(s % 60)}`
  if (m > 0) return `${m}:${pad(s % 60)}`
  return `${s}s`
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = (ms / 1000).toFixed(1)
  return `${s}s`
}

export function formatRelative(timestamp: number): string {
  const diff = Date.now() - timestamp
  const s = Math.floor(diff / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)

  if (d > 30) return new Date(timestamp).toLocaleDateString('en-US')
  if (d > 0) return `${d}d ago`
  if (h > 0) return `${h}h ago`
  if (m > 0) return `${m}m ago`
  if (s > 5) return `${s}s ago`
  return 'now'
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('en-US', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
