import React from 'react'
import { CheckCircle2, Circle, Loader2, Activity, ListChecks } from 'lucide-react'
import { useAgentStore } from '../../stores/agent.store'
import { TaskProgress } from '../../lib/ipc'
import { ToolTrace } from '../session/ToolTrace'

export function ProgressPanel() {
  const { progress, status, toolCalls } = useAgentStore()
  const working = status === 'thinking'
  const activeTool = toolCalls.find(t => t.status === 'running')

  const completed = progress.filter(t => t.status === 'completed').length
  const total = progress.length
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <div className="flex flex-col">
      {/* Live status banner */}
      <div className="px-4 pt-4">
        <div className={`rounded-xl border px-3.5 py-3 transition-colors ${
          working ? 'border-accent/30 bg-accent-subtle' : 'border-border-subtle bg-bg-tertiary/50'
        }`}>
          <div className="flex items-center gap-2">
            {working
              ? <Loader2 size={15} className="text-accent animate-spin" />
              : status === 'error'
              ? <Activity size={15} className="text-error" />
              : <CheckCircle2 size={15} className="text-success" />}
            <span className="text-xs font-semibold text-text-primary">
              {working ? 'Agent is working' : status === 'error' ? 'An error occurred' : 'Ready'}
            </span>
          </div>
          {working && (
            <p className="text-2xs text-text-secondary mt-1.5 font-mono truncate">
              {activeTool ? `${activeTool.name} …` : 'thinking…'}
            </p>
          )}
        </div>
      </div>

      {/* Task checklist */}
      <div className="px-4 pt-4">
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-2xs font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
            <ListChecks size={12} /> Tasks
          </h3>
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

      {/* Live activity feed */}
      {toolCalls.length > 0 && (
        <div className="px-4 pt-5 pb-4">
          <h3 className="text-2xs font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
            <Activity size={12} /> Live activity
          </h3>
          <div className="rounded-xl border border-border-subtle bg-bg-tertiary/40 px-3 py-2 space-y-0.5 max-h-[320px] overflow-y-auto">
            {toolCalls.slice().reverse().map(tc => <ToolTrace key={tc.id} toolCall={tc} />)}
          </div>
        </div>
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
