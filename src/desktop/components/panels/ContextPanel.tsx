import React, { useEffect, useState } from 'react'
import { Brain, BookOpen, RefreshCw, Edit2, Save, X, ChevronDown, ChevronRight } from 'lucide-react'
import { ipc } from '../../lib/ipc'

interface Props { projectId: string | null }

export function ContextPanel({ projectId }: Props) {
  return (
    <div className="p-4 space-y-5">
      <MemorySection projectId={projectId} />
      <SkillsSection />
    </div>
  )
}

// ─── Memory ──────────────────────────────────────────────────────────────────

function MemorySection({ projectId }: { projectId: string | null }) {
  const [content, setContent] = useState('')
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(true)
  const [mode, setMode] = useState<'project' | 'global'>('project')

  async function load() {
    setLoading(true)
    try {
      const text = mode === 'global'
        ? await ipc.memory.readGlobal()
        : projectId ? await ipc.memory.readProject(projectId) : ''
      setContent(text)
      setDraft(text)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(); setEditing(false) }, [projectId, mode])

  async function save() {
    setSaving(true)
    try {
      if (mode === 'global') await ipc.memory.writeGlobal(draft)
      else if (projectId) await ipc.memory.writeProject(projectId, draft)
      setContent(draft)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-2 mb-2">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1.5 flex-1 min-w-0">
          {open ? <ChevronDown size={11} className="text-text-muted flex-shrink-0" /> : <ChevronRight size={11} className="text-text-muted flex-shrink-0" />}
          <Brain size={12} className="text-text-muted flex-shrink-0" />
          <span className="text-2xs font-semibold text-text-muted uppercase tracking-wide">Memory</span>
        </button>
        <div className="flex items-center gap-0.5">
          <button onClick={load} className="p-0.5 text-text-muted hover:text-text-secondary transition-colors rounded">
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
          </button>
          {!editing ? (
            <button onClick={() => { setDraft(content); setEditing(true); setOpen(true) }}
              className="p-0.5 text-text-muted hover:text-accent transition-colors rounded">
              <Edit2 size={10} />
            </button>
          ) : (
            <>
              <button onClick={() => setEditing(false)} className="p-0.5 text-text-muted rounded"><X size={10} /></button>
              <button onClick={save} disabled={saving} className="p-0.5 text-accent rounded"><Save size={10} /></button>
            </>
          )}
        </div>
      </div>

      {open && (
        <>
          {/* Mode toggle */}
          <div className="flex gap-1 mb-2">
            {(['project', 'global'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                disabled={m === 'project' && !projectId}
                className={`px-2 py-0.5 rounded text-2xs font-medium transition-colors disabled:opacity-40 ${
                  mode === m ? 'bg-accent/20 text-accent' : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover'
                }`}
              >
                {m === 'global' ? 'Global' : 'Project'}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-2xs text-text-muted">Loading…</p>
          ) : editing ? (
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={6}
              className="w-full bg-bg-tertiary border border-border rounded-lg p-2.5 text-2xs text-text-primary placeholder-text-muted resize-none focus:border-accent transition-colors font-mono"
              placeholder="The agent references these notes…"
            />
          ) : content ? (
            <div className="text-2xs text-text-secondary whitespace-pre-wrap leading-relaxed font-mono bg-bg-tertiary/50 rounded-lg p-2.5 max-h-40 overflow-y-auto selectable">
              {content}
            </div>
          ) : (
            <p className="text-2xs text-text-muted italic">
              Appears here when the agent calls <code className="font-mono text-accent/80">manage_memory</code>.
            </p>
          )}
        </>
      )}
    </div>
  )
}

// ─── Skills ──────────────────────────────────────────────────────────────────

function SkillsSection() {
  const [open, setOpen] = useState(true)

  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1.5 mb-2 w-full">
        {open ? <ChevronDown size={11} className="text-text-muted" /> : <ChevronRight size={11} className="text-text-muted" />}
        <BookOpen size={12} className="text-text-muted" />
        <span className="text-2xs font-semibold text-text-muted uppercase tracking-wide">Skills</span>
      </button>

      {open && (
        <p className="text-2xs text-text-muted leading-relaxed">
          Skills invoked via slash command are copied into this session's context.
          To manage all skills,{' '}
          <span className="text-accent font-medium">Settings → Skills</span>.
        </p>
      )}
    </div>
  )
}
