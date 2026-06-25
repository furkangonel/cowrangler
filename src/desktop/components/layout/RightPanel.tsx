import React, { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { ProgressPanel } from '../panels/ProgressPanel'
import { ContextPanel } from '../panels/ContextPanel'
import { WorkingFoldersPanel } from '../panels/WorkingFoldersPanel'
import { InstructionsPanel } from '../panels/InstructionsPanel'
import { ScheduledPanel } from '../panels/ScheduledPanel'
import { PreviewPanel } from '../panels/PreviewPanel'
import { useUIStore } from '../../stores/ui.store'
import { useProjectsStore } from '../../stores/projects.store'
import { useSessionsStore } from '../../stores/sessions.store'

export function RightPanel() {
  const { rightPanelOpen, previewFile } = useUIStore()
  const { activeProjectId } = useProjectsStore()
  const { activeSessionId } = useSessionsStore()

  if (!rightPanelOpen) return null

  const isSession = !!activeSessionId

  return (
    <aside
      className="flex flex-col flex-shrink-0 border-l border-border-subtle bg-bg-secondary overflow-y-auto animate-slide-in"
      style={{ width: 'var(--right-panel-width)' }}
    >
      {previewFile && (
        <div className="flex-1 flex flex-col min-h-0 border-b border-border-subtle">
          <PreviewPanel />
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {isSession ? (
        // ─── Session view ───────────────────────────────────────────────────
        <>
          <CollapsibleBox title="Tasks" defaultOpen>
            <ProgressPanel projectId={activeProjectId} sessionId={activeSessionId} />
          </CollapsibleBox>

          <CollapsibleBox title="Working Folders" defaultOpen>
            <WorkingFoldersPanel projectId={activeProjectId} />
          </CollapsibleBox>

          <CollapsibleBox title="Context" defaultOpen={false}>
            <ContextPanel projectId={activeProjectId} />
          </CollapsibleBox>
        </>
      ) : (
        // ─── Project home view ──────────────────────────────────────────────
        <>
          <CollapsibleBox title="Instructions" defaultOpen>
            <InstructionsPanel projectId={activeProjectId} />
          </CollapsibleBox>

          <CollapsibleBox title="Scheduled" defaultOpen={false}>
            <ScheduledPanel />
          </CollapsibleBox>

          <CollapsibleBox title="Context" defaultOpen={false}>
            <ContextPanel projectId={activeProjectId} />
          </CollapsibleBox>
        </>
      )}
      </div>
    </aside>
  )
}

// ─── CollapsibleBox ──────────────────────────────────────────────────────────

interface BoxProps {
  title: string
  defaultOpen?: boolean
  badge?: React.ReactNode
  children: React.ReactNode
}

function CollapsibleBox({ title, defaultOpen = true, badge, children }: BoxProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-border-subtle last:border-b-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full px-4 py-3 hover:bg-bg-hover/50 transition-colors group"
      >
        <span className="flex items-center gap-2">
          {badge}
          <span className="text-xs font-semibold text-text-primary">{title}</span>
        </span>
        <ChevronDown
          size={13}
          className={`text-text-muted transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
        />
      </button>

      {open && (
        <div className="border-t border-border-subtle/50">
          {children}
        </div>
      )}
    </div>
  )
}
