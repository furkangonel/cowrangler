import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useProjectsStore } from '../../stores/projects.store'
import { ipc } from '../../lib/ipc'

interface Props {
  projectId: string
  onClose: () => void
}

/** Proje düzenleme modalı — ad, açıklama ve talimatları günceller. */
export function EditProjectModal({ projectId, onClose }: Props) {
  const { getActiveProject, updateProject, loadInstructions, instructions } = useProjectsStore()
  const project = getActiveProject()

  const [name, setName] = useState(project?.name ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  const [instr, setInstr] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadInstructions(projectId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => {
    if (instructions[projectId] != null) setInstr(instructions[projectId])
  }, [instructions, projectId])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSave() {
    if (!name.trim()) { setError('Project name required'); return }
    setSaving(true); setError('')
    try {
      await updateProject(projectId, { name: name.trim(), description: description.trim() || null })
      await ipc.projects.setInstructions(projectId, instr.trim()).catch(() => {})
      await loadInstructions(projectId)
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Could not update project')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
      onMouseDown={onClose}
    >
      <div
        className="bg-bg-secondary border border-border rounded-2xl shadow-panel w-[480px] max-h-[90vh] overflow-auto animate-slide-up"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <h2 className="text-md font-semibold text-text-primary brand-serif">Edit project</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors rounded-lg"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <label className="text-xs text-text-secondary font-medium block mb-1.5">
              Project name <span className="text-accent">*</span>
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              autoFocus
              className="w-full px-3 py-2.5 bg-bg-tertiary border border-border rounded-xl text-sm text-text-primary placeholder-text-muted focus:border-accent transition-colors"
            />
          </div>

          <div>
            <label className="text-xs text-text-secondary font-medium block mb-1.5">
              Description <span className="text-text-muted font-normal">(optional)</span>
            </label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="Short project description"
              className="w-full px-3 py-2.5 bg-bg-tertiary border border-border rounded-xl text-sm text-text-primary placeholder-text-muted focus:border-accent transition-colors"
            />
          </div>

          <div>
            <label className="text-xs text-text-secondary font-medium block mb-1.5">
              Instructions <span className="text-text-muted font-normal">(optional)</span>
            </label>
            <textarea
              value={instr}
              onChange={e => setInstr(e.target.value)}
              placeholder="Give the agent custom instructions for this project…"
              rows={4}
              className="w-full px-3 py-2.5 bg-bg-tertiary border border-border rounded-xl text-sm text-text-primary placeholder-text-muted focus:border-accent transition-colors resize-none"
            />
          </div>

          {error && <p className="text-xs text-error">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 pb-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors rounded-xl hover:bg-bg-hover"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="px-4 py-2 text-sm font-medium text-accent-fg bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
