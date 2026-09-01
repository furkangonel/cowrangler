import React, { useEffect, useMemo, useState } from 'react'
import { Check, Folder, FolderPlus, Star, X } from 'lucide-react'
import { useProjectsStore } from '../../stores/projects.store'
import { ipc } from '../../lib/ipc'

interface Props {
  projectId: string
  onClose: () => void
}

export function EditProjectModal({ projectId, onClose }: Props) {
  const {
    projects, folders, loadFolders, addFolder, removeFolder,
    setPrimaryFolder, updateProject, deleteProject,
  } = useProjectsStore()
  const project = useMemo(() => projects.find((item) => item.id === projectId), [projects, projectId])
  const sourceFolders = folders[projectId] ?? []
  const [name, setName] = useState(project?.name ?? '')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState('')
  const [primaryPath, setPrimaryPath] = useState(project?.workdir ?? '')

  useEffect(() => { void loadFolders(projectId) }, [loadFolders, projectId])
  useEffect(() => { if (project) setName(project.name) }, [project])
  useEffect(() => {
    const persisted = sourceFolders.find(folder => folder.is_primary)?.folder_path
    const next = persisted ?? project?.workdir ?? sourceFolders[0]?.folder_path ?? ''
    if (!sourceFolders.some(folder => folder.folder_path === primaryPath)) setPrimaryPath(next)
  }, [sourceFolders, project?.workdir, primaryPath])
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
      if (!primaryPath) throw new Error('Choose a primary folder.')
      await setPrimaryFolder(projectId, primaryPath)
      await updateProject(projectId, { name: name.trim() })
      onClose()
    } catch (cause: any) {
      setError(cause?.message || 'Could not save project changes.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemoveFolder(folderPath: string) {
    if (sourceFolders.length <= 1) { setError('A project must keep one primary folder.'); return }
    const wasPrimary = folderPath === primaryPath
    await removeFolder(projectId, folderPath)
    if (wasPrimary) setPrimaryPath(sourceFolders.find(folder => folder.folder_path !== folderPath)?.folder_path ?? '')
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
            {sourceFolders.map((folder) => {
              const primary = folder.folder_path === primaryPath
              return (
              <div key={folder.id} className={`group flex min-h-[62px] items-center gap-3 border-b border-border-subtle px-4 last:border-b-0 ${primary ? 'bg-accent/[0.045]' : ''}`}>
                <button type="button" onClick={() => setPrimaryPath(folder.folder_path)} aria-label={`Use ${folder.folder_path} as primary folder`} aria-pressed={primary} className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl border transition-colors ${primary ? 'border-accent/45 bg-accent/12 text-accent' : 'border-border text-text-muted hover:border-accent/30 hover:text-text-primary'}`}>
                  {primary ? <Check size={15} strokeWidth={2.5} /> : <Folder size={16} />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">{folder.folder_path.split(/[\\/]/).filter(Boolean).pop()}</p>
                  <p className="truncate text-[10px] text-text-muted">{folder.folder_path}</p>
                </div>
                {primary && <span className="flex items-center gap-1 rounded-full border border-accent/20 bg-accent/10 px-2 py-1 text-[10px] font-semibold text-accent"><Star size={10} fill="currentColor" /> Primary</span>}
                <button
                  onClick={() => void handleRemoveFolder(folder.folder_path)}
                  aria-label={`Remove ${folder.folder_path}`}
                  disabled={sourceFolders.length <= 1}
                  className="rounded-lg p-1.5 text-text-muted opacity-0 transition-all hover:bg-bg-hover hover:text-error group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-20"
                ><X size={17} /></button>
              </div>
            )})}
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
                disabled={saving || !name.trim() || sourceFolders.length === 0 || !primaryPath}
                className="rounded-xl bg-text-primary px-5 py-2.5 text-sm font-semibold text-bg-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
              >{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
