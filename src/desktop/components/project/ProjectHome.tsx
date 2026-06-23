import React, { useEffect, useState, useRef } from 'react'
import { Pin, MoreHorizontal, Plus, ArrowUp, Folder, Clock, ExternalLink, MessageSquare } from 'lucide-react'
import { useProjectsStore } from '../../stores/projects.store'
import { useSessionsStore } from '../../stores/sessions.store'
import { useAgentStore } from '../../stores/agent.store'
import { ipc, OutputFile } from '../../lib/ipc'
import { formatRelative } from '../../lib/time'
import { EditProjectModal } from './EditProjectModal'

interface Props { projectId: string }

export function ProjectHome({ projectId }: Props) {
  const { getActiveProject, loadFolders, folders, loadInstructions, updateProject, deleteProject, setActiveProject } = useProjectsStore()
  const { sessionsByProject, loadSessions, setActiveSession } = useSessionsStore()
  const [message, setMessage] = useState('')
  const [outputs, setOutputs] = useState<OutputFile[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const project = getActiveProject()
  const sessions = sessionsByProject[projectId] ?? []

  useEffect(() => {
    if (projectId) {
      loadSessions(projectId)
      loadFolders(projectId)
      loadInstructions(projectId)
      ipc.projects.getOutputs(projectId).then(setOutputs).catch(() => {})
    }
  }, [projectId])

  async function startSession() {
    if (!message.trim()) return
    await ipc.agent.newSession(projectId)
    setActiveSession('__new__')
    useAgentStore.getState().setStatus('idle')
    sessionStorage.setItem(`pendingMessage_${projectId}`, message)
    setMessage('')
  }

  async function togglePin() {
    if (!project) return
    await updateProject(projectId, { pinned: project.pinned ? 0 : 1 })
  }

  async function handleDelete() {
    if (!project) return
    const ok = window.confirm(`Are you sure you want to delete the project "${project.name}"? This action cannot be undone.`)
    if (!ok) return
    setMenuOpen(false)
    await deleteProject(projectId)
    setActiveProject(null)
  }

  if (!project) return null
  const projectFolders = folders[projectId] ?? []
  const isPinned = !!project.pinned

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-bg-primary">
      <div className="max-w-2xl w-full mx-auto px-6 py-10 flex flex-col gap-7">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary brand-serif">{project.name}</h1>
            {project.description && (
              <p className="text-sm text-text-secondary mt-1 leading-relaxed">{project.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={togglePin}
              className={`p-2 rounded-lg transition-colors ${
                isPinned
                  ? 'text-accent bg-accent-subtle hover:bg-accent-subtle'
                  : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover'
              }`}
              title={isPinned ? 'Unpin' : 'Pin'}
            >
              <Pin size={15} className={isPinned ? 'fill-current' : ''} />
            </button>
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-2 text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-colors rounded-lg"
              >
                <MoreHorizontal size={15} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-10 z-20 bg-bg-secondary border border-border rounded-xl shadow-pop min-w-[170px] py-1 animate-slide-up">
                    <button
                      onClick={() => { setMenuOpen(false); setEditOpen(true) }}
                      className="w-full px-3 py-2 text-left text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                    >
                      Edit project
                    </button>
                    <button
                      onClick={handleDelete}
                      className="w-full px-3 py-2 text-left text-xs text-error hover:bg-error/10"
                    >
                      Delete project
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Composer */}
        <div className="bg-bg-secondary border border-border rounded-2xl overflow-hidden shadow-card">
          {outputs.length > 0 && (
            <div className="px-4 pt-3.5 pb-0 border-b border-border-subtle">
              <div className="flex gap-2 overflow-x-auto pb-3.5">
                {outputs.slice(0, 5).map(f => <OutputCard key={f.path} file={f} />)}
              </div>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); startSession() } }}
            placeholder="What do you want to do in this project?"
            rows={3}
            className="w-full bg-transparent text-md text-text-primary placeholder-text-muted resize-none outline-none selectable px-4 py-3.5"
          />

          <div className="flex items-center justify-between px-4 py-3 border-t border-border-subtle">
            <button
              onClick={async () => {
                const path = await ipc.fs.pickFolder()
                if (path) await useProjectsStore.getState().addFolder(projectId, path)
              }}
              className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              <Plus size={14} /> Add folder
            </button>
            <button
              onClick={startSession}
              disabled={!message.trim()}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-accent text-accent-fg rounded-xl text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-accent-hover transition-colors"
            >
              Start <ArrowUp size={13} />
            </button>
          </div>
        </div>

        {/* Folders */}
        {projectFolders.length > 0 && (
          <Section title="Folders">
            <div className="flex flex-col gap-1.5">
              {projectFolders.map(f => (
                <div key={f.id} className="flex items-center gap-2.5 px-3 py-2.5 bg-bg-secondary border border-border rounded-xl group">
                  <Folder size={14} className="text-text-muted flex-shrink-0" />
                  <span className="text-xs text-text-secondary truncate flex-1 font-mono">{f.folder_path}</span>
                  <button
                    onClick={() => ipc.fs.openInFinder(f.folder_path)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-text-primary transition-all"
                  >
                    <ExternalLink size={12} />
                  </button>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Recent chats */}
        {sessions.length > 0 && (
          <Section title="Recent chats">
            <div className="grid grid-cols-2 gap-2.5">
              {sessions.slice(0, 6).map(s => (
                <button
                  key={s.id}
                  onClick={() => setActiveSession(s.id)}
                  className="text-left px-3.5 py-3 bg-bg-secondary border border-border rounded-xl hover:border-accent/40 hover:bg-bg-hover transition-colors group"
                >
                  <div className="flex items-start gap-2.5">
                    <MessageSquare size={13} className="text-text-muted mt-0.5 flex-shrink-0 group-hover:text-accent transition-colors" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-text-primary truncate group-hover:text-accent transition-colors">
                        {s.title || 'Chat'}
                      </p>
                      <p className="text-2xs text-text-muted mt-1 flex items-center gap-1">
                        <Clock size={9} /> {formatRelative(s.started_at)}
                        {s.message_count > 0 && ` · ${s.message_count} messages`}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </Section>
        )}
      </div>

      {editOpen && <EditProjectModal projectId={projectId} onClose={() => setEditOpen(false)} />}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-2xs font-semibold text-text-muted uppercase tracking-wider mb-2.5">{title}</h3>
      {children}
    </div>
  )
}

function OutputCard({ file }: { file: OutputFile }) {
  const ext = file.ext.toLowerCase()
  const emoji =
    ['.md', '.txt'].includes(ext) ? '📝' :
    ['.pdf'].includes(ext) ? '📕' :
    ['.docx'].includes(ext) ? '📄' :
    ['.xlsx', '.pptx'].includes(ext) ? '📊' :
    ['.png', '.jpg', '.jpeg'].includes(ext) ? '🖼️' : '📎'
  return (
    <button
      onClick={() => ipc.fs.openInFinder(file.path)}
      className="flex-shrink-0 flex flex-col items-center gap-1.5 p-3 bg-bg-tertiary border border-border rounded-xl hover:border-accent/40 transition-colors w-24"
    >
      <span className="text-2xl">{emoji}</span>
      <span className="text-2xs text-text-muted truncate w-full text-center">{file.name}</span>
    </button>
  )
}
