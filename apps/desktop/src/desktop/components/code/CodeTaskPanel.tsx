/**
 * CodeTaskPanel — Code sağ panelinin ilkel "Task" yüzeyi.
 *
 * manage_task ile üretilen görev listesini (agentStore.progress) gösterir. Cowork
 * tarafındaki zengin ProgressPanel'den bilinçli olarak DAHA İLKEL: sade bir
 * checkbox listesi + ilerleme sayacı. Tıklanabilir değil — yalnızca canlı durum.
 */
import React from 'react'
import { CheckSquare, Square, Loader2, ListTodo, X } from 'lucide-react'
import { useAgentStore } from '../../stores/agent.store'
import { useUIStore } from '../../stores/ui.store'

export function CodeTaskPanel() {
  const progress = useAgentStore((s) => s.progress)
  const working = useAgentStore((s) => s.status === 'thinking')
  const setCodeRightTab = useUIStore((s) => s.setCodeRightTab)

  const total = progress.length
  const done = progress.filter((t) => t.status === 'completed').length

  return (
    <div className="flex flex-col h-full bg-bg-secondary">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border-subtle flex-shrink-0">
        <ListTodo size={13} className="text-accent flex-shrink-0" />
        <span className="text-xs font-semibold text-text-primary">Tasks</span>
        {total > 0 && (
          <span className="text-[11px] font-mono text-text-muted ml-1">{done}/{total}</span>
        )}
        <button
          onClick={() => setCodeRightTab(null)}
          title="Close"
          className="ml-auto p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary"
        >
          <X size={13} />
        </button>
      </div>

      {/* Body — plain checkbox list */}
      {total === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-text-muted h-full">
          <ListTodo size={20} />
          <p className="text-xs text-center px-6">
            {working ? 'Building the task list…' : 'No tasks yet. They appear here when the agent breaks work into steps.'}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-2 py-2 font-mono">
          {progress.map((t) => (
            <div key={t.id} className="flex items-start gap-2 px-1.5 py-1">
              <span className="flex-shrink-0 mt-[2px]">
                {t.status === 'completed' ? (
                  <CheckSquare size={13} className="text-accent" />
                ) : t.status === 'in_progress' ? (
                  <Loader2 size={13} className="text-accent animate-spin" />
                ) : (
                  <Square size={13} className="text-text-muted/60" />
                )}
              </span>
              <span className={`text-[12px] leading-snug ${
                t.status === 'completed'
                  ? 'line-through text-text-muted/70'
                  : t.status === 'in_progress'
                  ? 'text-text-primary'
                  : 'text-text-secondary'
              }`}>
                {t.text}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
