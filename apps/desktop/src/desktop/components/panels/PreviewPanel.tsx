import React, { useEffect, useState } from 'react'
import { FileText, X } from 'lucide-react'
import { useUIStore } from '../../stores/ui.store'
import { ipc } from '../../lib/ipc'

export function PreviewPanel() {
  const { previewFile, setPreviewFile } = useUIStore()
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!previewFile) {
      setContent(null)
      setError(null)
      return
    }

    let isMounted = true
    setLoading(true)
    setError(null)

    ipc.fs.readFile(previewFile).then(res => {
      if (!isMounted) return
      setLoading(false)
      if (res.error) {
        setError(res.error)
        setContent(null)
      } else {
        setContent(res.content || '')
        setError(null)
      }
    }).catch(err => {
      if (!isMounted) return
      setLoading(false)
      setError(err.message)
    })

    return () => { isMounted = false }
  }, [previewFile])

  if (!previewFile) return null

  const fileName = previewFile.split(/[/\\]/).pop() || 'Unknown file'

  return (
    <div className="flex flex-col h-full bg-bg-secondary border-t border-border-subtle">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle bg-bg-tertiary">
        <div className="flex items-center gap-2 overflow-hidden">
          <FileText size={14} className="text-accent flex-shrink-0" />
          <span className="text-xs font-semibold text-text-primary truncate">{fileName}</span>
        </div>
        <button
          onClick={() => setPreviewFile(null)}
          className="p-1 text-text-muted hover:text-text-primary rounded-lg hover:bg-bg-hover transition-colors flex-shrink-0"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4 relative">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-xs text-text-muted animate-pulse">Loading preview...</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-xs text-error">{error}</span>
          </div>
        ) : (
          <pre className="text-2xs text-text-secondary font-mono whitespace-pre-wrap break-all w-full">
            {content}
          </pre>
        )}
      </div>
    </div>
  )
}
