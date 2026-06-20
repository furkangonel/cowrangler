import React, { useMemo } from 'react'
import { renderMarkdown } from '../../lib/markdown'

interface Props {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className = '' }: Props) {
  const html = useMemo(() => renderMarkdown(content), [content])
  return (
    <div
      className={`prose selectable ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
