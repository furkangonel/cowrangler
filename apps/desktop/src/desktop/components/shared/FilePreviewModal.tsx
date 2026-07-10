import React, { useEffect, useState, useMemo } from 'react'
import { X, ExternalLink, FileText, Image as ImageIcon, Code, Download, ChevronDown } from 'lucide-react'
import { useUIStore } from '../../stores/ui.store'
import { ipc } from '../../lib/ipc'
import { renderMarkdown } from '../../lib/markdown'

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']
const HTML_EXTS = ['.html', '.htm']
const MD_EXTS = ['.md', '.markdown']

function getExt(filePath: string) {
  const m = filePath.match(/(\.[^.]+)$/)
  return m ? m[1].toLowerCase() : ''
}

function getFileName(filePath: string) {
  return filePath.split('/').pop() ?? filePath
}

// Wrap rendered markdown in a printable, styled HTML document for PDF export.
function mdDoc(html: string): string {
  return `<!doctype html><meta charset="utf-8"><style>body{font-family:Georgia,'Times New Roman',serif;max-width:760px;margin:40px auto;padding:0 28px;line-height:1.7;color:#1a1a1a}h1,h2,h3{line-height:1.3}pre{background:#f4f4f4;padding:12px 14px;border-radius:8px;overflow:auto;font-size:13px}code{font-family:ui-monospace,SFMono-Regular,monospace}img{max-width:100%}a{color:#9a4b2e}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px 10px}</style>${html}`
}

function DlRow({ label, onClick, testId }: { label: string; onClick: () => void; testId?: string }) {
  return (
    <button onClick={onClick} data-testid={testId} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover text-left transition-colors">
      <Download size={12} className="text-text-muted" />{label}
    </button>
  )
}

export function FilePreviewModal() {
  const { previewFile, setPreviewFile } = useUIStore()
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dlOpen, setDlOpen] = useState(false)

  useEffect(() => {
    if (!previewFile) {
      setContent(null)
      setError(null)
      return
    }
    const ext = getExt(previewFile)
    if (IMAGE_EXTS.includes(ext)) {
      setContent(null); setError(null); setLoading(false)
      return
    }
    setLoading(true); setError(null); setContent(null)
    ipc.fs.readFile(previewFile)
      .then(r => {
        if (r.error) setError(r.error)
        else setContent(r.content ?? '')
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [previewFile])

  const htmlContent = useMemo(() => {
    if (!previewFile || !content) return ''
    const ext = getExt(previewFile)
    if (MD_EXTS.includes(ext)) return renderMarkdown(content)
    return ''
  }, [previewFile, content])

  if (!previewFile) return null

  const ext = getExt(previewFile)
  const isImage = IMAGE_EXTS.includes(ext)
  const isHtml = HTML_EXTS.includes(ext)
  const isMd = MD_EXTS.includes(ext)

  function close() { setPreviewFile(null) }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-overlay/80 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="relative bg-bg-primary border border-border rounded-2xl shadow-xl flex flex-col"
        style={{ width: 'min(90vw, 860px)', height: 'min(85vh, 700px)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle flex-shrink-0">
          <FileIcon ext={ext} />
          <span className="flex-1 text-sm font-medium text-text-primary truncate font-mono">
            {getFileName(previewFile)}
          </span>
          <div className="relative">
            <button
              onClick={() => setDlOpen(o => !o)}
              className="flex items-center gap-1 px-2 py-1.5 text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors text-xs"
              title="Download"
            >
              <Download size={14} /><ChevronDown size={11} />
            </button>
            {dlOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setDlOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-bg-primary border border-border rounded-xl shadow-xl overflow-hidden py-1 min-w-[170px]">
                  {isHtml && <DlRow label="Export as PDF" onClick={() => { ipc.exporter.toPdf({ srcPath: previewFile }); setDlOpen(false) }} />}
                  {isHtml && <DlRow label="Export as PNG" onClick={() => { ipc.exporter.toImage({ srcPath: previewFile }); setDlOpen(false) }} />}
                  {isMd && <DlRow label="Export as PDF" onClick={() => { ipc.exporter.toPdf({ html: mdDoc(htmlContent), name: getFileName(previewFile).replace(/\.[^.]+$/, '') }); setDlOpen(false) }} />}
                  <DlRow testId="export-save-copy" label={`Save a copy (${ext || 'file'})`} onClick={() => { ipc.exporter.saveCopy({ srcPath: previewFile }); setDlOpen(false) }} />
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => ipc.fs.openInFinder(previewFile)}
            className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors"
            title="Reveal in Finder"
          >
            <ExternalLink size={14} />
          </button>
          <button
            onClick={close}
            className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden">
          {loading && (
            <div className="flex items-center justify-center h-full text-sm text-text-muted">Loading…</div>
          )}
          {error && (
            <div className="flex items-center justify-center h-full text-sm text-error px-6 text-center">{error}</div>
          )}
          {!loading && !error && (
            <>
              {isImage && (
                <div className="flex items-center justify-center h-full p-4 bg-bg-tertiary/40">
                  <img
                    src={`file://${previewFile}`}
                    alt={getFileName(previewFile)}
                    className="max-w-full max-h-full object-contain rounded-lg"
                  />
                </div>
              )}
              {isHtml && content !== null && (
                <iframe
                  srcDoc={content}
                  className="w-full h-full border-none"
                  sandbox="allow-scripts"
                  title={getFileName(previewFile)}
                />
              )}
              {isMd && (
                <div
                  className="prose h-full overflow-y-auto px-8 py-6 selectable"
                  dangerouslySetInnerHTML={{ __html: htmlContent }}
                />
              )}
              {!isImage && !isHtml && !isMd && content !== null && (
                <pre className="h-full overflow-auto px-5 py-4 text-xs font-mono text-text-primary leading-relaxed whitespace-pre-wrap selectable">
                  {content}
                </pre>
              )}
            </>
          )}
        </div>

        {/* Footer: path */}
        <div className="px-4 py-2 border-t border-border-subtle flex-shrink-0">
          <p className="text-2xs text-text-muted font-mono truncate">{previewFile}</p>
        </div>
      </div>
    </div>
  )
}

function FileIcon({ ext }: { ext: string }) {
  if (IMAGE_EXTS.includes(ext)) return <ImageIcon size={15} className="text-text-muted flex-shrink-0" />
  if (['.html', '.htm', '.jsx', '.tsx', '.ts', '.js', '.py', '.sh'].includes(ext))
    return <Code size={15} className="text-text-muted flex-shrink-0" />
  return <FileText size={15} className="text-text-muted flex-shrink-0" />
}
