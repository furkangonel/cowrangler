import React from 'react'
import { PanelRight } from 'lucide-react'
import { Octopus } from '../shared/Octopus'
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
  const { newProjectModalOpen, rightPanelOpen, toggleRightPanel, setNewProjectModal } = useUIStore()

  const project = projects.find(p => p.id === activeProjectId)
  const showSession = !!activeProjectId && !!activeSessionId
  const showProjectHome = !!activeProjectId && !activeSessionId

  return (
    <div className="flex flex-col h-screen bg-bg-primary overflow-hidden">
      {/* macOS titlebar */}
      <div
        className="drag-region flex-shrink-0 flex items-center bg-bg-secondary border-b border-border-subtle"
        style={{ height: 'var(--titlebar-height)', paddingLeft: '82px', paddingRight: '10px' }}
      >
        <span className="text-text-secondary text-sm font-medium truncate flex items-center gap-1.5">
          {project ? (
            <>
              <span className="text-base leading-none">{project.icon}</span>
              {project.name}
            </>
          ) : (
            <span className="brand-serif text-text-primary text-md">Cowrangler</span>
          )}
        </span>

        <div className="ml-auto flex items-center gap-1 no-drag">
          <button
            onClick={toggleRightPanel}
            className={`p-1.5 rounded-md transition-colors ${
              rightPanelOpen ? 'text-text-secondary bg-bg-hover' : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover'
            }`}
            title="Toggle side panel"
          >
            <PanelRight size={15} />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main className="flex flex-col flex-1 overflow-hidden bg-bg-primary">
          {!activeProjectId && <EmptyState onNew={() => setNewProjectModal(true)} />}
          {showProjectHome && <ProjectHome projectId={activeProjectId!} />}
          {showSession && <SessionView projectId={activeProjectId!} sessionId={activeSessionId!} />}
        </main>

        <RightPanel />
      </div>

      <StatusBar />

      {newProjectModalOpen && <NewProjectModal />}
    </div>
  )
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-5 text-center px-8 animate-fade-in">
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-accent-subtle overflow-hidden ring-1 ring-accent/20">
        <Octopus size={42} />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-2xl font-semibold text-text-primary brand-serif">Welcome to Cowrangler</h2>
        <p className="text-text-secondary text-md max-w-sm leading-relaxed">
          Create a project so the agent can work on your files, take on tasks, and track progress live.
        </p>
      </div>
      <button
        onClick={onNew}
        className="mt-1 px-5 py-2.5 bg-accent text-accent-fg rounded-xl text-sm font-medium hover:bg-accent-hover transition-colors no-drag shadow-card"
      >
        + Create new project
      </button>
    </div>
  )
}
