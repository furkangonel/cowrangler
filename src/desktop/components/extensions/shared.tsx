import React, { useState } from 'react'
import {
  Check, AlertTriangle, Circle, Loader2, Lock, KeyRound, Globe, Terminal,
  FolderGit2, FileText, Database, MessagesSquare, Sparkles, Brain, Search,
  Palette, Briefcase,
} from 'lucide-react'

/* ══════════════════════════════════════════════════════════════════════════
   Extensions — shared primitives
   One visual vocabulary for Connectors · Plugins · Skills.
   Rules applied: status is icon + text (never colour alone), 4.5:1 contrast,
   tabular numerals for counts, visible focus, consistent lucide icon family.
   ══════════════════════════════════════════════════════════════════════════ */

// ── Live health pill ──────────────────────────────────────────────────────────
export type HealthState = 'live' | 'error' | 'configured' | 'idle' | 'checking'

export function StatusPill({ state, toolCount, title }: {
  state: HealthState
  toolCount?: number
  title?: string
}) {
  const map: Record<HealthState, { Icon: any; text: string; cls: string }> = {
    live:       { Icon: Check,         text: toolCount != null ? `${toolCount} ${toolCount === 1 ? 'tool' : 'tools'}` : 'Connected', cls: 'text-success bg-success/12 border-success/30' },
    error:      { Icon: AlertTriangle, text: 'Error',       cls: 'text-error bg-error/12 border-error/30' },
    configured: { Icon: Circle,        text: 'Not started', cls: 'text-text-muted bg-bg-hover border-border' },
    idle:       { Icon: Circle,        text: 'Idle',        cls: 'text-text-muted bg-bg-hover border-border' },
    checking:   { Icon: Loader2,       text: 'Checking…',   cls: 'text-info bg-info/12 border-info/30' },
  }
  const { Icon, text, cls } = map[state]
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-2xs font-medium tabular-nums whitespace-nowrap ${cls}`}
    >
      <Icon size={10} className={state === 'checking' ? 'animate-spin' : ''} strokeWidth={2.5} />
      {text}
    </span>
  )
}

// ── Auth requirement badge ────────────────────────────────────────────────────
export function AuthBadge({ auth }: { auth: 'none' | 'apikey' | 'token' | 'oauth' }) {
  if (auth === 'none') return null
  const m = {
    apikey: { Icon: KeyRound, label: 'API key' },
    token:  { Icon: KeyRound, label: 'Token' },
    oauth:  { Icon: Lock,     label: 'OAuth' },
  }[auth]
  const { Icon, label } = m
  return (
    <span className="inline-flex items-center gap-1 text-2xs text-text-muted" title={`Requires ${label}`}>
      <Icon size={10} /> {label}
    </span>
  )
}

// ── Category / transport icon ─────────────────────────────────────────────────
const CATEGORY_ICON: Record<string, any> = {
  files: FileText,
  dev: FolderGit2,
  web: Globe,
  data: Database,
  productivity: Sparkles,
  communication: MessagesSquare,
  design: Palette,
  business: Briefcase,
  ai: Brain,
}

export function CategoryIcon({ category, transport, size = 16, className = '' }: {
  category?: string
  transport?: 'stdio' | 'http' | 'sse'
  size?: number
  className?: string
}) {
  const Icon = (category && CATEGORY_ICON[category]) || (transport === 'stdio' ? Terminal : Globe)
  return <Icon size={size} className={className} />
}

// ── Connector logo (brand mark with graceful fallback) ─────────────────────────
/**
 * Shows the connector's brand logo. If no logo URL is provided — or the image
 * fails to load (offline, 404) — it falls back to the category icon so the card
 * always renders something meaningful.
 */
export function ConnectorLogo({ logo, category, transport, size = 16 }: {
  logo?: string
  category?: string
  transport?: 'stdio' | 'http' | 'sse'
  size?: number
}) {
  const [failed, setFailed] = useState(false)
  if (!logo || failed) {
    return <CategoryIcon category={category} transport={transport} size={size} className="text-text-secondary" />
  }
  return (
    <img
      src={logo}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  )
}

// ── Segmented sub-navigation ──────────────────────────────────────────────────
export interface SegmentOption<T extends string> {
  value: T
  label: string
  icon?: React.ReactNode
  count?: number
}

export function Segmented<T extends string>({ value, onChange, options }: {
  value: T
  onChange: (v: T) => void
  options: SegmentOption<T>[]
}) {
  return (
    <div role="tablist" className="inline-flex p-0.5 bg-bg-tertiary border border-border-subtle rounded-lg gap-0.5">
      {options.map(o => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              active
                ? 'bg-bg-secondary text-text-primary shadow-card'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {o.icon}
            {o.label}
            {o.count != null && (
              <span className={`text-2xs tabular-nums ${active ? 'text-accent' : 'text-text-muted'}`}>{o.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Toggle switch (accessible) ────────────────────────────────────────────────
export function Toggle({ on, onClick, label, disabled }: {
  on: boolean
  onClick: (e: React.MouseEvent) => void
  label?: string
  disabled?: boolean
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 disabled:opacity-40 ${
        on ? 'bg-accent' : 'bg-bg-hover border border-border'
      }`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${on ? 'translate-x-4' : ''}`} />
    </button>
  )
}

// ── Search input ──────────────────────────────────────────────────────────────
export function SearchInput({ value, onChange, placeholder }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-bg-tertiary rounded-lg border border-border-subtle focus-within:border-accent/50 transition-colors">
      <Search size={13} className="text-text-muted flex-shrink-0" />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? 'Search'}
        className="flex-1 bg-transparent text-xs text-text-primary placeholder-text-muted outline-none min-w-0"
      />
    </div>
  )
}

// ── Filter chip ───────────────────────────────────────────────────────────────
export function Chip({ active, onClick, children }: {
  active?: boolean
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-2xs font-medium capitalize transition-colors border ${
        active
          ? 'bg-accent-subtle text-accent border-accent/30'
          : 'bg-bg-tertiary text-text-secondary border-border-subtle hover:text-text-primary hover:border-border'
      }`}
    >
      {children}
    </button>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, hint }: {
  icon: React.ReactNode
  title: string
  hint?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 text-center py-12 px-6">
      <div className="text-text-muted opacity-50">{icon}</div>
      <p className="text-xs font-medium text-text-secondary">{title}</p>
      {hint && <p className="text-2xs text-text-muted max-w-xs leading-relaxed">{hint}</p>}
    </div>
  )
}

// ── Skeleton row ──────────────────────────────────────────────────────────────
export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-[68px] rounded-xl shimmer" />
      ))}
    </div>
  )
}
