import React, { useEffect, useMemo, useState } from 'react'
import { Folder, FolderPlus, X } from 'lucide-react'
import { useProjectsStore } from '../../stores/projects.store'
import { ipc } from '../../lib/ipc'

interface Props {
  projectId: string
  onClose: () => void
}

export function EditProjectModal({ projectId, onClose }: Props) {
  const {
    projects, folders, loadFolders, addFolder, removeFolder,
    updateProject, deleteProject,
  } = useProjectsStore()
  const project = useMemo(() => projects.find((item) => item.id === projectId), [projects, projectId])
  const sourceFolders = folders[projectId] ?? []
  const [name, setName] = useState(project?.name ?? '')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { void loadFolders(projectId) }, [loadFolders, projectId])
  useEffect(() => { if (project) setName(project.name) }, [project])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function pickFolder() {
    const folderPath = await ipc.fs.pickFolder()
    if (!folderPath) return
    await addFolder(projectId, folderPath)
  }

  async function handleSave() {
    if (!name.trim()) { setError('Enter a project name.'); return }
    if (sourceFolders.length === 0) { setError('Add at least one source folder.'); return }
    setSaving(true)
    setError('')
    try {
      const primary = sourceFolders[0]?.folder_path ?? project?.workdir ?? null
      await updateProject(projectId, { name: name.trim(), workdir: primary })
      onClose()
    } catch (cause: any) {
      setError(cause?.message || 'Could not save project changes.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    if (!project) return
    const confirmed = window.confirm(
      `Remove “${project.name}” from Cowrangler?\n\nLocal chat history and agent support data will be removed. Your source folders and files will not be deleted.`,
    )
    if (!confirmed) return
    setRemoving(true)
    try {
      await deleteProject(projectId)
      onClose()
    } catch (cause: any) {
      setError(cause?.message || 'Could not remove project.')
      setRemoving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 backdrop-blur-sm animate-fade-in" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-project-title"
        className="project-editor-modal w-[640px] max-w-[94vw] overflow-hidden rounded-[28px] border border-border bg-bg-secondary shadow-panel animate-slide-up"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-7 pt-7 pb-5">
          <h2 id="edit-project-title" className="text-[24px] font-semibold tracking-tight text-text-primary">Edit project</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary">
            <X size={19} />
          </button>
        </div>

        <div className="px-7 pb-7">
          <div className="flex h-[66px] overflow-hidden rounded-2xl border border-border bg-bg-tertiary focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/30">
            <div className="flex w-[60px] items-center justify-center border-r border-border text-text-secondary"><Folder size={22} /></div>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void handleSave() }}
              aria-label="Project name"
              className="min-w-0 flex-1 bg-transparent px-4 text-lg text-text-primary outline-none placeholder:text-text-muted"
            />
          </div>

          <h3 className="mb-3 mt-6 text-[15px] font-medium text-text-primary">Source folders</h3>
          <div className="overflow-hidden rounded-2xl border border-border bg-bg-tertiary/70">
            {sourceFolders.map((folder, index) => (
              <div key={folder.id} className="flex min-h-[58px] items-center gap-3 border-b border-border-subtle px-5 last:border-b-0">
                <Folder size={19} className="shrink-0 text-text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">{folder.folder_path.split(/[\\/]/).filter(Boolean).pop()}</p>
                  <p className="truncate text-[10px] text-text-muted">{folder.folder_path}{index === 0 ? ' · Primary' : ''}</p>
                </div>
                <button
                  onClick={() => void removeFolder(projectId, folder.folder_path)}
                  aria-label={`Remove ${folder.folder_path}`}
                  className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-hover hover:text-error"
                ><X size={17} /></button>
              </div>
            ))}
            <button onClick={() => void pickFolder()} className="flex min-h-[58px] w-full items-center gap-3 px-5 text-left text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary">
              <FolderPlus size={19} className="text-text-muted" /> Add folder
            </button>
          </div>

          {error && <p className="mt-3 text-xs text-error" role="alert">{error}</p>}

          <div className="mt-7 flex items-center">
            <button
              onClick={() => void handleRemove()}
              disabled={removing}
              className="rounded-xl bg-error/12 px-4 py-2.5 text-sm font-medium text-error transition-colors hover:bg-error/18 disabled:opacity-50"
            >{removing ? 'Removing…' : 'Remove project'}</button>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-medium text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary">Cancel</button>
              <button
                onClick={() => void handleSave()}
                disabled={saving || !name.trim() || sourceFolders.length === 0}
                className="rounded-xl bg-text-primary px-5 py-2.5 text-sm font-semibold text-bg-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
              >{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
