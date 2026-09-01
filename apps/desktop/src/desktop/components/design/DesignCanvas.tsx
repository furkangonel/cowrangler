import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react'
import { X, Maximize2, ExternalLink, GripVertical, ChevronLeft, ChevronRight, RotateCw, Play, Plus, Minus, Frame, Smartphone, Tablet, Monitor, Code2, Component, Image as ImageIcon, GitBranch } from 'lucide-react'
import { useDesignStore, DesignFrame, DesignTemplateType, DesignDevice, DesignMeta } from '../../stores/design.store'
import { ipc } from '../../lib/ipc'
import { buildSrcDoc, resolveTweakVars, kindFromName, RenderKind } from './renderScreen'
import { compileJsx } from './esbuildCompiler'
import { DeviceMockup, deviceSpec } from './DeviceMockup'
import { Player } from '@remotion/player'
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'

interface Props {
  projectId: string
  mode: DesignTemplateType
  viewport?: DesignDevice
  viewMode?: 'preview' | 'code'
}

/** Templates whose screens live in a device/browser mockup on an infinite canvas. */
export function isDeviceTemplate(mode?: string): boolean {
  return mode === 'mobile-app' || mode === 'ui-mockups' || mode === 'prototype' || mode === 'wireframe' || mode === 'live-artifact' || mode === 'blank'
}

/** Mode router — each design template arranges its screens differently. */
export function DesignCanvas({ projectId, mode, viewport, viewMode = 'preview' }: Props) {
  switch (mode) {
    case 'slides': return <StageCanvas kind="slides" viewMode={viewMode} />
    case 'document': return <DocumentCanvas viewMode={viewMode} />
    case 'resume': return <DocumentCanvas viewMode={viewMode} />
    case 'research': return <DocumentCanvas viewMode={viewMode} />
    case 'flier': return <DocumentCanvas viewMode={viewMode} />
    case 'html-email': return <EmailCanvas viewMode={viewMode} />
    case 'animation': return <StageCanvas kind="animation" viewMode={viewMode} />
    case '3d-object': return <StageCanvas kind="artifact" viewMode={viewMode} />
    case 'hyperframes': return <StageCanvas kind="animation" viewMode={viewMode} />
    default: return <FreeformCanvas projectId={projectId} mode={mode} viewport={viewport} viewMode={viewMode} />
  }
}

/* ── Primitives ────────────────────────────────────────────────────────────── */

/**
 * Ekran kaynağı.
 *
 * `rendered = true` (canvas önizlemesi): tasarımın içindeki YEREL görsel/stil
 * referansları data: URL olarak gömülü gelir. srcDoc iframe'inin base URL'i
 * olmadığı ve CSP `file:` şemasına izin vermediği için kullanıcının eklediği
 * görseller ancak böyle görünür.
 * `rendered = false` (kod editörü): ham içerik — kaydederken base64 yazmayalım.
 */
function useScreenContent(filePath: string, rendered = false): string | null {
  const refreshTick = useDesignStore(s => s.refreshTick)
  const [content, setContent] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    // readRendered eski preload'larda olmayabilir → readFile'a düş.
    const read = rendered ? (ipc.design.readRendered ?? ipc.design.readFile) : ipc.design.readFile
    read(filePath).then(r => {
      if (!alive) return
      const next = r.content ?? null
      setContent(prev => (prev === next ? prev : next))
    })
    return () => { alive = false }
  }, [filePath, refreshTick, rendered])
  return content
}

/** Inline a sibling shared.css (agents often factor shared theme vars there, and
 *  `import './shared.css'` is stripped from .jsx). html/jsx only. */
function useSharedCss(filePath: string, kind: RenderKind): string {
  const refreshTick = useDesignStore(s => s.refreshTick)
  const [css, setCss] = useState('')
  const sharedPath = useMemo(() => filePath.replace(/[^/]+$/, 'shared.css'), [filePath])
  useEffect(() => {
    if ((kind !== 'html' && kind !== 'jsx') || /shared\.css$/.test(filePath)) { setCss(''); return }
    let alive = true
    ipc.design.readFile(sharedPath).then(r => { if (alive) setCss(r.content ?? '') }).catch(() => {})
    return () => { alive = false }
  }, [sharedPath, kind, filePath, refreshTick])
  return css
}

/** Resolved live CSS variables for a screen, from its manifest + current values. */
function useLiveVars(filePath: string, meta?: DesignMeta | null): Record<string, string> {
  const values = useDesignStore(s => s.tweakValues[filePath])
  return useMemo(() => resolveTweakVars(meta?.tweaks, values), [meta, values])
}

/**
 * The single iframe primitive. Renders a screen at its intrinsic size, scaled by
 * `scale`, and keeps live tweaks flowing in via postMessage (no reload). Reports
 * the content's natural size so callers can hug content.
 */
interface ScreenTimeline {
  frame: number
  fps: number
  durationInFrames: number
}

function ScaledScreen({ filePath, kind, meta, intrinsicW, intrinsicH, scale, reloadKey, interactive = false, onNatural, timeline }: {
  filePath: string
  kind: RenderKind
  meta?: DesignMeta | null
  intrinsicW: number
  intrinsicH: number
  scale: number
  reloadKey?: number
  interactive?: boolean
  onNatural?: (w: number, h: number) => void
  timeline?: ScreenTimeline
}) {
  const raw = useScreenContent(filePath, true)
  const sharedCss = useSharedCss(filePath, kind)
  const liveVars = useLiveVars(filePath, meta)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [loaded, setLoaded] = useState(false)

  // Design-mode bus (inspector + a11y). Selectors keep re-renders minimal.
  const inspectMode = useDesignStore(s => s.inspectMode)
  const a11yRequest = useDesignStore(s => s.a11yRequest)
  const setInspectorPick = useDesignStore(s => s.setInspectorPick)
  const setA11yResult = useDesignStore(s => s.setA11yResult)

  // Ahead-of-time compile jsx with esbuild-wasm (falls back to in-iframe Babel).
  const [compiled, setCompiled] = useState<{ src: string; js?: string } | null>(null)
  useEffect(() => {
    if (kind !== 'jsx' || raw == null) { setCompiled(null); return }
    let alive = true
    compileJsx(raw).then(r => {
      if (!alive) return
      // On esbuild error, leave js undefined so the iframe surfaces the error via Babel.
      setCompiled({ src: raw, js: r.code })
    }).catch(() => { if (alive) setCompiled({ src: raw }) })
    return () => { alive = false }
  }, [raw, kind])

  const compiledJs = kind === 'jsx' && compiled?.src === raw ? compiled.js : undefined
  // Hold render until the jsx compile settles, so we don't paint twice.
  const jsxPending = kind === 'jsx' && raw != null && compiled?.src !== raw

  const srcDoc = useMemo(
    () => (raw == null || jsxPending ? null : buildSrcDoc({ kind, raw, filePath, css: sharedCss, compiledJs, engine: meta?.engine })),
    [raw, kind, filePath, sharedCss, compiledJs, jsxPending, meta?.engine],
  )

  // Push tweak vars on first load and whenever they change.
  useEffect(() => {
    if (!loaded) return
    iframeRef.current?.contentWindow?.postMessage({ type: 'apply_tweaks', vars: liveVars }, '*')
  }, [loaded, liveVars, reloadKey])

  // Remotion owns the clock; generated HTML consumes the exact same frame.
  useEffect(() => {
    if (!loaded || !timeline) return
    const last = Math.max(1, timeline.durationInFrames - 1)
    iframeRef.current?.contentWindow?.postMessage({
      type: 'remotion_frame',
      frame: timeline.frame,
      fps: timeline.fps,
      time: timeline.frame / timeline.fps,
      progress: timeline.frame / last,
      durationInFrames: timeline.durationInFrames,
    }, '*')
  }, [loaded, timeline?.frame, timeline?.fps, timeline?.durationInFrames, reloadKey])

  // Arm/disarm the in-iframe element inspector to match global inspect mode.
  useEffect(() => {
    if (!loaded) return
    iframeRef.current?.contentWindow?.postMessage({ type: 'set_inspect', on: inspectMode }, '*')
  }, [loaded, inspectMode, reloadKey])

  // Fire an accessibility scan when this screen is the requested target.
  useEffect(() => {
    if (!loaded || !a11yRequest || a11yRequest.filePath !== filePath) return
    iframeRef.current?.contentWindow?.postMessage({ type: 'run_a11y' }, '*')
  }, [loaded, a11yRequest, filePath, reloadKey])

  // Re-highlight a selector when a composer chip for this screen is clicked.
  const highlightRequest = useDesignStore(s => s.highlightRequest)
  useEffect(() => {
    if (!loaded || !highlightRequest || highlightRequest.filePath !== filePath) return
    iframeRef.current?.contentWindow?.postMessage({ type: 'highlight_selector', selector: highlightRequest.selector }, '*')
  }, [loaded, highlightRequest, filePath, reloadKey])

  // Single message listener: resize + inspector picks + a11y reports.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data
      if (!d || d.filePath !== filePath) return
      if (d.type === 'screen_resize') { onNatural?.(d.width, d.height) }
      else if (d.type === 'element_pick') {
        setInspectorPick({ filePath, selector: d.selector, tag: d.tag, text: d.text, w: d.w, h: d.h })
      } else if (d.type === 'a11y_report') {
        setA11yResult(filePath, Array.isArray(d.issues) ? d.issues : [])
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [filePath, onNatural, setInspectorPick, setA11yResult])

  if (raw == null) return <div className="w-full h-full flex items-center justify-center text-xs" style={{ color: 'var(--d-ink-faint)' }}>Loading…</div>

  return (
    <iframe
      ref={iframeRef}
      key={reloadKey}
      srcDoc={srcDoc ?? undefined}
      title={filePath}
      sandbox="allow-scripts allow-same-origin"
      onLoad={() => setLoaded(true)}
      className="border-none"
      style={{
        width: intrinsicW,
        height: intrinsicH,
        transform: `scale(${scale})`,
        transformOrigin: '0 0',
        // Inspect mode needs pointer events even on non-interactive cards so the
        // user can click an element to target it.
        pointerEvents: interactive || inspectMode ? 'auto' : 'none',
        background: '#fff',
      }}
    />
  )
}

interface RemotionScreenProps {
  filePath: string
  kind: RenderKind
  meta?: DesignMeta | null
  width: number
  height: number
  reloadKey: number
}

function RemotionScreen({ filePath, kind, meta, width, height, reloadKey }: RemotionScreenProps) {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  return (
    <AbsoluteFill style={{ background: '#fff', overflow: 'hidden' }}>
      <ScaledScreen
        filePath={filePath}
        kind={kind}
        meta={meta}
        intrinsicW={width}
        intrinsicH={height}
        scale={1}
        reloadKey={reloadKey}
        interactive
        timeline={{ frame, fps, durationInFrames }}
      />
    </AbsoluteFill>
  )
}

/** Fit-to-container scale for responsive stages. */
function useFitScale(ref: React.RefObject<HTMLElement>, intrinsicW: number, intrinsicH: number, pad = 0.96) {
  const [scale, setScale] = useState(0.5)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const { width, height } = e.contentRect
        setScale(Math.min(width / intrinsicW, height / intrinsicH) * pad)
      }
    })
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [intrinsicW, intrinsicH, pad])
  return scale
}

function KindBadge({ kind }: { kind: RenderKind }) {
  const map: Record<RenderKind, { icon: React.ReactNode; label: string }> = {
    html: { icon: <Code2 size={10} />, label: 'HTML' },
    jsx: { icon: <Component size={10} />, label: 'React' },
    svg: { icon: <ImageIcon size={10} />, label: 'SVG' },
    mermaid: { icon: <GitBranch size={10} />, label: 'Diagram' },
  }
  const m = map[kind]
  return (
    <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: 'var(--d-cream-2)', color: 'var(--d-ink-muted)' }}>
      {m.icon}{m.label}
    </span>
  )
}

function EmptyCanvas({ hint }: { hint: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'var(--d-surface)', border: '1px solid var(--d-line)' }}>
        <div className="grid grid-cols-2 gap-1">{[0, 1, 2, 3].map(i => <div key={i} className="w-5 h-4 rounded-sm" style={{ background: 'var(--d-beige-2)' }} />)}</div>
      </div>
      <p className="text-sm font-medium" style={{ color: 'var(--d-ink-soft)' }}>Describe what you want to design</p>
      <p className="text-xs" style={{ color: 'var(--d-ink-faint)' }}>{hint}</p>
    </div>
  )
}

/* ── Freeform infinite canvas (prototype / wireframe / live-artifact / blank) ── */

function FreeformCanvas({ projectId, mode, viewport, viewMode }: { projectId: string; mode: string; viewport?: DesignDevice; viewMode?: 'preview' | 'code' }) {
  const { frames, canvasScale, canvasOffsetX, canvasOffsetY, updateFramePosition, saveCanvas, setCanvasView } = useDesignStore()
  const canvasRef = useRef<HTMLDivElement>(null)
  const isPanning = useRef(false)
  const panStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 })
  const [enlarged, setEnlarged] = useState<DesignFrame | null>(null)

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1 && !e.altKey) return
    isPanning.current = true
    panStart.current = { x: e.clientX, y: e.clientY, ox: canvasOffsetX, oy: canvasOffsetY }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!isPanning.current) return
    setCanvasView(canvasScale, panStart.current.ox + (e.clientX - panStart.current.x), panStart.current.oy + (e.clientY - panStart.current.y))
  }
  const onPointerUp = () => { isPanning.current = false }
  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const next = Math.max(0.2, Math.min(3, canvasScale + (-e.deltaY * 0.0025) * canvasScale))
      const rect = e.currentTarget.getBoundingClientRect()
      const pointerX = e.clientX - rect.left
      const pointerY = e.clientY - rect.top
      const worldX = (pointerX - canvasOffsetX) / canvasScale
      const worldY = (pointerY - canvasOffsetY) / canvasScale
      setCanvasView(next, pointerX - worldX * next, pointerY - worldY * next)
    } else {
      setCanvasView(canvasScale, canvasOffsetX - e.deltaX, canvasOffsetY - e.deltaY)
    }
  }
  const zoom = (dir: 1 | -1) => setCanvasView(Math.max(0.2, Math.min(3, canvasScale + dir * 0.15)), canvasOffsetX, canvasOffsetY)
  const fitAll = useCallback(() => {
    const host = canvasRef.current
    if (!host || frames.length === 0) return
    const padding = 72
    const minX = Math.min(...frames.map(frame => frame.x))
    const minY = Math.min(...frames.map(frame => frame.y - 28))
    const maxX = Math.max(...frames.map(frame => frame.x + frame.width))
    const maxY = Math.max(...frames.map(frame => frame.y + frame.height))
    const contentW = Math.max(1, maxX - minX)
    const contentH = Math.max(1, maxY - minY)
    const next = Math.max(0.2, Math.min(1.5, Math.min(
      (host.clientWidth - padding * 2) / contentW,
      (host.clientHeight - padding * 2) / contentH,
    )))
    setCanvasView(
      next,
      (host.clientWidth - contentW * next) / 2 - minX * next,
      (host.clientHeight - contentH * next) / 2 - minY * next,
    )
  }, [frames, setCanvasView])

  const onCanvasKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === '0') { e.preventDefault(); fitAll() }
    if (e.key === '1') { e.preventDefault(); setCanvasView(1, 40, 40) }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom(1) }
    if (e.key === '-') { e.preventDefault(); zoom(-1) }
  }

  // Auto-open the code editor only when ENTERING code mode — not continuously,
  // otherwise closing the modal (enlarged → null) immediately reopens it.
  const prevViewMode = useRef(viewMode)
  useEffect(() => {
    if (viewMode === 'code' && prevViewMode.current !== 'code' && frames.length > 0) {
      setEnlarged(frames[0])
    }
    prevViewMode.current = viewMode
  }, [viewMode, frames])

  return (
    <div
      ref={canvasRef}
      tabIndex={0}
      className="flex-1 relative overflow-hidden design-canvas-dots select-none cursor-grab active:cursor-grabbing"
      style={{
        touchAction: 'none',
        backgroundPosition: `${canvasOffsetX}px ${canvasOffsetY}px`,
        backgroundSize: `${22 * canvasScale}px ${22 * canvasScale}px`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onKeyDown={onCanvasKeyDown}
      onContextMenu={e => e.preventDefault()}
    >
      <div style={{ transform: `translate3d(${canvasOffsetX}px, ${canvasOffsetY}px, 0) scale(${canvasScale})`, transformOrigin: '0 0', position: 'absolute', inset: 0, willChange: 'transform' }}>
        {frames.map(frame => (
          <FreeformCard
            key={frame.id}
            frame={frame}
            mode={mode}
            viewport={viewport}
            scale={canvasScale}
            onMove={(x, y) => updateFramePosition(frame.id, x, y)}
            onMoveEnd={() => saveCanvas(projectId)}
            onEnlarge={setEnlarged}
          />
        ))}
      </div>

      {frames.length === 0 && <EmptyCanvas hint="Screens appear here as the agent creates them — drag to arrange." />}

      {enlarged && <Lightbox frame={enlarged} onClose={() => setEnlarged(null)} viewMode={viewMode} variant={mode === 'wireframe' ? 'wireframe' : 'realistic'} />}

      <div onPointerDown={e => e.stopPropagation()} className="absolute bottom-4 right-4 flex items-center gap-1 rounded-xl p-1 design-elev cursor-default" style={{ background: 'var(--d-surface)', border: '1px solid var(--d-line)' }}>
        <button onClick={fitAll} disabled={frames.length === 0} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-black/5 disabled:opacity-40" style={{ color: 'var(--d-ink-soft)' }} title="Fit all screens (0)"><Frame size={14} /></button>
        <span className="h-4 w-px mx-0.5" style={{ background: 'var(--d-line)' }} />
        <button onClick={() => zoom(-1)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-black/5" style={{ color: 'var(--d-ink-soft)' }}><Minus size={14} /></button>
        <button onClick={() => setCanvasView(1, 40, 40)} className="text-xs font-medium w-10 h-7 rounded-lg text-center tabular-nums hover:bg-black/5" style={{ color: 'var(--d-ink-soft)' }} title="Reset to 100% (1)">{Math.round(canvasScale * 100)}%</button>
        <button onClick={() => zoom(1)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-black/5" style={{ color: 'var(--d-ink-soft)' }}><Plus size={14} /></button>
      </div>
    </div>
  )
}

function FreeformCard({ frame, mode, viewport, scale, onMove, onMoveEnd, onEnlarge }: {
  frame: DesignFrame; mode: string; viewport?: DesignDevice; scale: number
  onMove: (x: number, y: number) => void; onMoveEnd: () => void
  onEnlarge: (f: DesignFrame) => void
}) {
  const kind = frame.kind ?? kindFromName(frame.name)
  // The effective device: the top-bar selection wins for device templates, else
  // the agent's declared target. svg/mermaid never get device chrome.
  const metaDevice = frame.meta?.device ?? null
  const effectiveDevice: DesignDevice =
    (kind === 'svg' || kind === 'mermaid') ? null
    : isDeviceTemplate(mode) ? (viewport ?? metaDevice ?? 'desktop')
    : metaDevice
  const spec = deviceSpec(effectiveDevice)

  // Bare (frameless) content gets sized from its natural footprint.
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const bareW = natural?.w ?? (kind === 'svg' || kind === 'mermaid' ? 560 : 1280)
  const bareH = natural?.h ?? (kind === 'svg' || kind === 'mermaid' ? 420 : 820)

  const variant = mode === 'wireframe' ? 'wireframe' : 'realistic'
  const outerW = spec ? spec.outerW : bareW
  const outerH = spec ? spec.outerH : bareH
  const cardScale = frame.width / outerW
  const dispW = frame.width
  const dispH = outerH * cardScale

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const startX = e.clientX, startY = e.clientY, fx = frame.x, fy = frame.y
    const s = scale || 1
    let dragging = false
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY
      if (!dragging && Math.hypot(dx, dy) < 4) return
      dragging = true
      onMove(fx + dx / s, fy + dy / s)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (dragging) onMoveEnd()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const screen = (
    <ScaledScreen
      filePath={frame.filePath}
      kind={kind}
      meta={frame.meta}
      intrinsicW={spec ? spec.cw : bareW}
      intrinsicH={spec ? spec.ch : bareH}
      scale={1}
      onNatural={spec ? undefined : (w, h) => setNatural(p => (p && p.w === w && p.h === h ? p : { w, h }))}
    />
  )

  return (
    <div className="absolute top-0 left-0" style={{ transform: `translate3d(${frame.x}px, ${frame.y}px, 0)`, width: dispW, willChange: 'transform' }}>
      {/* Floating label / handle — sits above the artwork, no boxy wrapper. */}
      <div
        className="flex items-center gap-1.5 mb-1.5 px-1 cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
        onPointerDown={onDown}
      >
        <GripVertical size={12} style={{ color: 'var(--d-ink-faint)' }} />
        <span className="flex-1 text-xs font-medium truncate" style={{ color: 'var(--d-ink-soft)' }}>{frame.meta?.title || frame.name}</span>
        <KindBadge kind={kind} />
        <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onEnlarge(frame) }} className="p-1 rounded hover:bg-black/5" style={{ color: 'var(--d-ink-muted)' }} title="Open preview"><Maximize2 size={11} /></button>
        <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); ipc.fs.openExternal(`file://${frame.filePath}`) }} className="p-1 rounded hover:bg-black/5" style={{ color: 'var(--d-ink-muted)' }} title="Open in browser"><ExternalLink size={11} /></button>
      </div>
      {/* The artwork itself is the frame — content renders directly, only the
          chrome that belongs to it (device bezel / browser bar) wraps it. */}
      <div
        style={{ width: dispW, height: dispH, position: 'relative', cursor: 'pointer' }}
        onDoubleClick={() => onEnlarge(frame)}
        title="Double-click to open"
      >
        <div style={{ transform: `scale(${cardScale})`, transformOrigin: '0 0', width: outerW, height: outerH }}>
          {spec ? <DeviceMockup device={effectiveDevice as Exclude<DesignDevice, null>} title={frame.meta?.title || frame.name} variant={variant} screen={screen} />
                : <div style={{ width: bareW, height: bareH, borderRadius: variant === 'wireframe' ? 4 : 6, overflow: 'hidden', background: '#fff', boxShadow: variant === 'wireframe' ? 'none' : '0 12px 32px -16px rgba(0,0,0,0.25)', border: variant === 'wireframe' ? '2px dashed #bdb9b0' : '1px solid var(--d-line)' }}>{screen}</div>}
        </div>
      </div>
    </div>
  )
}

/* ── Stage canvas (slides / animation / hyperframes) ───────────────────────── */

function StageCanvas({ kind, viewMode }: { kind: 'slides' | 'animation' | 'artifact'; viewMode?: 'preview' | 'code' }) {
  const frames = useDesignStore(s => s.frames)
  const refreshTick = useDesignStore(s => s.refreshTick)
  const [idx, setIdx] = useState(0)
  const [reload, setReload] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const cur = frames[Math.min(idx, Math.max(frames.length - 1, 0))]
  const intrinsicW = Math.max(1, cur?.meta?.width ?? 1280)
  const intrinsicH = Math.max(1, cur?.meta?.height ?? 720)
  const fitScale = useFitScale(containerRef, intrinsicW, intrinsicH)

  useEffect(() => { if (frames.length > 0 && idx >= frames.length) setIdx(frames.length - 1) }, [frames.length, idx])
  useEffect(() => { setReload(r => r + 1) }, [refreshTick])

  const curKind = cur ? (cur.kind ?? kindFromName(cur.name)) : 'html'
  const isRemotion = kind === 'animation' && cur?.meta?.engine === 'remotion'
  const fps = Math.max(1, cur?.meta?.fps ?? 30)
  const durationInFrames = Math.max(1, cur?.meta?.durationInFrames ?? fps * 5)
  const go = (d: number) => { const n = idx + d; if (n >= 0 && n < frames.length) setIdx(n) }

  if (frames.length === 0) return <div className="flex-1 relative design-canvas-dots"><EmptyCanvas hint={kind === 'slides' ? 'Slides appear here as the agent creates them.' : kind === 'animation' ? 'Press play to watch motion render.' : 'Interactive object appears here when ready.'} /></div>

  if (viewMode === 'code' && cur) {
    return <div className="flex-1"><CodeEditor filePath={cur.filePath} /></div>
  }

  return (
    <div className="flex-1 relative flex flex-col design-canvas-dots min-h-0">
      <div className="flex-1 flex items-center justify-center p-8 gap-4 min-h-0">
        {kind === 'slides' && <button onClick={() => go(-1)} disabled={idx === 0} className="w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-30 design-elev flex-shrink-0" style={{ background: 'var(--d-surface)', color: 'var(--d-ink-soft)' }}><ChevronLeft size={18} /></button>}
        <div ref={containerRef} className="flex-1 h-full flex items-center justify-center min-w-0">
          <div className="rounded-2xl overflow-hidden design-elev-lg" style={{ width: intrinsicW * fitScale, height: intrinsicH * fitScale, background: '#fff', border: '1px solid var(--d-line)' }}>
            {cur && (isRemotion ? (
              <Player
                component={RemotionScreen}
                inputProps={{ filePath: cur.filePath, kind: curKind, meta: cur.meta, width: intrinsicW, height: intrinsicH, reloadKey: reload }}
                durationInFrames={durationInFrames}
                compositionWidth={intrinsicW}
                compositionHeight={intrinsicH}
                fps={fps}
                controls
                autoPlay
                loop
                style={{ width: intrinsicW * fitScale, height: intrinsicH * fitScale }}
              />
            ) : (
              <ScaledScreen filePath={cur.filePath} kind={curKind} meta={cur.meta} intrinsicW={intrinsicW} intrinsicH={intrinsicH} scale={fitScale} reloadKey={reload} interactive />
            ))}
          </div>
        </div>
        {kind === 'slides' && <button onClick={() => go(1)} disabled={idx >= frames.length - 1} className="w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-30 design-elev flex-shrink-0" style={{ background: 'var(--d-surface)', color: 'var(--d-ink-soft)' }}><ChevronRight size={18} /></button>}
      </div>

      {/* Filmstrip / scene picker */}
      <div className="flex items-center gap-3 px-6 py-3 overflow-x-auto flex-shrink-0" style={{ borderTop: '1px solid var(--d-line)', background: 'var(--d-paper)' }}>
        {((kind === 'animation' && !isRemotion) || kind === 'artifact') && <button onClick={() => setReload(r => r + 1)} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold flex-shrink-0 transition-transform active:scale-95" style={{ background: 'var(--d-clay)', color: 'var(--d-on-accent)' }}><Play size={13} className="fill-current" /> {kind === 'animation' ? 'Replay' : 'Reset view'}</button>}
        <span className="shrink-0 font-mono text-[10px]" style={{ color: 'var(--d-ink-faint)' }}>{intrinsicW} × {intrinsicH}{cur?.meta?.fps ? ` · ${cur.meta.fps} fps` : ''}</span>
        {frames.map((f, i) => (
          <button key={f.id} onClick={() => { setIdx(i); if (kind !== 'slides') setReload(r => r + 1) }} className="relative rounded overflow-hidden flex-shrink-0 transition-transform" style={{ width: 132, height: 74, background: '#fff', border: idx === i ? '2px solid var(--d-blue)' : '1px solid var(--d-line)', transform: idx === i ? 'scale(1.05)' : 'scale(1)' }}>
            <Thumb frame={f} boxW={132} boxH={74} />
            <span className="absolute bottom-1 right-1.5 text-[9px] font-medium" style={{ color: 'var(--d-ink-soft)', textShadow: '0 1px 2px rgba(255,255,255,0.8)' }}>{i + 1}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── Document — vertical paged scroll ──────────────────────────────────────── */

/**
 * One document file on the canvas. A file may hold MANY \`.page\` blocks, so the
 * sheet grows to the content's natural height instead of clamping to a single
 * A4 page (the old fixed-1123 + overflow:hidden box hid every page after the
 * first — the same clipping that broke the PDF). The file's own page CSS
 * (white \`.page\` on a grey body) draws the page boundaries.
 */
function DocumentSheet({ frame, index, pageW, pageH, scale }: {
  frame: DesignFrame; index: number; pageW: number; pageH: number; scale: number
}) {
  const kind = frame.kind ?? kindFromName(frame.name)
  const [naturalH, setNaturalH] = useState(pageH)
  const h = Math.max(pageH, naturalH)
  const pages = Math.max(1, Math.round(h / pageH))
  return (
    <div className="relative">
      <div
        className="rounded-lg overflow-hidden design-elev-lg"
        style={{ width: pageW * scale, height: h * scale, background: '#fff', border: '1px solid var(--d-line)' }}
      >
        <ScaledScreen
          filePath={frame.filePath} kind={kind} meta={frame.meta}
          intrinsicW={pageW} intrinsicH={h} scale={scale} interactive
          onNatural={(_w, nh) => setNaturalH(prev => (Math.abs(prev - nh) > 2 ? nh : prev))}
        />
      </div>
      <span className="absolute -left-12 top-2 text-xs tabular-nums" style={{ color: 'var(--d-ink-faint)' }}>
        {String(index + 1).padStart(2, '0')}
      </span>
      {pages > 1 && (
        <span className="absolute -left-12 top-8 text-[10px] tabular-nums" style={{ color: 'var(--d-ink-faint)' }}>
          {pages}p
        </span>
      )}
    </div>
  )
}

function DocumentCanvas({ viewMode }: { viewMode?: 'preview' | 'code' }) {
  const { frames, canvasScale, canvasOffsetX, canvasOffsetY, setCanvasView } = useDesignStore()
  // A4 @96dpi (210×297mm) — sayfa render alanı.
  const pageW = 794, pageH = 1123

  const zoom = (dir: 1 | -1) => setCanvasView(Math.max(0.2, Math.min(3, canvasScale + dir * 0.15)), canvasOffsetX, canvasOffsetY)

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const next = Math.max(0.2, Math.min(3, canvasScale + (-e.deltaY * 0.0025) * canvasScale))
      setCanvasView(next, canvasOffsetX, canvasOffsetY)
    }
  }

  if (frames.length === 0) {
    return (
      <div className="flex-1 relative design-canvas-dots">
        <EmptyCanvas hint="Sections stack into a continuous, readable document." />
      </div>
    )
  }

  if (viewMode === 'code') {
    return <div className="h-full"><CodeEditor filePath={frames[0].filePath} /></div>
  }

  return (
    <div className="flex-1 relative min-h-0">
      {/* Scrollable document area */}
      <div
        className="absolute inset-0 overflow-y-auto flex flex-col items-center gap-8 py-10"
        style={{ background: 'var(--d-cream)' }}
        onWheel={onWheel}
      >
        {frames.map((f, i) => (
          <DocumentSheet key={f.id} frame={f} index={i} pageW={pageW} pageH={pageH} scale={canvasScale} />
        ))}
      </div>

      {/* Floating zoom controls */}
      <div onPointerDown={e => e.stopPropagation()} className="absolute bottom-4 right-4 flex items-center gap-1 rounded-xl p-1 design-elev cursor-default z-10" style={{ background: 'var(--d-surface)', border: '1px solid var(--d-line)' }}>
        <button onClick={() => zoom(-1)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-black/5" style={{ color: 'var(--d-ink-soft)' }}><Minus size={14} /></button>
        <span className="text-xs font-medium w-10 text-center tabular-nums" style={{ color: 'var(--d-ink-soft)' }}>{Math.round(canvasScale * 100)}%</span>
        <button onClick={() => zoom(1)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-black/5" style={{ color: 'var(--d-ink-soft)' }}><Plus size={14} /></button>
      </div>
    </div>
  )
}

/* ── Email — inbox-width, natural-height preview ─────────────────────────── */

function EmailCanvas({ viewMode }: { viewMode?: 'preview' | 'code' }) {
  const frames = useDesignStore(s => s.frames)
  const [naturalH, setNaturalH] = useState(900)
  const frame = frames[0]
  if (!frame) return <div className="flex-1 relative design-canvas-dots"><EmptyCanvas hint="Email appears at true inbox width with mobile-safe content." /></div>
  if (viewMode === 'code') return <div className="h-full"><CodeEditor filePath={frame.filePath} /></div>
  const kind = frame.kind ?? kindFromName(frame.name)
  const width = 600
  const height = Math.max(640, naturalH)
  return (
    <div className="flex-1 min-h-0 overflow-y-auto py-10 px-6" style={{ background: 'var(--d-cream)' }}>
      <div className="mx-auto mb-3 flex items-center justify-between" style={{ width }}>
        <span className="text-xs font-semibold" style={{ color: 'var(--d-ink-soft)' }}>Inbox preview</span>
        <span className="text-[10px]" style={{ color: 'var(--d-ink-faint)' }}>600 px · natural height</span>
      </div>
      <div className="mx-auto overflow-hidden design-elev-lg" style={{ width, height, background: '#fff', border: '1px solid var(--d-line)', borderRadius: 8 }}>
        <ScaledScreen
          filePath={frame.filePath} kind={kind} meta={frame.meta}
          intrinsicW={width} intrinsicH={height} scale={1} interactive
          onNatural={(_w, nextH) => setNaturalH(previous => Math.abs(previous - nextH) > 2 ? nextH : previous)}
        />
      </div>
    </div>
  )
}

/* ── Thumbnail (filmstrip) ─────────────────────────────────────────────────── */

function Thumb({ frame, boxW, boxH }: { frame: DesignFrame; boxW: number; boxH: number }) {
  const kind = frame.kind ?? kindFromName(frame.name)
  const intrinsicW = Math.max(1, frame.meta?.width ?? 1280)
  const intrinsicH = Math.max(1, frame.meta?.height ?? 720)
  const scale = Math.min(boxW / intrinsicW, boxH / intrinsicH)
  return (
    <div style={{ width: boxW, height: boxH, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: intrinsicW * scale, height: intrinsicH * scale }}><ScaledScreen filePath={frame.filePath} kind={kind} meta={frame.meta} intrinsicW={intrinsicW} intrinsicH={intrinsicH} scale={scale} /></div>
    </div>
  )
}

/* ── Code editor ───────────────────────────────────────────────────────────── */

function CodeEditor({ filePath }: { filePath: string }) {
  const raw = useScreenContent(filePath)
  const [code, setCode] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (raw != null) setCode(raw) }, [raw])
  const save = async () => {
    setSaving(true)
    await ipc.fs.writeFile(filePath, code)
    setSaving(false)
    useDesignStore.getState().setRefreshTick()
  }
  if (raw == null) return <div className="w-full h-full flex items-center justify-center text-sm" style={{ color: 'var(--d-ink-faint)' }}>Loading…</div>
  return (
    <div className="w-full h-full flex flex-col bg-[#1e1e1e] text-[#d4d4d4] font-mono text-sm relative">
      <textarea value={code} onChange={e => setCode(e.target.value)} className="flex-1 w-full p-4 bg-transparent outline-none resize-none" spellCheck={false} />
      <div className="absolute bottom-4 right-4">
        <button onClick={save} disabled={saving || code === raw} className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg shadow-lg font-sans text-sm transition-colors">
          {saving ? 'Saving…' : code === raw ? 'Saved' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

/* ── Lightbox ──────────────────────────────────────────────────────────────── */

function Lightbox({ frame, onClose, viewMode, variant = 'realistic' }: { frame: DesignFrame; onClose: () => void; viewMode?: 'preview' | 'code'; variant?: 'realistic' | 'wireframe' }) {
  const [reload, setReload] = useState(0)
  const kind = frame.kind ?? kindFromName(frame.name)
  const containerRef = useRef<HTMLDivElement>(null)
  const spec = deviceSpec(frame.meta?.device ?? null)
  const intrinsicW = spec ? spec.outerW : 1280
  const intrinsicH = spec ? spec.outerH : 800
  const fitScale = useFitScale(containerRef, intrinsicW, intrinsicH)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const screen = <ScaledScreen filePath={frame.filePath} kind={kind} meta={frame.meta} intrinsicW={spec ? spec.cw : intrinsicW} intrinsicH={spec ? spec.ch : intrinsicH} scale={spec ? 1 : fitScale} reloadKey={reload} interactive />

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(20,17,13,0.55)' }} onClick={onClose} onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
      <div className="rounded-2xl overflow-hidden design-elev-lg flex flex-col" style={{ width: '86vw', height: '88vh', background: viewMode === 'code' ? '#1e1e1e' : 'var(--d-cream)' }} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid var(--d-line)', background: 'var(--d-surface)' }}>
          <span className="flex-1 text-sm font-medium truncate" style={{ color: 'var(--d-ink-soft)' }}>{frame.meta?.title || frame.name}</span>
          <KindBadge kind={kind} />
          <button onClick={() => setReload(r => r + 1)} className="p-1.5 rounded-lg hover:bg-black/5" style={{ color: 'var(--d-ink-muted)' }}><RotateCw size={14} /></button>
          <button onClick={() => ipc.fs.openExternal(`file://${frame.filePath}`)} className="p-1.5 rounded-lg hover:bg-black/5" style={{ color: 'var(--d-ink-muted)' }}><ExternalLink size={14} /></button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5" style={{ color: 'var(--d-ink-muted)' }}><X size={15} /></button>
        </div>
        {viewMode === 'code' ? (
          <CodeEditor filePath={frame.filePath} />
        ) : (
          <div ref={containerRef} className="flex-1 flex items-center justify-center min-h-0 p-6">
            {spec ? (
              <div style={{ transform: `scale(${fitScale})`, transformOrigin: 'center' }}>
                <DeviceMockup device={(frame.meta?.device ?? 'desktop') as Exclude<DesignDevice, null>} title={frame.meta?.title || frame.name} variant={variant} screen={screen} />
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden design-elev-lg" style={{ width: intrinsicW * fitScale, height: intrinsicH * fitScale, background: '#fff' }}>{screen}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
