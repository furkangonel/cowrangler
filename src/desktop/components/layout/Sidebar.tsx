import React, { useState } from 'react'
import { Settings, Plus, Search, Pin, MessageSquare, Home, FolderPlus } from 'lucide-react'
import { useProjectsStore } from '../../stores/projects.store'
import { useSessionsStore } from '../../stores/sessions.store'
import { useUIStore } from '../../stores/ui.store'
import { formatRelative } from '../../lib/time'

export function Sidebar() {
  const { projects, activeProjectId, setActiveProject, loading } = useProjectsStore()
  const { setActiveSession, activeSessionId, sessionsByProject, loadSessions } = useSessionsStore()
  const { setNewProjectModal, openSettings } = useUIStore()
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

  return (
    <aside
      className="flex flex-col flex-shrink-0 border-r border-border-subtle bg-bg-secondary"
      style={{ width: 'var(--sidebar-width)' }}
    >
      {/* New project */}
      <div className="px-3 pt-3 pb-2">
        <button
          onClick={() => setNewProjectModal(true)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-accent text-accent-fg hover:bg-accent-hover transition-colors text-sm font-medium shadow-card"
        >
          <FolderPlus size={15} />
          <span>Yeni proje</span>
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-bg-tertiary rounded-lg border border-border-subtle focus-within:border-accent/40 transition-colors">
          <Search size={13} className="text-text-muted flex-shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Projelerde ara"
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
          <Section label={pinned.length > 0 ? 'Projeler' : undefined}>
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

      {/* Footer — settings */}
      <div className="border-t border-border-subtle px-2 py-2">
        <button
          onClick={() => openSettings('models')}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors text-xs"
        >
          <Settings size={14} />
          <span>Ayarlar</span>
        </button>
      </div>
    </aside>
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
          {sessions.slice(0, 6).map(s => (
            <SubItem
              key={s.id}
              active={activeSessionId === s.id}
              icon={<MessageSquare size={11} />}
              label={s.title || formatRelative(s.started_at)}
              onClick={() => onSession(s.id)}
            />
          ))}
          <SubItem
            active={false}
            icon={<Plus size={11} />}
            label="Yeni sohbet"
            muted
            onClick={() => onSession('__new__')}
          />
        </div>
      )}
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
