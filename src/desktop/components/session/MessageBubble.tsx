import React from 'react'
import { AssistantMessage } from './AssistantMessage'
import { ToolTrace } from './ToolTrace'
import { Octopus } from '../shared/Octopus'
import { ActiveToolCall } from '../../stores/agent.store'

interface UIMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  isStreaming?: boolean
}

interface Props {
  message: UIMessage
  toolCalls?: ActiveToolCall[]
  isLast?: boolean
}

export function MessageBubble({ message, toolCalls = [], isLast = false }: Props) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end animate-fade-in">
        <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-tr-md text-md selectable bg-user-bubble border border-user-bubble-border text-text-primary">
          <p className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
        </div>
      </div>
    )
  }

  if (message.role === 'assistant') {
    return (
      <div className="flex gap-3 animate-fade-in">
        {/* Avatar — shown only on the latest message, framed in a circle */}
        <div className="flex-shrink-0 w-8 flex justify-center mt-0.5">
          {isLast
            ? <span className="flex items-center justify-center w-8 h-8 rounded-full bg-accent-subtle overflow-hidden ring-1 ring-accent/15">
                <Octopus size={26} thinking={!!message.isStreaming} />
              </span>
            : <div className="w-8" />}
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-2">
          {/* Activity (tool calls) */}
          {toolCalls.length > 0 && (
            <div className="rounded-xl border border-border-subtle bg-bg-secondary/60 px-3 py-2 space-y-0.5">
              {toolCalls.map(tc => <ToolTrace key={tc.id} toolCall={tc} />)}
            </div>
          )}

          {(message.content || message.isStreaming) && (
            <AssistantMessage content={message.content} isStreaming={message.isStreaming} />
          )}
        </div>
      </div>
    )
  }

  return null
}
