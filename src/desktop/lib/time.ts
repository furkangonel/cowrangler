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

  if (d > 30) return new Date(timestamp).toLocaleDateString('tr-TR')
  if (d > 0) return `${d} gün önce`
  if (h > 0) return `${h} saat önce`
  if (m > 0) return `${m} dakika önce`
  if (s > 5) return `${s} saniye önce`
  return 'şimdi'
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('tr-TR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
