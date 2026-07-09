import React from 'react'
import { useSettingsStore } from '../../stores/settings.store'
import { ipc } from '../../lib/ipc'

/**
 * AdvancedTab — WP-5 gelişmiş ayarlar.
 *
 * Auto Mode risk hassasiyeti, checkpoint sıklığı, context sıkıştırma eşiği,
 * cache-hit hedefi, telemetri (opt-in, VARSAYILAN KAPALI). Nested `context`
 * dışındakiler dotted anahtarlarla kalıcı.
 */

const RISK_LEVELS = [
  { id: 'conservative', label: 'Conservative', hint: 'Ask more often; classify borderline actions as risky.' },
  { id: 'balanced', label: 'Balanced', hint: 'Default risk classifier sensitivity.' },
  { id: 'aggressive', label: 'Aggressive', hint: 'Ask less; only clearly irreversible actions prompt.' },
]

export function AdvancedTab() {
  const { config, setConfig } = useSettingsStore()
  const context = config.context ?? {}

  const riskSensitivity = config['auto.riskSensitivity'] ?? 'balanced'
  const checkpointEvery = config['auto.checkpointEvery'] ?? 1
  const compressThreshold = context.compress_threshold ?? 0.85
  const cacheHitTarget = config['cache.hitTarget'] ?? 0.7
  const telemetry = config['telemetry.enabled'] === true // VARSAYILAN KAPALI

  const workspaceRoot = (config.workspace_root as string | undefined) || ''

  async function pickWorkspaceRoot() {
    const dir = await ipc.fs.pickFolder()
    if (dir) setConfig('workspace_root', dir)
  }

  return (
    <div className="p-6 space-y-8 max-w-xl">
      {/* ── Workspace ── */}
      <section>
        <h4 className="text-sm font-semibold text-text-primary mb-1">Workspace folder</h4>
        <p className="text-xs text-text-muted mb-4">
          New projects get their own folder under <span className="font-mono">Cowrangler/</span> inside this
          directory. Files Cowrangler creates are saved there.
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 text-xs font-mono px-3 py-2 rounded-lg bg-bg-tertiary border border-border text-text-secondary truncate">
            {(workspaceRoot || '~/Documents')}/Cowrangler
          </div>
          <button
            onClick={pickWorkspaceRoot}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-bg-hover hover:bg-bg-tertiary border border-border text-text-primary transition-colors flex-shrink-0"
          >
            Change…
          </button>
        </div>
        {!workspaceRoot && (
          <p className="text-2xs text-text-muted mt-1.5">Not set — defaulting to your Documents folder.</p>
        )}
      </section>

      {/* ── Auto Mode ── */}
      <section>
        <h4 className="text-sm font-semibold text-text-primary mb-1">Auto Mode</h4>
        <p className="text-xs text-text-muted mb-4">Risk classifier sensitivity for autonomous execution.</p>
        <div className="grid grid-cols-1 gap-2">
          {RISK_LEVELS.map(r => {
            const active = riskSensitivity === r.id
            return (
              <button
                key={r.id}
                onClick={() => setConfig('auto.riskSensitivity', r.id)}
                className={`flex flex-col items-start p-3 rounded-xl border-2 text-left transition-all ${
                  active ? 'border-accent bg-accent/5' : 'border-border hover:border-text-muted'
                }`}
              >
                <span className={`text-sm font-medium ${active ? 'text-text-primary' : 'text-text-secondary'}`}>{r.label}</span>
                <span className="text-xs text-text-muted mt-0.5">{r.hint}</span>
              </button>
            )
          })}
        </div>

        <div className="mt-4">
          <Slider
            label="Checkpoint frequency"
            value={checkpointEvery}
            min={1} max={5} step={1}
            format={v => v === 1 ? 'Every turn' : `Every ${v} turns`}
            onChange={v => setConfig('auto.checkpointEvery', v)}
          />
        </div>
      </section>

      {/* ── Context ── */}
      <section>
        <h4 className="text-sm font-semibold text-text-primary mb-1">Context</h4>
        <p className="text-xs text-text-muted mb-4">When context usage crosses the threshold, older history is compressed.</p>
        <Slider
          label="Compression threshold"
          value={compressThreshold}
          min={0.5} max={0.95} step={0.05}
          format={v => `${Math.round(v * 100)}%`}
          onChange={v => setConfig('context', { ...context, compress_threshold: v })}
        />
        <div className="mt-4">
          <Slider
            label="Cache-hit target"
            value={cacheHitTarget}
            min={0} max={1} step={0.05}
            format={v => `${Math.round(v * 100)}%`}
            onChange={v => setConfig('cache.hitTarget', v)}
          />
        </div>
      </section>

      {/* ── Telemetri ── */}
      <section>
        <h4 className="text-sm font-semibold text-text-primary mb-1">Telemetry</h4>
        <p className="text-xs text-text-muted mb-4">Off by default. Nothing is collected unless you opt in.</p>
        <label className="flex items-start gap-3 p-3 rounded-xl border-2 border-border cursor-pointer hover:border-text-muted transition-all">
          <input type="checkbox" className="mt-1" checked={telemetry} onChange={e => setConfig('telemetry.enabled', e.target.checked)} />
          <div>
            <div className="text-sm font-medium text-text-primary">Enable anonymous telemetry</div>
            <div className="text-xs text-text-muted mt-0.5">Share anonymous usage metrics to help improve Cowrangler.</div>
          </div>
        </label>
      </section>
    </div>
  )
}

function Slider({
  label, value, min, max, step, format, onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-text-secondary">{label}</span>
        <span className="text-xs font-mono text-accent">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full accent-accent"
      />
    </div>
  )
}
