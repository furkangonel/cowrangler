import React, { useState } from 'react'
import { Copy, Check } from 'lucide-react'

interface CopyButtonProps {
  text: string
  className?: string
  iconSize?: number
}

export function CopyButton({ text, className = "", iconSize = 14 }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text).catch(err => console.error('Failed to copy', err))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className={`p-1.5 rounded-md transition-colors ${className}`}
      title="Copy to clipboard"
    >
      {copied ? (
        <Check size={iconSize} style={{ color: 'var(--color-success, #22c55e)' }} />
      ) : (
        <Copy size={iconSize} className="opacity-50 hover:opacity-100 transition-opacity" />
      )}
    </button>
  )
}
