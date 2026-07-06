/**
 * DiffPanel — Code sağ panelinin "Files / Diff" yüzeyi (WP-4).
 *
 * Ekran görüntülerindeki `branch → working tree` görünümünü yakalar:
 *   • Başlık: `<branch> → working tree` + yenile.
 *   • Değişen dosya listesi — her satırda `+adds -dels` rozetleri (numstat).
 *   • Dosyaya tıkla → satır-numaralı birleşik (unified) diff açılır; yeşil/kırmızı.
 *
 * SALT-GÖRÜNÜM: burada Create PR / commit gibi git aksiyonu YOKTUR. Değişiklikler
 * yalnızca gösterilir; commit/push/PR kullanıcı açıkça isterse agent git_* ile yapar.
 *
 * Veri: git:status + git:diffStat (numstat) + git:diff (patch), gitStore.workdir.
 */
import React, { useEffect, useMemo, useState } from 'react'
import {
  GitBranch, RefreshCw, ChevronRight, ChevronDown,
  FileText,
} from 'lucide-react'
import { useGitStore } from '../../stores/git.store'
import { ipc, GitFileEntry, GitDiffStat } from '../../lib/ipc'

interface Row {
  file: GitFileEntry
  additions: number
  deletions: number
  binary: boolean
}

export function DiffPanel() {
  const { workdir, status, loading, refresh } = useGitStore()
  const [statMap, setStatMap] = useState<Record<string, GitDiffStat>>({})
  const [expanded, setExpanded] = useState<string | null>(null)

  // numstat (working tree + staged) yükle.
  useEffect(() => {
    if (!workdir) return
    let cancelled = false
    Promise.all([
      ipc.git.diffStat({ staged: false }, workdir),
      ipc.git.diffStat({ staged: true }, workdir),
    ])
      .then(([unstaged, staged]) => {
        if (cancelled) return
        const m: Record<string, GitDiffStat> = {}
        for (const s of [...unstaged, ...staged]) {
          const prev = m[s.path]
          m[s.path] = prev
            ? { ...s, additions: prev.additions + s.additions, deletions: prev.deletions + s.deletions }
            : s
        }
        setStatMap(m)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [workdir, status])

  const rows: Row[] = useMemo(() => {
    const files = status?.files ?? []
    return files.map((f) => {
      const st = statMap[f.path]
      return {
        file: f,
        additions: st?.additions ?? 0,
        deletions: st?.deletions ?? 0,
        binary: st?.binary ?? false,
      }
    })
  }, [status, statMap])

  if (!workdir) return <Empty text="Pick a folder in the Code tab to see changes." />
  if (status && !status.repo) return <Empty text="Not a Git repository." />

  return (
    <div className="flex flex-col h-full bg-bg-secondary">
      {/* Header: branch → working tree */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border-subtle flex-shrink-0">
        <GitBranch size={12} className="text-accent flex-shrink-0" />
        <span className="font-mono text-xs text-text-primary truncate">{status?.branch || '…'}</span>
        <ChevronRight size={11} className="text-text-muted flex-shrink-0" />
        <span className="text-xs text-text-muted">working tree</span>
        <button
          onClick={() => refresh()}
          title="Refresh"
          className="ml-auto p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* File list + inline diffs */}
      <div className="flex-1 overflow-y-auto">
        {status?.clean ? (
          <p className="px-3 py-6 text-center text-text-muted text-xs italic">Working tree clean.</p>
        ) : (
          rows.map((r) => (
            <DiffFileRow
              key={r.file.path}
              row={r}
              workdir={workdir}
              open={expanded === r.file.path}
              onToggle={() => setExpanded((e) => (e === r.file.path ? null : r.file.path))}
            />
          ))
        )}
      </div>
    </div>
  )
}

/* ── Tek dosya satırı + açılır diff ───────────────────────────────────────── */
function DiffFileRow({
  row, workdir, open, onToggle,
}: { row: Row; workdir: string; open: boolean; onToggle: () => void }) {
  const { file, additions, deletions, binary } = row
  const [patch, setPatch] = useState<string | null>(null)
  const [loadingPatch, setLoadingPatch] = useState(false)

  useEffect(() => {
    if (open && patch === null && !binary) {
      setLoadingPatch(true)
      ipc.git.diff({ file: file.path, staged: file.staged }, workdir)
        .then((t) => setPatch(t))
        .catch(() => setPatch('Git error.'))
        .finally(() => setLoadingPatch(false))
    }
  }, [open, patch, binary, file.path, file.staged, workdir])

  return (
    <div className="border-b border-border-subtle/40">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-bg-hover/50 transition-colors text-left"
      >
        {open ? <ChevronDown size={12} className="text-text-muted flex-shrink-0" />
              : <ChevronRight size={12} className="text-text-muted flex-shrink-0" />}
        <FileText size={11} className="text-text-muted flex-shrink-0" />
        <span className="font-mono text-xs text-text-primary truncate flex-1">{file.path}</span>
        {binary ? (
          <span className="text-[10px] text-text-muted">binary</span>
        ) : (
          <span className="flex items-center gap-1.5 text-[11px] font-mono flex-shrink-0">
            {additions > 0 && <span className="text-emerald-500">+{additions}</span>}
            {deletions > 0 && <span className="text-red-500">-{deletions}</span>}
          </span>
        )}
      </button>
      {open && (
        binary ? (
          <div className="px-3 py-2 text-[11px] text-text-muted italic">Binary file — no text diff.</div>
        ) : loadingPatch ? (
          <div className="px-3 py-2 text-[11px] text-text-muted italic">Loading diff…</div>
        ) : (
          <UnifiedDiff text={patch ?? ''} />
        )
      )}
    </div>
  )
}

/* ── Satır-numaralı unified diff ──────────────────────────────────────────── */
interface DiffLine { old: number | null; neu: number | null; sign: ' ' | '+' | '-' | '@'; text: string }

function parseUnified(text: string): DiffLine[] {
  const out: DiffLine[] = []
  let oldLn = 0
  let newLn = 0
  for (const raw of text.split('\n')) {
    if (raw.startsWith('diff ') || raw.startsWith('index ') ||
        raw.startsWith('--- ') || raw.startsWith('+++ ') ||
        raw.startsWith('new file') || raw.startsWith('deleted file') ||
        raw.startsWith('similarity ') || raw.startsWith('rename ')) {
      continue
    }
    if (raw.startsWith('@@')) {
      const m = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (m) { oldLn = parseInt(m[1], 10); newLn = parseInt(m[2], 10) }
      out.push({ old: null, neu: null, sign: '@', text: raw })
      continue
    }
    if (raw.startsWith('+')) {
      out.push({ old: null, neu: newLn, sign: '+', text: raw.slice(1) }); newLn++
    } else if (raw.startsWith('-')) {
      out.push({ old: oldLn, neu: null, sign: '-', text: raw.slice(1) }); oldLn++
    } else {
      // context (leading space) veya boş
      out.push({ old: oldLn, neu: newLn, sign: ' ', text: raw.startsWith(' ') ? raw.slice(1) : raw })
      oldLn++; newLn++
    }
  }
  return out
}

function UnifiedDiff({ text }: { text: string }) {
  const lines = useMemo(() => parseUnified(text), [text])
  if (!text.trim() || text.startsWith('Git error')) {
    return <div className="px-3 py-2 text-[11px] text-text-muted italic">{text || 'No diff.'}</div>
  }
  return (
    <div className="overflow-x-auto bg-bg-primary font-mono text-[11px] leading-[1.5]">
      {lines.map((l, i) => {
        const bg = l.sign === '+' ? 'bg-emerald-500/10' : l.sign === '-' ? 'bg-red-500/10'
          : l.sign === '@' ? 'bg-accent-subtle/30' : ''
        const fg = l.sign === '+' ? 'text-emerald-400' : l.sign === '-' ? 'text-red-400'
          : l.sign === '@' ? 'text-accent' : 'text-text-secondary'
        return (
          <div key={i} className={`flex ${bg}`}>
            <span className="w-9 flex-shrink-0 text-right pr-1.5 text-text-muted/50 select-none tabular-nums">
              {l.old ?? ''}
            </span>
            <span className="w-9 flex-shrink-0 text-right pr-1.5 text-text-muted/50 select-none tabular-nums border-r border-border-subtle/40">
              {l.neu ?? ''}
            </span>
            <span className={`flex-1 pl-2 whitespace-pre ${fg}`}>
              {l.sign === '@' ? l.text : `${l.sign === ' ' ? ' ' : l.sign}${l.text}` || ' '}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-text-muted h-full">
      <GitBranch size={20} />
      <p className="text-xs text-center px-4">{text}</p>
    </div>
  )
}
