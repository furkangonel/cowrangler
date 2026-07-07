import React, { useEffect, useMemo, useState } from 'react'
import {
  GitBranch, Plus, RefreshCw, FileText,
  ChevronDown, AlertTriangle, GitPullRequest, History, Clock,
  User,
} from 'lucide-react'
import { useGitStore } from '../../stores/git.store'
import { useUIStore } from '../../stores/ui.store'
import { ipc, GitFileEntry } from '../../lib/ipc'

/**
 * GitPanel — Desktop git (Code sekmesine özel), SALT-GÖRÜNÜM + agent-driven PR.
 *
 * WP-B2: Claude Desktop Code parity. Elle commit kutusu / stage checkbox / push
 * butonu YOK — bunlar agent'ın işi. Panel working-tree'yi gösterir (değişen
 * dosyalar → tıkla→diff, commit geçmişi, branch geçişi) ve "Create PR ▾"
 * agent'a talimat verir (stage+commit+push+PR). Manuel yol tarayıcıda compare
 * sayfasını açar.
 */
export function GitPanel() {
  const {
    workdir,
    status, branches, activeDiff, loading, error,
    refresh, loadDiff, clearDiff, createBranch, checkout,
  } = useGitStore()
  const requestCodePrompt = useUIStore(s => s.requestCodePrompt)

  const [branchOpen, setBranchOpen] = useState(false)
  const [newBranch, setNewBranch] = useState('')
  const [actionErr, setActionErr] = useState<string | null>(null)
  const [showLog, setShowLog] = useState(false)
  const [prMenuOpen, setPrMenuOpen] = useState(false)
  const [logEntries, setLogEntries] = useState<Array<{ hash: string; author: string; relative: string; subject: string }>>([])
  const [logLoading, setLogLoading] = useState(false)

  const staged = useMemo(() => (status?.files ?? []).filter(f => f.staged), [status])
  const unstaged = useMemo(() => (status?.files ?? []).filter(f => f.unstaged), [status])

  const needsSetUpstream = !status?.upstream

  useEffect(() => {
    if (showLog && workdir) {
      setLogLoading(true)
      ipc.git.log({ limit: 10 }, workdir)
        .then(entries => { setLogEntries(entries ?? []); setLogLoading(false) })
        .catch(() => setLogLoading(false))
    }
  }, [showLog, workdir, status])

  if (!workdir) {
    return <Empty text="Pick a folder in the Code tab to use Git." />
  }
  if (status && !status.repo) {
    return <Empty text="Not a Git repository." icon={<GitBranch size={20} />} />
  }

  // WP-B2: PR = agent'a talimat (elle commit/push yok). CodeSessionView'deki
  // köprü effect'i bu prompt'u handleSend'e verir.
  function createPR(kind: 'pr' | 'draft' = 'pr') {
    const draft = kind === 'draft' ? ' Open it as a draft PR.' : ''
    requestCodePrompt(
      `Stage all changes, commit them with a clear conventional-commit message, ` +
      `push the current branch (set upstream if needed), then open a GitHub pull request ` +
      `using the git_open_pr tool with a concise title and a body summarizing what changed.${draft}`,
    )
  }

  async function createPRManually() {
    setActionErr(null)
    const url = await ipc.git.prUrl(workdir!)
    if (!url) { setActionErr('No GitHub remote — cannot open a PR.'); return }
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
          {needsSetUpstream && (
            <span className="text-[9px] text-amber-500/80 border border-amber-500/30 rounded px-1">no upstream</span>
          )}
          <ChevronDown size={10} className={`text-text-muted transition-transform ${branchOpen ? 'rotate-180' : ''}`} />
        </button>
        {status && (status.ahead > 0 || status.behind > 0) && (
          <span className="text-2xs text-text-muted">
            {status.ahead > 0 && `↑${status.ahead}`} {status.behind > 0 && `↓${status.behind}`}
          </span>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <button
            onClick={() => setShowLog(o => !o)}
            title="Commit history"
            className={`p-1 rounded hover:bg-bg-hover transition-colors ${showLog ? 'text-accent' : 'text-text-muted hover:text-text-primary'}`}
          >
            <History size={12} />
          </button>
          <button
            onClick={() => refresh()}
            title="Refresh"
            className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

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

      {/* ── Commit log ── */}
      {showLog && (
        <div className="rounded-lg border border-border-subtle overflow-hidden bg-bg-elevated">
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border-subtle bg-bg-tertiary/40">
            <History size={11} className="text-text-muted" />
            <span className="text-2xs font-semibold text-text-muted uppercase tracking-wider">Recent commits</span>
          </div>
          {logLoading ? (
            <p className="px-2 py-2 text-2xs text-text-muted italic">Loading…</p>
          ) : logEntries.length === 0 ? (
            <p className="px-2 py-2 text-2xs text-text-muted italic">No commits yet.</p>
          ) : (
            <div className="max-h-48 overflow-y-auto divide-y divide-border-subtle/40">
              {logEntries.map(e => (
                <div key={e.hash} className="px-2 py-1.5 flex flex-col gap-0.5 hover:bg-bg-hover/40 transition-colors">
                  <span className="text-2xs text-text-primary leading-snug truncate">{e.subject}</span>
                  <div className="flex items-center gap-2 text-[9px] text-text-muted">
                    <span className="font-mono text-accent/70">{e.hash}</span>
                    <span className="flex items-center gap-0.5"><User size={8} />{e.author}</span>
                    <span className="flex items-center gap-0.5 ml-auto"><Clock size={8} />{e.relative}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Working tree (salt-görünüm: tıkla→diff) ── */}
      {status?.clean ? (
        <p className="px-2 py-3 text-center text-text-muted text-2xs italic">Working tree clean.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <FileGroup title="Staged" files={staged} active={activeDiff} onOpen={f => loadDiff(f.path, true)} />
          <FileGroup title="Changes" files={unstaged} active={activeDiff} onOpen={f => loadDiff(f.path, false)} />
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

      {/* ── Create PR (agent-driven) ── */}
      <div className="relative pt-1.5 border-t border-border-subtle">
        <button
          onClick={() => setPrMenuOpen(o => !o)}
          disabled={status?.clean && status?.ahead === 0}
          title="Create a Pull Request — the agent stages, commits, pushes & opens it"
          className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-accent text-white text-2xs font-medium hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <GitPullRequest size={12} />
          Create PR
          <ChevronDown size={11} className={`opacity-80 transition-transform ${prMenuOpen ? 'rotate-180' : ''}`} />
        </button>
        {prMenuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setPrMenuOpen(false)} />
            <div className="absolute bottom-full left-0 right-0 mb-1.5 z-50 bg-bg-secondary border border-border rounded-xl shadow-pop p-1 animate-slide-up">
              <PrMenuItem label="Create PR" hint="Agent commits, pushes & opens"
                onClick={() => { setPrMenuOpen(false); createPR('pr') }} />
              <PrMenuItem label="Create draft PR" hint="Same, opened as draft"
                onClick={() => { setPrMenuOpen(false); createPR('draft') }} />
              <PrMenuItem label="Manually create…" hint="Open compare page in browser"
                onClick={() => { setPrMenuOpen(false); void createPRManually() }} />
            </div>
          </>
        )}
      </div>

      {error && <p className="text-2xs text-red-500 px-1">{error}</p>}
    </div>
  )
}

// ── Alt bileşenler ────────────────────────────────────────────────────────────

function PrMenuItem({ label, hint, onClick }: { label: string; hint: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex flex-col items-start gap-0.5 px-2.5 py-1.5 rounded-lg text-left hover:bg-bg-hover transition-colors"
    >
      <span className="text-2xs font-medium text-text-primary">{label}</span>
      <span className="text-[9px] text-text-muted">{hint}</span>
    </button>
  )
}

function FileGroup({
  title, files, onOpen, active,
}: {
  title: string
  files: GitFileEntry[]
  onOpen: (f: GitFileEntry) => void
  active: { file: string; staged: boolean } | null
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
          <button
            key={f.path}
            onClick={() => onOpen(f)}
            className={`group flex items-center gap-1.5 px-1.5 py-1 rounded-lg cursor-pointer text-left transition-colors ${
              active?.file === f.path ? 'bg-accent-subtle' : 'hover:bg-bg-hover'
            }`}
          >
            <StatusBadge entry={f} />
            <span className="font-mono text-2xs truncate">{f.path}</span>
          </button>
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
