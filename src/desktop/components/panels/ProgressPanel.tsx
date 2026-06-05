import React from 'react'
import { CheckCircle2, Circle, Loader } from 'lucide-react'
import { useAgentStore } from '../../stores/agent.store'
import { TaskProgress } from '../../lib/ipc'

export function ProgressPanel() {
  const { progress, status } = useAgentStore()

  if (progress.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center gap-2">
        <span className="text-2xl opacity-40">✅</span>
        <p className="text-xs text-text-muted">
          {status === 'thinking'
            ? 'Agent görevleri oluşturuyor...'
            : 'Henüz görev listesi yok. Agent manage_todo çağırdığında burada görünür.'}
        </p>
        {status === 'thinking' && (
          <div className="flex gap-1 mt-1">
            {[0, 1, 2].map(i => (
              <span key={i} className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
            ))}
          </div>
        )}
      </div>
    )
  }

  const completed = progress.filter(t => t.status === 'completed').length
  const total = progress.length

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-text-primary">Progress</h3>
        <span className="text-2xs text-text-muted">
          {completed}/{total}
        </span>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="h-1 bg-bg-tertiary rounded-full mb-3 overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-500"
            style={{ width: `${(completed / total) * 100}%` }}
          />
        </div>
      )}

      {/* Tasks */}
      <div className="space-y-1.5">
        {progress.map(task => (
          <TaskItem key={task.id} task={task} />
        ))}
      </div>
    </div>
  )
}

function TaskItem({ task }: { task: TaskProgress }) {
  return (
    <div className="flex items-start gap-2.5 py-1">
      <div className="flex-shrink-0 mt-0.5">
        {task.status === 'completed' ? (
          <CheckCircle2 size={13} className="text-success" />
        ) : task.status === 'in_progress' ? (
          <Loader size={13} className="text-accent animate-spin" />
        ) : (
          <Circle size={13} className="text-text-muted" />
        )}
      </div>
      <span
        className={`text-xs leading-relaxed ${
          task.status === 'completed'
            ? 'task-completed text-text-muted'
            : task.status === 'in_progress'
            ? 'text-text-primary'
            : 'text-text-secondary'
        }`}
      >
        {task.text}
      </span>
    </div>
  )
}
