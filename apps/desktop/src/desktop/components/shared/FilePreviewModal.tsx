import React, { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Code, Download, ExternalLink, File, FileText, Image as ImageIcon, X } from 'lucide-react'
import { useUIStore } from '../../stores/ui.store'
import { ipc } from '../../lib/ipc'
import { renderMarkdown } from '../../lib/markdown'

type PreviewResult = Awaited<ReturnType<typeof ipc.fs.previewFile>>

function getExt(filePath: string) { return filePath.match(/(\.[^.]+)$/)?.[1].toLowerCase() ?? '' }
function getFileName(filePath: string) { return filePath.split(/[\\/]/).pop() ?? filePath }
function formatBytes(bytes?: number) {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
function mdDoc(html: string): string {
  return `<!doctype html><meta charset="utf-8"><style>body{font-family:Georgia,'Times New Roman',serif;max-width:760px;margin:40px auto;padding:0 28px;line-height:1.7;color:#1a1a1a}h1,h2,h3{line-height:1.3}pre{background:#f4f4f4;padding:12px 14px;border-radius:8px;overflow:auto;font-size:13px}code{font-family:ui-monospace,SFMono-Regular,monospace}img{max-width:100%}a{color:#9a4b2e}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px 10px}</style>${html}`
}
function ActionRow({ label, onClick }: { label: string; onClick: () => void }) {
  return <button onClick={onClick} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"><Download size={12} />{label}</button>
}

/** Right-panel file viewer. Kept in this file to preserve old imports. */
export function FilePreviewPanel() {
  const { previewFile, setPreviewFile } = useUIStore()
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!previewFile) { setPreview(null); return }
    let alive = true
    setLoading(true)
    setPreview(null)
    ipc.fs.previewFile(previewFile)
      .then(result => { if (alive) setPreview(result) })
      .catch(error => { if (alive) setPreview({ kind: 'unsupported', error: String(error) }) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [previewFile])

  const markdownHtml = useMemo(() => preview?.kind === 'markdown' ? renderMarkdown(preview.content ?? '') : '', [preview])
  if (!previewFile) return null

  const ext = getExt(previewFile)
  const name = getFileName(previewFile)
  const canRenderPdf = preview?.kind === 'html' || preview?.kind === 'markdown'

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-secondary">
      <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border-subtle px-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border bg-bg-tertiary text-text-muted"><FileIcon kind={preview?.kind} ext={ext} /></span>
        <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-text-primary">{name}</p><p className="truncate text-[9px] text-text-muted">{formatBytes(preview?.size)}{preview?.kind ? ` · ${preview.kind}` : ''}</p></div>
        <div className="relative">
          <button onClick={() => setMenuOpen(value => !value)} title="Export" className="flex items-center gap-1 rounded-lg p-1.5 text-text-muted hover:bg-bg-hover hover:text-text-primary"><Download size={14} /><ChevronDown size={10} /></button>
          {menuOpen && <><div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} /><div className="absolute right-0 top-full z-50 mt-1 min-w-[178px] overflow-hidden rounded-xl border border-border bg-bg-elevated py-1 shadow-pop">
            {preview?.kind === 'html' && <ActionRow label="Export as PNG" onClick={() => { void ipc.exporter.toImage({ srcPath: previewFile }); setMenuOpen(false) }} />}
            {canRenderPdf && <ActionRow label="Export as PDF" onClick={() => { if (preview?.kind === 'html') void ipc.exporter.toPdf({ srcPath: previewFile }); else void ipc.exporter.toPdf({ html: mdDoc(markdownHtml), name: name.replace(/\.[^.]+$/, '') }); setMenuOpen(false) }} />}
            <ActionRow label={`Save a copy (${ext || 'file'})`} onClick={() => { void ipc.exporter.saveCopy({ srcPath: previewFile }); setMenuOpen(false) }} />
          </div></>}
        </div>
        <button onClick={() => void ipc.fs.openInFinder(previewFile)} title="Reveal in Finder" className="rounded-lg p-1.5 text-text-muted hover:bg-bg-hover hover:text-text-primary"><ExternalLink size={14} /></button>
        <button onClick={() => setPreviewFile(null)} title="Close preview" className="rounded-lg p-1.5 text-text-muted hover:bg-bg-hover hover:text-text-primary"><X size={14} /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden bg-bg-primary">
        {loading && <div className="grid h-full place-items-center text-xs text-text-muted"><span className="animate-pulse">Rendering preview…</span></div>}
        {!loading && preview?.error && <EmptyPreview title="Preview unavailable" detail={preview.error} />}
        {!loading && preview && !preview.error && <PreviewBody preview={preview} markdownHtml={markdownHtml} name={name} />}
      </div>
      <footer className="shrink-0 border-t border-border-subtle px-3 py-2"><p className="truncate font-mono text-[9px] text-text-muted" title={previewFile}>{previewFile}</p></footer>
    </div>
  )
}

function PreviewBody({ preview, markdownHtml, name }: { preview: PreviewResult; markdownHtml: string; name: string }) {
  if (preview.kind === 'image') return <div className="grid h-full place-items-center overflow-auto p-5"><img src={preview.dataUrl} alt={name} className="max-h-full max-w-full rounded-lg object-contain shadow-panel" /></div>
  if (preview.kind === 'pdf') return <embed src={preview.dataUrl} type="application/pdf" className="h-full w-full" />
  if (preview.kind === 'video') return <div className="grid h-full place-items-center bg-black p-4"><video src={preview.dataUrl} controls className="max-h-full max-w-full" /></div>
  if (preview.kind === 'audio') return <div className="grid h-full place-items-center p-6"><audio src={preview.dataUrl} controls className="w-full" /></div>
  if (preview.kind === 'html') return <iframe srcDoc={preview.content} sandbox="allow-scripts" title={name} className="h-full w-full border-0 bg-white" />
  if (preview.kind === 'markdown') return <article className="prose h-full overflow-y-auto px-6 py-5 selectable" dangerouslySetInnerHTML={{ __html: markdownHtml }} />
  if (preview.kind === 'document' || preview.kind === 'spreadsheet' || preview.kind === 'presentation') return <div className={`office-preview office-preview--${preview.kind}`} dangerouslySetInnerHTML={{ __html: preview.content ?? '' }} />
  if (preview.kind === 'text') return <pre className="h-full overflow-auto whitespace-pre-wrap break-words px-4 py-4 font-mono text-[11px] leading-relaxed text-text-primary selectable">{preview.content}</pre>
  return <EmptyPreview title="No inline preview" detail="Save a copy or reveal this file in Finder." />
}

function EmptyPreview({ title, detail }: { title: string; detail: string }) {
  return <div className="grid h-full place-items-center p-8 text-center"><div><File size={24} className="mx-auto mb-3 text-text-muted" /><p className="text-sm font-medium text-text-primary">{title}</p><p className="mt-1 text-xs leading-relaxed text-text-muted">{detail}</p></div></div>
}
function FileIcon({ kind, ext }: { kind?: PreviewResult['kind']; ext: string }) {
  if (kind === 'image') return <ImageIcon size={14} />
  if (kind === 'html' || ['.jsx', '.tsx', '.ts', '.js', '.py', '.sh'].includes(ext)) return <Code size={14} />
  return <FileText size={14} />
}

export const FilePreviewModal = FilePreviewPanel
