import React, { useEffect } from 'react'
import { CheckCircle2, Circle, Loader2 } from 'lucide-react'
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
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-2xs font-semibold text-text-muted uppercase tracking-wider">Tasks</h3>
        {total > 0 && <span className="text-2xs text-text-muted tabular-nums">{completed}/{total}</span>}
      </div>

      {total === 0 ? (
        <p className="text-2xs text-text-muted leading-relaxed py-1">
          {working
            ? 'The agent is building the task list…'
            : 'No task list. It appears here once the agent creates a plan.'}
        </p>
      ) : (
        <>
          <div className="h-1.5 bg-bg-tertiary rounded-full mb-3 overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="space-y-0.5">
            {progress.map(task => <TaskItem key={task.id} task={task} />)}
          </div>
        </>
      )}
    </div>
  )
}

function TaskItem({ task }: { task: TaskProgress }) {
  return (
    <div className="flex items-start gap-2.5 py-1">
      <div className="flex-shrink-0 mt-0.5">
        {task.status === 'completed'
          ? <CheckCircle2 size={14} className="text-success" />
          : task.status === 'in_progress'
          ? <Loader2 size={14} className="text-accent animate-spin" />
          : <Circle size={14} className="text-text-muted" />}
      </div>
      <span className={`text-xs leading-relaxed ${
        task.status === 'completed'
          ? 'task-completed text-text-muted'
          : task.status === 'in_progress'
          ? 'text-text-primary font-medium'
          : 'text-text-secondary'
      }`}>
        {task.text}
      </span>
    </div>
  )
}
