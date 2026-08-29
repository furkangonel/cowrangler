import React, { useEffect, useState } from 'react'
import { ShieldCheck, ShieldAlert, RefreshCw } from 'lucide-react'
import { useSettingsStore } from '../../stores/settings.store'
import { ipc } from '../../lib/ipc'
import type { SandboxHealth, PermissionPolicyView } from '../../lib/ipc'

/**
 * SandboxTab — WP-5 çok-platform sandbox ayarları + canlı backend sağlığı.
 *
 * Permission policy owns whether isolation is enabled. Runtime-only tuning
 * (provider, timeout, output cap, audit) remains in config.yaml. Keeping that
 * split explicit prevents two settings screens from writing competing values.
 */

const PROVIDERS = [
  { id: 'auto', label: 'Auto (recommended)' },
  { id: 'docker', label: 'Docker' },
  { id: 'fallback', label: 'None (low-trust)' },
]

export function SandboxTab() {
  const { config, setConfig } = useSettingsStore()
  const sandbox = config.sandbox ?? {}

  const [health, setHealth] = useState<SandboxHealth | null>(null)
  const [policy, setPolicy] = useState<PermissionPolicyView | null>(null)
  const [loading, setLoading] = useState(false)

  async function loadHealth() {
    setLoading(true)
    try {
      const [nextHealth, nextPolicy] = await Promise.all([
        ipc.settings.sandboxHealth(),
        window.electronAPI.permissions.get(),
      ])
      setHealth(nextHealth)
      setPolicy(nextPolicy)
    } catch { /* surface remains in unavailable state */ }
    setLoading(false)
  }
  useEffect(() => { void loadHealth() }, [])

  async function patch(partial: Record<string, any>) {
    await setConfig('sandbox', { ...sandbox, ...partial })
    if ('provider' in partial) {
      await loadHealth()
      window.dispatchEvent(new Event('cowrangler:permissions-changed'))
    }
  }

  async function setEnabled(enabled: boolean) {
    await window.electronAPI.permissions.setSandbox({ enabled })
    await loadHealth()
    window.dispatchEvent(new Event('cowrangler:permissions-changed'))
  }

  const isolated = health?.isolated
  const enabled = policy?.sandbox.enabled ?? true
  const HealthIcon = isolated ? ShieldCheck : ShieldAlert

  return (
    <div className="p-6 space-y-8 max-w-xl">
      {/* ── Canlı backend sağlığı ── */}
      <section>
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-sm font-semibold text-text-primary">Isolation Backend</h4>
          <button
            onClick={loadHealth}
            className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary"
            title="Re-detect"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <p className="text-xs text-text-muted mb-4">Detected on this platform right now.</p>

        <div className={`flex items-start gap-3 p-3 rounded-xl border-2 ${
          isolated ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-orange-500/40 bg-orange-500/5'
        }`}>
          <HealthIcon size={18} className={`mt-0.5 ${isolated ? 'text-emerald-500' : 'text-orange-500'}`} />
          <div>
            <div className="text-sm font-medium text-text-primary">
              {health ? health.label : 'Detecting…'}
            </div>
            <div className="text-xs text-text-muted mt-0.5">
              {health
                ? isolated
                  ? `OS isolation and runner bundle healthy (${health.platform}).`
                  : `Isolation unavailable (${health.platform}). Commands stay blocked until fixed or explicitly approved outside sandbox.`
                : ''}
            </div>
            {health?.bundlePath && (
              <div className="text-2xs text-text-muted mt-1 font-mono break-all">{health.bundlePath}</div>
            )}
            {health?.error && (
              <div className="text-2xs text-orange-500 mt-1 whitespace-pre-wrap">{health.error}</div>
            )}
          </div>
        </div>
      </section>

      {/* ── Ayarlar ── */}
      <section className="space-y-4">
        <h4 className="text-sm font-semibold text-text-primary">Settings</h4>

        <label className="flex items-start gap-3 p-3 rounded-xl border-2 border-border cursor-pointer hover:border-text-muted transition-all">
          <input type="checkbox" className="mt-1" checked={enabled} onChange={e => void setEnabled(e.target.checked)} />
          <div>
            <div className="text-sm font-medium text-text-primary">Enable sandbox isolation</div>
            <div className="text-xs text-text-muted mt-0.5">Shared with Permissions; one policy controls both approval and execution.</div>
          </div>
        </label>

        <label className="flex items-start gap-3 p-3 rounded-xl border-2 border-border cursor-pointer hover:border-text-muted transition-all">
          <input type="checkbox" className="mt-1" checked={sandbox.network_restricted ?? false} onChange={e => patch({ network_restricted: e.target.checked })} />
          <div>
            <div className="text-sm font-medium text-text-primary">Restrict network</div>
            <div className="text-xs text-text-muted mt-0.5">Block outbound network access inside the sandbox.</div>
          </div>
        </label>

        <label className="flex items-start gap-3 p-3 rounded-xl border-2 border-border cursor-pointer hover:border-text-muted transition-all">
          <input type="checkbox" className="mt-1" checked={sandbox.audit_log ?? false} onChange={e => patch({ audit_log: e.target.checked })} />
          <div>
            <div className="text-sm font-medium text-text-primary">Audit log</div>
            <div className="text-xs text-text-muted mt-0.5">Record every sandboxed command to an audit log.</div>
          </div>
        </label>

        <Field label="Preferred backend">
          <select
            value={sandbox.provider ?? 'auto'}
            onChange={e => patch({ provider: e.target.value })}
            className="w-full px-2.5 py-1.5 bg-bg-tertiary border border-border rounded-lg text-xs focus:border-accent/60 outline-none"
          >
            {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Field>

        <Field label="Timeout (ms)">
          <NumberInput value={sandbox.max_timeout_ms ?? 30000} min={1000} onChange={v => patch({ max_timeout_ms: v })} />
        </Field>

        <Field label="Max output (bytes)">
          <NumberInput value={sandbox.max_output_bytes ?? 524288} min={1024} onChange={v => patch({ max_output_bytes: v })} />
        </Field>

        <p className="text-2xs text-text-muted">
          Workspace root follows active project. Extra roots come from Permissions → Additional directories.
        </p>
      </section>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-text-secondary w-36 flex-shrink-0">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function NumberInput({ value, min, onChange }: { value: number; min?: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      onChange={e => { const n = parseInt(e.target.value, 10); if (!Number.isNaN(n)) onChange(n) }}
      className="w-full px-2.5 py-1.5 bg-bg-tertiary border border-border rounded-lg text-xs font-mono focus:border-accent/60 outline-none"
    />
  )
}
