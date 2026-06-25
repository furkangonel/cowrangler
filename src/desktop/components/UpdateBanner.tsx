import React, { useEffect, useState } from 'react'
import { Download, RefreshCw, X, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import { ipc } from '../lib/ipc'
import type { UpdateStatus } from '../lib/ipc'

export function UpdateBanner({ collapsed = false }: { collapsed?: boolean }) {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const off = ipc.updates.onStatus((s) => {
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

  // Collapsed Mode (Icon only)
  if (collapsed) {
    if (status.state === 'available') {
      return (
        <button onClick={download} title={`Update v${status.version} available`} className="w-9 h-9 flex items-center justify-center rounded-lg text-accent hover:bg-bg-hover transition-colors">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
        </button>
      )
    }
    if (status.state === 'progress') {
      return (
        <div title={`Downloading update: ${status.percent}%`} className="w-9 h-9 flex items-center justify-center rounded-lg text-accent">
          <Loader2 size={16} className="animate-spin" />
        </div>
      )
    }
    if (status.state === 'downloaded') {
      return (
        <button onClick={install} title="Restart to update" className="w-9 h-9 flex items-center justify-center rounded-lg text-success hover:bg-bg-hover transition-colors relative">
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-success border border-bg-secondary" />
          <RefreshCw size={16} />
        </button>
      )
    }
    if (status.state === 'error') {
      return (
        <button onClick={() => setDismissed(true)} title="Update error" className="w-9 h-9 flex items-center justify-center rounded-lg text-error hover:bg-bg-hover transition-colors">
          <AlertTriangle size={16} />
        </button>
      )
    }
    return null
  }

  // Expanded Sidebar Mode
  const base = 'flex flex-col gap-2 p-2.5 mb-2 mx-2 rounded-lg border border-border-subtle bg-bg-tertiary shadow-sm'

  if (status.state === 'available') {
    return (
      <div className={base} role="status">
        <div className="flex items-start justify-between gap-2 w-full">
          <div className="flex items-center gap-2 text-xs text-text-primary">
            <Download size={14} className="text-accent flex-shrink-0" />
            <span className="font-medium leading-none mt-0.5">Update available</span>
          </div>
          <DismissBtn onClick={() => setDismissed(true)} />
        </div>
        <p className="text-2xs text-text-muted leading-tight">
          Version {status.version} is ready to download.
        </p>
        <button
          onClick={download}
          disabled={busy}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-accent text-accent-fg rounded-md text-xs font-medium hover:bg-accent-hover transition-colors disabled:opacity-60"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Download
        </button>
      </div>
    )
  }

  if (status.state === 'progress') {
    return (
      <div className={base} role="status">
        <div className="flex items-center gap-2 text-xs text-text-primary">
          <Loader2 size={14} className="text-accent animate-spin flex-shrink-0" />
          <span className="font-medium">Downloading...</span>
        </div>
        <div className="w-full h-1.5 mt-1 rounded-full bg-bg-hover overflow-hidden">
          <div className="h-full bg-accent transition-all" style={{ width: `${status.percent}%` }} />
        </div>
      </div>
    )
  }

  if (status.state === 'downloaded') {
    return (
      <div className={base} role="status">
        <div className="flex items-start justify-between gap-2 w-full">
          <div className="flex items-center gap-2 text-xs text-text-primary">
            <CheckCircle2 size={14} className="text-success flex-shrink-0" />
            <span className="font-medium leading-none mt-0.5">Update ready</span>
          </div>
          <DismissBtn onClick={() => setDismissed(true)} />
        </div>
        <p className="text-2xs text-text-muted leading-tight">
          Version {status.version} has been downloaded.
        </p>
        <button
          onClick={install}
          disabled={busy}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-success text-success-fg rounded-md text-xs font-medium hover:brightness-90 transition-colors disabled:opacity-60"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Restart & update
        </button>
      </div>
    )
  }

  // error
  return (
    <div className={base} role="alert">
      <div className="flex items-start justify-between gap-2 w-full">
        <div className="flex items-center gap-2 text-xs text-text-primary">
          <AlertTriangle size={14} className="text-error flex-shrink-0" />
          <span className="font-medium leading-none mt-0.5">Update error</span>
        </div>
        <DismissBtn onClick={() => setDismissed(true)} />
      </div>
      <p className="text-2xs text-text-muted leading-tight break-words">
        {status.message}
      </p>
    </div>
  )
}

function DismissBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="Close" className="p-0.5 text-text-muted hover:text-text-primary rounded-md hover:bg-bg-hover transition-colors flex-shrink-0">
      <X size={12} />
    </button>
  )
}
