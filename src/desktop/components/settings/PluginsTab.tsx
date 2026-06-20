import React, { useEffect, useState } from 'react'
import { BadgeCheck, Boxes, RefreshCw } from 'lucide-react'
import { ipc, PluginInfo } from '../../lib/ipc'

/**
 * Plugins — cowrangler-signed, pre-installed packages.
 * When a plugin is enabled, its SKILLs and recommended CONNECTORs are surfaced.
 */
export function PluginsTab() {
  const [plugins, setPlugins] = useState<PluginInfo[]>([])
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const list = await ipc.plugins.list()
      setPlugins(Array.isArray(list) ? list : [])
    } catch {
      setPlugins([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function toggle(p: PluginInfo) {
    setPlugins(ps => ps.map(x => x.id === p.id ? { ...x, enabled: !x.enabled } : x))
    await ipc.plugins.setEnabled(p.id, !p.enabled)
  }

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-text-primary">Plugins</h4>
          <p className="text-xs text-text-muted mt-0.5">cowrangler-signed packages — skill + connector bundles.</p>
        </div>
        <button onClick={load} className="p-1.5 text-text-muted hover:text-text-secondary rounded">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="space-y-2.5">
        {plugins.map(p => (
          <div key={p.id} className="flex items-start gap-3 p-3.5 bg-bg-tertiary border border-border rounded-xl">
            <div className="flex-shrink-0 mt-0.5 text-accent"><Boxes size={17} /></div>
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
              <p className="text-2xs text-text-muted mt-1.5">
                {p.skills.length} skill · {p.connectors.length} connector
              </p>
            </div>
            <button
              onClick={() => toggle(p)}
              className={`flex-shrink-0 w-10 h-5.5 rounded-full transition-colors relative ${p.enabled ? 'bg-accent' : 'bg-border'}`}
              style={{ height: '22px', width: '40px' }}
              title={p.enabled ? 'Enabled' : 'Disabled'}
            >
              <span className={`absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-all ${p.enabled ? 'left-[20px]' : 'left-0.5'}`} />
            </button>
          </div>
        ))}
        {plugins.length === 0 && !loading && (
          <p className="text-xs text-text-muted text-center py-6">No plugins found.</p>
        )}
      </div>
    </div>
  )
}
