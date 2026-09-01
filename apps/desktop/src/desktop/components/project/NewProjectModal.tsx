import React, { useEffect, useState } from 'react'
import { Check, Folder, FolderOpen, Plus, Star, X } from 'lucide-react'
import { useProjectsStore } from '../../stores/projects.store'
import { useUIStore } from '../../stores/ui.store'
import { ipc } from '../../lib/ipc'

export function NewProjectModal() {
  const { createProject, setActiveProject } = useProjectsStore()
  const { setNewProjectModal, setActiveCodeSession } = useUIStore()
  const [name, setName] = useState('')
  const [folders, setFolders] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [primaryPath, setPrimaryPath] = useState('')

  const close = () => setNewProjectModal(false)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function pickFolder() {
    const folderPath = await ipc.fs.pickFolder()
    if (!folderPath || folders.includes(folderPath)) return
    setFolders((current) => [...current, folderPath])
    if (!primaryPath) setPrimaryPath(folderPath)
    if (!name.trim()) setName(folderPath.split(/[\\/]/).filter(Boolean).pop() ?? '')
  }

  async function handleCreate() {
    if (!name.trim()) { setError('Enter a project name.'); return }
    if (folders.length === 0) { setError('Choose a local source folder.'); return }
    setCreating(true)
    setError('')
    try {
      const ordered = [primaryPath, ...folders.filter(folder => folder !== primaryPath)]
      const project = await createProject({ name: name.trim(), workdir: ordered[0], icon: '📁' })
      for (const folderPath of ordered.slice(1)) await ipc.projects.addFolder(project.id, folderPath)
      setActiveProject(project.id)
      setActiveCodeSession(null)
      close()
    } catch (cause: any) {
      setError(cause?.message || 'Could not add the project.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 backdrop-blur-sm animate-fade-in" onMouseDown={close}>
      <div className="w-[580px] max-w-[94vw] overflow-hidden rounded-[28px] border border-border bg-bg-secondary shadow-panel animate-slide-up" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between px-7 pt-7 pb-5">
          <div><h2 className="text-[24px] font-semibold tracking-tight text-text-primary">Add project</h2><p className="mt-1 text-xs text-text-muted">Projects stay on this machine. Cowrangler never uploads your source folder.</p></div>
          <button onClick={close} aria-label="Close" className="rounded-lg p-1.5 text-text-muted hover:bg-bg-hover hover:text-text-primary"><X size={19} /></button>
        </div>

        <div className="px-7 pb-7">
          <div className="flex h-[60px] overflow-hidden rounded-2xl border border-border bg-bg-tertiary focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/30">
            <div className="flex w-[56px] items-center justify-center border-r border-border text-text-secondary"><Folder size={20} /></div>
            <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Project name" className="min-w-0 flex-1 bg-transparent px-4 text-base text-text-primary outline-none" />
          </div>

          <h3 className="mb-3 mt-6 text-sm font-medium text-text-primary">Source folders</h3>
          <div className="overflow-hidden rounded-2xl border border-border bg-bg-tertiary/70">
            {folders.map((folderPath) => {
              const primary = folderPath === primaryPath
              return (
              <div key={folderPath} className={`group flex min-h-[60px] items-center gap-3 border-b border-border-subtle px-4 ${primary ? 'bg-accent/[0.045]' : ''}`}>
                <button type="button" onClick={() => setPrimaryPath(folderPath)} aria-pressed={primary} aria-label={`Use ${folderPath} as primary folder`} className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl border ${primary ? 'border-accent/45 bg-accent/12 text-accent' : 'border-border text-text-muted hover:text-text-primary'}`}>
                  {primary ? <Check size={15} strokeWidth={2.5} /> : <FolderOpen size={16} />}
                </button>
                <div className="min-w-0 flex-1"><p className="truncate text-sm text-text-primary">{folderPath.split(/[\\/]/).filter(Boolean).pop()}</p><p className="truncate text-[10px] text-text-muted">{folderPath}</p></div>
                {primary && <span className="flex items-center gap-1 rounded-full border border-accent/20 bg-accent/10 px-2 py-1 text-[10px] font-semibold text-accent"><Star size={10} fill="currentColor" /> Primary</span>}
                <button onClick={() => { setFolders((current) => current.filter((item) => item !== folderPath)); if (primary) setPrimaryPath(folders.find(item => item !== folderPath) ?? '') }} aria-label={`Remove ${folderPath}`} className="rounded-lg p-1 text-text-muted opacity-0 hover:bg-bg-hover hover:text-error group-hover:opacity-100"><X size={16} /></button>
              </div>
            )})}
            <button onClick={() => void pickFolder()} className="flex min-h-[56px] w-full items-center gap-3 px-5 text-left text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"><Plus size={18} className="text-text-muted" /> Choose folder</button>
          </div>

          {error && <p className="mt-3 text-xs text-error" role="alert">{error}</p>}
          <div className="mt-7 flex justify-end gap-2">
            <button onClick={close} className="rounded-xl px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-bg-hover hover:text-text-primary">Cancel</button>
            <button onClick={() => void handleCreate()} disabled={creating || !name.trim() || folders.length === 0 || !primaryPath} className="rounded-xl bg-text-primary px-5 py-2.5 text-sm font-semibold text-bg-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35">{creating ? 'Adding…' : 'Add project'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
