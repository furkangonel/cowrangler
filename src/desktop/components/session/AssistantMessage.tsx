import React, { useMemo } from 'react'
import { renderMarkdown } from '../../lib/markdown'

interface Props {
  content: string
  isStreaming?: boolean
}

export function AssistantMessage({ content, isStreaming }: Props) {
  const html = useMemo(() => (content ? renderMarkdown(content) : ''), [content])

  if (!content) {
    return (
      <div className="flex items-center gap-2 py-1.5">
        <ThinkingDots />
        <span className="text-xs text-text-muted">Thinking…</span>
      </div>
    )
  }

  return (
    <div
      className={`prose selectable ${isStreaming ? 'cursor-after' : ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function ThinkingDots() {
  return (
    <div className="flex gap-1 items-center">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"
          style={{ animationDelay: `${i * 0.18}s` }}
        />
      ))}
    </div>
  )
}
