import React, { useEffect, useRef, useState } from 'react'
import { ChevronUp, ShieldAlert, PenLine, ListChecks, Zap, Gauge, Database } from 'lucide-react'
import { useSettingsStore } from '../../stores/settings.store'
import { useAgentStore } from '../../stores/agent.store'
import { useUIStore, CodeEffort } from '../../stores/ui.store'
import { formatTokenCount } from '../../lib/tokens'

/**
 * WP-3 — Code arayüzü alt kontrol çubuğu (Claude paritesi).
 *
 * Mod dropdown (Ask · Accept · Plan · Auto → permission_mode), model seçici
 * (savedModels), effort (Low/Med/High) ve token/cache göstergesi. Mod ve model
 * kalıcı ayara (settings.ipc) yazılır; effort oturum-yerel (WP-5/WP-6 kalıcı yapar).
 */

const MODES = [
  { id: 'ask', label: 'Ask', icon: ShieldAlert, hint: 'Ask before destructive actions' },
  { id: 'accept', label: 'Accept', icon: PenLine, hint: 'Auto-accept edits, show diffs' },
  { id: 'plan', label: 'Plan', icon: ListChecks, hint: 'Plan first, then apply' },
  { id: 'auto', label: 'Auto', icon: Zap, hint: 'Autonomous; only irreversible asks' },
] as const

const EFFORTS: { id: CodeEffort; label: string }[] = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Med' },
  { id: 'high', label: 'High' },
]

/** permission_mode config değerini dropdown moduna eşle ('default' → 'ask'). */
function normalizeMode(raw: string | undefined): (typeof MODES)[number]['id'] {
  if (raw === 'accept' || raw === 'plan' || raw === 'auto') return raw
  return 'ask'
}

export function CodeControlBar() {
  const { config, setConfig, getModel, setModel, savedModels } = useSettingsStore()
  const contextSnapshot = useAgentStore(s => s.contextSnapshot)
  const status = useAgentStore(s => s.status)
  const { codeEffort, setCodeEffort } = useUIStore()

  const mode = normalizeMode(config.permission_mode)
  const model = getModel()
  const shortModel = (model.split('/').pop() || model) || 'no model'

  const ctx = contextSnapshot
  const cacheTokens = ctx ? ctx.cacheReadTokens + ctx.cacheWriteTokens : 0
  const cacheHitPct =
    ctx && ctx.contextTokens > 0
      ? Math.min(100, Math.round((ctx.cacheReadTokens / ctx.contextTokens) * 100))
      : 0

  const [openMenu, setOpenMenu] = useState<'mode' | 'model' | 'effort' | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenMenu(null)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  const ActiveModeIcon = MODES.find(m => m.id === mode)!.icon

  return (
    <div
      ref={rootRef}
      className="flex items-center gap-1.5 px-3 py-1.5 border-t border-border-subtle bg-bg-secondary text-[11px]"
    >
      {/* ── Mod dropdown ── */}
      <PopButton
        open={openMenu === 'mode'}
        onToggle={() => setOpenMenu(o => (o === 'mode' ? null : 'mode'))}
        icon={<ActiveModeIcon size={12} className="text-accent" />}
        label={MODES.find(m => m.id === mode)!.label}
      >
        {MODES.map(m => {
          const Icon = m.icon
          return (
            <MenuItem
              key={m.id}
              active={m.id === mode}
              onClick={() => { setConfig('permission_mode', m.id); setOpenMenu(null) }}
            >
              <Icon size={12} className="flex-shrink-0" />
              <span className="flex-1">{m.label}</span>
              <span className="text-2xs text-text-muted truncate max-w-[150px]">{m.hint}</span>
            </MenuItem>
          )
        })}
      </PopButton>

      <span className="text-border">│</span>

      {/* ── Model seçici ── */}
      <PopButton
        open={openMenu === 'model'}
        onToggle={() => setOpenMenu(o => (o === 'model' ? null : 'model'))}
        disabled={status === 'thinking'}
        label={shortModel}
        labelClass="font-mono max-w-[160px] truncate"
      >
        {savedModels.length === 0 ? (
          <p className="px-2.5 py-2 text-2xs text-text-muted italic">No saved models — add in Settings</p>
        ) : (
          savedModels.map(id => (
            <MenuItem key={id} active={id === model} onClick={() => { setModel(id); setOpenMenu(null) }}>
              <span className="flex-1 truncate font-mono">{id}</span>
            </MenuItem>
          ))
        )}
      </PopButton>

      <span className="text-border">│</span>

      {/* ── Effort ── */}
      <PopButton
        open={openMenu === 'effort'}
        onToggle={() => setOpenMenu(o => (o === 'effort' ? null : 'effort'))}
        icon={<Gauge size={12} className="text-text-muted" />}
        label={EFFORTS.find(e => e.id === codeEffort)!.label}
      >
        {EFFORTS.map(e => (
          <MenuItem key={e.id} active={e.id === codeEffort} onClick={() => { setCodeEffort(e.id); setOpenMenu(null) }}>
            <span className="flex-1">{e.label}</span>
          </MenuItem>
        ))}
      </PopButton>

      {/* ── Token / cache göstergesi ── */}
      {ctx && (
        <div className="ml-auto flex items-center gap-2 text-text-muted">
          <span title="Context tokens used">
            {formatTokenCount(ctx.contextTokens)} tok
          </span>
          <span className="flex items-center gap-1" title="Cache tokens (read + write) · cache-hit share">
            <Database size={11} className={cacheTokens > 0 ? 'text-accent' : 'text-text-muted/50'} />
            {formatTokenCount(cacheTokens)}
            {cacheTokens > 0 && <span className="text-accent">{cacheHitPct}%</span>}
          </span>
        </div>
      )}
    </div>
  )
}

/* ── Küçük yardımcı bileşenler ─────────────────────────────────────────────── */

function PopButton({
  open, onToggle, disabled, icon, label, labelClass, children,
}: {
  open: boolean
  onToggle: () => void
  disabled?: boolean
  icon?: React.ReactNode
  label: string
  labelClass?: string
  children: React.ReactNode
}) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        disabled={disabled}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-50 font-medium select-none"
      >
        {icon}
        <span className={labelClass}>{label}</span>
        <ChevronUp size={10} className={`transition-transform text-text-muted/70 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-1.5 z-50 min-w-[180px] bg-bg-secondary border border-border rounded-xl shadow-pop overflow-hidden animate-slide-up">
          <div className="p-1 max-h-64 overflow-y-auto">{children}</div>
        </div>
      )}
    </div>
  )
}

function MenuItem({
  active, onClick, children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors ${
        active ? 'bg-accent-subtle text-accent font-medium' : 'text-text-secondary hover:bg-bg-hover'
      }`}
    >
      {children}
    </button>
  )
}
