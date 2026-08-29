import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, Check, FolderPlus, Globe, Hand, Lock, Plus, ShieldCheck,
  ShieldOff, SlidersHorizontal, Terminal, Trash2, X, Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type {
  PermissionModeId, PermissionPolicyView, RuleKind, SourcedPermissionRule,
} from '../../lib/ipc'

/**
 * PermissionsTab — the permission model Anthropic ships with Claude Code.
 *
 * Two independent controls, presented as such:
 *   • the mode, which decides what happens when no rule matches
 *   • the rules, which decide specific cases ahead of the mode
 *
 * Everything is resolved in the main process, so this view never has to know
 * which settings file a rule came from — it just shows the scope badge.
 */

const MODE_ICONS: Record<PermissionModeId, LucideIcon> = {
  default: Hand,
  acceptEdits: Check,
  plan: SlidersHorizontal,
  auto: Zap,
  dontAsk: Lock,
  bypassPermissions: ShieldOff,
}

const RULE_META: Record<RuleKind, { label: string; hint: string; placeholder: string; tone: string }> = {
  deny: {
    label: 'Deny',
    hint: 'Always blocked, in every mode. Checked first, so a deny beats any allow.',
    placeholder: 'Read(.env)',
    tone: 'text-error',
  },
  ask: {
    label: 'Ask',
    hint: 'Always confirmed with you, even in Auto mode and even when sandboxed.',
    placeholder: 'Bash(git push *)',
    tone: 'text-warning',
  },
  allow: {
    label: 'Allow',
    hint: 'Runs without asking. Checked after deny and ask.',
    placeholder: 'Bash(npm run *)',
    tone: 'text-success',
  },
}

const RULE_ORDER: RuleKind[] = ['deny', 'ask', 'allow']

export function PermissionsTab() {
  const [policy, setPolicy] = useState<PermissionPolicyView | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setPolicy(await window.electronAPI.permissions.get())
    } catch (cause: any) {
      setError(cause?.message ?? 'Could not read the permission settings.')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const run = useCallback(async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true)
    setError(null)
    try {
      const result = await fn()
      if (!result.ok && result.error) setError(result.error)
      await load()
      window.dispatchEvent(new Event('cowrangler:permissions-changed'))
    } catch (cause: any) {
      setError(cause?.message ?? 'That change could not be saved.')
    } finally {
      setBusy(false)
    }
  }, [load])

  if (!policy) {
    return <div className="p-6 text-sm text-text-muted">Reading permission settings…</div>
  }

  const lockedModes = new Set<PermissionModeId>([
    ...(policy.disableBypassPermissionsMode ? (['bypassPermissions'] as PermissionModeId[]) : []),
    ...(policy.disableAutoMode ? (['auto'] as PermissionModeId[]) : []),
  ])

  return (
    <div className="p-6 space-y-9 max-w-3xl">
      {error && (
        <div className="flex items-start gap-2.5 p-3 rounded-xl border border-error/40 bg-error/10 text-error text-xs">
          <AlertTriangle size={14} className="mt-px flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto opacity-70 hover:opacity-100"><X size={13} /></button>
        </div>
      )}

      {/* ── Mode ─────────────────────────────────────────────────────────── */}
      <section>
        <h4 className="text-sm font-semibold text-text-primary">Permission mode</h4>
        <p className="text-xs text-text-muted mt-1 mb-4">
          What happens when no rule matches. Sessions start in this mode; you can still switch per session from the Code control bar.
        </p>

        <div className="grid grid-cols-1 gap-2">
          {policy.modes.map(info => {
            const Icon = MODE_ICONS[info.id]
            const active = policy.mode === info.id
            const locked = lockedModes.has(info.id)
            return (
              <button
                key={info.id}
                disabled={busy || locked}
                onClick={() => run(async () => window.electronAPI.permissions.setMode(info.id))}
                className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-colors ${
                  active
                    ? 'border-accent bg-accent/[0.07]'
                    : locked
                      ? 'border-border-subtle opacity-45 cursor-not-allowed'
                      : 'border-border hover:border-border-strong hover:bg-bg-hover/50'
                }`}
              >
                <span className={`mt-0.5 ${active ? 'text-accent-text' : 'text-text-muted'}`}><Icon size={17} /></span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${active ? 'text-text-primary' : 'text-text-secondary'}`}>{info.label}</span>
                    <code className="text-2xs text-text-muted font-mono">{info.id}</code>
                    {locked && (
                      <span className="text-2xs px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted">
                        disabled by policy
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-text-muted mt-1">{active ? info.detail : info.summary}</span>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* ── Rules ────────────────────────────────────────────────────────── */}
      <section>
        <h4 className="text-sm font-semibold text-text-primary">Rules</h4>
        <p className="text-xs text-text-muted mt-1 mb-3">
          Rules decide specific cases before the mode does, in the order below. Write them as{' '}
          <code className="font-mono text-text-secondary">Tool(specifier)</code> — for example{' '}
          <code className="font-mono text-text-secondary">Bash(npm run *)</code>,{' '}
          <code className="font-mono text-text-secondary">Edit(src/**)</code> or{' '}
          <code className="font-mono text-text-secondary">WebFetch(domain:example.com)</code>.
        </p>

        {policy.issues.length > 0 && (
          <div className="mb-4 p-3 rounded-xl border border-warning/40 bg-warning/10 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-medium text-warning">
              <AlertTriangle size={13} /> Rules that can&apos;t be applied
            </div>
            {policy.issues.map(issue => (
              <p key={issue.raw} className="text-2xs text-text-secondary">
                <code className="font-mono">{issue.raw}</code> — {issue.reason}
              </p>
            ))}
          </div>
        )}

        <div className="space-y-5">
          {RULE_ORDER.map(kind => (
            <RuleList
              key={kind}
              kind={kind}
              rules={policy[kind]}
              busy={busy}
              onAdd={rule => run(async () => window.electronAPI.permissions.addRule(kind, rule))}
              onRemove={rule => run(async () => window.electronAPI.permissions.removeRule(kind, rule))}
            />
          ))}
        </div>
      </section>

      {/* ── Working directories ──────────────────────────────────────────── */}
      <section>
        <h4 className="text-sm font-semibold text-text-primary">Additional directories</h4>
        <p className="text-xs text-text-muted mt-1 mb-3">
          Folders outside the project that count as part of the workspace: reads and edits there are treated the same as in-project ones.
        </p>
        <DirectoryList
          directories={policy.additionalDirectories}
          busy={busy}
          onChange={dirs => run(async () => window.electronAPI.permissions.setDirectories(dirs))}
        />
      </section>

      {/* ── Sandbox ──────────────────────────────────────────────────────── */}
      <section>
        <h4 className="text-sm font-semibold text-text-primary">Sandbox</h4>
        <p className="text-xs text-text-muted mt-1 mb-3">
          The sandbox is a separate layer from the rules above: the rules decide whether a command runs, the sandbox decides what it can touch while it does. The operating system enforces the boundary for the command and every process it spawns.
        </p>

        <div className="space-y-2">
          <Toggle
            icon={ShieldCheck}
            checked={policy.sandbox.enabled}
            disabled={busy}
            onChange={v => run(async () => window.electronAPI.permissions.setSandbox({ enabled: v }))}
            title="Confine shell commands"
            hint="Writes stay inside your working directories; network egress is limited to the domains below."
          />
          <Toggle
            icon={Zap}
            checked={policy.sandbox.autoAllowBash}
            disabled={busy || !policy.sandbox.enabled}
            onChange={v => run(async () => window.electronAPI.permissions.setSandbox({ autoAllowBash: v }))}
            title="Run confinable commands without asking"
            hint="A command the sandbox can fully contain runs straight away. Anything it can't contain still comes back to you."
          />
          <Toggle
            icon={Terminal}
            checked={policy.sandbox.allowUnsandboxedCommands}
            disabled={busy || !policy.sandbox.enabled}
            onChange={v => run(async () => window.electronAPI.permissions.setSandbox({ allowUnsandboxedCommands: v }))}
            title="Allow an unsandboxed retry"
            hint="When a command fails because the sandbox blocked it, Claude may retry outside the sandbox — which sends it back through the normal approval flow. Turn this off for strict mode."
          />
        </div>

        <div className="mt-4">
          <PatternField
            icon={Globe}
            label="Allowed domains"
            hint="Hosts sandboxed commands may reach. A leading *. covers subdomains."
            placeholder="registry.npmjs.org"
            values={policy.sandbox.network.allowedDomains}
            busy={busy}
            onChange={next => run(async () => window.electronAPI.permissions.setSandbox({ network: { allowedDomains: next } }))}
          />
        </div>
        <div className="mt-3">
          <PatternField
            icon={Terminal}
            label="Commands that run outside the sandbox"
            hint="For tools the sandbox breaks. These always go through the normal approval flow."
            placeholder="docker *"
            values={policy.sandbox.excludedCommands}
            busy={busy}
            onChange={next => run(async () => window.electronAPI.permissions.setSandbox({ excludedCommands: next }))}
          />
        </div>
      </section>

      <section className="pt-1 border-t border-border-subtle">
        <p className="text-2xs text-text-muted leading-relaxed">
          Changes are written to <code className="font-mono">{policy.files.local}</code>, which stays on this machine.
          Rules checked into <code className="font-mono">.cowrangler/settings.json</code> are shared with everyone on the
          project, and a managed policy at <code className="font-mono">{policy.files.managed}</code> outranks both — a deny
          set there can&apos;t be lifted here.
        </p>
      </section>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function RuleList({
  kind, rules, busy, onAdd, onRemove,
}: {
  kind: RuleKind
  rules: SourcedPermissionRule[]
  busy: boolean
  onAdd: (rule: string) => void
  onRemove: (rule: string) => void
}) {
  const [input, setInput] = useState('')
  const meta = RULE_META[kind]

  const submit = () => {
    const value = input.trim()
    if (!value) return
    onAdd(value)
    setInput('')
  }

  // A rule from managed settings or the legacy config can't be edited here;
  // showing it read-only is more honest than hiding it.
  const editable = (scope: SourcedPermissionRule['scope']) =>
    scope === 'local' || scope === 'project' || scope === 'user'

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className={`text-xs font-semibold ${meta.tone}`}>{meta.label}</span>
        <span className="text-2xs text-text-muted">{meta.hint}</span>
      </div>

      <div className="flex gap-2 mb-2">
        <input
          value={input}
          disabled={busy}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          placeholder={meta.placeholder}
          spellCheck={false}
          className="flex-1 px-2.5 py-1.5 bg-bg-tertiary border border-border rounded-lg text-xs font-mono placeholder:text-text-placeholder focus:border-accent/60 outline-none transition-colors"
        />
        <button
          onClick={submit}
          disabled={busy || !input.trim()}
          className="px-3 py-1.5 bg-accent text-accent-fg text-xs rounded-lg disabled:opacity-40 hover:bg-accent-hover transition-colors flex items-center gap-1"
        >
          <Plus size={13} /> Add
        </button>
      </div>

      {rules.length === 0 ? (
        <p className="text-2xs text-text-muted px-1">No {meta.label.toLowerCase()} rules.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {rules.map(rule => (
            <span
              key={`${rule.scope}:${rule.raw}`}
              className="flex items-center gap-1.5 pl-2 pr-1.5 py-1 bg-bg-secondary border border-border rounded-lg text-2xs font-mono"
              title={`from ${rule.scope} settings`}
            >
              {rule.raw}
              <span className="text-text-muted font-sans">{rule.scope}</span>
              {editable(rule.scope) && (
                <button
                  onClick={() => onRemove(rule.raw)}
                  disabled={busy}
                  className="text-text-muted hover:text-error transition-colors"
                  aria-label={`Remove ${rule.raw}`}
                >
                  <X size={11} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function DirectoryList({
  directories, busy, onChange,
}: {
  directories: string[]
  busy: boolean
  onChange: (dirs: string[]) => void
}) {
  const [input, setInput] = useState('')
  const submit = () => {
    const value = input.trim()
    if (!value || directories.includes(value)) return
    onChange([...directories, value])
    setInput('')
  }
  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input
          value={input}
          disabled={busy}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          placeholder="~/work/shared-assets"
          spellCheck={false}
          className="flex-1 px-2.5 py-1.5 bg-bg-tertiary border border-border rounded-lg text-xs font-mono placeholder:text-text-placeholder focus:border-accent/60 outline-none transition-colors"
        />
        <button
          onClick={submit}
          disabled={busy || !input.trim()}
          className="px-3 py-1.5 bg-accent text-accent-fg text-xs rounded-lg disabled:opacity-40 hover:bg-accent-hover transition-colors flex items-center gap-1"
        >
          <FolderPlus size={13} /> Add
        </button>
      </div>
      {directories.length === 0 ? (
        <p className="text-2xs text-text-muted px-1">Only the project folder.</p>
      ) : (
        <div className="space-y-1">
          {directories.map(dir => (
            <div key={dir} className="flex items-center gap-2 px-2.5 py-1.5 bg-bg-secondary border border-border rounded-lg">
              <span className="flex-1 truncate text-2xs font-mono text-text-secondary">{dir}</span>
              <button
                onClick={() => onChange(directories.filter(d => d !== dir))}
                disabled={busy}
                className="text-text-muted hover:text-error transition-colors"
                aria-label={`Remove ${dir}`}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PatternField({
  icon: Icon, label, hint, placeholder, values, busy, onChange,
}: {
  icon: LucideIcon
  label: string
  hint: string
  placeholder: string
  values: string[]
  busy: boolean
  onChange: (next: string[]) => void
}) {
  const [input, setInput] = useState('')
  // Allowed domains arrive tagged with the scope that declared them, so the
  // engine can honour a managed lockdown; the tab shows only the value.
  const display = useMemo(
    () => values.map(v => (v.includes(' ') ? (v.split(' ').pop() as string) : v)),
    [values],
  )

  const submit = () => {
    const value = input.trim()
    if (!value || display.includes(value)) return
    onChange([...display, value])
    setInput('')
  }
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-text-secondary"><Icon size={12} /> {label}</span>
        <span className="text-2xs text-text-muted">{hint}</span>
      </div>
      <div className="flex gap-2 mb-2">
        <input
          value={input}
          disabled={busy}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          placeholder={placeholder}
          spellCheck={false}
          className="flex-1 px-2.5 py-1.5 bg-bg-tertiary border border-border rounded-lg text-xs font-mono placeholder:text-text-placeholder focus:border-accent/60 outline-none transition-colors"
        />
        <button
          onClick={submit}
          disabled={busy || !input.trim()}
          className="px-3 py-1.5 bg-bg-tertiary border border-border text-text-secondary text-xs rounded-lg disabled:opacity-40 hover:border-border-strong transition-colors flex items-center gap-1"
        >
          <Plus size={13} /> Add
        </button>
      </div>
      {display.length === 0 ? (
        <p className="text-2xs text-text-muted px-1">None.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {display.map(value => (
            <span key={value} className="flex items-center gap-1 px-2 py-1 bg-bg-secondary border border-border rounded-lg text-2xs font-mono">
              {value}
              <button
                onClick={() => onChange(display.filter(v => v !== value))}
                disabled={busy}
                className="text-text-muted hover:text-error transition-colors"
                aria-label={`Remove ${value}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Toggle({
  icon: Icon, checked, disabled, onChange, title, hint,
}: {
  icon: LucideIcon
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
  title: string
  hint: string
}) {
  return (
    <label
      className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
        disabled ? 'border-border-subtle opacity-50 cursor-not-allowed' : 'border-border hover:border-border-strong cursor-pointer'
      }`}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className={`mt-0.5 grid place-items-center w-[30px] h-[30px] flex-shrink-0 rounded-lg border transition-colors ${
          checked ? 'bg-accent/[0.12] border-accent/40 text-accent-text' : 'bg-bg-tertiary border-border-subtle text-text-muted'
        }`}
      >
        <Icon size={14} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-text-primary">{title}</span>
        <span className="block text-xs text-text-muted mt-0.5">{hint}</span>
      </span>
      <span
        aria-hidden
        className={`mt-1 ml-auto flex-shrink-0 w-9 h-5 rounded-full p-0.5 transition-colors ${checked ? 'bg-accent' : 'bg-bg-hover'}`}
      >
        <span className={`block w-4 h-4 rounded-full bg-bg-elevated transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </span>
    </label>
  )
}
