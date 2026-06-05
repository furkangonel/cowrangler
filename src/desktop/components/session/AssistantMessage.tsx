import React, { useMemo } from 'react'
import { renderMarkdown } from '../../lib/markdown'

interface Props {
  content: string
  isStreaming?: boolean
}

export function AssistantMessage({ content, isStreaming }: Props) {
  const html = useMemo(() => {
    if (!content) return ''
    return renderMarkdown(content)
  }, [content])

  return (
    <div className={`max-w-[92%] ${isStreaming && !content ? 'opacity-60' : ''}`}>
      {content ? (
        <div
          className={`prose text-sm selectable ${isStreaming ? 'cursor-after' : ''}`}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <div className="flex items-center gap-2 py-1">
          <ThinkingDots />
        </div>
      )}
    </div>
  )
}

function ThinkingDots() {
  return (
    <div className="flex gap-1 items-center">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-text-muted animate-pulse"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </div>
  )
}
