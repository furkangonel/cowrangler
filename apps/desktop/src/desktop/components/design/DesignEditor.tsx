import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  Square, ArrowUp, ArrowRight, Layers, Database, Code2, PenTool, X, Check, Pencil, Trash2,
  ChevronDown, Eye, PanelLeft, MessageSquare, Palette, Monitor, Smartphone, Tablet, FolderOpen, Download, HelpCircle,
  SlidersHorizontal, RotateCcw, MousePointerClick, ShieldCheck, History, AlertTriangle, Clock,
  Brain, ChevronRight, Paperclip, FileText,
} from 'lucide-react'
import { useFileDrop } from '../../lib/useFileDrop'
import { parseAttachments, isImagePath, useLocalImage, fileName as attachFileName } from '../../lib/attachments'
import { useDesignStore, DesignSystemRecord, DesignFrame, DesignMeta, DesignTweak, DesignDevice, DesignActivity, InspectorPick } from '../../stores/design.store'
import { useSettingsStore } from '../../stores/settings.store'
import { DesignCanvas, isDeviceTemplate } from './DesignCanvas'
import { buildSrcDoc, kindFromName, resolveTweakVars } from './renderScreen'

import { CopyButton } from '../shared/CopyButton'
import { ClampText } from '../ClampText'
import { PdfExportModal, ExportFile, PdfExportOptions } from './PdfExportModal'
import { RobotLoader } from '../shared/RobotLoader'
import { DesignTopBar } from './DesignTopBar'
import { renderMarkdown } from '../../lib/markdown'
import { ipc } from '../../lib/ipc'
import { useModelPool } from '../../hooks/useModelPool'

interface Props { onBack: () => void }

type ContextModal = 'designsystem' | 'codebase' | 'figma' | null

const CONTEXT: { key: Exclude<ContextModal, null>; icon: React.ReactNode; label: string; bg: string }[] = [
  { key: 'designsystem', icon: <Database size={14} />, label: 'Design system', bg: '#c24a22' },
  { key: 'codebase', icon: <Code2 size={14} />, label: 'Codebase', bg: '#4a6ba8' },
  { key: 'figma', icon: <PenTool size={14} />, label: 'Figma', bg: '#9b59b6' },
]

/* ── Ek dosyalar ───────────────────────────────────────────────────────────── */

/** Composer chip'inin küçük görsel önizlemesi (sürükle-bırak URL'i yoksa diskten). */
function DesignChipThumb({ file }: { file: { name: string; relPath: string; previewUrl?: string } }) {
  const { src } = useLocalImage(file.previewUrl || (isImagePath(file.relPath) ? file.relPath : undefined))
  if (!src) return <FileText size={10} className="flex-shrink-0" style={{ color: 'var(--d-ink-muted)' }} />
  return <img src={src} alt={file.name} className="w-5 h-5 rounded object-cover flex-shrink-0" />
}

function DesignImageAttachment({ path }: { path: string }) {
  const { src, failed } = useLocalImage(path)
  if (failed) {
    return (
      <div className="px-2 py-1 rounded-lg text-xs font-medium max-w-[220px] truncate"
        style={{ background: 'var(--d-cream-2)', border: '1px solid var(--d-line)', color: 'var(--d-ink-soft)' }}
        title={path}
      >{attachFileName(path)}</div>
    )
  }
  if (!src) return <div className="rounded-xl animate-pulse" style={{ width: 140, height: 96, background: 'var(--d-cream-2)' }} />
  return (
    <button
      onClick={() => ipc.fs.openInFinder(path)}
      title={attachFileName(path)}
      className="block overflow-hidden rounded-xl"
      style={{ border: '1px solid var(--d-line)' }}
    >
      <img src={src} alt={attachFileName(path)} className="max-h-[220px] max-w-[280px] w-auto h-auto object-contain block" />
    </button>
  )
}

/** Kullanıcı mesajındaki ekler: görseller render edilir, diğerleri chip olur. */
function DesignAttachments({ files }: { files: string[] }) {
  if (!files.length) return null
  const images = files.filter(isImagePath)
  const others = files.filter(f => !isImagePath(f))
  return (
    <div className="flex flex-col items-end gap-1.5">
      {images.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {images.map(p => <DesignImageAttachment key={p} path={p} />)}
        </div>
      )}
      {others.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {others.map(p => (
            <button key={p} onClick={() => ipc.fs.openInFinder(p)} title={p}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium max-w-[220px]"
              style={{ background: 'var(--d-cream-2)', border: '1px solid var(--d-line)', color: 'var(--d-ink-soft)' }}
            >
              <FileText size={11} style={{ color: 'var(--d-ink-muted)' }} />
              <span className="truncate">{attachFileName(p)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function DesignEditor({ onBack }: Props) {
  const {
    activeProject, frames, messages, sessions, sessionId, chatLoading, streamingText, qaPrompt, pendingMessage,
    sendMessage, interruptChat, answerQa, clearChat, loadCanvas, loadHistory, switchSession, scanAndMergeScreens,
    renameProject, deleteProject, systems, loadSystems, setPending,
    tweaksOn, setTweaksOn, tweakValues, setTweakValue, resetTweaks, persistTweaks,
    checkpoints, loadCheckpoints, saveCheckpoint, restoreCheckpoint,
    inspectMode, setInspectMode, inspectorPick, setInspectorPick, requestHighlight,
    a11yResults, a11yRunning, requestA11y, clearA11y,
  } = useDesignStore()
  const startedRef = useRef<string | null>(null)
  const { getModel } = useSettingsStore()

  const [input, setInput] = useState('')
  const drop = useFileDrop(activeProject?.id)
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  // Ana uygulamayla AYNI model havuzu (saved ∪ plugin) + kilit bilgisi.
  const { displayModels, modelGates, unlockingModel, unlockModel } = useModelPool(modelPickerOpen)
  const [chatOpen, setChatOpen] = useState(true)
  const [filesOpen, setFilesOpen] = useState(true)
  const [preview, setPreview] = useState<{ filePath: string; name: string; content: string | null; meta?: DesignMeta | null } | null>(null)
  const [headerMenu, setHeaderMenu] = useState(false)
  const [viewport, setViewport] = useState<DesignDevice>('desktop')
  const [viewportTouched, setViewportTouched] = useState(false)
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview')
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [ctxModal, setCtxModal] = useState<ContextModal>(null)
  const [attachedSystem, setAttachedSystem] = useState<string | null>(null)
  const [attachedFolder, setAttachedFolder] = useState<string | null>(null)
  const [dlMenu, setDlMenu] = useState<string | null>(null)
  const [deckMenu, setDeckMenu] = useState(false)
  const [pdfModal, setPdfModal] = useState<ExportFile[] | null>(null)
  const [pickedRefs, setPickedRefs] = useState<InspectorPick[]>([])
  const [historyMenuOpen, setHistoryMenuOpen] = useState(false)
  const [versionsMenuOpen, setVersionsMenuOpen] = useState(false)
  const [a11yPanelOpen, setA11yPanelOpen] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; msg: string; path?: string; busy?: boolean } | null>(null)
  const [composerNotice, setComposerNotice] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const modelRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)

  const effectiveModel = selectedModel ?? getModel() ?? undefined
  const modelLabel = effectiveModel ? (effectiveModel.split('/').pop() ?? effectiveModel) : 'Opus 4.8'

  useEffect(() => {
    if (!activeProject) return
    setViewportTouched(false)
    setViewport(activeProject.designType === 'mobile-app' ? 'mobile' : 'desktop')
    loadCanvas(activeProject.id)
    loadCheckpoints(activeProject.id)
    // Restore prior conversation — unless the home screen queued a first message
    // to auto-send (a brand-new project has no history to load). Sonrasında
    // agent hâlâ çalışıyorsa canlı akışa yeniden bağlan (resumeRunning).
    if (!useDesignStore.getState().pendingMessage) {
      const pid = activeProject.id
      loadHistory(pid).then(() => useDesignStore.getState().resumeRunning(pid))
    }
  }, [activeProject?.id])

  // A click in inspect mode adds a targeted element as a chip above the composer
  // (not raw text). The chip is included in the prompt on send and, when clicked,
  // re-highlights the element on the canvas.
  useEffect(() => {
    if (!inspectorPick) return
    const pick = inspectorPick
    setPickedRefs(prev =>
      prev.some(p => p.filePath === pick.filePath && p.selector === pick.selector)
        ? prev
        : [...prev, pick])
    setInspectMode(false)
    setInspectorPick(null)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [inspectorPick])

  // Auto-send the prompt typed on the home screen so generation starts on open.
  // `pendingMessage` dep'i: pending mount'tan SONRA set edilse bile tetiklenir
  // (aynı proje id'siyle ikinci setActiveProject remount yaratmaz).
  useEffect(() => {
    if (!activeProject || startedRef.current === activeProject.id) return
    const pending = useDesignStore.getState().pendingMessage
    if (pending) {
      startedRef.current = activeProject.id
      setPending(null)
      if (pending.model) setSelectedModel(pending.model)
      sendMessage(pending.text, pending.model)
    }
  }, [activeProject?.id, pendingMessage])
  // Boşta (agent çalışmıyorken) dışarıdan dosya değişikliğini yakalamak için
  // yavaş nabız. Agent çalışırken tarama zaten store'un debounce'lı akışında
  // yapılıyor — o yüzden burada yalnız !chatLoading iken tara. scanAndMerge
  // değişiklik yoksa no-op (disk yazmaz, preview yenilemez).
  useEffect(() => {
    if (!activeProject || chatLoading) return
    const t = setInterval(() => { scanAndMergeScreens(activeProject.id) }, 8000)
    return () => clearInterval(t)
  }, [activeProject?.id, chatLoading])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length, streamingText])
  // Surface approval/clarification prompts even if the chat panel was collapsed.
  useEffect(() => { if (qaPrompt) { setChatOpen(true); requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })) } }, [qaPrompt])
  useEffect(() => { loadSystems() }, [])
  // Keep an active file selected for the Tweaks panel / code editor.
  useEffect(() => {
    if (frames.length === 0) { setActiveFilePath(null); return }
    if (!activeFilePath || !frames.some(f => f.filePath === activeFilePath)) setActiveFilePath(frames[0].filePath)
  }, [frames, activeFilePath])
  // Default the device selector to the agent's declared target until the user picks one.
  useEffect(() => {
    if (viewportTouched) return
    const dev = frames.find(f => f.meta?.device)?.meta?.device
    if (dev && dev !== viewport) setViewport(dev)
  }, [frames, viewportTouched])
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) setModelPickerOpen(false)
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) setHeaderMenu(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  async function commitRename(name: string) {
    const t = name.trim()
    if (t && activeProject && t !== activeProject.name) await renameProject(activeProject.id, t)
    setRenaming(null)
  }
  async function handleDelete() {
    if (!activeProject) return
    if (!window.confirm(`Delete "${activeProject.name}"? This removes its screens too.`)) return
    await deleteProject(activeProject.id)
    onBack()
  }
  async function attachCodebase() {
    if (!activeProject) return
    const folder = await ipc.fs.pickFolder()
    if (!folder) return
    await ipc.projects.addFolder(activeProject.id, folder)
    setAttachedFolder(folder)
    setCtxModal(null)
  }
  async function chooseSystem(id: string | null) {
    if (!activeProject) return
    await ipc.design.attachSystem({ projectId: activeProject.id, designSystemId: id })
    setAttachedSystem(id)
  }
  // Natural page size per template — keeps the native dialog and the rendered
  // output in the right format (16:9 slides, A4 docs, desktop screens).
  function dimsFor(type?: string, frame?: DesignFrame | null): { w: number; h: number; landscape: boolean } {
    if (frame?.meta?.width && frame.meta.height) return { w: frame.meta.width, h: frame.meta.height, landscape: frame.meta.width > frame.meta.height }
    if (type === 'slides' || type === 'animation' || type === '3d-object') return { w: 1280, h: 720, landscape: true }
    if (type === 'document' || type === 'research' || type === 'resume' || type === 'flier') return { w: 794, h: 1123, landscape: false }
    if (type === 'html-email') return { w: 600, h: 900, landscape: false }
    if (type === 'mobile-app') return { w: 390, h: 844, landscape: false }
    return { w: 1280, h: 800, landscape: false }
  }
  function showToast(t: { ok: boolean; msg: string; path?: string; busy?: boolean }, hold = 5000) {
    setToast(t)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    if (!t.busy) toastTimer.current = setTimeout(() => setToast(null), hold)
  }
  // Await every export and surface the outcome — a silent failure was the whole
  // "file won't save" complaint. Cancelling the dialog just dismisses quietly.
  async function runExport(label: string, p: Promise<{ ok: boolean; path?: string; count?: number; error?: string }>) {
    showToast({ ok: true, msg: `Exporting ${label}…`, busy: true })
    try {
      const r = await p
      if (r?.ok) showToast({ ok: true, msg: `${label} exported${r.count && r.count > 1 ? ` · ${r.count} pages` : ''}`, path: r.path })
      else if (r?.error) showToast({ ok: false, msg: `Export failed — ${r.error}` })
      else setToast(null)
    } catch (e: any) { showToast({ ok: false, msg: `Export failed — ${e?.message ?? e}` }) }
  }
  function downloadScreen(filePath: string, name: string, fmt: 'pdf' | 'png' | 'jpg' | 'copy' | 'pptx' | 'html' | 'video') {
    const frame = frames.find(item => item.filePath === filePath)
    const { w, h } = dimsFor(activeProject?.designType, frame)
    const base = name.replace(/\.[^.]+$/, '')
    setDlMenu(null)
    if (fmt === 'pdf') {
      setPdfModal([{ filePath, name, tweaks: frame?.meta?.tweaks, meta: frame?.meta }])   // PDF → ölçekli önizleme modalı
    }
    else if (fmt === 'png') runExport('PNG', ipc.exporter.toImage({ srcPath: filePath, name: base, width: w, height: h, format: 'png', scale: 2 }))
    else if (fmt === 'jpg') runExport('JPG', ipc.exporter.toImage({ srcPath: filePath, name: base, width: w, height: h, format: 'jpeg', scale: 2 }))
    else if (fmt === 'copy') runExport('Copied image', ipc.exporter.copyImage({ srcPath: filePath, width: w, height: h }).then(r => ({ ...r, path: undefined })))
    else if (fmt === 'pptx') runExport('PowerPoint', ipc.exporter.fileToPptx({ srcPath: filePath, name: base, width: w, height: h }))
    else if (fmt === 'video') runExport('Video', ipc.exporter.toVideo({ srcPath: filePath, name: base, width: w, height: h, fps: frame?.meta?.fps ?? 30, durationInFrames: frame?.meta?.durationInFrames ?? 150, tweakVars: resolveTweakVars(frame?.meta?.tweaks, useDesignStore.getState().tweakValues[filePath]) }))
    else runExport(/\.(?:jsx|tsx)$/i.test(filePath) ? 'Remotion source' : 'HTML', ipc.exporter.saveCopy({ srcPath: filePath }))
  }
  function exportDeck(fmt: 'pdf' | 'pptx') {
    if (!activeProject || frames.length === 0) return
    const files = frames.map(f => f.filePath)
    const { w, h } = dimsFor(activeProject.designType, frames[0])
    setDeckMenu(false)
    if (fmt === 'pdf') setPdfModal(frames.map(f => ({ filePath: f.filePath, name: f.name, tweaks: f.meta?.tweaks, meta: f.meta })))  // PDF → önizleme modalı
    else runExport(`PowerPoint (${files.length} slides)`, ipc.exporter.deckToPptx({ files, name: activeProject.name, slideW: w, slideH: h }))
  }
  /** PDF önizleme modalından onaylanınca gelişmiş PDF export'unu çalıştırır. */
  function runPdfExport(exportFiles: ExportFile[], o: PdfExportOptions) {
    if (!activeProject) return
    const sourceFrame = frames.find(frame => frame.filePath === exportFiles[0]?.filePath)
    const { w, h } = dimsFor(activeProject.designType, sourceFrame)
    const files = exportFiles.map(f => f.filePath)
    const name = exportFiles.length > 1 ? activeProject.name : exportFiles[0].name.replace(/\.[^.]+$/, '')
    // Documents paginate (bir bölüm birden çok A4 sayfaya yayılabilir); slaytlar
    // sayfa=dosya. Bu bayrak export'un doğru modu seçmesini sağlar.
    const isDocument = ['document', 'research', 'resume', 'flier'].includes(activeProject.designType)
    setPdfModal(null)
    runExport(files.length > 1 ? `PDF (${files.length} ${isDocument ? 'sections' : 'pages'})` : 'PDF',
      ipc.exporter.toPdfAdvanced({ files, name, fitW: w, fitH: h, document: isDocument, ...o }))
  }
  async function exportAllHtml() {
    setDeckMenu(false)
    if (!activeProject) return
    const dir = await ipc.fs.pickFolder()
    if (!dir) return
    showToast({ ok: true, msg: 'Exporting source files…', busy: true })
    try {
      const r = await ipc.design.exportProject({ projectId: activeProject.id, destDir: dir })
      if (r.ok && r.dir) { showToast({ ok: true, msg: `${r.count} source files exported`, path: r.dir }); ipc.fs.openInFinder(r.dir) }
      else showToast({ ok: false, msg: 'Export failed' })
    } catch (e: any) { showToast({ ok: false, msg: `Export failed — ${e?.message ?? e}` }) }
  }

  // Grow the composer up to ~7 lines, then scroll. Line height (1.625) × 14px
  // text-sm × 7 rows + vertical padding ≈ 168px.
  // Composer: 7 satıra kadar büyür, sonrası scroll.
  // satır yüksekliği 22px × 7 + dikey iç boşluk (üst 4 + alt 4) = 162px.
  const COMPOSER_LINE_H = 22
  const COMPOSER_MAX_H = COMPOSER_LINE_H * 7 + 8 // 162
  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target
    setInput(el.value)
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, COMPOSER_MAX_H) + 'px'
    el.style.overflowY = el.scrollHeight > COMPOSER_MAX_H ? 'auto' : 'hidden'
  }, [])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    const attach = drop.refText()
    if ((!text && !attach && pickedRefs.length === 0) || chatLoading) return
    setComposerNotice(null)
    const hasImages = drop.files.some(file => /\.(png|jpe?g|webp|gif)$/i.test(file.name))
    if (hasImages) {
      if (!effectiveModel) {
        setComposerNotice('Choose a model before sending an image. The file is still attached.')
        return
      }
      const capabilities = await ipc.settings.modelCapabilities(effectiveModel).catch(() => null)
      if (!capabilities?.supportsVision) {
        setComposerNotice(`${capabilities?.displayName || effectiveModel} cannot read images. Choose a vision-capable model; the file is still attached.`)
        return
      }
    }
    // Inspector chips → a scoped reference block prepended to the prompt.
    const refBlock = pickedRefs.length
      ? 'Targeted elements:\n' + pickedRefs.map(p => `- ${p.selector} (${p.text ? `"${p.text}"` : `<${p.tag}>`}) in ${p.filePath.split('/').pop()}`).join('\n')
      : ''
    const msg = [refBlock, text, attach].filter(Boolean).join('\n\n')
    setInput('')
    drop.clear()
    setPickedRefs([])
    if (textareaRef.current) { textareaRef.current.style.height = 'auto'; textareaRef.current.style.overflowY = 'hidden' }
    await sendMessage(msg, effectiveModel)
  }, [input, chatLoading, effectiveModel, sendMessage, drop, pickedRefs])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  async function openPreview(filePath: string, name: string, meta?: DesignMeta | null) {
    setPreview({ filePath, name, content: null, meta })
    const read = ipc.design.readRendered ?? ipc.design.readFile
    const r = await read(filePath)
    setPreview(current => current?.filePath === filePath
      ? { filePath, name, content: r.content ?? null, meta }
      : current)
  }

  if (!activeProject) return null
  const mode = activeProject.designType ?? 'blank'
  const deviceTemplate = isDeviceTemplate(mode)
  const activeFrame = frames.find(f => f.filePath === activeFilePath) ?? frames[0] ?? null
  const activeTweaks = activeFrame?.meta?.tweaks ?? []

  const userMessages = messages.filter(m => m.role === 'user')
  const assistantMessages = messages.filter(m => m.role === 'assistant')
  const latestAssistantMsg = assistantMessages[assistantMessages.length - 1]

  return (
    <>
      <DesignTopBar
        border
        surface="white"
        left={
          <div className="flex items-center gap-1.5">
            <button onClick={onBack} title="Back to home" className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors hover:opacity-80" style={{ background: 'var(--d-clay-wash)', color: 'var(--d-clay)' }}><Palette size={13} /></button>
            <div className="relative" ref={headerRef}>
              {renaming !== null ? (
                <input
                  autoFocus
                  value={renaming}
                  onChange={e => setRenaming(e.target.value)}
                  onBlur={() => commitRename(renaming)}
                  onKeyDown={e => { if (e.key === 'Enter') commitRename(renaming); if (e.key === 'Escape') setRenaming(null) }}
                  className="text-sm font-semibold px-1.5 py-1 rounded-lg bg-transparent outline-none border"
                  style={{ color: 'var(--d-ink)', borderColor: 'var(--d-clay)' }}
                />
              ) : (
                <button onClick={() => setHeaderMenu(o => !o)} className="flex items-center gap-1 text-sm font-semibold px-1.5 py-1 rounded-lg hover:bg-black/5" style={{ color: 'var(--d-ink)' }}>
                  {activeProject.name}<ChevronDown size={13} style={{ color: 'var(--d-ink-muted)' }} />
                </button>
              )}
              {headerMenu && (
                <div className="absolute left-0 top-full mt-1 z-40 rounded-xl overflow-hidden py-1 design-elev-lg" style={{ minWidth: 160, background: 'var(--d-surface)', border: '1px solid var(--d-line)' }}>
                  <button onClick={() => { setHeaderMenu(false); setRenaming(activeProject.name) }} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-black/[0.04]" style={{ color: 'var(--d-ink-soft)' }}><Pencil size={13} /> Rename</button>
                  <button onClick={() => { setHeaderMenu(false); handleDelete() }} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-red-50" style={{ color: '#c0392b' }}><Trash2 size={13} /> Delete</button>
                </div>
              )}
            </div>
            <span className="text-[11px] px-1.5 py-0.5 rounded-md capitalize" style={{ background: 'var(--d-cream-2)', color: 'var(--d-ink-muted)' }}>{mode}</span>
            <button onClick={() => setChatOpen(o => !o)} className="ml-1 w-7 h-7 rounded-lg flex items-center justify-center hover:bg-black/5" style={{ color: chatOpen ? 'var(--d-ink)' : 'var(--d-ink-muted)' }} title="Toggle chat"><PanelLeft size={15} /></button>
            <button onClick={() => setFilesOpen(o => !o)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-black/5" style={{ color: filesOpen ? 'var(--d-ink)' : 'var(--d-ink-muted)' }} title="Toggle screens"><Layers size={15} /></button>
          </div>
        }
      />

      <div className="flex-1 flex min-h-0" style={{ background: 'var(--d-cream)' }}>
        {/* ── Chat ──────────────────────────────────────────────────────────── */}
        {chatOpen && (
          <div className="flex flex-col flex-shrink-0" style={{ width: 312, background: 'var(--d-surface)', borderRight: '1px solid var(--d-line)' }}>
            <div className="flex items-center justify-end px-3 py-2 gap-2">
              <div className="relative">
                <button onClick={() => setHistoryMenuOpen(o => !o)} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg hover:bg-black/5" style={{ color: 'var(--d-ink-muted)' }}>
                  History <ChevronDown size={12} />
                </button>
                {historyMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setHistoryMenuOpen(false)} />
                    <div className="absolute left-0 top-full mt-1 z-40 rounded-xl overflow-hidden py-1 design-elev-lg w-56 max-h-64 overflow-y-auto" style={{ background: 'var(--d-surface)', border: '1px solid var(--d-line)' }}>
                      {sessions.length === 0 ? (
                        <p className="px-3 py-2 text-xs italic" style={{ color: 'var(--d-ink-faint)' }}>No past sessions</p>
                      ) : sessions.map(s => (
                        <button key={s.id} onClick={() => { switchSession(s.id); setHistoryMenuOpen(false) }} className="w-full flex flex-col px-3 py-1.5 text-left transition-colors hover:bg-black/[0.04]" style={{ background: s.id === sessionId ? 'var(--d-clay-wash)' : 'transparent' }}>
                          <span className="text-xs font-medium truncate" style={{ color: s.id === sessionId ? 'var(--d-clay)' : 'var(--d-ink-soft)' }}>{new Date(s.started_at).toLocaleString()}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <button onClick={clearChat} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg hover:bg-black/5" style={{ color: 'var(--d-ink-muted)' }}><MessageSquare size={12} /> New chat</button>
            </div>

            {messages.length === 0 ? (
              <div className="flex-1 flex flex-col justify-center px-6">
                <h3 className="design-serif text-2xl font-semibold mb-1.5" style={{ color: 'var(--d-ink)' }}>Start with context</h3>
                <p className="text-sm mb-5" style={{ color: 'var(--d-ink-muted)' }}>Designs grounded in real context turn out better.</p>
                <div className="flex flex-col gap-2">
                  {CONTEXT.map(c => {
                    const active = (c.key === 'designsystem' && attachedSystem) || (c.key === 'codebase' && attachedFolder)
                    return (
                      <button key={c.key} onClick={() => setCtxModal(c.key)} className="flex items-center gap-3 px-3 py-2 rounded-full transition-colors hover:bg-black/[0.03]" style={{ border: `1px solid ${active ? 'var(--d-clay)' : 'var(--d-line)'}` }}>
                        <span className="w-6 h-6 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: c.bg }}>{c.icon}</span>
                        <span className="text-sm flex-1 text-left" style={{ color: 'var(--d-ink-soft)' }}>{c.label}</span>
                        {active && <Check size={14} style={{ color: 'var(--d-clay)' }} />}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-5">
                {messages.map(m => {
                  if (m.role === 'user') {
                    // "Attached files:" bloğunu ham yol listesi yerine görsel olarak göster.
                    const parsed = parseAttachments(m.content)
                    return (
                      <div key={m.id} className="flex justify-end group">
                        <div className="flex flex-col items-end gap-1.5 max-w-[88%]">
                          <DesignAttachments files={parsed.files} />
                          {parsed.text && (
                            <div className="px-3.5 py-2.5 text-sm leading-relaxed rounded-2xl w-full"
                              style={{ background: 'var(--d-user-bg)', color: 'var(--d-user-fg)', borderBottomRightRadius: 4 }}>
                              <ClampText
                                text={parsed.text}
                                className="whitespace-pre-wrap"
                                toggleClassName="mt-1.5 text-xs font-medium underline opacity-80 hover:opacity-100"
                              />
                            </div>
                          )}
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <CopyButton text={parsed.text || m.content} className="text-xs flex items-center gap-1 bg-transparent hover:bg-black/5 dark:hover:bg-white/10" />
                          </div>
                        </div>
                      </div>
                    )
                  } else {
                    return (
                      <div key={m.id} className="flex flex-col items-start gap-2 w-full group">
                        {m.reasoning && (
                          <DesignReasoningBlock
                            text={m.reasoning}
                            isLive={!!m.streaming && chatLoading && !m.content?.trim()}
                          />
                        )}
                        {m.activity && m.activity.length > 0 && <ActivityFeed items={m.activity} live={!!m.streaming && chatLoading} />}
                        {(m.content || !m.streaming) && (
                          <div className="w-full prose prose-sm max-w-none [&_p]:my-1 [&_pre]:text-xs text-left" style={{ color: 'var(--d-ink)' }} dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content || '…') }} />
                        )}
                        {m.content && !m.streaming && (
                          <div className="flex justify-start mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <CopyButton text={m.content} className="text-xs flex items-center gap-1 bg-transparent hover:bg-black/5 dark:hover:bg-white/10" />
                          </div>
                        )}
                      </div>
                    )
                  }
                })}
                {chatLoading && !latestAssistantMsg?.activity?.some(a => a.status === 'start') && <ThinkingPulse />}
                {qaPrompt && (
                  <div className="w-full rounded-2xl overflow-hidden mt-2" style={{ border: '1px solid var(--d-clay)', background: 'var(--d-surface)' }}>
                    <div className="px-3.5 py-3 border-b flex items-center gap-2" style={{ background: 'var(--d-cream-2)', borderColor: 'var(--d-line)' }}>
                       <HelpCircle size={15} style={{ color: 'var(--d-clay)' }} />
                       <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--d-ink)' }}>Waiting for user input</span>
                    </div>
                    <DesignQaCard payload={qaPrompt} onSubmit={answerQa} />
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}

            {/* Composer */}
            <div className="p-3">
              <div
                {...drop.dropBind}
                className="relative rounded-2xl p-2.5"
                style={{ background: 'var(--d-surface)', border: `1px ${drop.isDragging ? 'dashed var(--d-clay)' : 'solid var(--d-line)'}` }}
              >
                {drop.isDragging && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl pointer-events-none" style={{ background: 'color-mix(in srgb, var(--d-clay) 8%, transparent)' }}>
                    <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--d-clay)' }}>
                      <Paperclip size={14} /> Drop files to attach
                    </div>
                  </div>
                )}
                {pickedRefs.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pb-2">
                    {pickedRefs.map((p, i) => (
                      <button
                        key={p.filePath + p.selector}
                        onClick={() => requestHighlight(p.filePath, p.selector)}
                        title={`${p.selector} — click to highlight on canvas`}
                        className="group flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded-md text-xs font-medium transition-colors"
                        style={{ background: 'var(--d-clay-wash)', border: '1px solid var(--d-clay)', color: 'var(--d-clay)' }}
                      >
                        <MousePointerClick size={11} className="flex-shrink-0" />
                        <span className="truncate max-w-[160px]">{p.text ? p.text : `<${p.tag}>`}</span>
                        <span
                          onClick={(e) => { e.stopPropagation(); setPickedRefs(prev => prev.filter((_, j) => j !== i)) }}
                          className="ml-0.5 rounded hover:bg-black/10"
                          title="Remove"
                        ><X size={11} /></span>
                      </button>
                    ))}
                  </div>
                )}
                {drop.files.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pb-2">
                    {drop.files.map(f => (
                      <div key={f.relPath} className="flex items-center gap-1 pl-1 pr-2 py-0.5 rounded-md text-xs font-medium max-w-[200px]" style={{ background: 'var(--d-cream-2)', border: '1px solid var(--d-line)', color: 'var(--d-ink-soft)' }}>
                        <DesignChipThumb file={f} />
                        <span className="truncate">{f.name}</span>
                        <button onClick={() => drop.remove(f.relPath)} className="ml-0.5" title="Remove" style={{ color: 'var(--d-ink-muted)' }}><X size={10} /></button>
                      </div>
                    ))}
                  </div>
                )}
                {drop.error && (
                  <div className="pb-2 text-2xs" style={{ color: 'var(--d-clay)' }}>{drop.error}</div>
                )}
                {composerNotice && (
                  <div className="mb-2 flex items-start gap-1.5 rounded-lg px-2 py-1.5 text-xs" style={{ background: 'var(--d-clay-wash)', color: 'var(--d-clay)' }}>
                    <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                    <span>{composerNotice}</span>
                  </div>
                )}
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleTextareaChange}
                  onKeyDown={onKeyDown}
                  placeholder="Describe what you want to create…"
                  rows={1}
                  disabled={chatLoading}
                  className="w-full resize-none bg-transparent outline-none text-sm px-1.5 pt-1"
                  style={{ color: 'var(--d-ink)', lineHeight: `${COMPOSER_LINE_H}px`, maxHeight: COMPOSER_MAX_H, minHeight: 30, overflowY: 'hidden' }}
                />
                <div className="flex items-center justify-end pt-1.5">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        const filePath = await ipc.fs.pickFile()
                        if (filePath) {
                          setComposerNotice(null)
                          await drop.attachPaths([filePath])
                        }
                      }}
                      disabled={drop.busy || chatLoading}
                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-black/5 disabled:opacity-40"
                      style={{ color: 'var(--d-ink-muted)' }}
                      title="Attach file"
                    >
                      <Paperclip size={14} />
                    </button>
                    <div className="relative" ref={modelRef}>
                      <button onClick={() => setModelPickerOpen(o => !o)} className="flex items-center gap-1 text-xs min-w-0 max-w-[240px]" style={{ color: 'var(--d-ink-muted)' }} title={effectiveModel}>
                        <span className="font-medium truncate min-w-0" style={{ color: 'var(--d-ink-soft)' }}>{modelLabel}</span>
                        <ChevronDown size={11} />
                      </button>
                      {modelPickerOpen && (
                        <div className="absolute bottom-full mb-1.5 right-0 z-30 rounded-xl overflow-hidden design-elev-lg w-60 max-w-[calc(100vw-2rem)]" style={{ background: 'var(--d-surface)', border: '1px solid var(--d-line)' }}>
                          <div className="p-1.5 space-y-0.5 max-h-72 overflow-y-auto">
                            <ModelOption label={`Use Global Model (${getModel()?.split('/').pop() ?? 'default'})`} selected={!selectedModel} onClick={() => { setSelectedModel(null); setModelPickerOpen(false) }} />
                            {displayModels.map(m => {
                              const gate = modelGates[m]
                              const locked = !!gate?.locked
                              return (
                                <ModelOption
                                  key={m}
                                  label={`${m.split('/').pop() ?? m}${locked ? (unlockingModel === m ? ' — signing in…' : ` — ${gate?.reason || 'sign-in required'}`) : ''}`}
                                  title={m}
                                  selected={selectedModel === m}
                                  locked={locked}
                                  onClick={async () => {
                                    if (locked) {
                                      const ok = await unlockModel(m)
                                      if (!ok) return
                                    }
                                    setSelectedModel(m)
                                    setModelPickerOpen(false)
                                  }}
                                />
                              )
                            })}
                            {displayModels.length === 0 && <p className="px-2.5 py-2 text-xs italic" style={{ color: 'var(--d-ink-faint)' }}>No saved models</p>}
                          </div>
                        </div>
                      )}
                    </div>
                    {chatLoading ? (
                      <button onClick={interruptChat} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white" style={{ background: '#c0392b' }}><Square size={11} className="fill-current" /> Stop</button>
                    ) : (
                      <button onClick={handleSend} disabled={!input.trim() && drop.files.length === 0 && pickedRefs.length === 0} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50" style={{ background: (input.trim() || drop.files.length > 0 || pickedRefs.length > 0) ? 'var(--d-clay)' : 'var(--d-clay-soft)' }}>
                        <ArrowUp size={13} /> Send
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Canvas ────────────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* File tabs — the design files open on the canvas. */}
          {frames.length > 0 && (
            <div className="flex items-stretch gap-1 px-3 pt-1.5 overflow-x-auto flex-shrink-0" style={{ background: 'var(--d-paper)', borderBottom: '1px solid var(--d-line)' }}>
              {frames.map(f => {
                const on = f.filePath === activeFilePath
                return (
                  <button key={f.id} onClick={() => setActiveFilePath(f.filePath)}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-t-lg whitespace-nowrap transition-colors"
                    style={{ background: on ? 'var(--d-cream)' : 'transparent', color: on ? 'var(--d-ink)' : 'var(--d-ink-muted)', borderBottom: on ? '2px solid var(--d-clay)' : '2px solid transparent' }}>
                    <FileGlyph name={f.name} />
                    {f.meta?.title || f.name}
                  </button>
                )
              })}
            </div>
          )}

          <div className="flex items-center gap-2 px-4 h-11 flex-shrink-0" style={{ borderBottom: '1px solid var(--d-line)', background: 'var(--d-paper)' }}>
            <span className="flex items-center gap-1.5 text-sm px-1 py-1" style={{ color: 'var(--d-ink-soft)' }}>
              <Monitor size={13} style={{ color: 'var(--d-ink-muted)' }} />
              {frames.length === 0 ? 'No file open' : `${frames.length} screen${frames.length > 1 ? 's' : ''}`}
            </span>

            {/* Device selector — only where designs target a device. */}
            {deviceTemplate && (
              <div className="flex items-center bg-black/5 rounded-lg p-0.5 ml-2">
                {([['desktop', Monitor], ['tablet', Tablet], ['mobile', Smartphone]] as const).map(([d, Icon]) => (
                  <button key={d} onClick={() => { setViewport(d); setViewportTouched(true) }} className="px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 capitalize"
                    style={{ background: viewport === d ? 'var(--d-elevated)' : 'transparent', boxShadow: viewport === d ? '0 1px 2px rgba(0,0,0,0.12)' : 'none', color: viewport === d ? 'var(--d-ink)' : 'var(--d-ink-muted)' }}>
                    <Icon size={12} /> {d}
                  </button>
                ))}
              </div>
            )}

            {/* Tweaks switch — opens the per-design controls panel. */}
            <button onClick={() => setTweaksOn(!tweaksOn)} className="ml-2 flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors"
              style={{ background: tweaksOn ? 'var(--d-clay-wash)' : 'transparent', color: tweaksOn ? 'var(--d-clay)' : 'var(--d-ink-soft)', border: `1px solid ${tweaksOn ? 'var(--d-clay)' : 'var(--d-line)'}` }} title="Toggle design tweaks">
              <SlidersHorizontal size={13} /> Tweaks
              <span className="relative inline-block w-7 h-4 rounded-full transition-colors" style={{ background: tweaksOn ? 'var(--d-clay)' : 'var(--d-line)' }}>
                <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all" style={{ left: tweaksOn ? 14 : 2 }} />
              </span>
            </button>

            <div className="flex items-center bg-black/5 rounded-lg p-0.5 ml-2">
               <button onClick={() => setViewMode('preview')} className="px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1" style={{ background: viewMode === 'preview' ? 'var(--d-elevated)' : 'transparent', boxShadow: viewMode === 'preview' ? '0 1px 2px rgba(0,0,0,0.12)' : 'none', color: viewMode === 'preview' ? 'var(--d-ink)' : 'var(--d-ink-muted)' }}><Eye size={12}/> Preview</button>
               <button onClick={() => setViewMode('code')} className="px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1" style={{ background: viewMode === 'code' ? 'var(--d-elevated)' : 'transparent', boxShadow: viewMode === 'code' ? '0 1px 2px rgba(0,0,0,0.12)' : 'none', color: viewMode === 'code' ? 'var(--d-ink)' : 'var(--d-ink-muted)' }}><Code2 size={12}/> Code</button>
            </div>

            {/* Inspect — click an element on the canvas to target it in the next prompt. */}
            {frames.length > 0 && (
              <button onClick={() => setInspectMode(!inspectMode)} className="ml-2 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors"
                style={{ background: inspectMode ? 'var(--d-clay-wash)' : 'transparent', color: inspectMode ? 'var(--d-clay)' : 'var(--d-ink-soft)', border: `1px solid ${inspectMode ? 'var(--d-clay)' : 'var(--d-line)'}` }}
                title="Click an element on the canvas to target it in your next prompt">
                <MousePointerClick size={13} /> Inspect
              </button>
            )}

            {/* Accessibility — run a WCAG AA contrast + touch-target scan on the active screen. */}
            {frames.length > 0 && (
              <div className="relative ml-2">
                {(() => {
                  const issues = activeFilePath ? (a11yResults[activeFilePath] ?? null) : null
                  const errs = issues?.filter(i => i.severity === 'error').length ?? 0
                  const warns = issues?.filter(i => i.severity === 'warn').length ?? 0
                  const clean = issues != null && issues.length === 0
                  return (
                    <button
                      onClick={() => { if (!activeFilePath) return; if (issues) setA11yPanelOpen(o => !o); else { requestA11y(activeFilePath); setA11yPanelOpen(true) } }}
                      disabled={a11yRunning}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60"
                      style={{ background: a11yPanelOpen ? 'var(--d-clay-wash)' : 'transparent', color: errs ? '#c0392b' : clean ? '#2e7d5b' : 'var(--d-ink-soft)', border: '1px solid var(--d-line)' }}
                      title="Check accessibility (WCAG AA contrast + touch targets)">
                      <ShieldCheck size={13} /> {a11yRunning ? 'Checking…' : issues ? (issues.length ? `${errs + warns} issue${errs + warns > 1 ? 's' : ''}` : 'A11y OK') : 'A11y'}
                    </button>
                  )
                })()}
                {a11yPanelOpen && activeFilePath && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setA11yPanelOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-40 rounded-xl overflow-hidden design-elev-lg w-80 max-h-80 overflow-y-auto" style={{ background: 'var(--d-surface)', border: '1px solid var(--d-line)' }}>
                      <div className="flex items-center gap-2 px-3 py-2 sticky top-0" style={{ background: 'var(--d-cream-2)', borderBottom: '1px solid var(--d-line)' }}>
                        <ShieldCheck size={13} style={{ color: 'var(--d-clay)' }} />
                        <span className="text-xs font-bold" style={{ color: 'var(--d-ink)' }}>Accessibility</span>
                        <button onClick={() => { clearA11y(activeFilePath); requestA11y(activeFilePath) }} className="ml-auto text-xs px-1.5 py-0.5 rounded hover:bg-black/5" style={{ color: 'var(--d-ink-muted)' }} title="Re-scan"><RotateCcw size={11} /></button>
                      </div>
                      {(() => {
                        const issues = a11yResults[activeFilePath] ?? []
                        if (a11yRunning) return <p className="px-3 py-3 text-xs italic" style={{ color: 'var(--d-ink-faint)' }}>Scanning…</p>
                        if (issues.length === 0) return <p className="px-3 py-3 text-xs" style={{ color: '#2e7d5b' }}>No contrast or touch-target issues found. ✓</p>
                        return issues.map((it, i) => (
                          <div key={i} className="flex items-start gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--d-line)' }}>
                            <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" style={{ color: it.severity === 'error' ? '#c0392b' : '#c24a22' }} />
                            <div className="min-w-0">
                              <p className="text-xs leading-snug" style={{ color: 'var(--d-ink-soft)' }}>{it.detail}</p>
                              <code className="text-[10px] truncate block" style={{ color: 'var(--d-ink-faint)' }}>{it.selector}</code>
                            </div>
                          </div>
                        ))
                      })()}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Versions — restore a snapshot taken before an agent edit. */}
            {frames.length > 0 && (
              <div className="relative ml-2">
                <button onClick={() => { setVersionsMenuOpen(o => !o); if (activeProject) loadCheckpoints(activeProject.id) }} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors hover:bg-black/5" style={{ color: 'var(--d-ink-soft)', border: '1px solid var(--d-line)' }} title="Version history">
                  <History size={13} /> Versions <ChevronDown size={11} />
                </button>
                {versionsMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setVersionsMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-40 rounded-xl overflow-hidden design-elev-lg w-72 max-h-80 overflow-y-auto" style={{ background: 'var(--d-surface)', border: '1px solid var(--d-line)' }}>
                      <div className="flex items-center gap-2 px-3 py-2 sticky top-0" style={{ background: 'var(--d-cream-2)', borderBottom: '1px solid var(--d-line)' }}>
                        <History size={13} style={{ color: 'var(--d-clay)' }} />
                        <span className="text-xs font-bold" style={{ color: 'var(--d-ink)' }}>Version history</span>
                        <button onClick={() => { if (activeProject) saveCheckpoint(activeProject.id, 'Saved version', false) }} className="ml-auto text-xs px-1.5 py-0.5 rounded hover:bg-black/5 font-medium" style={{ color: 'var(--d-clay)' }} title="Save current state">+ Save</button>
                      </div>
                      {checkpoints.length === 0 ? (
                        <p className="px-3 py-3 text-xs italic" style={{ color: 'var(--d-ink-faint)' }}>No saved versions yet</p>
                      ) : checkpoints.map(cp => (
                        <div key={cp.id} className="flex items-center gap-2 px-3 py-2 border-b group" style={{ borderColor: 'var(--d-line)' }}>
                          <Clock size={11} className="flex-shrink-0" style={{ color: 'var(--d-ink-faint)' }} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate" style={{ color: 'var(--d-ink-soft)' }}>{cp.label}</p>
                            <span className="text-[10px]" style={{ color: 'var(--d-ink-faint)' }}>{new Date(cp.createdAt).toLocaleString()} · {cp.fileCount} file{cp.fileCount !== 1 ? 's' : ''}{cp.auto ? ' · auto' : ''}</span>
                          </div>
                          <button onClick={async () => { if (activeProject && confirm('Restore this version? Current screens are snapshotted first.')) { await restoreCheckpoint(activeProject.id, cp.id); setVersionsMenuOpen(false) } }} className="flex-shrink-0 text-xs px-2 py-0.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'var(--d-clay-wash)', color: 'var(--d-clay)' }}>Restore</button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="flex-1" />
            {frames.length > 1 && (
              <div className="relative">
                <button onClick={() => setDeckMenu(o => !o)} className="flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-lg transition-colors hover:bg-black/5" style={{ color: 'var(--d-ink-soft)', border: '1px solid var(--d-line)' }} title="Export all screens">
                  <Download size={13} /> Export all <ChevronDown size={12} style={{ color: 'var(--d-ink-muted)' }} />
                </button>
                {deckMenu && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setDeckMenu(false)} />
                    <div className="absolute right-0 top-full mt-1 z-40 rounded-xl overflow-hidden py-1 design-elev-lg" style={{ minWidth: 190, background: 'var(--d-surface)', border: '1px solid var(--d-line)' }}>
                      <DlItem label={`PDF — all ${frames.length} screens`} onClick={() => exportDeck('pdf')} />
                      <DlItem label="PowerPoint (.pptx)" onClick={() => exportDeck('pptx')} />
                      <DlItem label="All source files (folder)" onClick={exportAllHtml} />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="flex-1 relative min-h-0 flex flex-col">
            <DesignCanvas projectId={activeProject.id} mode={mode} viewport={viewport} viewMode={viewMode} />
            {tweaksOn && activeFrame && (
              <TweaksPanel
                frame={activeFrame}
                tweaks={activeTweaks}
                values={tweakValues[activeFrame.filePath] ?? {}}
                onChange={(id, v) => setTweakValue(activeFrame.filePath, id, v)}
                onReset={() => resetTweaks(activeFrame.filePath)}
                onSave={() => persistTweaks(activeFrame.filePath)}
                onClose={() => setTweaksOn(false)}
              />
            )}
          </div>
        </div>

        {/* ── Screens panel ─────────────────────────────────────────────────── */}
        {filesOpen && (
          <div className="flex flex-col flex-shrink-0" style={{ width: 232, background: 'var(--d-surface)', borderLeft: '1px solid var(--d-line)' }}>
            <div className="flex items-center gap-1.5 px-4 py-3" style={{ borderBottom: '1px solid var(--d-line)' }}>
              <Layers size={13} style={{ color: 'var(--d-ink-muted)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--d-ink-soft)' }}>Screens</span>
              <span className="ml-auto text-xs tabular-nums" style={{ color: 'var(--d-ink-faint)' }}>{frames.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {frames.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 px-4 text-center">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--d-cream-2)' }}><Layers size={15} style={{ color: 'var(--d-ink-faint)' }} /></div>
                  <p className="text-xs" style={{ color: 'var(--d-ink-muted)' }}>No screens yet</p>
                  <p className="text-xs" style={{ color: 'var(--d-ink-faint)' }}>Ask the agent to create designs</p>
                </div>
              ) : frames.map(f => (
                <div key={f.id} className="relative group flex items-center gap-2.5 px-2 py-2 rounded-lg transition-colors hover:bg-black/[0.03]">
                  <button onClick={() => openPreview(f.filePath, f.name, f.meta)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                    <div className="w-9 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: 'var(--d-cream-2)', border: '1px solid var(--d-line)' }}><Monitor size={11} style={{ color: 'var(--d-ink-faint)' }} /></div>
                    <span className="flex-1 text-xs truncate" style={{ color: 'var(--d-ink-soft)' }}>{f.name}</span>
                  </button>
                  <button onClick={() => setDlMenu(d => d === f.id ? null : f.id)} className="flex-shrink-0 p-1 rounded-md hover:bg-black/5" style={{ color: dlMenu === f.id ? 'var(--d-ink)' : 'var(--d-ink-faint)' }} title="Download as…"><Download size={13} /></button>
                  {dlMenu === f.id && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setDlMenu(null)} />
                      <div className="absolute right-1 top-full mt-0.5 z-40 rounded-xl overflow-hidden py-1 design-elev-lg" style={{ minWidth: 150, background: 'var(--d-surface)', border: '1px solid var(--d-line)' }}>
                        {(mode === 'animation' || mode === 'hyperframes') ? <>
                          <DlItem label="Video (.mp4)" onClick={() => downloadScreen(f.filePath, f.name, 'video')} />
                          <DlItem label="Remotion source" onClick={() => downloadScreen(f.filePath, f.name, 'html')} />
                        </> : <>
                          <DlItem label="PDF…" onClick={() => downloadScreen(f.filePath, f.name, 'pdf')} />
                          <DlItem label="PNG image" onClick={() => downloadScreen(f.filePath, f.name, 'png')} />
                          <DlItem label="JPG image" onClick={() => downloadScreen(f.filePath, f.name, 'jpg')} />
                          <DlItem label="Copy image" onClick={() => downloadScreen(f.filePath, f.name, 'copy')} />
                          <DlItem label="PowerPoint (.pptx)" onClick={() => downloadScreen(f.filePath, f.name, 'pptx')} />
                          <DlItem label="HTML (copy)" onClick={() => downloadScreen(f.filePath, f.name, 'html')} />
                        </>}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Preview overlay */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(20,17,13,0.55)' }} onClick={() => setPreview(null)}>
          <div className="rounded-2xl overflow-hidden design-elev-lg flex flex-col" style={{ width: '82vw', height: '84vh', background: '#fff' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--d-line)' }}>
              <span className="text-sm font-medium" style={{ color: 'var(--d-ink-soft)' }}>{preview.name}</span>
              <button onClick={() => setPreview(null)} className="p-1.5 rounded-lg hover:bg-black/5" style={{ color: 'var(--d-ink-muted)' }}>✕</button>
            </div>
            {preview.content
              ? <iframe srcDoc={buildSrcDoc({ kind: kindFromName(preview.name), raw: preview.content, filePath: preview.filePath, resize: false, engine: preview.meta?.engine })} className="flex-1 border-none w-full bg-white" sandbox="allow-scripts allow-same-origin" title={preview.name} />
              : <div className="flex-1 flex items-center justify-center text-sm" style={{ color: 'var(--d-ink-faint)' }}>Loading…</div>}
          </div>
        </div>
      )}

      {/* PDF export preview + scale dialog */}
      {pdfModal && activeProject && (
        <PdfExportModal
          open
          files={pdfModal}
          fitW={dimsFor(activeProject.designType).w}
          fitH={dimsFor(activeProject.designType).h}
          document={['document', 'research', 'resume', 'flier'].includes(activeProject.designType)}
          onClose={() => setPdfModal(null)}
          onExport={(o) => runPdfExport(pdfModal, o)}
        />
      )}

      {/* Export feedback toast */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[70]">
          <button
            onClick={() => { if (toast.path) ipc.fs.openInFinder(toast.path) }}
            disabled={!toast.path}
            className="flex items-center gap-2.5 pl-3.5 pr-3 py-2.5 rounded-xl design-elev-lg text-sm font-medium transition-opacity"
            style={{
              background: toast.ok ? 'var(--d-ink)' : '#b03a2e',
              color: '#fff',
              cursor: toast.path ? 'pointer' : 'default',
            }}
          >
            {toast.busy
              ? <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              : toast.ok ? <Check size={15} /> : <X size={15} />}
            <span>{toast.msg}</span>
            {toast.path && !toast.busy && <span className="text-xs opacity-70 ml-1">Reveal</span>}
          </button>
        </div>
      )}

      {ctxModal === 'figma' && (
        <Modal title="How to download a .fig file" onClose={() => setCtxModal(null)} width={540}>
          <p className="text-sm mb-4" style={{ color: 'var(--d-ink-soft)' }}>From the Figma web or desktop app:</p>
          <ol className="space-y-2 text-sm" style={{ color: 'var(--d-ink-soft)' }}>
            <li>1. Open the file in Figma.</li>
            <li>2. Go to <b>File → Save local copy…</b> (web: main menu → File).</li>
            <li>3. Figma downloads a .fig file. Drop it onto the chat input.</li>
          </ol>
          <p className="text-xs mt-4" style={{ color: 'var(--d-ink-faint)' }}>The file is parsed locally on your machine and never uploaded.</p>
        </Modal>
      )}

      {ctxModal === 'codebase' && (
        <Modal title="Attach codebase" onClose={() => setCtxModal(null)} width={620}
          footer={<div className="flex items-center justify-end gap-2">
            <button onClick={() => setCtxModal(null)} className="px-3.5 py-1.5 rounded-lg text-sm font-medium" style={{ color: 'var(--d-ink-soft)' }}>Cancel</button>
            <button onClick={attachCodebase} className="px-3.5 py-1.5 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--d-clay)' }}>Choose folder</button>
          </div>}>
          <button onClick={attachCodebase} className="w-full rounded-2xl flex flex-col items-center justify-center gap-2 py-10" style={{ background: 'var(--d-cream)', border: '1.5px dashed var(--d-line)' }}>
            <FolderOpen size={22} style={{ color: 'var(--d-ink-muted)' }} />
            <span className="text-base font-semibold" style={{ color: 'var(--d-ink)' }}>{attachedFolder ? attachedFolder.split('/').pop() : 'Attach a codebase folder'}</span>
            <span className="text-sm" style={{ color: 'var(--d-ink-muted)' }}>For large repos, pick the frontend or design-system folder</span>
          </button>
        </Modal>
      )}

      {ctxModal === 'designsystem' && (
        <Modal title="Choose a design system" onClose={() => setCtxModal(null)} width={560}
          footer={<button onClick={() => setCtxModal(null)} className="px-3.5 py-1.5 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--d-ink)' }}>Done</button>}>
          {systems.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: 'var(--d-ink-faint)' }}>No design systems yet. Create one from the Design home → “Set up a design system”.</p>
          ) : (
            <div className="space-y-1.5">
              <SystemRow name="None" active={!attachedSystem} onClick={() => chooseSystem(null)} />
              {systems.map((s: DesignSystemRecord) => (
                <SystemRow key={s.id} name={s.name} sub={s.blurb} active={attachedSystem === s.id} onClick={() => chooseSystem(s.id)} />
              ))}
            </div>
          )}
        </Modal>
      )}
    </>
  )
}

function Modal({ title, onClose, children, footer, width = 560 }: {
  title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; width?: number
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(20,17,13,0.45)' }} onClick={onClose}>
      <div className="rounded-2xl design-elev-lg flex flex-col" style={{ width, maxWidth: '90vw', background: 'var(--d-surface)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4">
          <h3 className="text-base font-semibold" style={{ color: 'var(--d-ink)' }}>{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-black/5" style={{ color: 'var(--d-ink-muted)' }}><X size={16} /></button>
        </div>
        <div className="px-5 pb-5">{children}</div>
        {footer && <div className="px-5 py-3.5" style={{ borderTop: '1px solid var(--d-line)' }}>{footer}</div>}
      </div>
    </div>
  )
}

function SystemRow({ name, sub, active, onClick }: { name: string; sub?: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors" style={{ background: active ? 'var(--d-clay-wash)' : 'transparent', border: `1px solid ${active ? 'var(--d-clay)' : 'var(--d-line)'}` }}>
      <span className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: active ? 'var(--d-clay)' : 'var(--d-cream-2)', color: '#fff' }}>{active && <Check size={13} />}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium truncate" style={{ color: 'var(--d-ink)' }}>{name}</span>
        {sub && <span className="block text-xs truncate" style={{ color: 'var(--d-ink-muted)' }}>{sub}</span>}
      </span>
    </button>
  )
}

/**
 * Inline approval / clarification card for the design chat. Renders the agent's
 * ask_user payload using the design theme. Stepping through one question at a
 * time; answering resumes the same agent turn (no context loss).
 */
function DesignQaCard({ payload, onSubmit }: { payload: any; onSubmit: (ans: string) => void }) {
  const isObj = payload && typeof payload === 'object' && Array.isArray(payload.questions)
  const questions: { question: string; options?: string[]; is_multi_select?: boolean }[] = isObj ? payload.questions : []
  const [step, setStep] = useState(0)
  const [picked, setPicked] = useState<Record<number, string[]>>({})
  const [custom, setCustom] = useState<Record<number, string>>({})
  const [focused, setFocused] = useState(0)

  useEffect(() => {
    setFocused(0)
  }, [step])

  if (!isObj) {
    return (
      <div className="p-4" style={{ background: 'var(--d-surface)' }}>
        <p className="text-sm font-medium mb-3" style={{ color: 'var(--d-ink)' }}>{String(payload)}</p>
        <form onSubmit={e => { e.preventDefault(); const v = (new FormData(e.currentTarget).get('a') as string)?.trim(); if (v) onSubmit(v) }} className="flex items-center gap-2">
          <input name="a" autoFocus placeholder="Type your answer…" className="flex-1 rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'var(--d-cream-2)', border: '1px solid transparent', color: 'var(--d-ink)' }} />
          <button type="submit" className="px-4 py-2 rounded-lg flex items-center justify-center text-sm font-semibold text-white" style={{ background: 'var(--d-clay)' }}>Submit</button>
        </form>
      </div>
    )
  }

  function build(next: Record<number, string[]>, nextCustom: Record<number, string>): string {
    let out = ''
    questions.forEach((q, i) => {
      const opts = next[i] ?? []
      const c = nextCustom[i]?.trim()
      if (opts.length || c) {
        out += `Q: ${q.question}\nA: ${[...opts, ...(c ? [c] : [])].join(', ')}\n\n`
      }
    })
    return out.trim() || 'Approved'
  }
  function advance(nextPicked: Record<number, string[]>, nextCustom: Record<number, string>) {
    if (step < questions.length - 1) setStep(step + 1)
    else onSubmit(build(nextPicked, nextCustom))
  }
  function choose(opt: string) {
    const q = questions[step]
    if (q.is_multi_select) {
      const cur = picked[step] ?? []
      setPicked({ ...picked, [step]: cur.includes(opt) ? cur.filter(o => o !== opt) : [...cur, opt] })
    } else {
      const np = { ...picked, [step]: [opt] }
      setPicked(np)
      advance(np, custom)
    }
  }

  const q = questions[step]
  const sel = picked[step] ?? []
  const opts = q.options ?? []

  function confirmFocused() {
    if (opts[focused]) choose(opts[focused])
    else advance(picked, custom)
  }

  return (
    <div
      className="flex flex-col w-full max-h-[min(32rem,calc(100vh-8rem))]"
      onKeyDown={e => {
        if (e.target instanceof HTMLInputElement) return
        if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(i => opts.length ? (i + 1) % opts.length : 0) }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setFocused(i => opts.length ? (i - 1 + opts.length) % opts.length : 0) }
        else if (/^[1-9]$/.test(e.key)) {
          const idx = Number(e.key) - 1
          if (opts[idx]) { e.preventDefault(); choose(opts[idx]) }
        } else if (e.key === 'Enter' || (e.key === ' ' && q.is_multi_select)) {
          e.preventDefault()
          confirmFocused()
        }
      }}
      tabIndex={0}
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--d-ink-muted)' }}>Question {step + 1} of {questions.length}</span>
      </div>
      <p className="px-3.5 pb-2.5 text-sm font-medium leading-snug whitespace-pre-wrap break-words max-h-28 overflow-y-auto flex-shrink-0" style={{ color: 'var(--d-ink)' }}>{q.question}</p>
      <div className="px-2.5 pb-2.5 space-y-1.5 overflow-y-auto min-h-0 flex-1">
        {opts.map((opt, i) => {
          const on = sel.includes(opt)
          return (
            <button key={i} onMouseEnter={() => setFocused(i)} onClick={() => choose(opt)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-sm transition-colors hover:bg-black/[0.03]"
              style={{ border: `1px solid ${on || focused === i ? 'var(--d-clay)' : 'var(--d-line)'}`, background: on ? 'var(--d-clay-wash)' : 'transparent', color: 'var(--d-ink)', boxShadow: focused === i ? '0 0 0 2px color-mix(in srgb, var(--d-clay) 18%, transparent)' : 'none' }}>
              <span className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ border: `1px solid ${on ? 'var(--d-clay)' : 'var(--d-line)'}`, background: on ? 'var(--d-clay)' : 'transparent' }}>{on && <Check size={11} className="text-white" />}</span>
              <span className="flex-1 min-w-0 whitespace-pre-wrap break-words">{opt}</span>
            </button>
          )
        })}
        <input
          value={custom[step] ?? ''}
          onChange={e => setCustom({ ...custom, [step]: e.target.value })}
          onKeyDown={e => { if (e.key === 'Enter' && (custom[step] ?? '').trim()) advance(picked, custom) }}
          placeholder="Something else…"
          className="w-full rounded-xl px-3 py-2 text-sm outline-none"
          style={{ background: 'var(--d-cream-2)', border: '1px solid transparent', color: 'var(--d-ink)' }}
        />
      </div>
      {q.is_multi_select && (
        <div className="px-3.5 py-3 flex justify-end flex-shrink-0" style={{ borderTop: '1px solid var(--d-line)', background: 'var(--d-surface)' }}>
          <button onClick={() => advance(picked, custom)} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--d-clay)' }}>
            {step < questions.length - 1 ? 'Next' : 'Confirm'} <ArrowRight size={13} />
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Live activity feed ──────────────────────────────────────────────────────
 * Stacked, append-only rows showing what the agent is actually doing — each
 * tool call gets its own line with a live spinner that resolves to a check. */

const TOOL_LABEL: Record<string, string> = {
  write_file: 'Writing', create_file: 'Creating', edit_file: 'Editing', str_replace: 'Editing',
  apply_patch: 'Patching', read_file: 'Reading', web_search: 'Searching', search: 'Searching',
  run_command: 'Running', bash: 'Running', terminal: 'Running', ask_user: 'Asking',
  list_dir: 'Scanning', glob: 'Scanning', grep: 'Searching',
}
function toolGlyph(name: string): string {
  if (/write|create|edit|patch|replace/.test(name)) return '✎'
  if (/read|cat|open/.test(name)) return '◎'
  if (/search|grep|glob|web/.test(name)) return '⌕'
  if (/run|bash|terminal|exec/.test(name)) return '⌘'
  if (/list|scan|dir/.test(name)) return '⊞'
  if (/ask/.test(name)) return '?'
  return '▸'
}

/** Biten satır bu süre sonra kaybolur (kısa bir "tamam" görünümü bırakır). */
const ACTIVITY_EXPIRE_MS = 1400
/** Aynı anda gösterilen azami satır — fazlası döngüyle en yeniyle değişir. */
const ACTIVITY_MAX_ROWS = 4

function ActivityFeed({ items, live }: { items: DesignActivity[]; live: boolean }) {
  const doneAt = useRef<Map<string, number>>(new Map())
  const [, force] = useState(0)

  // Biten satırların bitiş zamanını kaydet; tekrar çalışırsa sıfırla.
  useEffect(() => {
    const now = Date.now()
    for (const a of items) {
      if (a.status === 'done' || a.status === 'error') {
        if (!doneAt.current.has(a.id)) doneAt.current.set(a.id, now)
      } else {
        doneAt.current.delete(a.id)
      }
    }
  }, [items])

  // Bitmiş satır varken periyodik yeniden değerlendir (süre dolunca kaybolsun).
  useEffect(() => {
    if (!items.some(a => a.status !== 'start')) return
    const t = setInterval(() => force(x => x + 1), 300)
    return () => clearInterval(t)
  }, [items])

  const now = Date.now()
  const visible = items
    .filter(a => {
      if (a.status === 'start') return true
      const t = doneAt.current.get(a.id)
      return t == null || now - t < ACTIVITY_EXPIRE_MS
    })
    .slice(-ACTIVITY_MAX_ROWS)

  if (visible.length === 0 && !live) return null

  return (
    <div className="w-full flex flex-col gap-1 rounded-xl p-2" style={{ background: 'var(--d-cream-2)', border: '1px solid var(--d-line)' }}>
      {visible.map(a => {
        const running = a.status === 'start'
        const err = a.status === 'error'
        const label = TOOL_LABEL[a.name] ?? a.name.replace(/_/g, ' ')
        return (
          <div key={a.id} className="flex items-center gap-2 px-1.5 py-0.5 text-xs animate-fade-in">
            <span className="w-4 flex-shrink-0 flex items-center justify-center" style={{ color: err ? '#c0392b' : running ? 'var(--d-clay)' : 'var(--d-ink-muted)' }}>
              {running ? <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin inline-block" /> : err ? '✕' : <Check size={12} />}
            </span>
            <span className="font-medium flex-shrink-0" style={{ color: 'var(--d-ink-soft)' }}>{label}</span>
            {a.detail && <span className="truncate font-mono text-[11px]" style={{ color: 'var(--d-ink-muted)' }} title={a.detail}>{a.detail}</span>}
            <span className="flex-1" />
            {!running && a.durationMs != null && <span className="tabular-nums text-[10px] flex-shrink-0" style={{ color: 'var(--d-ink-faint)' }}>{(a.durationMs / 1000).toFixed(1)}s</span>}
          </div>
        )
      })}
      {live && (
        <div className="flex items-center gap-2 px-1.5 py-0.5">
          <span className="w-4 flex-shrink-0 flex items-center justify-center"><span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--d-clay)' }} /></span>
          <span className="text-[11px] italic" style={{ color: 'var(--d-ink-faint)' }}>working…</span>
        </div>
      )}
    </div>
  )
}

function ThinkingPulse() {
  return (
    <div className="flex items-center pb-1">
      <RobotLoader size={30} active color="var(--d-clay)" />
    </div>
  )
}

function fmtThinkDuration(ms: number): string {
  if (ms < 1000) return '<1s'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

/**
 * Design chat için model "thinking" (reasoning) bloğu — cream/serif temaya uygun.
 * Canlıyken otomatik açık + süre sayacı + akan metin; bitince "Thought for Xs"
 * olarak katlanır, kullanıcı açıp inceleyebilir.
 */
function DesignReasoningBlock({ text, isLive = false }: { text: string; isLive?: boolean }) {
  const userToggled = useRef(false)
  const [isOpen, setIsOpen] = useState(isLive)
  const startedAt = useRef<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [finalMs, setFinalMs] = useState<number | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isLive) {
      if (startedAt.current == null) startedAt.current = Date.now()
      const t = setInterval(() => setElapsed(Date.now() - (startedAt.current ?? Date.now())), 100)
      return () => clearInterval(t)
    }
    if (startedAt.current != null && finalMs == null) setFinalMs(Date.now() - startedAt.current)
    if (!userToggled.current) setIsOpen(false)
  }, [isLive]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isLive && isOpen && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [text, isLive, isOpen])

  const toggle = () => { userToggled.current = true; setIsOpen(v => !v) }
  const durationLabel = finalMs != null ? `Thought for ${fmtThinkDuration(finalMs)}` : null

  return (
    <div
      className="w-full rounded-xl overflow-hidden transition-all"
      style={{
        border: `1px solid ${isLive ? 'var(--d-clay)' : 'var(--d-line)'}`,
        background: isLive ? 'var(--d-cream-2)' : 'var(--d-surface)',
      }}
    >
      <button
        onClick={toggle}
        className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium select-none"
        style={{ color: 'var(--d-ink-soft)' }}
      >
        <span className="flex items-center gap-2">
          <Brain size={14} style={{ color: isLive ? 'var(--d-clay)' : 'var(--d-ink-muted)' }}
            className={isLive ? 'animate-pulse' : ''} />
          {isLive ? (
            <span className="flex items-center gap-2">
              <span className="italic" style={{ color: 'var(--d-clay)' }}>Thinking</span>
              <span className="tabular-nums" style={{ color: 'var(--d-ink-muted)' }}>{fmtThinkDuration(elapsed)}</span>
            </span>
          ) : (
            <span>{durationLabel ?? 'Thought Process'}</span>
          )}
        </span>
        {isOpen ? <ChevronDown size={14} style={{ color: 'var(--d-ink-muted)' }} />
                : <ChevronRight size={14} style={{ color: 'var(--d-ink-muted)' }} />}
      </button>
      {isOpen && (
        <div
          ref={bodyRef}
          className="px-3 py-2.5 text-[12px] whitespace-pre-wrap font-mono leading-relaxed max-h-80 overflow-y-auto select-text"
          style={{ color: 'var(--d-ink-muted)', borderTop: '1px solid var(--d-line)', background: 'var(--d-cream)' }}
        >
          {text}
          {isLive && <span className="inline-block w-1 h-3 ml-0.5 align-middle animate-pulse" style={{ background: 'var(--d-clay)' }} />}
        </div>
      )}
    </div>
  )
}

/** Tiny extension glyph for the file tabs. */
function FileGlyph({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase()
  const label = ext === 'tsx' ? 'RM' : ext === 'jsx' ? 'JSX' : ext === 'svg' ? 'SVG' : ext === 'mermaid' || ext === 'mmd' ? 'MMD' : 'HTML'
  const color = ext === 'tsx' ? '#d96f45' : ext === 'jsx' ? '#4a6ba8' : ext === 'svg' ? '#9b59b6' : ext === 'mermaid' || ext === 'mmd' ? '#2e8b6f' : '#c24a22'
  return <span className="text-[8px] font-bold px-1 py-0.5 rounded" style={{ background: `${color}1a`, color }}>{label}</span>
}

/**
 * Live, per-design controls. Reads the screen's tweak manifest (agent-authored)
 * and renders the right control for each entry; changes flow to the rendered
 * iframe instantly via CSS custom properties.
 */
function TweaksPanel({ frame, tweaks, values, onChange, onReset, onSave, onClose }: {
  frame: DesignFrame
  tweaks: DesignTweak[]
  values: Record<string, string | number | boolean>
  onChange: (id: string, v: string | number | boolean) => void
  onReset: () => void
  onSave: () => void | Promise<void>
  onClose: () => void
}) {
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  const save = async () => { await onSave(); setDirty(false); setSaved(true); setTimeout(() => setSaved(false), 1600) }
  const change = (id: string, value: string | number | boolean) => { onChange(id, value); setDirty(true); setSaved(false) }
  useEffect(() => {
    if (!dirty) return
    const timer = setTimeout(() => { void save() }, 650)
    return () => clearTimeout(timer)
  }, [dirty, values])
  return (
    <div className="absolute top-4 right-4 z-30 rounded-2xl flex flex-col design-elev-lg" style={{ width: 264, maxHeight: 'calc(100% - 32px)', background: 'var(--d-surface)', border: '1px solid var(--d-line)' }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--d-line)' }}>
        <SlidersHorizontal size={14} style={{ color: 'var(--d-clay)' }} />
        <span className="min-w-0 flex-1"><strong className="block text-sm font-semibold" style={{ color: 'var(--d-ink)' }}>Tweaks</strong><small className="block truncate text-[9px]" style={{ color: 'var(--d-ink-faint)' }}>{frame.meta?.title || frame.name} · live</small></span>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-black/5" style={{ color: 'var(--d-ink-muted)' }}><X size={14} /></button>
      </div>

      {tweaks.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs" style={{ color: 'var(--d-ink-faint)' }}>
          No tweaks declared for <span className="font-medium">{frame.meta?.title || frame.name}</span>.<br />Ask the agent to expose some controls.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {tweaks.map(t => (
            <TweakControl key={t.id} tweak={t} value={values[t.id] ?? (t.default as any)} onChange={v => change(t.id, v)} />
          ))}
        </div>
      )}

      {tweaks.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderTop: '1px solid var(--d-line)' }}>
          <button onClick={() => { onReset(); setDirty(true) }} className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg hover:bg-black/5" style={{ color: 'var(--d-ink-muted)' }}><RotateCcw size={12} /> Reset</button>
          <div className="flex-1" />
          <button onClick={() => void save()} disabled={!dirty && !saved} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-60" style={{ background: 'var(--d-clay)', color: 'var(--d-on-accent)' }}>
            {saved ? <><Check size={12} /> Saved</> : dirty ? 'Save now' : 'Saved'}
          </button>
        </div>
      )}
    </div>
  )
}

function TweakControl({ tweak, value, onChange }: { tweak: DesignTweak; value: any; onChange: (v: string | number | boolean) => void }) {
  if (tweak.type === 'color') {
    return (
      <label className="block">
        <span className="block text-xs font-medium mb-1.5" style={{ color: 'var(--d-ink-soft)' }}>{tweak.label}</span>
        <div className="flex items-center gap-2">
          <input type="color" value={String(value ?? '#000000')} onChange={e => onChange(e.target.value)} className="w-8 h-8 rounded-lg cursor-pointer border" style={{ borderColor: 'var(--d-line)', background: 'none' }} />
          <span className="text-xs tabular-nums" style={{ color: 'var(--d-ink-muted)' }}>{String(value)}</span>
        </div>
      </label>
    )
  }
  if (tweak.type === 'range') {
    const num = typeof value === 'number' ? value : parseFloat(String(value)) || tweak.min || 0
    return (
      <label className="block">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium" style={{ color: 'var(--d-ink-soft)' }}>{tweak.label}</span>
          <span className="text-xs tabular-nums" style={{ color: 'var(--d-ink-muted)' }}>{num}{tweak.unit ?? ''}</span>
        </div>
        <input type="range" min={tweak.min ?? 0} max={tweak.max ?? 100} step={tweak.step ?? 1} value={num} onChange={e => onChange(parseFloat(e.target.value))} className="w-full accent-[var(--d-clay)]" />
      </label>
    )
  }
  if (tweak.type === 'select') {
    return (
      <div>
        <span className="block text-xs font-medium mb-1.5" style={{ color: 'var(--d-ink-soft)' }}>{tweak.label}</span>
        <div className="flex flex-wrap gap-1.5">
          {(tweak.options ?? []).map(opt => {
            const on = String(value) === opt
            return (
              <button key={opt} onClick={() => onChange(opt)} className="text-xs px-2.5 py-1 rounded-lg transition-colors" style={{ background: on ? 'var(--d-clay)' : 'var(--d-cream-2)', color: on ? 'var(--d-on-accent)' : 'var(--d-ink-soft)' }}>{opt}</button>
            )
          })}
        </div>
      </div>
    )
  }
  // toggle
  const on = value === true || value === '1' || value === 1
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-xs font-medium" style={{ color: 'var(--d-ink-soft)' }}>{tweak.label}</span>
      <button onClick={() => onChange(!on)} className="relative inline-block w-9 h-5 rounded-full transition-colors" style={{ background: on ? 'var(--d-clay)' : 'var(--d-line)' }}>
        <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: on ? 18 : 2 }} />
      </button>
    </label>
  )
}

function DlItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-black/[0.04]" style={{ color: 'var(--d-ink-soft)' }}>
      <Download size={12} style={{ color: 'var(--d-ink-faint)' }} /> {label}
    </button>
  )
}

function ModelOption({ label, title, selected, locked, onClick }: { label: string; title?: string; selected: boolean; locked?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} title={title ?? label} className="w-full px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors truncate" style={{ background: selected ? 'var(--d-cream-2)' : 'transparent', color: locked ? 'var(--d-ink-faint)' : 'var(--d-ink)', fontWeight: selected ? 600 : 400 }}>
      {label}
    </button>
  )
}
