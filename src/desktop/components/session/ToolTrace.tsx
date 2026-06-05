import React from 'react'
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
  image_generate: '🎨', text_to_speech: '🔊',
  notify: '🔔',
}

function getToolEmoji(name: string): string {
  return TOOL_EMOJIS[name] ?? '🔧'
}

function formatArgs(args: Record<string, any>): string {
  const keys = Object.keys(args)
  if (!keys.length) return ''

  // En anlamlı argümanı göster
  const primary = args.path ?? args.file_path ?? args.url ?? args.query ??
    args.command ?? args.content?.slice?.(0, 40) ??
    args.action ?? args.tool_name ?? args.task ?? args.message
  if (primary) return String(primary).slice(0, 60)

  return keys.slice(0, 2).map(k => `${k}=${String(args[k]).slice(0, 20)}`).join(' ')
}

interface Props {
  toolCall: ActiveToolCall
}

export function ToolTrace({ toolCall }: Props) {
  const { name, args, status, durationMs } = toolCall
  const emoji = getToolEmoji(name)
  const argsStr = formatArgs(args)

  return (
    <div className={`tool-trace flex items-baseline gap-2 py-0.5 ${status === 'error' ? 'text-error' : ''}`}>
      <span className="text-text-muted flex-shrink-0">┊</span>
      <span className="flex-shrink-0">
        {status === 'running' ? (
          <span className="animate-pulse">{emoji}</span>
        ) : status === 'done' ? (
          <span className="text-success">✓</span>
        ) : (
          <span className="text-error">✗</span>
        )}
      </span>
      <span className={`font-mono ${status === 'done' ? 'text-text-secondary' : status === 'error' ? 'text-error' : 'text-text-primary'}`}>
        {name}
      </span>
      {argsStr && (
        <span className="text-text-muted truncate flex-1 max-w-[200px]">
          {argsStr}
        </span>
      )}
      <span className="flex-shrink-0 text-text-muted ml-auto">
        {status === 'running' ? (
          <span className="animate-pulse">···</span>
        ) : durationMs ? (
          formatDuration(durationMs)
        ) : null}
      </span>
    </div>
  )
}
