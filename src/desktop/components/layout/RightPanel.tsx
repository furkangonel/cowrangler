import React from 'react'
import { X, ChevronLeft } from 'lucide-react'
import { ProgressPanel } from '../panels/ProgressPanel'
import { ContextPanel } from '../panels/ContextPanel'
import { MemoryPanel } from '../panels/MemoryPanel'
import { InstructionsPanel } from '../panels/InstructionsPanel'
import { ScheduledPanel } from '../panels/ScheduledPanel'
import { useUIStore } from '../../stores/ui.store'
import { useProjectsStore } from '../../stores/projects.store'
import { useSessionsStore } from '../../stores/sessions.store'
import { useAgentStore } from '../../stores/agent.store'

const TABS = [
  { id: 'progress', label: 'Progress' },
  { id: 'context', label: 'Context' },
  { id: 'instructions', label: 'Instructions' },
  { id: 'memory', label: 'Memory' },
  { id: 'scheduled', label: 'Scheduled' },
] as const

type TabId = typeof TABS[number]['id']

export function RightPanel() {
  const { rightPanelOpen, rightPanelTab, setRightPanelOpen, setRightPanelTab } = useUIStore()
  const { activeProjectId } = useProjectsStore()
  const { activeSessionId } = useSessionsStore()
  const { progress } = useAgentStore()

  if (!rightPanelOpen) {
    return (
      <button
        onClick={() => setRightPanelOpen(true)}
        className="flex-shrink-0 flex items-center justify-center w-6 border-l border-border bg-bg-secondary hover:bg-bg-hover transition-colors text-text-muted hover:text-text-secondary"
        title="Paneli aç"
      >
        <ChevronLeft size={12} />
      </button>
    )
  }

  // Session aktifken Progress önde, yoksa Instructions önde
  const defaultTab: TabId = activeSessionId ? 'progress' : 'instructions'
  const activeTab: TabId = rightPanelTab

  // Progress tab badge
  const pendingCount = progress.filter(t => t.status !== 'completed').length

  return (
    <aside
      className="flex flex-col flex-shrink-0 border-l border-border bg-bg-secondary overflow-hidden animate-fade-in"
      style={{ width: 'var(--right-panel-width)' }}
    >
      {/* Tab bar */}
      <div className="flex items-center border-b border-border px-1 flex-shrink-0" style={{ minHeight: '36px' }}>
        <div className="flex flex-1 overflow-x-auto">
          {TABS.map(tab => {
            // Progress sadece session varken göster
            if (tab.id === 'progress' && !activeSessionId) return null
            const isActive = activeTab === tab.id

            return (
              <button
                key={tab.id}
                onClick={() => setRightPanelTab(tab.id)}
                className={`
                  relative flex-shrink-0 px-2.5 py-2 text-2xs font-medium transition-colors whitespace-nowrap
                  ${isActive
                    ? 'text-text-primary border-b-2 border-accent'
                    : 'text-text-muted hover:text-text-secondary'
                  }
                `}
              >
                {tab.label}
                {tab.id === 'progress' && pendingCount > 0 && (
                  <span className="ml-1 bg-accent text-white text-2xs rounded-full px-1 py-0.5 font-medium">
                    {pendingCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <button
          onClick={() => setRightPanelOpen(false)}
          className="flex-shrink-0 p-1 text-text-muted hover:text-text-secondary transition-colors ml-1"
          title="Paneli kapat"
        >
          <X size={12} />
        </button>
      </div>

      {/* Panel içeriği */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'progress' && <ProgressPanel />}
        {activeTab === 'context' && <ContextPanel projectId={activeProjectId} />}
        {activeTab === 'instructions' && <InstructionsPanel projectId={activeProjectId} />}
        {activeTab === 'memory' && <MemoryPanel projectId={activeProjectId} />}
        {activeTab === 'scheduled' && <ScheduledPanel />}
      </div>
    </aside>
  )
}
