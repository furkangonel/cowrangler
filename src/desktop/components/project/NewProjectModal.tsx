import React, { useState } from 'react'
import { X, FolderOpen } from 'lucide-react'
import { useProjectsStore } from '../../stores/projects.store'
import { useSessionsStore } from '../../stores/sessions.store'
import { useUIStore } from '../../stores/ui.store'
import { ipc } from '../../lib/ipc'

const ICONS = ['📁', '🚀', '💻', '🎨', '📊', '🔧', '🌐', '📱', '⚡', '🤖', '🎯', '🔬']
const COLORS = ['#e05c2a', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899']

export function NewProjectModal() {
  const { createProject, setActiveProject, loadFolders } = useProjectsStore()
  const { setActiveSession } = useSessionsStore()
  const { setNewProjectModal } = useUIStore()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [workdir, setWorkdir] = useState('')
  const [icon, setIcon] = useState('📁')
  const [color, setColor] = useState('#e05c2a')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  async function pickFolder() {
    const path = await ipc.fs.pickFolder()
    if (path) {
      setWorkdir(path)
      // Klasör adını proje ismi olarak öner
      if (!name) {
        setName(path.split('/').pop() || path.split('\\').pop() || '')
      }
    }
  }

  async function handleCreate() {
    if (!name.trim()) { setError('Proje adı gerekli'); return }
    setCreating(true)
    setError('')
    try {
      const project = await createProject({
        name: name.trim(),
        description: description.trim() || undefined,
        workdir: workdir || undefined,
        icon,
      })
      // Klasörü projeye ekle
      if (workdir) {
        await ipc.projects.addFolder(project.id, workdir)
        await loadFolders(project.id)
      }
      setActiveProject(project.id)
      setActiveSession(null)
      setNewProjectModal(false)
    } catch (e: any) {
      setError(e.message || 'Proje oluşturulamadı')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in">
      <div className="bg-bg-secondary border border-border rounded-xl shadow-2xl w-[440px] max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-md font-semibold text-text-primary">Yeni Proje</h2>
          <button
            onClick={() => setNewProjectModal(false)}
            className="p-1 text-text-muted hover:text-text-secondary transition-colors rounded"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Icon + Name row */}
          <div className="flex gap-3 items-start">
            <div className="flex-shrink-0">
              <p className="text-xs text-text-muted mb-1">İkon</p>
              <div className="grid grid-cols-4 gap-1 p-2 bg-bg-tertiary rounded-lg border border-border">
                {ICONS.map(i => (
                  <button
                    key={i}
                    onClick={() => setIcon(i)}
                    className={`text-lg p-1 rounded transition-colors ${icon === i ? 'bg-accent/20 ring-1 ring-accent' : 'hover:bg-bg-hover'}`}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1">
              <label className="text-xs text-text-muted block mb-1">Proje adı *</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="Projemin adı"
                autoFocus
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded-lg text-sm text-text-primary placeholder-text-muted focus:border-accent transition-colors"
              />
              <label className="text-xs text-text-muted block mb-1 mt-3">Açıklama</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Opsiyonel kısa açıklama"
                rows={2}
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded-lg text-sm text-text-primary placeholder-text-muted focus:border-accent transition-colors resize-none"
              />
            </div>
          </div>

          {/* Workdir */}
          <div>
            <label className="text-xs text-text-muted block mb-1">Çalışma klasörü</label>
            <div className="flex gap-2">
              <input
                value={workdir}
                onChange={e => setWorkdir(e.target.value)}
                placeholder="/Users/sen/projelerim/benim-projem"
                className="flex-1 px-3 py-2 bg-bg-tertiary border border-border rounded-lg text-xs text-text-primary placeholder-text-muted focus:border-accent transition-colors font-mono"
              />
              <button
                onClick={pickFolder}
                className="flex items-center gap-1.5 px-3 py-2 bg-bg-hover border border-border rounded-lg text-xs text-text-secondary hover:text-text-primary hover:border-accent transition-colors"
              >
                <FolderOpen size={13} />
                Seç
              </button>
            </div>
            <p className="text-2xs text-text-muted mt-1">
              Agent bu klasörde araçlarını çalıştırır. Boş bırakılabilir.
            </p>
          </div>

          {error && (
            <p className="text-xs text-error">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button
            onClick={() => setNewProjectModal(false)}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors rounded-lg hover:bg-bg-hover"
          >
            İptal
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || creating}
            className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            {creating ? 'Oluşturuluyor...' : 'Proje Oluştur'}
          </button>
        </div>
      </div>
    </div>
  )
}
