import React, { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, Loader2, RefreshCw } from 'lucide-react'
import { ipc } from '../../lib/ipc'
import { useUpdateStatus } from '../../lib/useUpdateStatus'

export function UpdatesTab() {
  const status = useUpdateStatus()
  const [currentVersion, setCurrentVersion] = useState('…')
  const [busy, setBusy] = useState(false)
  const [localMessage, setLocalMessage] = useState<string | null>(null)

  useEffect(() => {
    void ipc.updates.current().then(({ version }) => setCurrentVersion(version)).catch(() => setCurrentVersion('unknown'))
  }, [])

  async function run(action: 'check' | 'download' | 'install') {
    setBusy(true)
    setLocalMessage(null)
    try {
      const result = await ipc.updates[action]()
      if (!result.ok) {
        if (result.reason === 'dev') setLocalMessage('Automatic updates are available in packaged builds only.')
        else if (result.error) setLocalMessage(result.error)
      }
    } finally {
      setBusy(false)
    }
  }

  const checking = status?.state === 'checking'
  const downloading = status?.state === 'progress'
  const actionBusy = busy || checking || downloading

  return (
    <div className="p-6 space-y-6 max-w-xl">
      <section>
        <h4 className="text-sm font-semibold text-text-primary mb-1">Cowrangler updates</h4>
        <p className="text-xs text-text-muted">
          Cowrangler checks for stable releases at startup and every six hours while it remains open.
        </p>
      </section>

      <section className="rounded-xl border-2 border-border bg-bg-tertiary p-4 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-2xs uppercase tracking-wide text-text-muted">Installed version</p>
            <p className="mt-1 text-sm font-semibold text-text-primary">v{currentVersion}</p>
          </div>
          <StatusMark state={status?.state} />
        </div>

        <StatusDetails status={status} />

        {localMessage && <p className="text-xs text-warning">{localMessage}</p>}

        {status?.state === 'progress' && (
          <div className="space-y-1.5">
            <div className="h-1.5 rounded-full bg-bg-hover overflow-hidden">
              <div className="h-full bg-accent transition-all" style={{ width: `${status.percent}%` }} />
            </div>
            <p className="text-2xs text-text-muted text-right">{status.percent}%</p>
          </div>
        )}

        <div className="flex gap-2">
          {status?.state === 'available' && (
            <ActionButton onClick={() => void run('download')} disabled={actionBusy} icon={<Download size={13} />}>
              Download v{status.version}
            </ActionButton>
          )}
          {status?.state === 'downloaded' && (
            <ActionButton onClick={() => void run('install')} disabled={actionBusy} icon={<RefreshCw size={13} />}>
              Restart and update
            </ActionButton>
          )}
          {status?.state !== 'downloaded' && status?.state !== 'progress' && status?.state !== 'available' && (
            <ActionButton onClick={() => void run('check')} disabled={actionBusy} icon={
              actionBusy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />
            }>
              {checking ? 'Checking…' : 'Check for updates'}
            </ActionButton>
          )}
        </div>
      </section>

      <p className="text-2xs leading-relaxed text-text-muted">
        Updates are downloaded only after you approve them and installed only when you choose “Restart and update”.
      </p>
    </div>
  )
}

function StatusMark({ state }: { state?: string }) {
  if (state === 'available' || state === 'progress') return <Download size={18} className="text-accent" />
  if (state === 'downloaded' || state === 'not-available') return <CheckCircle2 size={18} className="text-success" />
  if (state === 'error') return <AlertTriangle size={18} className="text-error" />
  return <RefreshCw size={18} className="text-text-muted" />
}

function StatusDetails({ status }: { status: ReturnType<typeof useUpdateStatus> }) {
  if (!status || status.state === 'idle') return <p className="text-xs text-text-secondary">Ready to check for updates.</p>
  if (status.state === 'checking') return <p className="text-xs text-text-secondary">Checking the release channel…</p>
  if (status.state === 'not-available') return <p className="text-xs text-success">You’re up to date.</p>
  if (status.state === 'available') return (
    <div className="space-y-2">
      <p className="text-xs text-text-primary">Version {status.version} is available.</p>
      {status.notes && <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-2xs leading-relaxed text-text-muted">{status.notes}</p>}
    </div>
  )
  if (status.state === 'progress') return <p className="text-xs text-text-secondary">Downloading the update…</p>
  if (status.state === 'downloaded') return <p className="text-xs text-success">Version {status.version} is ready to install.</p>
  return <p className="text-xs text-error break-words">{status.message}</p>
}

function ActionButton({ children, icon, disabled, onClick }: {
  children: React.ReactNode
  icon: React.ReactNode
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
    >
      {icon}{children}
    </button>
  )
}
