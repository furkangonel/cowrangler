import React, { useState } from 'react'
import { ShieldAlert, PenLine, ListChecks, Zap, Plus, X } from 'lucide-react'
import { useSettingsStore } from '../../stores/settings.store'

/**
 * PermissionsTab — WP-5/WP-7 dört mod izin sistemi.
 *
 * Modlar (permission_mode): ask · accept · plan · auto.
 * Ek: komut allowlist/denylist kalıpları ve "yıkıcı işlemde her zaman sor" toggle.
 * Hepsi settings.ipc ile kalıcı (config.yaml).
 */

const MODES = [
  { id: 'ask', label: 'Ask', description: 'Ask for confirmation before every destructive action.', icon: ShieldAlert, color: 'text-orange-500' },
  { id: 'accept', label: 'Accept', description: 'Auto-accept reversible edits (show diffs); ask only for irreversible/external actions.', icon: PenLine, color: 'text-blue-500' },
  { id: 'plan', label: 'Plan', description: 'Plan first, approve once, then apply similar actions.', icon: ListChecks, color: 'text-violet-500' },
  { id: 'auto', label: 'Auto', description: 'Autonomous: risk classifier + mandatory sandbox + checkpoints. Only irreversible/external asks.', icon: Zap, color: 'text-green-500' },
]

/** permission_mode ham değerini dört moddan birine indir ('default' → 'ask'). */
function normalizeMode(raw: string | undefined): string {
  if (raw === 'accept' || raw === 'plan' || raw === 'auto') return raw
  return 'ask'
}

export function PermissionsTab() {
  const { config, setConfig } = useSettingsStore()

  const permissionMode = normalizeMode(config.permission_mode)
  const alwaysAskDestructive = config['permissions.alwaysAskDestructive'] !== false // varsayılan açık
  const allow: string[] = Array.isArray(config['permissions.allow']) ? config['permissions.allow'] : []
  const deny: string[] = Array.isArray(config['permissions.deny']) ? config['permissions.deny'] : []

  return (
    <div className="p-6 space-y-8 max-w-xl">
      <section>
        <h4 className="text-sm font-semibold text-text-primary mb-1">Permission Mode</h4>
        <p className="text-xs text-text-muted mb-4">Default mode for how the agent requests permission. Also switchable per-session in the Code control bar.</p>

        <div className="grid grid-cols-1 gap-3">
          {MODES.map(m => {
            const Icon = m.icon
            const active = permissionMode === m.id
            return (
              <button
                key={m.id}
                onClick={() => setConfig('permission_mode', m.id)}
                className={`flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                  active ? 'border-accent bg-accent/5' : 'border-border hover:border-text-muted'
                }`}
              >
                <div className={`mt-0.5 ${active ? m.color : 'text-text-muted'}`}>
                  <Icon size={18} />
                </div>
                <div>
                  <div className={`text-sm font-medium ${active ? 'text-text-primary' : 'text-text-secondary'}`}>
                    {m.label}
                  </div>
                  <div className="text-xs text-text-muted mt-0.5">{m.description}</div>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <h4 className="text-sm font-semibold text-text-primary mb-1">Destructive Actions</h4>
        <p className="text-xs text-text-muted mb-4">Irreversible or external-effect operations (git push, external APIs, deletes outside the workspace).</p>
        <Toggle
          checked={alwaysAskDestructive}
          onChange={v => setConfig('permissions.alwaysAskDestructive', v)}
          title="Always ask on destructive actions"
          hint="Even in Auto mode, prompt before irreversible or external-effect operations."
        />
      </section>

      <section>
        <h4 className="text-sm font-semibold text-text-primary mb-1">Command Patterns</h4>
        <p className="text-xs text-text-muted mb-4">Allowlisted patterns run without asking; denylisted patterns are always blocked. Substring or regex.</p>
        <PatternList
          label="Allowlist"
          placeholder="e.g. npm run test"
          patterns={allow}
          onChange={next => setConfig('permissions.allow', next)}
          accent="text-emerald-500"
        />
        <div className="h-4" />
        <PatternList
          label="Denylist"
          placeholder="e.g. rm -rf"
          patterns={deny}
          onChange={next => setConfig('permissions.deny', next)}
          accent="text-red-500"
        />
      </section>
    </div>
  )
}

// ── Alt bileşenler ────────────────────────────────────────────────────────────

function Toggle({
  checked, onChange, title, hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  title: string
  hint: string
}) {
  return (
    <label className="flex items-start gap-3 p-3 rounded-xl border-2 border-border cursor-pointer hover:border-text-muted transition-all">
      <input type="checkbox" className="mt-1" checked={checked} onChange={e => onChange(e.target.checked)} />
      <div>
        <div className="text-sm font-medium text-text-primary">{title}</div>
        <div className="text-xs text-text-muted mt-0.5">{hint}</div>
      </div>
    </label>
  )
}

function PatternList({
  label, placeholder, patterns, onChange, accent,
}: {
  label: string
  placeholder: string
  patterns: string[]
  onChange: (next: string[]) => void
  accent: string
}) {
  const [input, setInput] = useState('')
  function add() {
    const v = input.trim()
    if (!v || patterns.includes(v)) return
    onChange([...patterns, v])
    setInput('')
  }
  return (
    <div>
      <div className={`text-xs font-medium mb-1.5 ${accent}`}>{label}</div>
      <div className="flex gap-2 mb-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add() }}
          placeholder={placeholder}
          className="flex-1 px-2.5 py-1.5 bg-bg-tertiary border border-border rounded-lg text-xs font-mono focus:border-accent/60 outline-none transition-colors"
        />
        <button
          onClick={add}
          disabled={!input.trim()}
          className="px-3 py-1.5 bg-accent text-accent-fg text-xs rounded-lg disabled:opacity-40 hover:bg-accent-hover transition-colors flex items-center gap-1"
        >
          <Plus size={13} /> Add
        </button>
      </div>
      {patterns.length === 0 ? (
        <p className="text-2xs text-text-muted italic px-1">None.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {patterns.map(p => (
            <span key={p} className="flex items-center gap-1 px-2 py-1 bg-bg-secondary border border-border rounded-lg text-2xs font-mono">
              {p}
              <button onClick={() => onChange(patterns.filter(x => x !== p))} className="text-text-muted hover:text-error">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
