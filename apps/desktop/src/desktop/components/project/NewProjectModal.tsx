import React, { useState } from 'react'
import { X, FolderOpen, Plus, Trash2 } from 'lucide-react'
import { useProjectsStore } from '../../stores/projects.store'
import { useSessionsStore } from '../../stores/sessions.store'
import { useUIStore } from '../../stores/ui.store'
import { ipc } from '../../lib/ipc'

export function NewProjectModal() {
  const { createProject, setActiveProject, loadFolders } = useProjectsStore()
  const { setActiveSession } = useSessionsStore()
  const { setNewProjectModal } = useUIStore()

  const [name, setName] = useState('')
  const [instructions, setInstructions] = useState('')
  const [folders, setFolders] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  async function pickFolder() {
    const path = await ipc.fs.pickFolder()
    if (!path) return
    if (!folders.includes(path)) setFolders(prev => [...prev, path])
    if (!name) setName(path.split('/').pop() || path.split('\\').pop() || '')
  }

  function removeFolder(path: string) {
    setFolders(prev => prev.filter(f => f !== path))
  }

  async function handleCreate() {
    if (!name.trim()) { setError('Project name required'); return }
    setCreating(true); setError('')
    try {
      const project = await createProject({
        name: name.trim(),
        workdir: folders[0] || undefined,
        icon: '📁',
      })
      // Add all selected folders
      for (const folder of folders) {
        await ipc.projects.addFolder(project.id, folder)
      }
      if (folders.length > 0) await loadFolders(project.id)
      // Save instructions if provided
      if (instructions.trim()) {
        await ipc.projects.setInstructions(project.id, instructions.trim()).catch(() => {})
      }
      setActiveProject(project.id)
      setActiveSession(null)
      setNewProjectModal(false)
    } catch (e: any) {
      setError(e.message || 'Could not create project')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
      onMouseDown={() => setNewProjectModal(false)}
    >
      <div
        className="bg-bg-secondary border border-border rounded-2xl shadow-panel w-[480px] max-h-[90vh] overflow-auto animate-slide-up"
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <h2 className="text-md font-semibold text-text-primary brand-serif">New project</h2>
          <button
            onClick={() => setNewProjectModal(false)}
            className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors rounded-lg"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Name */}
          <div>
            <label className="text-xs text-text-secondary font-medium block mb-1.5">
              Project name <span className="text-accent">*</span>
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="e.g. Marketing site"
              autoFocus
              className="w-full px-3 py-2.5 bg-bg-tertiary border border-border rounded-xl text-sm text-text-primary placeholder-text-muted focus:border-accent transition-colors"
            />
          </div>

          {/* Instructions */}
          <div>
            <label className="text-xs text-text-secondary font-medium block mb-1.5">
              Instructions <span className="text-text-muted font-normal">(optional)</span>
            </label>
            <textarea
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              placeholder="Give the agent custom instructions for this project…"
              rows={3}
              className="w-full px-3 py-2.5 bg-bg-tertiary border border-border rounded-xl text-sm text-text-primary placeholder-text-muted focus:border-accent transition-colors resize-none"
            />
          </div>

          {/* Folders */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-text-secondary font-medium">
                Folders <span className="text-text-muted font-normal">(optional)</span>
              </label>
              <button
                onClick={pickFolder}
                className="flex items-center gap-1 text-2xs text-text-muted hover:text-accent transition-colors"
              >
                <Plus size={11} /> Add folder
              </button>
            </div>

            {folders.length === 0 ? (
              <button
                onClick={pickFolder}
                className="w-full flex items-center justify-center gap-2 px-3 py-3 border border-dashed border-border rounded-xl text-xs text-text-muted hover:border-accent/50 hover:text-text-secondary hover:bg-bg-hover/50 transition-colors"
              >
                <FolderOpen size={14} /> Select folder
              </button>
            ) : (
              <div className="space-y-1.5">
                {folders.map(path => (
                  <div
                    key={path}
                    className="flex items-center gap-2 px-3 py-2 bg-bg-tertiary border border-border rounded-xl group"
                  >
                    <FolderOpen size={13} className="text-text-muted flex-shrink-0" />
                    <span className="text-2xs text-text-secondary truncate flex-1 font-mono">{path}</span>
                    <button
                      onClick={() => removeFolder(path)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-text-muted hover:text-error transition-all"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={pickFolder}
                  className="flex items-center gap-1.5 text-2xs text-text-muted hover:text-text-secondary transition-colors mt-1"
                >
                  <Plus size={11} /> Add another folder
                </button>
              </div>
            )}
          </div>

          {error && <p className="text-xs text-error">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button
            onClick={() => setNewProjectModal(false)}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors rounded-xl hover:bg-bg-hover"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || creating}
            className="px-4 py-2 text-sm font-medium text-accent-fg bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors"
          >
            {creating ? 'Creating…' : 'Create project'}
          </button>
        </div>
      </div>
    </div>
  )
}
