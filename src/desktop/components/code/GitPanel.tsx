import React, { useEffect, useMemo, useState } from 'react'
import {
  GitBranch, Plus, Check, ArrowUp, RefreshCw, Sparkles, FileText,
  ChevronDown, AlertTriangle, GitCommit, GitPullRequest,
} from 'lucide-react'
import { useGitStore } from '../../stores/git.store'
import { useProjectsStore } from '../../stores/projects.store'
import { useSettingsStore } from '../../stores/settings.store'
import { ipc, GitFileEntry } from '../../lib/ipc'

/**
 * GitPanel — WP-4 Desktop git yönetimi.
 *
 * Değişen dosyalar (staged/unstaged), tıkla→diff, checkbox ile stage, commit
 * kutusu (+ AI "commit mesajı öner"), branch dropdown + yeni branch, push.
 * Push geri-alınamaz-dış-etkili → daima onay ister (WP-7 ile tutarlı, Auto'da bile).
 */
export function GitPanel() {
  const activeProject = useProjectsStore(s => s.getActiveProject())
  const workdir = activeProject?.workdir ?? null

  const {
    status, branches, activeDiff, loading, busy, error,
    setWorkdir, refresh, loadDiff, clearDiff, stage, unstage, commit,
    createBranch, checkout, push, suggestCommitMessage,
  } = useGitStore()

  const getModel = useSettingsStore(s => s.getModel)
  const requirePushApproval = useSettingsStore(s => s.config['git.requirePushApproval'])

  const [message, setMessage] = useState('')
  const [suggesting, setSuggesting] = useState(false)
  const [branchOpen, setBranchOpen] = useState(false)
  const [newBranch, setNewBranch] = useState('')
  const [actionErr, setActionErr] = useState<string | null>(null)

  // Aktif proje değişince git dizinini güncelle.
  useEffect(() => { setWorkdir(workdir) }, [workdir, setWorkdir])

  const staged = useMemo(() => (status?.files ?? []).filter(f => f.staged), [status])
  const unstaged = useMemo(() => (status?.files ?? []).filter(f => !f.staged), [status])

  if (!workdir) {
    return <Empty text="Open a project with a folder to use Git." />
  }
  if (status && !status.repo) {
    return <Empty text="Not a Git repository." icon={<GitBranch size={20} />} />
  }

  async function onCommit() {
    setActionErr(null)
    if (!message.trim()) return
    const res = await commit(message.trim())
    if (res.ok) setMessage('')
    else setActionErr(res.error ?? 'Commit failed.')
  }

  async function onSuggest() {
    setSuggesting(true)
    setActionErr(null)
    const model = getModel()
    if (!model) { setActionErr('No model selected (Settings → Models).'); setSuggesting(false); return }
    const res = await suggestCommitMessage(model)
    setSuggesting(false)
    if (res.ok && res.message) setMessage(res.message)
    else setActionErr(res.error ?? 'Could not generate message.')
  }

  async function onPush(force = false) {
    setActionErr(null)
    // Geri-alınamaz/dış-etkili → onay. Force her zaman onay ister; normal push
    // ise ayar "push için onay zorunlu" açıksa (varsayılan) sorar.
    const needsConfirm = force || requirePushApproval !== false
    const label = force ? 'force-push (--force-with-lease)' : 'push to remote'
    if (needsConfirm && !window.confirm(`Confirm ${label} on branch "${status?.branch}"?`)) return
    const res = await push({ force })
    if (!res.ok) setActionErr(res.error ?? 'Push failed.')
  }

  async function onOpenPR() {
    setActionErr(null)
    const url = await ipc.git.prUrl(workdir!)
    if (!url) { setActionErr('No GitHub remote — cannot open a PR.'); return }
    // Sadece compare sayfasını açar; PR'ı kullanıcı GitHub'da oluşturur.
    await ipc.fs.openExternal(url)
  }

  async function onCreateBranch() {
    if (!newBranch.trim()) return
    const res = await createBranch(newBranch.trim())
    if (res.ok) { setNewBranch(''); setBranchOpen(false) }
    else setActionErr(res.error ?? 'Branch create failed.')
  }

  return (
    <div className="flex flex-col gap-2 text-[11px]">
      {/* ── Branch satırı ── */}
      <div className="relative flex items-center gap-1.5">
        <button
          onClick={() => setBranchOpen(o => !o)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-bg-tertiary/50 hover:bg-bg-hover transition-colors min-w-0"
        >
          <GitBranch size={12} className="text-accent flex-shrink-0" />
          <span className="font-mono truncate max-w-[120px]">{status?.branch || '…'}</span>
          <ChevronDown size={10} className={`text-text-muted transition-transform ${branchOpen ? 'rotate-180' : ''}`} />
        </button>
        {status && (status.ahead > 0 || status.behind > 0) && (
          <span className="text-2xs text-text-muted">
            {status.ahead > 0 && `↑${status.ahead}`} {status.behind > 0 && `↓${status.behind}`}
          </span>
        )}
        <button
          onClick={() => refresh()}
          title="Refresh"
          className="ml-auto p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>

        {branchOpen && (
          <div className="absolute top-full left-0 mt-1 z-40 w-56 bg-bg-secondary border border-border rounded-xl shadow-pop p-1.5 animate-slide-up">
            <div className="max-h-40 overflow-y-auto">
              {(branches?.local ?? []).map(b => (
                <button
                  key={b}
                  onClick={() => { void checkout(b); setBranchOpen(false) }}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                    b === status?.branch ? 'bg-accent-subtle text-accent font-medium' : 'hover:bg-bg-hover text-text-secondary'
                  }`}
                >
                  <GitBranch size={11} className="flex-shrink-0" />
                  <span className="font-mono truncate">{b}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 mt-1 pt-1.5 border-t border-border-subtle">
              <input
                value={newBranch}
                onChange={e => setNewBranch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void onCreateBranch() }}
                placeholder="new-branch"
                className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-bg-primary border border-border-subtle font-mono text-2xs focus:outline-none focus:border-accent"
              />
              <button
                onClick={() => void onCreateBranch()}
                disabled={!newBranch.trim()}
                className="p-1 rounded-lg bg-accent-subtle text-accent hover:bg-accent/20 disabled:opacity-40"
                title="Create branch"
              >
                <Plus size={12} />
              </button>
            </div>
          </div>
        )}
      </div>

      {actionErr && (
        <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-lg bg-red-500/10 text-red-500 text-2xs">
          <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" />
          <span className="break-words">{actionErr}</span>
        </div>
      )}

      {/* ── Değişen dosyalar ── */}
      {status?.clean ? (
        <p className="px-2 py-3 text-center text-text-muted text-2xs italic">Working tree clean.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <FileGroup
            title="Staged" files={staged} active={activeDiff}
            onToggle={f => unstage([f.path])}
            onOpen={f => loadDiff(f.path, true)}
            checked
          />
          <FileGroup
            title="Changes" files={unstaged} active={activeDiff}
            onToggle={f => stage([f.path])}
            onOpen={f => loadDiff(f.path, false)}
          />
        </div>
      )}

      {/* ── Diff önizleme ── */}
      {activeDiff && (
        <div className="rounded-lg border border-border-subtle overflow-hidden bg-bg-elevated">
          <div className="flex items-center gap-1.5 px-2 py-1 border-b border-border-subtle bg-bg-tertiary/40">
            <FileText size={11} className="text-text-muted" />
            <span className="font-mono text-2xs truncate flex-1">{activeDiff.file}</span>
            <button onClick={clearDiff} className="text-text-muted hover:text-text-primary text-2xs">close</button>
          </div>
          <DiffView text={activeDiff.text} />
        </div>
      )}

      {/* ── Commit kutusu ── */}
      <div className="flex flex-col gap-1.5 pt-1.5 border-t border-border-subtle">
        <div className="relative">
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Commit message (feat: …)"
            rows={2}
            className="w-full px-2 py-1.5 pr-7 rounded-lg bg-bg-primary border border-border-subtle text-2xs resize-none focus:outline-none focus:border-accent font-mono"
          />
          <button
            onClick={() => void onSuggest()}
            disabled={suggesting || busy}
            title="Suggest commit message (AI)"
            className="absolute top-1.5 right-1.5 p-1 rounded text-accent hover:bg-accent-subtle disabled:opacity-40"
          >
            <Sparkles size={12} className={suggesting ? 'animate-pulse' : ''} />
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => void onCommit()}
            disabled={!message.trim() || staged.length === 0 || busy}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-accent text-white text-2xs font-medium hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <GitCommit size={12} />
            Commit {staged.length > 0 && `(${staged.length})`}
          </button>
          <button
            onClick={() => void onPush(false)}
            disabled={busy}
            title="Push to remote"
            className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-bg-tertiary/60 hover:bg-bg-hover text-text-secondary text-2xs font-medium disabled:opacity-40"
          >
            <ArrowUp size={12} />
            Push{status && status.ahead > 0 ? ` (${status.ahead})` : ''}
          </button>
          <button
            onClick={() => void onOpenPR()}
            disabled={busy}
            title="Open a pull request on GitHub"
            className="flex items-center justify-center px-2 py-1.5 rounded-lg bg-bg-tertiary/60 hover:bg-bg-hover text-text-secondary disabled:opacity-40"
          >
            <GitPullRequest size={13} />
          </button>
        </div>
      </div>

      {error && <p className="text-2xs text-red-500 px-1">{error}</p>}
    </div>
  )
}

// ── Alt bileşenler ────────────────────────────────────────────────────────────

function FileGroup({
  title, files, onToggle, onOpen, active, checked,
}: {
  title: string
  files: GitFileEntry[]
  onToggle: (f: GitFileEntry) => void
  onOpen: (f: GitFileEntry) => void
  active: { file: string; staged: boolean } | null
  checked?: boolean
}) {
  if (files.length === 0) return null
  return (
    <div>
      <div className="flex items-center gap-1.5 px-1 mb-1">
        <span className="text-2xs font-semibold text-text-muted uppercase tracking-wider">{title}</span>
        <span className="text-2xs text-text-muted/70">{files.length}</span>
      </div>
      <div className="flex flex-col">
        {files.map(f => (
          <div
            key={f.path}
            className={`group flex items-center gap-1.5 px-1.5 py-1 rounded-lg cursor-pointer transition-colors ${
              active?.file === f.path ? 'bg-accent-subtle' : 'hover:bg-bg-hover'
            }`}
          >
            <button
              onClick={() => onToggle(f)}
              title={checked ? 'Unstage' : 'Stage'}
              className={`w-3.5 h-3.5 flex items-center justify-center rounded border flex-shrink-0 ${
                checked ? 'bg-accent border-accent text-white' : 'border-border text-transparent hover:border-accent'
              }`}
            >
              <Check size={10} />
            </button>
            <button onClick={() => onOpen(f)} className="flex items-center gap-1.5 min-w-0 flex-1 text-left">
              <StatusBadge entry={f} />
              <span className="font-mono text-2xs truncate">{f.path}</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusBadge({ entry }: { entry: GitFileEntry }) {
  const ch = entry.untracked ? 'U' : (entry.staged ? entry.index : entry.worktree).trim() || 'M'
  const color =
    ch === 'A' || ch === 'U' ? 'text-emerald-500'
    : ch === 'D' ? 'text-red-500'
    : ch === 'R' ? 'text-blue-500'
    : 'text-amber-500'
  return <span className={`font-mono text-2xs font-bold w-3 flex-shrink-0 ${color}`}>{ch}</span>
}

function DiffView({ text }: { text: string }) {
  const lines = useMemo(() => text.split('\n'), [text])
  if (!text.trim() || text.startsWith('Git error')) {
    return <p className="px-2 py-2 text-2xs text-text-muted italic">{text || 'No diff.'}</p>
  }
  return (
    <div className="max-h-56 overflow-auto font-mono text-2xs leading-relaxed">
      {lines.map((l, i) => {
        const isAdd = l.startsWith('+') && !l.startsWith('+++')
        const isDel = l.startsWith('-') && !l.startsWith('---')
        const isHunk = l.startsWith('@@')
        const isMeta = l.startsWith('diff ') || l.startsWith('index ') || l.startsWith('+++') || l.startsWith('---')
        return (
          <div
            key={i}
            className={`px-2 whitespace-pre-wrap break-all ${
              isAdd ? 'bg-emerald-500/10 text-emerald-500'
              : isDel ? 'bg-red-500/10 text-red-500'
              : isHunk ? 'text-accent bg-accent-subtle/40'
              : isMeta ? 'text-text-muted/60'
              : 'text-text-secondary'
            }`}
          >
            {l || ' '}
          </div>
        )
      })}
    </div>
  )
}

function Empty({ text, icon }: { text: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-6 text-text-muted">
      {icon ?? <GitBranch size={20} />}
      <p className="text-2xs text-center px-3">{text}</p>
    </div>
  )
}
