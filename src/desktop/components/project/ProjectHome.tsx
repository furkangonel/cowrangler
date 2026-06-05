import React, { useEffect, useState, useRef } from 'react'
import { Pin, MoreHorizontal, Plus, Send, Folder, Clock, FolderOpen, Trash2, ExternalLink } from 'lucide-react'
import { useProjectsStore } from '../../stores/projects.store'
import { useSessionsStore } from '../../stores/sessions.store'
import { useUIStore } from '../../stores/ui.store'
import { useAgentStore } from '../../stores/agent.store'
import { ipc, OutputFile } from '../../lib/ipc'
import { formatRelative, formatDateTime } from '../../lib/time'

interface Props { projectId: string }

export function ProjectHome({ projectId }: Props) {
  const { projects, getActiveProject, loadFolders, folders, loadInstructions } = useProjectsStore()
  const { sessionsByProject, loadSessions, setActiveSession } = useSessionsStore()
  const { setRightPanelTab } = useUIStore()
  const [message, setMessage] = useState('')
  const [outputs, setOutputs] = useState<OutputFile[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const project = getActiveProject()
  const sessions = sessionsByProject[projectId] ?? []

  useEffect(() => {
    if (projectId) {
      loadSessions(projectId)
      loadFolders(projectId)
      loadInstructions(projectId)
      ipc.projects.getOutputs(projectId).then(setOutputs)
    }
  }, [projectId])

  useEffect(() => {
    setRightPanelTab('instructions')
  }, [projectId])

  async function startSession() {
    if (!message.trim()) return
    // Yeni session başlat
    await ipc.agent.newSession(projectId)
    // Session ID'yi agent'tan alacağız — şimdilik geçici bir session açıyoruz
    // İlk mesaj gönderilince agent sessionId döner
    setActiveSession('__new__')
    // Mesajı agent store'a aktar
    useAgentStore.getState().setStatus('idle')
    // Session view açılır ve message iletilir
    sessionStorage.setItem(`pendingMessage_${projectId}`, message)
    setMessage('')
  }

  if (!project) return null

  const projectFolders = folders[projectId] ?? []

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-bg-primary">
      <div className="max-w-2xl w-full mx-auto px-6 py-8 flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{project.icon}</span>
            <div>
              <h1 className="text-xl font-semibold text-text-primary">{project.name}</h1>
              {project.description && (
                <p className="text-sm text-text-secondary mt-0.5">{project.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {}}
              className="p-1.5 text-text-muted hover:text-text-secondary transition-colors rounded"
              title="Sabitle"
            >
              <Pin size={14} />
            </button>
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-1.5 text-text-muted hover:text-text-secondary transition-colors rounded"
              >
                <MoreHorizontal size={14} />
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 top-8 z-20 bg-bg-secondary border border-border rounded-lg shadow-xl min-w-[160px] py-1 animate-fade-in"
                  onClick={() => setMenuOpen(false)}
                >
                  <button className="w-full px-3 py-2 text-left text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary">
                    Projeyi düzenle
                  </button>
                  <button className="w-full px-3 py-2 text-left text-xs text-error hover:bg-bg-hover">
                    Projeyi sil
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Message prompt */}
        <div className="bg-bg-secondary border border-border rounded-xl overflow-hidden shadow-sm">
          {/* Image/outputs preview strip */}
          {outputs.length > 0 && (
            <div className="px-4 pt-3 pb-0 border-b border-border-subtle">
              <div className="flex gap-2 overflow-x-auto pb-3">
                {outputs.slice(0, 4).map(f => (
                  <OutputCard key={f.path} file={f} />
                ))}
              </div>
            </div>
          )}

          {/* Text area */}
          <div className="px-4 py-3">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  startSession()
                }
              }}
              placeholder="Bu projede ne yapmak istersiniz?"
              rows={3}
              className="w-full bg-transparent text-sm text-text-primary placeholder-text-muted resize-none outline-none selectable"
            />
          </div>

          {/* Footer bar */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border-subtle">
            <button
              onClick={async () => {
                const path = await ipc.fs.pickFolder()
                if (path) await useProjectsStore.getState().addFolder(projectId, path)
              }}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              <Plus size={13} />
              Klasör ekle
            </button>
            <button
              onClick={startSession}
              disabled={!message.trim()}
              className="flex items-center gap-2 px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent-hover transition-colors"
            >
              <Send size={12} />
              Gönder
            </button>
          </div>
        </div>

        {/* Folders */}
        {projectFolders.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">Klasörler</h3>
            <div className="flex flex-col gap-1">
              {projectFolders.map(f => (
                <div key={f.id} className="flex items-center gap-2 px-3 py-2 bg-bg-secondary border border-border rounded-lg group">
                  <Folder size={13} className="text-text-muted flex-shrink-0" />
                  <span className="text-xs text-text-secondary truncate flex-1 font-mono">{f.folder_path}</span>
                  <button
                    onClick={() => ipc.fs.openInFinder(f.folder_path)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-text-secondary transition-all"
                  >
                    <ExternalLink size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent sessions */}
        {sessions.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">Son Sessionlar</h3>
            <div className="grid grid-cols-2 gap-2">
              {sessions.slice(0, 6).map(s => (
                <button
                  key={s.id}
                  onClick={() => setActiveSession(s.id)}
                  className="text-left px-3 py-3 bg-bg-secondary border border-border rounded-lg hover:border-accent/40 hover:bg-bg-tertiary transition-colors group"
                >
                  <div className="flex items-start gap-2">
                    <Clock size={12} className="text-text-muted mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-text-primary truncate group-hover:text-accent transition-colors">
                        {s.title || 'Session'}
                      </p>
                      <p className="text-2xs text-text-muted mt-0.5">
                        {formatRelative(s.started_at)}
                        {s.message_count > 0 && ` · ${s.message_count} mesaj`}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            {sessions.length > 6 && (
              <button className="text-xs text-text-muted hover:text-text-secondary transition-colors mt-2">
                +{sessions.length - 6} daha
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function OutputCard({ file }: { file: OutputFile }) {
  const ext = file.ext.toLowerCase()
  const emoji =
    ['.md', '.txt'].includes(ext) ? '📝' :
    ['.pdf'].includes(ext) ? '📕' :
    ['.docx'].includes(ext) ? '📄' :
    ['.xlsx'].includes(ext) ? '📊' :
    ['.pptx'].includes(ext) ? '📊' :
    ['.png', '.jpg', '.jpeg'].includes(ext) ? '🖼️' :
    '📎'

  return (
    <button
      onClick={() => ipc.fs.openInFinder(file.path)}
      className="flex-shrink-0 flex flex-col items-center gap-1 p-2.5 bg-bg-tertiary border border-border rounded-lg hover:border-accent/40 transition-colors w-24"
    >
      <span className="text-2xl">{emoji}</span>
      <span className="text-2xs text-text-muted truncate w-full text-center">{file.name}</span>
    </button>
  )
}
