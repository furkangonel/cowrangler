import React, { useEffect, useState } from 'react'
import { GitBranch } from 'lucide-react'
import { useSettingsStore } from '../../stores/settings.store'
import { useProjectsStore } from '../../stores/projects.store'
import { ipc } from '../../lib/ipc'

/**
 * GitTab — WP-5 git ayarları + canlı depo durumu.
 *
 * Varsayılan branch, commit attribution (Co-authored-by), "push için onay
 * zorunlu", GitHub token, PR şablonu. Dotted config anahtarlarıyla kalıcı.
 */
export function GitTab() {
  const { config, setConfig } = useSettingsStore()
  const activeProject = useProjectsStore(s => s.getActiveProject())
  const workdir = activeProject?.workdir ?? null

  const [branch, setBranch] = useState<string | null>(null)
  const [isRepo, setIsRepo] = useState<boolean | null>(null)

  useEffect(() => {
    if (!workdir) { setIsRepo(false); return }
    let alive = true
    ipc.git.status(workdir).then(s => {
      if (!alive) return
      setIsRepo(s.repo)
      setBranch(s.repo ? s.branch : null)
    }).catch(() => {})
    return () => { alive = false }
  }, [workdir])

  const requirePush = config['git.requirePushApproval'] !== false // varsayılan açık
  const attribution = config['git.attribution'] !== false // varsayılan açık

  return (
    <div className="p-6 space-y-8 max-w-xl">
      {/* ── Canlı durum ── */}
      <section>
        <h4 className="text-sm font-semibold text-text-primary mb-1">Repository</h4>
        <div className={`flex items-center gap-2 p-3 rounded-xl border-2 mt-2 ${
          isRepo ? 'border-accent/40 bg-accent/5' : 'border-border'
        }`}>
          <GitBranch size={16} className={isRepo ? 'text-accent' : 'text-text-muted'} />
          <span className="text-xs text-text-secondary">
            {isRepo === null ? 'Checking…'
              : isRepo ? <>Active project on branch <code className="font-mono text-text-primary">{branch}</code></>
              : 'Active project is not a Git repository.'}
          </span>
        </div>
      </section>

      {/* ── Ayarlar ── */}
      <section className="space-y-4">
        <h4 className="text-sm font-semibold text-text-primary">Settings</h4>

        <Field label="Default branch">
          <input
            value={config['git.defaultBranch'] ?? ''}
            onChange={e => setConfig('git.defaultBranch', e.target.value)}
            placeholder="main"
            className="w-full px-2.5 py-1.5 bg-bg-tertiary border border-border rounded-lg text-xs font-mono focus:border-accent/60 outline-none"
          />
        </Field>

        <label className="flex items-start gap-3 p-3 rounded-xl border-2 border-border cursor-pointer hover:border-text-muted transition-all">
          <input type="checkbox" className="mt-1" checked={requirePush} onChange={e => setConfig('git.requirePushApproval', e.target.checked)} />
          <div>
            <div className="text-sm font-medium text-text-primary">Require approval to push</div>
            <div className="text-xs text-text-muted mt-0.5">Push and PR are irreversible/external — confirm before running (even in Auto mode).</div>
          </div>
        </label>

        <label className="flex items-start gap-3 p-3 rounded-xl border-2 border-border cursor-pointer hover:border-text-muted transition-all">
          <input type="checkbox" className="mt-1" checked={attribution} onChange={e => setConfig('git.attribution', e.target.checked)} />
          <div>
            <div className="text-sm font-medium text-text-primary">AI commit attribution</div>
            <div className="text-xs text-text-muted mt-0.5">Add a <code className="font-mono">Co-authored-by</code> trailer marking AI contribution.</div>
          </div>
        </label>

        <Field label="GitHub token">
          <input
            type="password"
            value={config['git.githubToken'] ?? ''}
            onChange={e => setConfig('git.githubToken', e.target.value)}
            placeholder="ghp_… (for opening PRs)"
            className="w-full px-2.5 py-1.5 bg-bg-tertiary border border-border rounded-lg text-xs font-mono focus:border-accent/60 outline-none"
          />
        </Field>

        <div>
          <div className="text-xs text-text-secondary mb-1.5">PR template</div>
          <textarea
            value={config['git.prTemplate'] ?? ''}
            onChange={e => setConfig('git.prTemplate', e.target.value)}
            rows={4}
            placeholder={'## Summary\n\n## Test plan'}
            className="w-full px-2.5 py-2 bg-bg-tertiary border border-border rounded-lg text-xs font-mono resize-y focus:border-accent/60 outline-none"
          />
        </div>
      </section>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-text-secondary w-32 flex-shrink-0">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  )
}
