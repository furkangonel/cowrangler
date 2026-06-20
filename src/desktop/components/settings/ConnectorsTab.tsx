import React, { useEffect, useState } from 'react'
import { Plus, Trash2, RefreshCw, CheckCircle, XCircle, Check, Lock, Globe, Terminal } from 'lucide-react'
import { ipc, MCPServerInfo, ConnectorCatalogInfo } from '../../lib/ipc'

/**
 * Connectors — the user-facing MCP surface.
 *   1) Browse: curated, working connector catalog → Add → auth (if needed)
 *   2) Connected: active connectors
 *   3) Manual add: raw stdio/url for advanced users
 */
export function ConnectorsTab() {
  const [catalog, setCatalog] = useState<ConnectorCatalogInfo[]>([])
  const [servers, setServers] = useState<MCPServerInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [authFor, setAuthFor] = useState<ConnectorCatalogInfo | null>(null)
  const [showManual, setShowManual] = useState(false)

  async function loadAll() {
    setLoading(true)
    try {
      const [cat, list] = await Promise.all([ipc.connectors.catalog(), ipc.connectors.list()])
      setCatalog(Array.isArray(cat) ? cat : [])
      setServers(Array.isArray(list) ? list : [])
    } catch {
      setCatalog([]); setServers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  async function addConnector(entry: ConnectorCatalogInfo) {
    // open modal if auth or path is required, otherwise add directly
    if (entry.auth !== 'none' || entry.requiresPathArg) {
      setAuthFor(entry)
      return
    }
    await ipc.connectors.add({ id: entry.id })
    await loadAll()
  }

  async function removeConnector(name: string) {
    await ipc.connectors.remove(name)
    await loadAll()
  }

  return (
    <div className="p-5 space-y-6">
      {/* Browse */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-sm font-semibold text-text-primary">Connectors</h4>
            <p className="text-xs text-text-muted mt-0.5">Pick from the most popular, add, and connect — all are real MCP connections.</p>
          </div>
          <button onClick={loadAll} className="p-1.5 text-text-muted hover:text-text-secondary rounded">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {catalog.map(entry => (
            <div key={entry.id} className="flex items-start gap-3 p-3 bg-bg-tertiary border border-border rounded-xl">
              <div className="flex-shrink-0 mt-0.5 text-text-muted">
                {entry.transport === 'stdio' ? <Terminal size={15} /> : <Globe size={15} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-medium text-text-primary truncate">{entry.name}</p>
                  {entry.auth !== 'none' && <Lock size={10} className="text-text-muted flex-shrink-0" />}
                </div>
                <p className="text-2xs text-text-muted leading-snug mt-0.5 line-clamp-2">{entry.description}</p>
              </div>
              {entry.connected ? (
                <span className="flex items-center gap-1 text-2xs text-success flex-shrink-0"><Check size={11} /> Connected</span>
              ) : (
                <button
                  onClick={() => addConnector(entry)}
                  className="flex-shrink-0 px-2 py-1 bg-accent text-accent-fg text-2xs rounded-lg hover:bg-accent-hover transition-colors font-medium"
                >
                  Add
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Connected */}
      {servers.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Connected</h4>
          <div className="space-y-2">
            {servers.map(server => (
              <div key={server.name} className="flex items-center gap-3 p-3 bg-bg-tertiary border border-border rounded-lg group">
                <CheckCircle size={14} className="text-success flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-text-primary">{server.name}</p>
                  <p className="text-2xs text-text-muted font-mono truncate">
                    {server.type === 'stdio' ? `${server.command} ${(server.args ?? []).join(' ')}` : server.url}
                  </p>
                </div>
                <button onClick={() => removeConnector(server.name)} className="p-1.5 text-text-muted hover:text-error rounded opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Manual */}
      <section>
        <button onClick={() => setShowManual(s => !s)} className="text-xs text-text-muted hover:text-accent transition-colors flex items-center gap-1.5">
          <Plus size={12} /> Add connector manually (advanced)
        </button>
        {showManual && <ManualAddForm onAdded={() => { setShowManual(false); loadAll() }} />}
      </section>

      {authFor && (
        <ConnectorAuthModal
          entry={authFor}
          onClose={() => setAuthFor(null)}
          onDone={() => { setAuthFor(null); loadAll() }}
        />
      )}
    </div>
  )
}

// ── Auth / path modal ─────────────────────────────────────────────────────────

function ConnectorAuthModal({ entry, onClose, onDone }: {
  entry: ConnectorCatalogInfo
  onClose: () => void
  onDone: () => void
}) {
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [pathArg, setPathArg] = useState('')
  const [busy, setBusy] = useState(false)

  async function pickFolder() {
    const p = await ipc.fs.pickFolder()
    if (p) setPathArg(p)
  }

  async function submit() {
    setBusy(true)
    try {
      await ipc.connectors.add({ id: entry.id, secrets, pathArg: pathArg || undefined })
      onDone()
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="bg-bg-secondary border border-border rounded-2xl shadow-panel w-[420px] p-5 space-y-4" onMouseDown={e => e.stopPropagation()}>
        <div>
          <h4 className="text-sm font-semibold text-text-primary">Connect {entry.name}</h4>
          <p className="text-xs text-text-muted mt-0.5">{entry.description}</p>
        </div>

        {entry.auth === 'oauth' && (
          <p className="text-xs text-text-secondary bg-bg-tertiary border border-border rounded-lg p-3">
            Clicking Add opens the provider's authorization page in your browser. The connection completes once you authorize.
          </p>
        )}

        {entry.requiresPathArg && (
          <div>
            <label className="text-2xs text-text-muted block mb-1">Directory</label>
            <div className="flex gap-2">
              <input value={pathArg} onChange={e => setPathArg(e.target.value)} placeholder="/Users/.../project"
                className="flex-1 px-2.5 py-1.5 bg-bg-primary border border-border rounded text-xs text-text-primary font-mono focus:border-accent" />
              <button onClick={pickFolder} className="px-2.5 py-1.5 bg-bg-tertiary border border-border rounded text-xs text-text-secondary hover:border-accent">Select</button>
            </div>
          </div>
        )}

        {(entry.authFields ?? []).map(f => (
          <div key={f.envKey}>
            <label className="text-2xs text-text-muted block mb-1">{f.label}</label>
            <input
              type="password"
              value={secrets[f.envKey] ?? ''}
              onChange={e => setSecrets(s => ({ ...s, [f.envKey]: e.target.value }))}
              placeholder={f.hint}
              className="w-full px-2.5 py-1.5 bg-bg-primary border border-border rounded text-xs text-text-primary font-mono focus:border-accent"
            />
          </div>
        ))}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-text-muted hover:text-text-secondary">Cancel</button>
          <button onClick={submit} disabled={busy} className="px-3 py-1.5 bg-accent text-accent-fg text-xs rounded-lg disabled:opacity-50 hover:bg-accent-hover font-medium">
            {busy ? 'Connecting...' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Manual raw add ─────────────────────────────────────────────────────────────

function ManualAddForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'stdio' | 'http' | 'sse'>('stdio')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function add() {
    if (!name.trim()) { setError('Name required'); return }
    if (type === 'stdio' && !command.trim()) { setError('Command required'); return }
    if (type !== 'stdio' && !url.trim()) { setError('URL required'); return }
    setBusy(true); setError('')
    try {
      await ipc.mcp.add({
        name: name.trim(),
        type,
        command: type === 'stdio' ? command.trim() : undefined,
        args: type === 'stdio' ? args.split(' ').map(s => s.trim()).filter(Boolean) : undefined,
        url: type !== 'stdio' ? url.trim() : undefined,
      })
      onAdded()
    } catch (e: any) {
      setError(e?.message ?? 'Error')
    } finally { setBusy(false) }
  }

  return (
    <div className="mt-3 p-4 bg-bg-tertiary border border-border rounded-xl space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="name"
          className="px-2.5 py-1.5 bg-bg-primary border border-border rounded text-xs text-text-primary focus:border-accent" />
        <select value={type} onChange={e => setType(e.target.value as any)}
          className="px-2.5 py-1.5 bg-bg-primary border border-border rounded text-xs text-text-primary focus:border-accent">
          <option value="stdio">stdio</option>
          <option value="http">HTTP</option>
          <option value="sse">SSE</option>
        </select>
      </div>
      {type === 'stdio' ? (
        <>
          <input value={command} onChange={e => setCommand(e.target.value)} placeholder="npx"
            className="w-full px-2.5 py-1.5 bg-bg-primary border border-border rounded text-xs text-text-primary font-mono focus:border-accent" />
          <input value={args} onChange={e => setArgs(e.target.value)} placeholder="-y @scope/server /path"
            className="w-full px-2.5 py-1.5 bg-bg-primary border border-border rounded text-xs text-text-primary font-mono focus:border-accent" />
        </>
      ) : (
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://server/mcp"
          className="w-full px-2.5 py-1.5 bg-bg-primary border border-border rounded text-xs text-text-primary font-mono focus:border-accent" />
      )}
      {error && <p className="text-2xs text-error">{error}</p>}
      <div className="flex justify-end">
        <button onClick={add} disabled={busy} className="px-3 py-1.5 bg-accent text-accent-fg text-xs rounded-lg disabled:opacity-50 hover:bg-accent-hover font-medium">
          {busy ? 'Adding...' : 'Add'}
        </button>
      </div>
    </div>
  )
}
