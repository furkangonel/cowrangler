import React from 'react'
import { AssistantMessage } from './AssistantMessage'
import { ToolTrace } from './ToolTrace'
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
}

export function MessageBubble({ message, toolCalls = [] }: Props) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end animate-fade-in">
        <div
          className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm selectable"
          style={{
            background: '#1c2a1c',
            border: '1px solid #2a3a2a',
            color: '#e8e8e8',
          }}
        >
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </div>
    )
  }

  if (message.role === 'assistant') {
    return (
      <div className="flex flex-col gap-0.5 animate-fade-in">
        {/* Tool traces — para current message*/}
        {toolCalls.length > 0 && (
          <div className="mb-1">
            {toolCalls.map(tc => (
              <ToolTrace key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}
        {/* Assistant text */}
        {(message.content || message.isStreaming) && (
          <AssistantMessage
            content={message.content}
            isStreaming={message.isStreaming}
          />
        )}
      </div>
    )
  }

  return null
}
