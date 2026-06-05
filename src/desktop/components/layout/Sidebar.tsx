import React, { useState } from 'react'
import { Settings, Plus, Search, Pin, ChevronRight, MessageSquare, Home } from 'lucide-react'
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
      className="flex flex-col flex-shrink-0 border-r border-border bg-bg-secondary"
      style={{ width: 'var(--sidebar-width)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border-subtle">
        <button
          onClick={() => setNewProjectModal(true)}
          className="flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors text-xs"
          title="Yeni proje"
        >
          <Plus size={13} />
          <span>Yeni Proje</span>
        </button>
        <button
          onClick={() => openSettings('models')}
          className="p-1.5 rounded text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-colors"
          title="Ayarlar"
        >
          <Settings size={14} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 px-2 py-1.5 bg-bg-tertiary rounded border border-border-subtle">
          <Search size={12} className="text-text-muted flex-shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Proje ara..."
            className="flex-1 bg-transparent text-xs text-text-primary placeholder-text-muted outline-none"
          />
        </div>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto px-1.5 pb-2">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-text-muted">Yükleniyor...</span>
          </div>
        )}

        {!loading && projects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-center px-4">
            <span className="text-3xl">📂</span>
            <p className="text-xs text-text-muted">Henüz proje yok</p>
            <button
              onClick={() => setNewProjectModal(true)}
              className="text-xs text-accent hover:text-accent-hover"
            >
              Proje oluştur
            </button>
          </div>
        )}

        {pinned.length > 0 && (
          <div className="mb-1">
            <p className="text-2xs text-text-muted px-2 py-1 font-medium uppercase tracking-wide flex items-center gap-1">
              <Pin size={10} /> Sabitlenmiş
            </p>
            {pinned.map(p => (
              <ProjectItem
                key={p.id}
                project={p}
                active={p.id === activeProjectId}
                onClick={() => selectProject(p.id)}
              />
            ))}
          </div>
        )}

        {unpinned.length > 0 && (
          <div>
            {pinned.length > 0 && (
              <p className="text-2xs text-text-muted px-2 py-1 font-medium uppercase tracking-wide mt-1">
                Projeler
              </p>
            )}
            {unpinned.map(p => (
              <div key={p.id}>
                <ProjectItem
                  project={p}
                  active={p.id === activeProjectId}
                  onClick={() => selectProject(p.id)}
                />
                {/* Sessions sub-list for active project */}
                {p.id === activeProjectId && (
                  <div className="ml-4 mb-1">
                    <button
                      onClick={() => setActiveSession(null)}
                      className={`flex items-center gap-1.5 w-full px-2 py-1 rounded text-2xs transition-colors ${
                        !activeSessionId ? 'text-accent bg-accent/10' : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover'
                      }`}
                    >
                      <Home size={10} />
                      Proje Ana Sayfası
                    </button>
                    {(sessionsByProject[p.id] ?? []).slice(0, 5).map(s => (
                      <button
                        key={s.id}
                        onClick={() => setActiveSession(s.id)}
                        className={`flex items-center gap-1.5 w-full px-2 py-1 rounded text-2xs transition-colors truncate ${
                          activeSessionId === s.id ? 'text-accent bg-accent/10' : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover'
                        }`}
                      >
                        <MessageSquare size={10} className="flex-shrink-0" />
                        <span className="truncate">{s.title || formatRelative(s.started_at)}</span>
                      </button>
                    ))}
                    <button
                      onClick={() => setActiveSession('__new__')}
                      className="flex items-center gap-1.5 w-full px-2 py-1 rounded text-2xs text-text-muted hover:text-accent hover:bg-bg-hover transition-colors"
                    >
                      <Plus size={10} />
                      Yeni konuşma
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}

function ProjectItem({ project, active, onClick }: {
  project: any; active: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-2 px-2 py-2 rounded-md text-left transition-colors mb-0.5
        ${active
          ? 'bg-accent-subtle text-text-primary border border-accent/20'
          : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
        }
      `}
    >
      <span className="text-base flex-shrink-0">{project.icon || '📁'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{project.name}</p>
        {project.session_count > 0 && (
          <p className="text-2xs text-text-muted">
            {project.session_count} session
            {project.last_session_at && ` · ${formatRelative(project.last_session_at)}`}
          </p>
        )}
      </div>
      {active && <ChevronRight size={12} className="text-accent flex-shrink-0" />}
    </button>
  )
}
