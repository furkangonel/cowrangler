import React from 'react'
import { AssistantMessage } from './AssistantMessage'
import { ToolGroup } from './ToolGroup'
import { Octopus } from '../shared/Octopus'
import { TimelineSegment } from '../../stores/agent.store'

interface UIMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  isStreaming?: boolean
}

interface Props {
  message: UIMessage
  /** O asistan turunun kronolojik segment akışı (text ↔ tool grupları) */
  timeline?: TimelineSegment[]
  isLast?: boolean
}

export function MessageBubble({ message, timeline, isLast = false }: Props) {
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
    const hasTimeline = !!timeline && timeline.length > 0
    // Akan imleci yalnızca SON metin segmentinde göster.
    const lastTextIdx = hasTimeline
      ? timeline!.reduce((acc, seg, i) => (seg.kind === 'text' ? i : acc), -1)
      : -1

    return (
      <div className="flex gap-3 animate-fade-in">
        {/* Avatar — yalnız son mesajda; kendi kendine oynamaz, sadece hover'da. */}
        <div className="flex-shrink-0 w-8 flex justify-center mt-0.5">
          {isLast
            ? <span className="flex items-center justify-center w-8 h-8 rounded-full bg-accent-subtle overflow-hidden ring-1 ring-accent/15">
                <Octopus size={26} />
              </span>
            : <div className="w-8" />}
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-2">
          {hasTimeline ? (
            timeline!.map((seg, i) =>
              seg.kind === 'text'
                ? (seg.text
                    ? <AssistantMessage key={seg.id} content={seg.text} isStreaming={message.isStreaming && i === lastTextIdx} />
                    : null)
                : <ToolGroup key={seg.id} calls={seg.calls} />
            )
          ) : (message.content || message.isStreaming) ? (
            <AssistantMessage content={message.content} isStreaming={message.isStreaming} />
          ) : null}
        </div>
      </div>
    )
  }

  return null
}
