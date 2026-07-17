import React, { useEffect, useMemo, useRef, useState } from 'react'
import { X, FileDown } from 'lucide-react'
import { ipc } from '../../lib/ipc'
import { buildSrcDoc, kindFromName, resolveTweakVars } from './renderScreen'
import { useDesignStore, DesignTweak } from '../../stores/design.store'

export interface ExportFile { filePath: string; name: string; tweaks?: DesignTweak[] }
export interface PdfExportOptions {
  pageSize: 'fit' | 'a4' | 'letter'
  landscape: boolean
  marginIn: number
  scale: number
}

interface Props {
  open: boolean
  onClose: () => void
  files: ExportFile[]
  /** Content (frame) intrinsic size in px. */
  fitW: number
  fitH: number
  /** Document projects paginate: each file flows across as many A4 sheets as
   *  its content needs, so the preview shows page-break guides. */
  document?: boolean
  onExport: (opts: PdfExportOptions) => void
}

const NAMED = { a4: { w: 794, h: 1123 }, letter: { w: 816, h: 1056 } }
const PAGE_LABEL: Record<string, string> = { fit: 'Fit to content', a4: 'A4', letter: 'US Letter' }
const PREVIEW_W = 300 // px, on-screen page width

/**
 * Build the exact same srcDoc the canvas uses: the screen HTML + its sibling
 * shared.css (theme vars) + resolved tweak variables. Without shared.css/tweaks
 * the preview loses the design's theme and colours.
 */
/** Once an element scrolls near the viewport, stays true (lazy-mount gate). */
function useInView<T extends Element>(ref: React.RefObject<T>): boolean {
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    if (seen) return
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setSeen(true); io.disconnect() }
    }, { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [seen, ref])
  return seen
}

function useSrcDoc(file: ExportFile, enabled: boolean): string | null {
  const [doc, setDoc] = useState<string | null>(null)
  const tweakValues = useDesignStore(s => s.tweakValues[file.filePath])
  const refreshTick = useDesignStore(s => s.refreshTick)
  useEffect(() => {
    if (!enabled) return
    let alive = true
    setDoc(null)
    const kind = kindFromName(file.filePath)
    const sharedPath = file.filePath.replace(/[^/]+$/, 'shared.css')
    const needShared = (kind === 'html' || kind === 'jsx') && !/shared\.css$/.test(file.filePath)
    Promise.all([
      ipc.design.readFile(file.filePath),
      needShared ? ipc.design.readFile(sharedPath).catch(() => ({ content: '' })) : Promise.resolve({ content: '' }),
    ]).then(([rf, rc]) => {
      if (!alive) return
      const raw = rf.content ?? ''
      const vars = resolveTweakVars(file.tweaks, tweakValues)
      // Hide scrollbars in the preview — a printed PDF page has none. Just the
      // bar is suppressed (no overflow:hidden) so nothing gets clipped early.
      const noScroll = 'html{scrollbar-width:none!important;}html::-webkit-scrollbar,body::-webkit-scrollbar,*::-webkit-scrollbar{width:0!important;height:0!important;display:none!important;}'
      const css = (rc.content ?? '') + noScroll
      setDoc(buildSrcDoc({ kind, raw, filePath: file.filePath, css, vars, resize: false }))
    }).catch(() => alive && setDoc(''))
    return () => { alive = false }
  }, [enabled, file.filePath, file.tweaks, tweakValues, refreshTick])
  return doc
}

function pageDims(pageSize: PdfExportOptions['pageSize'], landscape: boolean, fitW: number, fitH: number) {
  if (pageSize === 'fit') return { w: fitW, h: fitH }
  const p = NAMED[pageSize]
  return landscape ? { w: p.h, h: p.w } : { w: p.w, h: p.h }
}

/**
 * One WYSIWYG page. Matches the actual PDF: the HTML is laid out at the page's
 * printable pixel size (not contain-shrunk), then only display-scaled to fit the
 * modal. `scale` zooms the content exactly like printToPDF's scale option.
 */
function PagePreview({ file, opts, fitW, fitH }: { file: ExportFile; opts: PdfExportOptions; fitW: number; fitH: number }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const inView = useInView(rootRef)
  const srcDoc = useSrcDoc(file, inView)
  const { w: pageW, h: pageH } = pageDims(opts.pageSize, opts.landscape, fitW, fitH)
  const disp = PREVIEW_W / pageW
  const marginPx = opts.marginIn * 96
  const printW = Math.max(1, pageW - marginPx * 2)  // printable area, CSS px (== print layout width)
  const printH = Math.max(1, pageH - marginPx * 2)

  return (
    <div ref={rootRef} className="flex flex-col items-center gap-1.5">
      <div
        className="relative overflow-hidden shadow-md"
        style={{ width: pageW * disp, height: pageH * disp, background: '#fff', border: '1px solid var(--d-line)' }}
      >
        <div
          className="absolute overflow-hidden"
          style={{ left: marginPx * disp, top: marginPx * disp, width: printW * disp, height: printH * disp }}
        >
          {srcDoc == null ? (
            <div className="w-full h-full flex items-center justify-center text-[10px]" style={{ color: 'var(--d-ink-faint)' }}>Loading…</div>
          ) : (
            <iframe
              title={file.name}
              srcDoc={srcDoc}
              scrolling="no"
              sandbox="allow-scripts allow-same-origin"
              style={{
                width: printW,
                height: printH,
                border: 'none',
                background: '#fff',
                transform: `scale(${disp * opts.scale})`,
                transformOrigin: 'top left',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      </div>
      <span className="text-[10px] truncate max-w-[300px]" style={{ color: 'var(--d-ink-muted)' }}>{file.name.replace(/\.[^.]+$/, '')}</span>
    </div>
  )
}

const A4 = { w: 794, h: 1123 }

/**
 * Document preview — shows the file's FULL content at A4 width with dashed
 * page-break guides every A4 height, so the user sees exactly how it paginates
 * (matching the multi-page vector PDF the exporter produces). This is the
 * WYSIWYG counterpart to the "one long scroll silently clipped" old behaviour.
 */
function DocPreview({ file, opts }: { file: ExportFile; opts: PdfExportOptions }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const inView = useInView(rootRef)
  const srcDoc = useSrcDoc(file, inView)
  const pageW = opts.landscape ? A4.h : A4.w
  const pageH = opts.landscape ? A4.w : A4.h
  const disp = PREVIEW_W / pageW
  const [contentH, setContentH] = useState(pageH)

  // Measure the rendered content height (same-origin sandbox lets us read it).
  const measure = () => {
    try {
      const d = iframeRef.current?.contentDocument
      if (!d) return
      const h = Math.max(pageH, d.documentElement?.scrollHeight ?? 0, d.body?.scrollHeight ?? 0)
      setContentH(prev => (Math.abs(prev - h) > 2 ? h : prev))
    } catch { /* cross-origin fallback: keep one page */ }
  }
  useEffect(() => { if (srcDoc != null) { const t = setTimeout(measure, 200); return () => clearTimeout(t) } }, [srcDoc, pageH])

  const pages = Math.max(1, Math.ceil(contentH / pageH))

  return (
    <div ref={rootRef} className="flex flex-col items-center gap-1.5">
      <div
        className="relative shadow-md"
        style={{ width: pageW * disp, height: contentH * disp, background: '#fff', border: '1px solid var(--d-line)' }}
      >
        {srcDoc == null ? (
          <div className="w-full h-full flex items-center justify-center text-[10px]" style={{ color: 'var(--d-ink-faint)' }}>Loading…</div>
        ) : (
          <iframe
            ref={iframeRef}
            title={file.name}
            srcDoc={srcDoc}
            scrolling="no"
            sandbox="allow-scripts allow-same-origin"
            onLoad={() => { measure(); setTimeout(measure, 200) }}
            style={{
              width: pageW,
              height: contentH,
              border: 'none',
              background: '#fff',
              transform: `scale(${disp})`,
              transformOrigin: 'top left',
              pointerEvents: 'none',
            }}
          />
        )}
        {/* Page-break guides — one dashed line at each A4 boundary. */}
        {Array.from({ length: pages - 1 }).map((_, i) => (
          <div
            key={i}
            className="absolute left-0 right-0 pointer-events-none"
            style={{ top: (i + 1) * pageH * disp, borderTop: '1px dashed var(--d-clay)' }}
          />
        ))}
      </div>
      <span className="text-[10px] truncate max-w-[300px]" style={{ color: 'var(--d-ink-muted)' }}>
        {file.name.replace(/\.[^.]+$/, '')} · {pages} {pages === 1 ? 'page' : 'pages'}
      </span>
    </div>
  )
}

export function PdfExportModal({ open, onClose, files, fitW, fitH, document: isDocument, onExport }: Props) {
  // Documents are inherently A4-paginated; slides/screens default to fit-to-frame.
  const [pageSize, setPageSize] = useState<PdfExportOptions['pageSize']>(isDocument ? 'a4' : 'fit')
  const [landscape, setLandscape] = useState(false)
  const [marginIn, setMarginIn] = useState(0)
  const [scale, setScale] = useState(1)

  const opts: PdfExportOptions = useMemo(() => ({ pageSize, landscape, marginIn, scale }), [pageSize, landscape, marginIn, scale])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div
        className="flex flex-col rounded-2xl overflow-hidden w-[860px] max-w-[calc(100vw-3rem)] max-h-[calc(100vh-4rem)]"
        style={{ background: 'var(--d-cream)', border: '1px solid var(--d-line)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid var(--d-line)' }}>
          <div className="flex items-center gap-2">
            <FileDown size={16} style={{ color: 'var(--d-clay)' }} />
            <span className="design-serif text-lg font-semibold" style={{ color: 'var(--d-ink)' }}>Export to PDF</span>
            <span className="text-xs" style={{ color: 'var(--d-ink-muted)' }}>· {files.length} {files.length === 1 ? 'page' : 'pages'}</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-black/5" style={{ color: 'var(--d-ink-muted)' }}><X size={16} /></button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Preview */}
          <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center gap-6" style={{ background: 'var(--d-cream-2)' }}>
            {files.map(f => (
              isDocument
                ? <DocPreview key={f.filePath} file={f} opts={opts} />
                : <PagePreview key={f.filePath} file={f} opts={opts} fitW={fitW} fitH={fitH} />
            ))}
          </div>

          {/* Controls */}
          <div className="w-[260px] flex-shrink-0 p-5 flex flex-col gap-5 overflow-y-auto" style={{ borderLeft: '1px solid var(--d-line)' }}>
            <Field label="Page size">
              <div className="flex flex-col gap-1.5">
                {(isDocument ? (['a4', 'letter'] as const) : (['fit', 'a4', 'letter'] as const)).map(s => (
                  <button
                    key={s}
                    onClick={() => setPageSize(s)}
                    className="px-3 py-1.5 rounded-lg text-xs text-left transition-colors"
                    style={pageSize === s
                      ? { background: 'var(--d-clay)', color: '#fff', fontWeight: 600 }
                      : { background: 'var(--d-surface)', color: 'var(--d-ink-soft)', border: '1px solid var(--d-line)' }}
                  >
                    {PAGE_LABEL[s]}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Orientation">
              <div className="flex gap-1.5">
                {([['Portrait', false], ['Landscape', true]] as const).map(([lbl, val]) => (
                  <button
                    key={lbl}
                    disabled={pageSize === 'fit'}
                    onClick={() => setLandscape(val)}
                    className="flex-1 px-2 py-1.5 rounded-lg text-xs transition-colors disabled:opacity-40"
                    style={landscape === val && pageSize !== 'fit'
                      ? { background: 'var(--d-clay)', color: '#fff', fontWeight: 600 }
                      : { background: 'var(--d-surface)', color: 'var(--d-ink-soft)', border: '1px solid var(--d-line)' }}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              {pageSize === 'fit' && <span className="text-[10px] mt-1 block" style={{ color: 'var(--d-ink-faint)' }}>Uses the content's own size.</span>}
            </Field>

            <Field label={`Scale · ${Math.round(scale * 100)}%`}>
              <input type="range" min={0.25} max={2} step={0.05} value={scale} onChange={e => setScale(parseFloat(e.target.value))} className="w-full" style={{ accentColor: 'var(--d-clay)' }} />
              <div className="flex justify-between text-[9px] mt-0.5" style={{ color: 'var(--d-ink-faint)' }}><span>25%</span><span>200%</span></div>
            </Field>

            <Field label={`Margin · ${marginIn.toFixed(2)}″`}>
              <input type="range" min={0} max={1} step={0.05} value={marginIn} onChange={e => setMarginIn(parseFloat(e.target.value))} className="w-full" style={{ accentColor: 'var(--d-clay)' }} />
              <div className="flex justify-between text-[9px] mt-0.5" style={{ color: 'var(--d-ink-faint)' }}><span>0</span><span>1″</span></div>
            </Field>

            <div className="flex-1" />
            <button
              onClick={() => onExport(opts)}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ background: 'var(--d-clay)' }}
            >
              <FileDown size={15} /> Export PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--d-ink-muted)' }}>{label}</div>
      {children}
    </div>
  )
}
