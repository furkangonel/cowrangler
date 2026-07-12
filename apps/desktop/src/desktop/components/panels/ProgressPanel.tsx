import React, { useEffect } from 'react'
import { Check, Circle, Loader2 } from 'lucide-react'
import { useAgentStore } from '../../stores/agent.store'
import { TaskProgress, ipc } from '../../lib/ipc'

/**
 * ProgressPanel — yalnızca GÖREV (task) yönetimi.
 * Canlı durum banner'ı / "Live activity" akışı bilinçli olarak kaldırıldı:
 * tool çağrıları artık sohbet akışında kronolojik olarak gösterilir.
 */
export function ProgressPanel({ projectId, sessionId }: { projectId: string; sessionId?: string | null }) {
  const { progress, status, setProgress } = useAgentStore()
  const working = status === 'thinking'

  useEffect(() => {
    // Session değişince önce temizle — bir önceki session'ın task'ları görünmesin
    setProgress([])
    if (projectId && sessionId && sessionId !== '__new__') {
      ipc.agent.getTodo(projectId, sessionId).then(tasks => {
        setProgress(tasks ?? [])
      })
    }
  }, [projectId, sessionId, setProgress])

  const completed = progress.filter(t => t.status === 'completed').length
  const total = progress.length
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <div className="px-4 py-4 bg-bg-elevated/60 transition-colors">
      {total === 0 ? (
        <p className="text-xs text-text-muted leading-relaxed py-1">
          {working
            ? 'The agent is building the task list…'
            : 'No task list. It appears here once the agent creates a plan.'}
        </p>
      ) : (
        <div className="flex flex-col gap-3.5 pr-1 max-h-[350px] overflow-y-auto overflow-x-hidden custom-scrollbar">
          {progress.map(task => <TaskItem key={task.id} task={task} />)}
        </div>
      )}
    </div>
  )
}

function TaskItem({ task }: { task: TaskProgress }) {
  return (
    <div className="flex items-start gap-3.5">
      <div className="flex-shrink-0 mt-[3px]">
        {task.status === 'completed' ? (
          <div className="flex items-center justify-center w-[16px] h-[16px] rounded-full bg-[#5B89F7]/90 shadow-sm">
            <Check size={10} className="text-[#1c1c1c]" strokeWidth={2.5} />
          </div>
        ) : task.status === 'in_progress' ? (
          <Loader2 size={16} className="text-accent animate-spin" />
        ) : (
          <Circle size={16} className="text-text-muted/60" strokeWidth={2} />
        )}
      </div>
      <span className={`text-[13.5px] tracking-[0.01em] leading-relaxed ${
        task.status === 'completed'
          ? 'line-through decoration-text-muted/30 decoration-1 text-text-muted/80'
          : task.status === 'in_progress'
          ? 'text-text-primary font-medium'
          : 'text-text-secondary'
      }`}>
        {task.text}
      </span>
    </div>
  )
}
