import React, { useCallback, useEffect, useState } from 'react'
import { Plug, Boxes, BookOpen } from 'lucide-react'
import { ipc } from '../../lib/ipc'
import { Segmented, SegmentOption } from './shared'
import { ConnectorsView } from './ConnectorsView'
import { PluginsView } from './PluginsView'
import { SkillsTab } from '../settings/SkillsTab'

export type ExtSubTab = 'connectors' | 'plugins' | 'skills'

interface Summary {
  connectorsLive: number
  connectorsConfigured: number
  tools: number
  errors: number
  pluginsEnabled: number
  pluginsTotal: number
  skillsActive: number
  skillsTotal: number
}

const EMPTY: Summary = {
  connectorsLive: 0, connectorsConfigured: 0, tools: 0, errors: 0,
  pluginsEnabled: 0, pluginsTotal: 0, skillsActive: 0, skillsTotal: 0,
}

/**
 * ExtensionsPage — one home for Connectors · Plugins · Skills.
 * A single segmented sub-nav + a live aggregate-health strip so the user always
 * knows what's connected and healthy at a glance.
 */
export function ExtensionsPage({ initial = 'connectors' }: { initial?: ExtSubTab }) {
  const [tab, setTab] = useState<ExtSubTab>(initial)
  const [s, setS] = useState<Summary>(EMPTY)

  const refresh = useCallback(async () => {
    try {
      const [cat, plugins, skills] = await Promise.all([
        ipc.connectors.catalog(),
        ipc.plugins.list(),
        ipc.skills.list(),
      ])
      const c = Array.isArray(cat) ? cat : []
      const p = Array.isArray(plugins) ? plugins : []
      const sk = Array.isArray(skills) ? skills : []
      setS({
        connectorsLive: c.filter(x => x.live).length,
        connectorsConfigured: c.filter(x => x.connected).length,
        tools: c.reduce((n, x) => n + (x.toolCount ?? 0), 0),
        errors: c.filter(x => x.connected && !x.live && x.error).length,
        pluginsEnabled: p.filter(x => x.enabled).length,
        pluginsTotal: p.length,
        skillsActive: sk.filter(x => x.active !== false).length,
        skillsTotal: sk.length,
      })
    } catch { /* keep last */ }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const options: SegmentOption<ExtSubTab>[] = [
    { value: 'connectors', label: 'Connectors', icon: <Plug size={13} />, count: s.connectorsConfigured || undefined },
    { value: 'plugins', label: 'Plugins', icon: <Boxes size={13} />, count: s.pluginsEnabled || undefined },
    { value: 'skills', label: 'Skills', icon: <BookOpen size={13} />, count: s.skillsActive || undefined },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Sub-nav + health strip */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border-subtle flex-shrink-0">
        <Segmented value={tab} onChange={setTab} options={options} />
        <HealthStrip s={s} />
      </div>

      {/* Active view */}
      <div className="flex-1 overflow-hidden">
        {tab === 'connectors' && <ConnectorsView onChanged={refresh} />}
        {tab === 'plugins' && <PluginsView onChanged={refresh} />}
        {tab === 'skills' && <SkillsTab />}
      </div>
    </div>
  )
}

function HealthStrip({ s }: { s: Summary }) {
  return (
    <div className="flex items-center gap-3 text-2xs tabular-nums">
      <Metric dot="bg-success" label="live" value={s.connectorsLive} />
      <Metric label="tools" value={s.tools} muted />
      {s.errors > 0 && <Metric dot="bg-error" label={s.errors === 1 ? 'error' : 'errors'} value={s.errors} danger />}
    </div>
  )
}

function Metric({ value, label, dot, muted, danger }: {
  value: number
  label: string
  dot?: string
  muted?: boolean
  danger?: boolean
}) {
  return (
    <span className={`flex items-center gap-1 ${danger ? 'text-error' : muted ? 'text-text-muted' : 'text-text-secondary'}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
      <span className="font-medium">{value}</span>
      <span className="text-text-muted">{label}</span>
    </span>
  )
}
