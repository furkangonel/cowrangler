import React, { useEffect, useState } from 'react'
import { Edit2, Save, X } from 'lucide-react'
import { useProjectsStore } from '../../stores/projects.store'

interface Props { projectId: string | null }

export function InstructionsPanel({ projectId }: Props) {
  const { instructions, loadInstructions, setInstructions } = useProjectsStore()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const content = projectId ? (instructions[projectId] ?? '') : ''

  useEffect(() => {
    if (projectId) loadInstructions(projectId)
  }, [projectId])

  useEffect(() => {
    setDraft(content)
    setEditing(false)
  }, [projectId])

  async function save() {
    if (!projectId) return
    setSaving(true)
    await setInstructions(projectId, draft)
    setSaving(false)
    setEditing(false)
  }

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-text-primary">Instructions</h3>
        {!editing ? (
          <button
            onClick={() => { setDraft(content); setEditing(true) }}
            disabled={!projectId}
            className="p-1 text-text-muted hover:text-accent transition-colors rounded disabled:opacity-40"
            title="Edit"
          >
            <Edit2 size={12} />
          </button>
        ) : (
          <div className="flex gap-1">
            <button
              onClick={() => setEditing(false)}
              className="p-1 text-text-muted hover:text-text-secondary transition-colors rounded"
              title="Cancel"
            >
              <X size={12} />
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="p-1 text-accent hover:text-accent-hover transition-colors rounded"
              title="Save"
            >
              <Save size={12} />
            </button>
          </div>
        )}
      </div>

      {!projectId ? (
        <p className="text-xs text-text-muted italic">Select a project.</p>
      ) : editing ? (
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          className="w-full min-h-[200px] bg-bg-tertiary border border-border rounded-lg p-3 text-xs text-text-primary placeholder-text-muted resize-none focus:border-accent transition-colors selectable"
          placeholder="Describe how you want the agent to behave.

e.g. Always respond in English. Use TypeScript when writing code. Follow Conventional Commits for commit messages."
        />
      ) : content ? (
        <div className="text-xs text-text-secondary selectable whitespace-pre-wrap leading-relaxed">
          {content}
        </div>
      ) : (
        <div className="flex flex-col gap-2 text-center py-4">
          <span className="text-2xl opacity-40">📝</span>
          <p className="text-xs text-text-muted italic">
            Add rules, tone, or formats to shape agent behavior.
          </p>
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-accent hover:text-accent-hover transition-colors"
          >
            + Add instructions
          </button>
        </div>
      )}
    </div>
  )
}
