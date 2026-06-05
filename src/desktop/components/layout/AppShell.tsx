import React, { useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { RightPanel } from './RightPanel'
import { ProjectHome } from '../project/ProjectHome'
import { SessionView } from '../session/SessionView'
import { NewProjectModal } from '../project/NewProjectModal'
import { StatusBar } from '../shared/StatusBar'
import { useProjectsStore } from '../../stores/projects.store'
import { useSessionsStore } from '../../stores/sessions.store'
import { useUIStore } from '../../stores/ui.store'

export function AppShell() {
  const { activeProjectId, projects } = useProjectsStore()
  const { activeSessionId } = useSessionsStore()
  const { newProjectModalOpen } = useUIStore()

  const showSession = !!activeProjectId && !!activeSessionId
  const showProjectHome = !!activeProjectId && !activeSessionId

  return (
    <div className="flex flex-col h-screen bg-bg-primary overflow-hidden">
      {/* macOS titlebar spacer */}
      <div
        className="drag-region flex-shrink-0 flex items-center"
        style={{
          height: 'var(--titlebar-height)',
          backgroundColor: '#0f0f0f',
          borderBottom: '1px solid #1f1f1f',
          paddingLeft: '80px',  // macOS traffic lights için boşluk
        }}
      >
        <span className="text-text-muted text-xs font-medium no-drag">
          {activeProjectId
            ? projects.find(p => p.id === activeProjectId)?.name ?? 'Co-Wrangler'
            : 'Co-Wrangler'}
        </span>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar />

        {/* Center area */}
        <main className="flex flex-col flex-1 overflow-hidden">
          {!activeProjectId && <EmptyState />}
          {showProjectHome && <ProjectHome projectId={activeProjectId} />}
          {showSession && <SessionView projectId={activeProjectId} sessionId={activeSessionId} />}
        </main>

        {/* Right panel */}
        <RightPanel />
      </div>

      {/* Status bar */}
      <StatusBar />

      {/* Modals */}
      {newProjectModalOpen && <NewProjectModal />}
    </div>
  )
}

function EmptyState() {
  const { setNewProjectModal } = useUIStore()
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center px-8">
      <div className="text-5xl mb-2">🤠</div>
      <h2 className="text-xl font-semibold text-text-primary">Co-Wrangler'a Hoş Geldiniz</h2>
      <p className="text-text-secondary text-sm max-w-xs">
        Sol taraftan bir proje seçin ya da yeni bir proje oluşturarak başlayın.
      </p>
      <button
        onClick={() => setNewProjectModal(true)}
        className="mt-2 px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover transition-colors no-drag"
      >
        + Yeni Proje
      </button>
    </div>
  )
}
