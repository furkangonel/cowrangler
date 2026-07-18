import React, { useEffect, useMemo, useState } from 'react'
import {
  Plus, Trash2, RefreshCw, Plug, Activity, KeyRound, Loader2,
  CheckCircle2, AlertTriangle, ShieldCheck, ShieldAlert,
} from 'lucide-react'
import { ipc, MCPServerInfo, ConnectorCatalogInfo } from '../../lib/ipc'
import { AuthModal } from './AuthModal'
import {
  StatusPill, AuthBadge, ConnectorLogo, SearchInput, Chip, EmptyState, SkeletonGrid,
  HealthState,
} from './shared'

/**
 * ConnectorsView — the user-facing MCP surface, unified.
 *   • Browse a curated, real catalog with live health.
 *   • Manage connected servers: test, re-authorise, remove.
 *   • Manual add for advanced stdio/url servers.
 */
export function ConnectorsView({ onChanged }: { onChanged?: () => void }) {
  const [catalog, setCatalog] = useState<ConnectorCatalogInfo[]>([])
  const [servers, setServers] = useState<MCPServerInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState<string>('all')
  const [authFor, setAuthFor] = useState<{ entry: ConnectorCatalogInfo; mode: 'add' | 'reauth' } | null>(null)
  const [showManual, setShowManual] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [encrypted, setEncrypted] = useState<boolean | null>(null)

  async function loadAll(silent = false) {
    if (!silent) setLoading(true)
    try {
      const [cat, list] = await Promise.all([ipc.connectors.catalog(), ipc.connectors.list()])
      setCatalog(Array.isArray(cat) ? cat : [])
      setServers(Array.isArray(list) ? list : [])
    } catch {
      setCatalog([]); setServers([])
    } finally {
      setLoading(false)
      onChanged?.()
    }
  }
  useEffect(() => {
    loadAll()
    ipc.connectors.secInfo().then(i => setEncrypted(!!i?.encrypted)).catch(() => setEncrypted(null))
  }, [])

  const categories = useMemo(() => {
    const s = new Set(catalog.map(c => c.category))
    return ['all', ...Array.from(s)]
  }, [catalog])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return catalog.filter(c =>
      (cat === 'all' || c.category === cat) &&
      (q === '' || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q))
    )
  }, [catalog, query, cat])

  function healthOf(entry: ConnectorCatalogInfo): HealthState {
    if (entry.live) return 'live'
    if (entry.connected && entry.error) return 'error'
    if (entry.connected) return 'configured'
    return 'idle'
  }

  async function quickAdd(entry: ConnectorCatalogInfo) {
    // Needs credentials or a path → open the modal.
    if (entry.auth !== 'none' || entry.requiresPathArg) {
      setAuthFor({ entry, mode: 'add' })
      return
    }
    setAdding(entry.id)
    try {
      await ipc.connectors.add({ id: entry.id })
      await loadAll(true)
    } finally {
      setAdding(null)
    }
  }

  async function removeConnector(name: string) {
    await ipc.connectors.remove(name)
    await loadAll(true)
  }

  // Catalog entry for a configured server (to enable re-auth).
  function catalogFor(name: string): ConnectorCatalogInfo | undefined {
    return catalog.find(c => c.id === name)
  }

  return (
    <div className="h-full overflow-y-auto px-5 py-4 space-y-5">
      {/* Controls */}
      <div className="flex items-center gap-2">
        <div className="flex-1"><SearchInput value={query} onChange={setQuery} placeholder="Search connectors" /></div>
        <button
          onClick={() => loadAll()}
          aria-label="Refresh"
          className="p-2 text-text-muted hover:text-text-secondary rounded-lg hover:bg-bg-hover transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {categories.map(c => (
            <Chip key={c} active={cat === c} onClick={() => setCat(c)}>{c}</Chip>
          ))}
        </div>
        {encrypted !== null && (
          <span
            className={`flex items-center gap-1 text-2xs flex-shrink-0 ${encrypted ? 'text-text-muted' : 'text-warning'}`}
            title={encrypted
              ? 'Credentials are encrypted at rest via your OS keychain.'
              : 'OS encryption unavailable — credentials are stored obfuscated (not encrypted).'}
          >
            {encrypted ? <ShieldCheck size={11} /> : <ShieldAlert size={11} />}
            {encrypted ? 'Encrypted vault' : 'Vault not encrypted'}
          </span>
        )}
      </div>

      {/* Browse grid */}
      {loading ? (
        <SkeletonGrid count={6} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Plug size={30} />} title="No connectors match" hint="Try a different search or category." />
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {filtered.map(entry => {
            const health = healthOf(entry)
            const isAdding = adding === entry.id
            return (
              <div key={entry.id} className="group flex items-start gap-3 p-3 bg-bg-tertiary border border-border rounded-xl hover:border-border transition-colors">
                <div className="w-8 h-8 rounded-lg bg-bg-secondary border border-border-subtle flex items-center justify-center flex-shrink-0 text-text-secondary overflow-hidden">
                  <ConnectorLogo logo={entry.logo} category={entry.category} transport={entry.transport} size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-medium text-text-primary truncate">{entry.name}</p>
                    <AuthBadge auth={entry.auth} />
                  </div>
                  <p className="text-2xs text-text-muted leading-snug mt-0.5 line-clamp-2">{entry.description}</p>
                  <div className="mt-1.5 h-[18px] flex items-center">
                    {entry.connected
                      ? <StatusPill state={health} toolCount={entry.toolCount} title={entry.error} />
                      : <span className="text-2xs text-text-muted capitalize">{entry.category}</span>}
                  </div>
                </div>
                {!entry.connected && (
                  <button
                    onClick={() => quickAdd(entry)}
                    disabled={isAdding}
                    className="flex-shrink-0 flex items-center gap-1 px-2 py-1 bg-accent text-accent-fg text-2xs rounded-lg hover:bg-accent-hover transition-colors font-medium disabled:opacity-60"
                  >
                    {isAdding ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Add
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Connected / management */}
      {servers.length > 0 && (
        <section className="space-y-2 pt-1">
          <div className="flex items-center gap-1.5">
            <Activity size={12} className="text-text-muted" />
            <h4 className="text-2xs font-semibold text-text-muted uppercase tracking-wide">Connected · {servers.length}</h4>
          </div>
          <div className="space-y-2">
            {servers.map(server => (
              <ConnectedRow
                key={server.name}
                server={server}
                catalogEntry={catalogFor(server.name)}
                onTest={() => ipc.connectors.test(server.name)}
                onReauth={(entry) => setAuthFor({ entry, mode: 'reauth' })}
                onRemove={() => removeConnector(server.name)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Manual add */}
      <section className="pt-1">
        <button onClick={() => setShowManual(s => !s)} className="text-2xs text-text-muted hover:text-accent transition-colors flex items-center gap-1.5">
          <Plus size={12} /> Add a connector manually (advanced)
        </button>
        {showManual && <ManualAddForm onAdded={() => { setShowManual(false); loadAll(true) }} />}
      </section>

      {authFor && (
        <AuthModal
          entry={authFor.entry}
          mode={authFor.mode}
          onClose={() => setAuthFor(null)}
          onDone={() => { setAuthFor(null); loadAll(true) }}
        />
      )}
    </div>
  )
}

// ── A configured server row with test / re-auth / remove ──────────────────────
function ConnectedRow({ server, catalogEntry, onTest, onReauth, onRemove }: {
  server: MCPServerInfo
  catalogEntry?: ConnectorCatalogInfo
  onTest: () => Promise<{ ok: boolean; message?: string; error?: string }>
  onReauth: (entry: ConnectorCatalogInfo) => void
  onRemove: () => void
}) {
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  const liveState: HealthState =
    server.status === 'connected' ? 'live'
    : server.status === 'error' ? 'error'
    : 'configured'

  async function test() {
    setTesting(true); setResult(null)
    try {
      const r = await onTest()
      setResult({ ok: r.ok, text: r.ok ? (r.message || 'Connected') : (r.error || 'Not connected') })
    } catch (e: any) {
      setResult({ ok: false, text: e?.message ?? 'Test failed' })
    } finally {
      setTesting(false)
      setTimeout(() => setResult(null), 4000)
    }
  }

  return (
    <div className="p-3 bg-bg-tertiary border border-border rounded-lg group">
      <div className="flex items-center gap-3">
        <CheckCircle2 size={14} className={`flex-shrink-0 ${server.status === 'connected' ? 'text-success' : 'text-text-muted'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-text-primary truncate">{server.name}</p>
            <StatusPill state={testing ? 'checking' : liveState} toolCount={server.toolCount} title={server.error} />
          </div>
          <p className="text-2xs text-text-muted font-mono truncate mt-0.5">
            {server.type === 'stdio' ? `${server.command ?? ''} ${(server.args ?? []).join(' ')}`.trim() : server.url}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={test} disabled={testing} title="Test connection" className="p-1.5 text-text-muted hover:text-info rounded-lg hover:bg-bg-hover transition-colors disabled:opacity-50">
            {testing ? <Loader2 size={13} className="animate-spin" /> : <Activity size={13} />}
          </button>
          {catalogEntry && catalogEntry.auth !== 'none' && (
            <button onClick={() => onReauth(catalogEntry)} title="Re-authorise" className="p-1.5 text-text-muted hover:text-accent rounded-lg hover:bg-bg-hover transition-colors">
              <KeyRound size={13} />
            </button>
          )}
          <button onClick={onRemove} title="Remove" className="p-1.5 text-text-muted hover:text-error rounded-lg hover:bg-bg-hover transition-colors opacity-0 group-hover:opacity-100">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      {result && (
        <div className={`flex items-center gap-1.5 mt-2 pt-2 border-t border-border-subtle text-2xs ${result.ok ? 'text-success' : 'text-error'}`}>
          {result.ok ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
          <span className="break-words">{result.text}</span>
        </div>
      )}
    </div>
  )
}

// ── Manual raw add (advanced) ─────────────────────────────────────────────────
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
      const result = await ipc.mcp.add({
        name: name.trim(),
        type,
        command: type === 'stdio' ? command.trim() : undefined,
        args: type === 'stdio' ? args.split(' ').map(s => s.trim()).filter(Boolean) : undefined,
        url: type !== 'stdio' ? url.trim() : undefined,
      })
      if (!result.ok) {
        setError(result.error || 'Could not save connector')
        return
      }
      onAdded()
    } catch (e: any) {
      setError(e?.message ?? 'Error')
    } finally { setBusy(false) }
  }

  const inputCls = 'px-2.5 py-1.5 bg-bg-primary border border-border rounded-lg text-xs text-text-primary focus:border-accent outline-none'

  return (
    <div className="mt-3 p-4 bg-bg-tertiary border border-border rounded-xl space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="name" className={inputCls} />
        <select value={type} onChange={e => setType(e.target.value as any)} className={inputCls}>
          <option value="stdio">stdio</option>
          <option value="http">HTTP</option>
          <option value="sse">SSE</option>
        </select>
      </div>
      {type === 'stdio' ? (
        <>
          <input value={command} onChange={e => setCommand(e.target.value)} placeholder="npx" className={`w-full font-mono ${inputCls}`} />
          <input value={args} onChange={e => setArgs(e.target.value)} placeholder="-y @scope/server /path" className={`w-full font-mono ${inputCls}`} />
        </>
      ) : (
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://server/mcp" className={`w-full font-mono ${inputCls}`} />
      )}
      {error && <p className="text-2xs text-error">{error}</p>}
      <div className="flex justify-end">
        <button onClick={add} disabled={busy} className="px-3 py-1.5 bg-accent text-accent-fg text-xs rounded-lg disabled:opacity-50 hover:bg-accent-hover font-medium transition-colors">
          {busy ? 'Adding…' : 'Add'}
        </button>
      </div>
    </div>
  )
}
