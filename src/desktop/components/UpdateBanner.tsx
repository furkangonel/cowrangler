import React, { useEffect, useState } from 'react'
import { Download, RefreshCw, X, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import { ipc } from '../lib/ipc'
import type { UpdateStatus } from '../lib/ipc'

/**
 * UpdateBanner — in-app auto-update surface.
 *
 * Listens for 'updates:status' events from the main process (electron-updater)
 * and shows a slim banner:
 *   • available  → "v2.0.6 ready" + Download
 *   • progress   → progress bar
 *   • downloaded → "Restart to update"
 *   • error      → quietly dismissable
 *
 * Idle/checking/not-available render nothing. The check itself fires on startup
 * (main process) and can be re-triggered from Settings via ipc.updates.check().
 */
export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const off = ipc.updates.onStatus((s) => {
      // A new meaningful event un-dismisses the banner.
      if (s.state === 'available' || s.state === 'downloaded') setDismissed(false)
      setStatus(s)
    })
    return off
  }, [])

  if (dismissed || !status) return null
  if (status.state === 'checking' || status.state === 'not-available') return null

  async function download() {
    setBusy(true)
    try { await ipc.updates.download() } finally { setBusy(false) }
  }
  async function install() {
    setBusy(true)
    try { await ipc.updates.install() } finally { setBusy(false) }
  }

  const base =
    'fixed top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-3 ' +
    'px-3.5 py-2 rounded-xl border shadow-card text-xs backdrop-blur ' +
    'bg-bg-secondary/95 border-border max-w-[92vw]'

  if (status.state === 'available') {
    return (
      <div className={base} role="status">
        <Download size={15} className="text-accent flex-shrink-0" />
        <span className="text-text-primary">
          New version available <span className="font-semibold">v{status.version}</span>
        </span>
        <button
          onClick={download}
          disabled={busy}
          className="flex items-center gap-1 px-2.5 py-1 bg-accent text-accent-fg rounded-lg font-medium hover:bg-accent-hover transition-colors disabled:opacity-60"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Download
        </button>
        <DismissBtn onClick={() => setDismissed(true)} />
      </div>
    )
  }

  if (status.state === 'progress') {
    return (
      <div className={base} role="status">
        <Loader2 size={15} className="text-accent animate-spin flex-shrink-0" />
        <span className="text-text-primary whitespace-nowrap">Downloading update</span>
        <div className="w-32 h-1.5 rounded-full bg-bg-hover overflow-hidden">
          <div className="h-full bg-accent transition-all" style={{ width: `${status.percent}%` }} />
        </div>
        <span className="text-text-muted tabular-nums">{status.percent}%</span>
      </div>
    )
  }

  if (status.state === 'downloaded') {
    return (
      <div className={base} role="status">
        <CheckCircle2 size={15} className="text-success flex-shrink-0" />
        <span className="text-text-primary">
          <span className="font-semibold">v{status.version}</span> downloaded
        </span>
        <button
          onClick={install}
          disabled={busy}
          className="flex items-center gap-1 px-2.5 py-1 bg-accent text-accent-fg rounded-lg font-medium hover:bg-accent-hover transition-colors disabled:opacity-60"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Restart & update
        </button>
        <DismissBtn onClick={() => setDismissed(true)} />
      </div>
    )
  }

  // error
  return (
    <div className={base} role="alert">
      <AlertTriangle size={15} className="text-error flex-shrink-0" />
      <span className="text-text-secondary truncate max-w-[60vw]">Update error: {status.message}</span>
      <DismissBtn onClick={() => setDismissed(true)} />
    </div>
  )
}

function DismissBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="Close" className="p-1 text-text-muted hover:text-text-secondary rounded-md hover:bg-bg-hover transition-colors flex-shrink-0">
      <X size={13} />
    </button>
  )
}
