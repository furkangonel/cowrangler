import React from 'react'
import { Loader2, Check, X } from 'lucide-react'
import { ActiveToolCall } from '../../stores/agent.store'
import { formatDuration } from '../../lib/time'

const TOOL_EMOJIS: Record<string, string> = {
  read_file: '📄', write_file: '✏️', edit_file: '📝', copy_file: '📋',
  delete_file: '🗑️', move_file: '📦', list_directory: '📂',
  web_search: '🔍', fetch_webpage: '🌐', http_request: '📡',
  execute_bash: '💻', get_system_info: '🖥️', get_current_time: '🕐',
  git_status: '🌿', git_commit: '📦', git_push: '🚀', git_diff: '🔀',
  git_add: '➕', git_log: '📜', git_checkout: '🔀',
  manage_todo: '✅', manage_memory: '🧠', manage_plan: '📋',
  delegate_task: '🤖', send_message: '💬', clarify: '❓',
  utilize_skill: '📚', list_skills: '📚',
  image_generate: '🎨', text_to_speech: '🔊', notify: '🔔',
}

const TOOL_LABELS: Record<string, string> = {
  read_file: 'Read file', write_file: 'Wrote file', edit_file: 'Edited file',
  list_directory: 'Listed directory', web_search: 'Web search', fetch_webpage: 'Fetched page',
  execute_bash: 'Ran command', git_status: 'Git status', git_commit: 'Commit',
  manage_todo: 'Task list', manage_memory: 'Memory', delegate_task: 'Sub-agent',
  utilize_skill: 'Used skill', image_generate: 'Generated image',
}

function emoji(name: string) { return TOOL_EMOJIS[name] ?? '🔧' }
function label(name: string) { return TOOL_LABELS[name] ?? name }

function formatArgs(args: Record<string, any>): string {
  const primary = args?.path ?? args?.file_path ?? args?.url ?? args?.query ??
    args?.command ?? (typeof args?.content === 'string' ? args.content.slice(0, 40) : undefined) ??
    args?.action ?? args?.tool_name ?? args?.task ?? args?.message
  if (primary) return String(primary).slice(0, 72)
  const keys = Object.keys(args || {})
  if (!keys.length) return ''
  return keys.slice(0, 2).map(k => `${k}=${String(args[k]).slice(0, 18)}`).join(' ')
}

export function ToolTrace({ toolCall }: { toolCall: ActiveToolCall }) {
  const { name, args, status, durationMs } = toolCall
  const argsStr = formatArgs(args)

  return (
    <div className="flex items-center gap-2 py-0.5 text-xs">
      <span className="flex-shrink-0 w-4 text-center">
        {status === 'running'
          ? <Loader2 size={12} className="text-accent animate-spin" />
          : status === 'done'
          ? <Check size={12} className="text-success" />
          : <X size={12} className="text-error" />}
      </span>
      <span className="flex-shrink-0 text-sm leading-none">{emoji(name)}</span>
      <span className={`font-medium ${status === 'error' ? 'text-error' : 'text-text-primary'}`}>
        {label(name)}
      </span>
      {argsStr && (
        <span className="text-text-muted font-mono truncate flex-1 min-w-0">{argsStr}</span>
      )}
      <span className="flex-shrink-0 text-text-muted ml-auto tabular-nums">
        {status === 'running'
          ? <span className="animate-pulse">···</span>
          : durationMs ? formatDuration(durationMs) : null}
      </span>
    </div>
  )
}
