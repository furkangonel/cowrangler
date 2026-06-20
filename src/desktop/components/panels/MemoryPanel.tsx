import React, { useEffect, useState } from 'react'
import { Edit2, Save, X, RefreshCw } from 'lucide-react'
import { ipc } from '../../lib/ipc'

interface Props { projectId: string | null }

export function MemoryPanel({ projectId }: Props) {
  const [content, setContent] = useState('')
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState<'global' | 'project'>('global')

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

  useEffect(() => {
    load()
    setEditing(false)
  }, [projectId, mode])

  async function save() {
    setSaving(true)
    try {
      if (mode === 'global') {
        await ipc.memory.writeGlobal(draft)
      } else if (projectId) {
        await ipc.memory.writeProject(projectId, draft)
      }
      setContent(draft)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-text-primary">Memory</h3>
        <div className="flex items-center gap-1">
          <button onClick={load} className="p-1 text-text-muted hover:text-text-secondary transition-colors rounded" title="Yenile">
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
          {!editing ? (
            <button onClick={() => { setDraft(content); setEditing(true) }}
              className="p-1 text-text-muted hover:text-accent transition-colors rounded" title="Edit">
              <Edit2 size={12} />
            </button>
          ) : (
            <>
              <button onClick={() => setEditing(false)} className="p-1 text-text-muted hover:text-text-secondary transition-colors rounded">
                <X size={12} />
              </button>
              <button onClick={save} disabled={saving} className="p-1 text-accent hover:text-accent-hover transition-colors rounded">
                <Save size={12} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 mb-3">
        {(['global', 'project'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            disabled={m === 'project' && !projectId}
            className={`px-2 py-1 rounded text-2xs font-medium transition-colors disabled:opacity-40 ${
              mode === m ? 'bg-accent/20 text-accent' : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover'
            }`}
          >
            {m === 'global' ? 'Global' : 'Proje'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-xs text-text-muted">Loading...</div>
      ) : editing ? (
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          className="w-full min-h-[200px] bg-bg-tertiary border border-border rounded-lg p-3 text-xs text-text-primary placeholder-text-muted resize-none focus:border-accent transition-colors selectable font-mono"
          placeholder="The agent reads and references these memory notes..."
        />
      ) : content ? (
        <div className="text-xs text-text-secondary selectable whitespace-pre-wrap leading-relaxed font-mono">
          {content}
        </div>
      ) : (
        <div className="text-center py-4">
          <span className="text-2xl opacity-40">🧠</span>
          <p className="text-xs text-text-muted mt-2">Memory is empty.</p>
          <p className="text-2xs text-text-muted mt-1">
            Appears here when the agent calls manage_memory.
          </p>
        </div>
      )}
    </div>
  )
}
