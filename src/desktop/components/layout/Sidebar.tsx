import React, { useEffect, useState } from 'react'
import { Settings, Plus, Search, Pin, MessageSquare, Home, FolderPlus, ChevronRight, MessagesSquare, FolderKanban, PenLine, Trash2 } from 'lucide-react'
import { useProjectsStore } from '../../stores/projects.store'
import { useSessionsStore } from '../../stores/sessions.store'
import { useUIStore } from '../../stores/ui.store'
import { useAgentStore } from '../../stores/agent.store'
import { ipc } from '../../lib/ipc'
import { GLOBAL_PROJECT_ID } from '../session/GlobalChatView'
import { formatRelative } from '../../lib/time'
import { UpdateBanner } from '../UpdateBanner'

export function Sidebar() {
  const { projects, activeProjectId, setActiveProject, loading } = useProjectsStore()
  const { setActiveSession, activeSessionId, sessionsByProject, loadSessions } = useSessionsStore()
  const { setNewProjectModal, openSettings, sidebarCollapsed, activeTab, setActiveTab } = useUIStore()
  const [search, setSearch] = useState('')

  const filtered = projects.filter(p =>
    search === '' || p.name.toLowerCase().includes(search.toLowerCase())
  )
  const pinned = filtered.filter(p => p.pinned)
  const unpinned = filtered.filter(p => !p.pinned)

  function selectProject(id: string) {
    setActiveProject(id)
    setActiveSession(null)
    loadSessions(id)
  }

  // Collapsed (icon-only rail) mode
  if (sidebarCollapsed) {
    return (
      <aside
        className="flex flex-col flex-shrink-0 border-r border-border-subtle bg-bg-secondary items-center py-3 gap-2"
        style={{ width: '52px' }}
      >
        <button
          onClick={() => setActiveTab('projects')}
          title="Projects"
          className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
            activeTab === 'projects' ? 'bg-accent text-accent-fg' : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover'
          }`}
        >
          <FolderKanban size={16} />
        </button>
        <button
          onClick={() => setActiveTab('chats')}
          title="Chats"
          className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
            activeTab === 'chats' ? 'bg-accent text-accent-fg' : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover'
          }`}
        >
          <MessagesSquare size={16} />
        </button>
        <div className="flex-1" />
        <UpdateBanner collapsed />
        <button
          onClick={() => openSettings('models')}
          title="Settings"
          className="w-9 h-9 flex items-center justify-center rounded-lg text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-colors"
        >
          <Settings size={16} />
        </button>
      </aside>
    )
  }

  return (
    <aside
      className="flex flex-col flex-shrink-0 border-r border-border-subtle bg-bg-secondary transition-all duration-200"
      style={{ width: 'var(--sidebar-width)' }}
    >
      {/* Tab navigation */}
      <div className="flex border-b border-border-subtle px-2 pt-2">
        <button
          onClick={() => setActiveTab('projects')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-medium transition-colors flex-1 justify-center ${
            activeTab === 'projects'
              ? 'bg-bg-primary text-text-primary border border-b-0 border-border-subtle'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          <FolderKanban size={12} />
          Projects
        </button>
        <button
          onClick={() => setActiveTab('chats')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-medium transition-colors flex-1 justify-center ${
            activeTab === 'chats'
              ? 'bg-bg-primary text-text-primary border border-b-0 border-border-subtle'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          <MessagesSquare size={12} />
          Chats
        </button>
      </div>

      {activeTab === 'projects' ? (
        <>
          {/* New project */}
          <div className="px-3 pt-3 pb-2">
            <button
              onClick={() => setNewProjectModal(true)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-accent text-accent-fg hover:bg-accent-hover transition-colors text-sm font-medium shadow-card"
            >
              <FolderPlus size={15} />
              <span>New project</span>
            </button>
          </div>

          {/* Search */}
          <div className="px-3 pb-2">
            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-bg-tertiary rounded-lg border border-border-subtle focus-within:border-accent/40 transition-colors">
              <Search size={13} className="text-text-muted flex-shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search projects"
                className="flex-1 bg-transparent text-xs text-text-primary placeholder-text-muted outline-none"
              />
            </div>
          </div>

          {/* Project list */}
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {loading && (
              <div className="space-y-1.5 px-1 py-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-9 rounded-lg shimmer" />
                ))}
              </div>
            )}

            {!loading && projects.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-center px-4">
                <span className="text-3xl opacity-70">📂</span>
                <p className="text-xs text-text-muted">No projects yet</p>
                <button
                  onClick={() => setNewProjectModal(true)}
                  className="text-xs text-accent hover:text-accent-hover font-medium"
                >
                  Create your first project
                </button>
              </div>
            )}

            {pinned.length > 0 && (
              <Section label="Pinned" icon={<Pin size={10} />}>
                {pinned.map(p => (
                  <ProjectItem
                    key={p.id}
                    project={p}
                    active={p.id === activeProjectId}
                    activeSessionId={activeSessionId}
                    sessions={sessionsByProject[p.id] ?? []}
                    onSelect={() => selectProject(p.id)}
                    onSession={setActiveSession}
                  />
                ))}
              </Section>
            )}

            {unpinned.length > 0 && (
              <Section label={pinned.length > 0 ? 'Projects' : undefined}>
                {unpinned.map(p => (
                  <ProjectItem
                    key={p.id}
                    project={p}
                    active={p.id === activeProjectId}
                    activeSessionId={activeSessionId}
                    sessions={sessionsByProject[p.id] ?? []}
                    onSelect={() => selectProject(p.id)}
                    onSession={setActiveSession}
                  />
                ))}
              </Section>
            )}
          </div>
        </>
      ) : (
        /* Chats tab — global sessions */
        <GlobalChatsPanel />
      )}

      {/* Footer — settings */}
      <div className="border-t border-border-subtle pt-2 pb-2 flex flex-col">
        <UpdateBanner />
        <div className="px-2">
          <button
            onClick={() => openSettings('models')}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors text-xs"
          >
            <Settings size={14} />
            <span>Settings</span>
          </button>
        </div>
      </div>
    </aside>
  )
}

function GlobalChatsPanel() {
  const { sessionsByProject, loadSessions, clearUIMessages, renameSession, deleteSession } = useSessionsStore()
  const { activeGlobalSessionId, setActiveGlobalSession } = useUIStore()
  const agentStore = useAgentStore()
  const sessions = sessionsByProject[GLOBAL_PROJECT_ID] ?? []

  useEffect(() => {
    loadSessions(GLOBAL_PROJECT_ID)
  }, [])

  async function newChat() {
    await ipc.agent.newSession(GLOBAL_PROJECT_ID)
    agentStore.setStatus('idle')
    agentStore.clearToolCalls()
    agentStore.clearTimelines()
    clearUIMessages()
    setActiveGlobalSession(null)
  }

  async function handleDeleteSession(sid: string) {
    if (!window.confirm('Are you sure you want to delete this chat and all its messages?')) return
    const wasActive = activeGlobalSessionId === sid
    await deleteSession(GLOBAL_PROJECT_ID, sid)
    if (wasActive) {
      await ipc.agent.newSession(GLOBAL_PROJECT_ID)
      agentStore.setStatus('idle')
      agentStore.clearToolCalls()
      agentStore.clearTimelines()
      clearUIMessages()
      setActiveGlobalSession(null)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3 pt-3 pb-2">
        <button
          onClick={newChat}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-accent text-accent-fg hover:bg-accent-hover transition-colors text-sm font-medium shadow-card"
        >
          <Plus size={15} />
          <span>New chat</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-4">
            <MessagesSquare size={28} className="text-text-muted opacity-50" />
            <p className="text-xs text-text-muted leading-relaxed max-w-[160px]">
              Start a general chat without a project. Your history appears here.
            </p>
          </div>
        ) : (
          <div className="space-y-0.5 pt-1">
            {sessions.map(s => (
              <SessionRow
                key={s.id}
                title={s.title || formatRelative(s.started_at)}
                active={activeGlobalSessionId === s.id}
                onSelect={() => setActiveGlobalSession(s.id)}
                onRename={(t) => renameSession(s.id, t)}
                onDelete={() => handleDeleteSession(s.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ label, icon, children }: { label?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-1.5">
      {label && (
        <p className="text-2xs text-text-muted px-2.5 py-1.5 font-semibold uppercase tracking-wider flex items-center gap-1.5">
          {icon}{label}
        </p>
      )}
      {children}
    </div>
  )
}

function ProjectItem({ project, active, activeSessionId, sessions, onSelect, onSession }: {
  project: any
  active: boolean
  activeSessionId: string | null
  sessions: any[]
  onSelect: () => void
  onSession: (id: string | null) => void
}) {
  const { renameSession, deleteSession } = useSessionsStore()
  const agentStore = useAgentStore()

  async function handleDeleteSession(sid: string) {
    if (!window.confirm('Are you sure you want to delete this chat and all its messages?')) return
    const wasActive = activeSessionId === sid
    await deleteSession(project.id, sid)
    if (wasActive) {
      await ipc.agent.newSession(project.id)
      agentStore.setStatus('idle')
      agentStore.clearToolCalls()
      agentStore.clearTimelines()
      onSession(null)
    }
  }

  return (
    <div className="mb-0.5">
      <button
        onClick={onSelect}
        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
          active
            ? 'bg-bg-hover text-text-primary'
            : 'text-text-secondary hover:bg-bg-hover/60 hover:text-text-primary'
        }`}
      >
        <span className="text-base flex-shrink-0 leading-none">{project.icon || '📁'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{project.name}</p>
          {project.session_count > 0 && (
            <p className="text-2xs text-text-muted truncate">
              {project.session_count} sohbet
              {project.last_session_at && ` · ${formatRelative(project.last_session_at)}`}
            </p>
          )}
        </div>
        {active && <ChevronRight size={12} className="text-text-muted flex-shrink-0" />}
      </button>

      {/* Sessions for active project */}
      {active && (
        <div className="ml-3 mt-0.5 pl-2 border-l border-border-subtle space-y-0.5">
          <SubItem
            active={!activeSessionId}
            icon={<Home size={11} />}
            label="Project home"
            onClick={() => onSession(null)}
          />
          {/* session rows below */}
          {sessions.slice(0, 12).map(s => (
            <SessionRow
              key={s.id}
              title={s.title || formatRelative(s.started_at)}
              active={activeSessionId === s.id}
              onSelect={() => onSession(s.id)}
              onRename={(t) => renameSession(s.id, t)}
              onDelete={() => handleDeleteSession(s.id)}
            />
          ))}
          <SubItem
            active={false}
            icon={<Plus size={11} />}
            label="New chat"
            muted
            onClick={() => onSession('__new__')}
          />
        </div>
      )}
    </div>
  )
}

function SessionRow({ title, active, onSelect, onRename, onDelete }: {
  title: string
  active: boolean
  onSelect: () => void
  onRename: (title: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(title)

  function commit() {
    const t = val.trim()
    if (t && t !== title) onRename(t)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          else if (e.key === 'Escape') { setVal(title); setEditing(false) }
        }}
        className="w-full px-2 py-1.5 rounded-md text-2xs bg-bg-tertiary border border-accent/40 text-text-primary outline-none"
      />
    )
  }

  return (
    <div
      className={`group flex items-center gap-1 w-full pl-2 pr-1 py-1.5 rounded-md text-2xs transition-colors ${
        active
          ? 'text-accent bg-accent-subtle font-medium'
          : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover/60'
      }`}
    >
      <button onClick={onSelect} className="flex items-center gap-2 flex-1 min-w-0 text-left">
        <MessageSquare size={11} className="flex-shrink-0" />
        <span className="truncate">{title}</span>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); setVal(title); setEditing(true) }}
        className="opacity-0 group-hover:opacity-100 p-0.5 text-text-muted hover:text-accent transition-all flex-shrink-0"
        title="Rename"
      >
        <PenLine size={11} />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        className="opacity-0 group-hover:opacity-100 p-0.5 text-text-muted hover:text-error transition-all flex-shrink-0"
        title="Delete"
      >
        <Trash2 size={11} />
      </button>
    </div>
  )
}

function SubItem({ active, icon, label, muted, onClick }: {
  active: boolean; icon: React.ReactNode; label: string; muted?: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-2xs transition-colors truncate ${
        active
          ? 'text-accent bg-accent-subtle font-medium'
          : muted
          ? 'text-text-muted hover:text-accent hover:bg-bg-hover/60'
          : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover/60'
      }`}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  )
}
