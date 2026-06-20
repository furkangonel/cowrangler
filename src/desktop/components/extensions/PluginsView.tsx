import React, { useEffect, useState } from 'react'
import {
  Boxes, BadgeCheck, RefreshCw, ChevronDown, BookOpen, Plug, Check, Plus, Loader2,
} from 'lucide-react'
import { ipc, PluginInfo, ConnectorCatalogInfo } from '../../lib/ipc'
import { AuthModal } from './AuthModal'
import { Toggle, CategoryIcon, EmptyState } from './shared'

/**
 * PluginsView — cowrangler-signed bundles of skills + recommended connectors.
 * Enabling a plugin surfaces its skills and connectors; each card expands so the
 * user can see (and connect) exactly what the bundle brings.
 */
export function PluginsView({ onChanged }: { onChanged?: () => void }) {
  const [plugins, setPlugins] = useState<PluginInfo[]>([])
  const [catalog, setCatalog] = useState<ConnectorCatalogInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [authFor, setAuthFor] = useState<ConnectorCatalogInfo | null>(null)
  const [adding, setAdding] = useState<string | null>(null)

  async function load(silent = false) {
    if (!silent) setLoading(true)
    try {
      const [list, cat] = await Promise.all([ipc.plugins.list(), ipc.connectors.catalog()])
      setPlugins(Array.isArray(list) ? list : [])
      setCatalog(Array.isArray(cat) ? cat : [])
    } catch {
      setPlugins([]); setCatalog([])
    } finally {
      setLoading(false)
      onChanged?.()
    }
  }
  useEffect(() => { load() }, [])

  async function toggle(p: PluginInfo) {
    setPlugins(ps => ps.map(x => x.id === p.id ? { ...x, enabled: !x.enabled } : x))
    await ipc.plugins.setEnabled(p.id, !p.enabled)
    onChanged?.()
  }

  function connectorById(id: string) { return catalog.find(c => c.id === id) }

  async function connect(entry: ConnectorCatalogInfo) {
    if (entry.auth !== 'none' || entry.requiresPathArg) { setAuthFor(entry); return }
    setAdding(entry.id)
    try { await ipc.connectors.add({ id: entry.id }); await load(true) }
    finally { setAdding(null) }
  }

  if (loading) {
    return (
      <div className="px-5 py-4 space-y-2.5">
        {[0, 1, 2].map(i => <div key={i} className="h-[72px] rounded-xl shimmer" />)}
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-5 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-2xs text-text-muted">Signed bundles — toggle one on to surface its skills and connectors.</p>
        <button onClick={() => load()} aria-label="Refresh" className="p-1.5 text-text-muted hover:text-text-secondary rounded-lg hover:bg-bg-hover transition-colors">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {plugins.length === 0 ? (
        <EmptyState icon={<Boxes size={30} />} title="No plugins available" />
      ) : (
        <div className="space-y-2.5">
          {plugins.map(p => {
            const open = expanded[p.id]
            return (
              <div key={p.id} className={`border rounded-xl transition-colors ${p.enabled ? 'bg-bg-tertiary border-border' : 'bg-bg-tertiary/60 border-border-subtle'}`}>
                {/* Header */}
                <div className="flex items-start gap-3 p-3.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${p.enabled ? 'bg-accent-subtle text-accent' : 'bg-bg-secondary text-text-muted'}`}>
                    <Boxes size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-text-primary">{p.name}</p>
                      {p.signed && (
                        <span className="flex items-center gap-0.5 text-2xs text-accent" title={`Signed by ${p.author}`}>
                          <BadgeCheck size={12} /> {p.author}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-muted leading-snug mt-0.5">{p.description}</p>
                    <button
                      onClick={() => setExpanded(e => ({ ...e, [p.id]: !e[p.id] }))}
                      className="flex items-center gap-1 text-2xs text-text-secondary hover:text-text-primary mt-2 transition-colors"
                    >
                      <span className="tabular-nums">{p.skills.length} skills · {p.connectors.length} connectors</span>
                      <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                  <Toggle on={p.enabled} onClick={() => toggle(p)} label={`Enable ${p.name}`} />
                </div>

                {/* Expanded contents */}
                {open && (
                  <div className="px-3.5 pb-3.5 pt-1 space-y-3 border-t border-border-subtle">
                    {p.skills.length > 0 && (
                      <div>
                        <p className="text-2xs font-semibold text-text-muted uppercase tracking-wide mb-1.5 flex items-center gap-1">
                          <BookOpen size={11} /> Skills
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {p.skills.map(s => (
                            <span key={s} className="px-2 py-0.5 rounded-md bg-bg-secondary border border-border-subtle text-2xs text-text-secondary">{s}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {p.connectors.length > 0 && (
                      <div>
                        <p className="text-2xs font-semibold text-text-muted uppercase tracking-wide mb-1.5 flex items-center gap-1">
                          <Plug size={11} /> Connectors
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {p.connectors.map(cid => {
                            const entry = connectorById(cid)
                            const connected = entry?.connected
                            return (
                              <button
                                key={cid}
                                disabled={connected || !entry || adding === cid}
                                onClick={() => entry && connect(entry)}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-2xs transition-colors ${
                                  connected
                                    ? 'bg-success/10 border-success/30 text-success cursor-default'
                                    : entry
                                      ? 'bg-bg-secondary border-border text-text-secondary hover:border-accent/50 hover:text-text-primary'
                                      : 'bg-bg-secondary border-border-subtle text-text-muted cursor-default'
                                }`}
                                title={entry ? (connected ? 'Connected' : 'Connect') : 'Not in catalog'}
                              >
                                {entry && <CategoryIcon category={entry.category} transport={entry.transport} size={10} />}
                                {connected ? <Check size={10} /> : adding === cid ? <Loader2 size={10} className="animate-spin" /> : entry ? <Plus size={10} /> : null}
                                {entry?.name ?? cid}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {authFor && (
        <AuthModal
          entry={authFor}
          onClose={() => setAuthFor(null)}
          onDone={() => { setAuthFor(null); load(true) }}
        />
      )}
    </div>
  )
}
