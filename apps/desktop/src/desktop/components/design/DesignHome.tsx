import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import designLogo from '@/assets/cowrangler_dsgn.png'
import {
  ArrowLeft, ArrowRight, ArrowUp, Check, ChevronDown, FileText, LayoutGrid,
  List, Loader2, MoreHorizontal, Palette, Paperclip, Plus, Search, Star,
  Trash2, X,
} from 'lucide-react'
import {
  DesignProjectRecord, DesignSystemRecord, DesignTemplateType, useDesignStore,
} from '../../stores/design.store'
import { useSettingsStore } from '../../stores/settings.store'
import { ipc } from '../../lib/ipc'
import { useDeferredFileDrop } from '../../lib/useDeferredFileDrop'
import { useModelPool } from '../../hooks/useModelPool'
import { ALL_TEMPLATES, TemplateMeta, templateFor } from './DesignTemplates'
import { DesignAvatar, DesignTopBar } from './DesignTopBar'

const PLACEHOLDERS = [
  'Describe an app idea',
  'Create an onboarding flow for a finance app',
  'Turn this research into a clear visual story',
  'Animate a quiet, confident logo reveal',
]

interface Props { onOpen: (project: DesignProjectRecord) => void }

export function DesignHome({ onOpen }: Props) {
  const {
    projects, loadingProjects, loadProjects, createProject, deleteProject, renameProject,
    systems, loadSystems, createSystem, deleteSystem, setPending,
  } = useDesignStore()
  const { getModel } = useSettingsStore()
  const drop = useDeferredFileDrop()
  const [input, setInput] = useState('')
  const [template, setTemplate] = useState<DesignTemplateType>('blank')
  const [systemId, setSystemId] = useState<string | null>(null)
  const [model, setModel] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [placeholder, setPlaceholder] = useState(0)
  const [tab, setTab] = useState<'projects' | 'systems'>('projects')
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadProjects(); loadSystems() }, [])
  useEffect(() => {
    if (input) return
    const timer = window.setInterval(() => setPlaceholder(i => (i + 1) % PLACEHOLDERS.length), 4200)
    return () => window.clearInterval(timer)
  }, [input])
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenu(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const activeTemplate = templateFor(template)
  const activeSystem = systems.find(system => system.id === systemId) ?? null
  const filteredProjects = useMemo(() => projects
    .filter(project => !query || project.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned)), [projects, query])

  async function create(name: string, type: DesignTemplateType, prompt?: string) {
    if (creating) return
    setCreating(true)
    try {
      const project = await createProject(name.trim() || 'Untitled', type, systemId ?? undefined)
      const attachmentText = await drop.flush(project.id)
      drop.clear()
      const finalPrompt = [prompt, attachmentText].filter(Boolean).join('\n\n')
      setPending(finalPrompt ? { text: finalPrompt, model: model ?? undefined } : null)
      onOpen(project)
    } finally { setCreating(false) }
  }

  function submit() {
    const text = input.trim()
    if (!text && drop.files.length === 0) return
    const name = text.split(/\s+/).slice(0, 6).join(' ') || activeTemplate?.label || 'Untitled'
    void create(name, template, text)
  }

  async function togglePin(project: DesignProjectRecord) {
    await ipc.projects.update(project.id, { pinned: project.pinned ? 0 : 1 })
    loadProjects()
  }

  if (setupOpen) {
    return <DesignSystemSetup onBack={() => setSetupOpen(false)} onCreate={async data => {
      const system = await createSystem(data)
      setSystemId(system.id)
      setSetupOpen(false)
    }} />
  }

  return (
    <>
      <DesignTopBar
        left={<span className="design-wordmark">Cowrangler <em>Design</em></span>}
        right={<DesignAvatar />}
        border
      />
      <main className="flex-1 overflow-y-auto design-home-shell">
        <section className="design-home-hero">
          <div className="design-home-mark design-rise">
            <img src={designLogo} alt="" />
            <span>Design workspace</span>
          </div>
          <h1 className="design-serif design-rise">Make the idea in your head visible.</h1>
          <Composer
            input={input}
            onInput={setInput}
            placeholder={PLACEHOLDERS[placeholder]}
            template={template}
            onTemplate={setTemplate}
            systems={systems}
            activeSystem={activeSystem}
            onSystem={setSystemId}
            onAddSystem={() => setSetupOpen(true)}
            model={model}
            globalModel={getModel() ?? null}
            onModel={setModel}
            drop={drop}
            creating={creating}
            onSubmit={submit}
          />
        </section>

        <section className="design-template-section" aria-labelledby="template-heading">
          <div className="design-section-heading">
            <div>
              <p className="design-eyebrow">Starting point</p>
              <h2 id="template-heading">Use a template</h2>
            </div>
            <span>13 purpose-built render paths</span>
          </div>
          <TemplateRail selected={template} onPick={setTemplate} />
          {activeTemplate && (
            <div className="design-template-detail design-rise" key={activeTemplate.type}>
              <div className="design-template-detail-mark" style={{ color: activeTemplate.accent }}>{activeTemplate.thumb}</div>
              <div className="min-w-0">
                <strong>{activeTemplate.label}</strong>
                <p>{activeTemplate.blurb}</p>
              </div>
              <div className="design-render-spec">
                <span>{activeTemplate.renderLabel}</span>
                <small>{activeTemplate.format}</small>
              </div>
              <button
                onClick={() => create(`Untitled ${activeTemplate.label}`, activeTemplate.type, activeTemplate.starterPrompt)}
                disabled={creating}
                className="design-primary-button"
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                Use template
              </button>
            </div>
          )}
        </section>

        <section className="design-library">
          <div className="design-library-toolbar">
            <div className="design-tabs" role="tablist" aria-label="Design library">
              <button role="tab" aria-selected={tab === 'projects'} onClick={() => setTab('projects')}>Projects</button>
              <button role="tab" aria-selected={tab === 'systems'} onClick={() => setTab('systems')}>Design systems</button>
            </div>
            <div className="design-library-actions">
              {tab === 'systems' && <button className="design-secondary-button" onClick={() => setSetupOpen(true)}><Plus size={13} /> Create design system</button>}
              <label className="design-search"><Search size={13} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search ${tab}`} /></label>
              {tab === 'projects' && <div className="design-view-toggle">
                <button aria-label="List view" aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={14} /></button>
                <button aria-label="Grid view" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><LayoutGrid size={14} /></button>
              </div>}
            </div>
          </div>

          {tab === 'projects' ? (
            <ProjectLibrary
              projects={filteredProjects} loading={loadingProjects} view={view} renaming={renaming}
              onOpen={onOpen} onTogglePin={togglePin}
              onMenu={(id, x, y) => setMenu({ id, x, y })}
              onRenameChange={name => setRenaming(value => value ? { ...value, name } : null)}
              onRenameCommit={async () => { if (renaming) await renameProject(renaming.id, renaming.name); setRenaming(null) }}
              onRenameCancel={() => setRenaming(null)}
            />
          ) : (
            <SystemLibrary systems={systems.filter(system => !query || system.name.toLowerCase().includes(query.toLowerCase()))} onCreate={() => setSetupOpen(true)} onDelete={deleteSystem} />
          )}
        </section>
      </main>

      {menu && <div ref={menuRef} className="design-menu" style={{ left: menu.x, top: menu.y }}>
        <button onClick={() => { const project = projects.find(item => item.id === menu.id); if (project) setRenaming({ id: project.id, name: project.name }); setMenu(null) }}>Rename</button>
        <button className="danger" onClick={async () => { await deleteProject(menu.id); setMenu(null) }}><Trash2 size={12} /> Delete</button>
      </div>}
    </>
  )
}

function Composer({ input, onInput, placeholder, template, onTemplate, systems, activeSystem, onSystem, onAddSystem, model, globalModel, onModel, drop, creating, onSubmit }: {
  input: string; onInput: (value: string) => void; placeholder: string
  template: DesignTemplateType; onTemplate: (value: DesignTemplateType) => void
  systems: DesignSystemRecord[]; activeSystem: DesignSystemRecord | null; onSystem: (id: string | null) => void; onAddSystem: () => void
  model: string | null; globalModel: string | null; onModel: (model: string | null) => void
  drop: ReturnType<typeof useDeferredFileDrop>; creating: boolean; onSubmit: () => void
}) {
  const [open, setOpen] = useState<'system' | 'template' | 'model' | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const { displayModels, modelGates, unlockingModel, unlockModel } = useModelPool(open === 'model')
  const currentTemplate = templateFor(template)
  const currentModel = model ?? globalModel
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const toggle = (value: typeof open) => setOpen(open === value ? null : value)

  return (
    <div ref={rootRef} {...drop.dropBind} className={`design-composer design-rise ${drop.isDragging ? 'is-dragging' : ''} ${open ? 'has-popover' : ''}`}>
      {drop.isDragging && <div className="design-drop-overlay"><Paperclip size={16} /> Drop references here</div>}
      {drop.files.length > 0 && <div className="design-attachments">{drop.files.map((file, index) => (
        <span key={`${file.name}-${index}`}>{file.previewUrl ? <img src={file.previewUrl} alt="" /> : <FileText size={11} />} {file.name}<button onClick={() => drop.remove(index)}><X size={10} /></button></span>
      ))}</div>}
      <textarea
        autoFocus value={input} onChange={e => onInput(e.target.value)} placeholder={placeholder} disabled={creating}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); onSubmit() } }}
      />
      <div className="design-composer-controls">
        <button className="design-add-button" title="Attach files"><Plus size={17} /></button>
        <div className="design-popover-anchor">
          <ControlChip label="Design system" value={activeSystem?.name ?? 'None'} active={open === 'system'} onClick={() => toggle('system')} />
          {open === 'system' && <Popover>
            <Option selected={!activeSystem} onClick={() => { onSystem(null); setOpen(null) }}>None</Option>
            {systems.map(system => <Option key={system.id} selected={activeSystem?.id === system.id} onClick={() => { onSystem(system.id); setOpen(null) }}>{system.name}</Option>)}
            <div className="design-popover-rule" />
            <Option onClick={() => { setOpen(null); onAddSystem() }}><Plus size={12} /> Add design system</Option>
          </Popover>}
        </div>
        <div className="design-popover-anchor">
          <ControlChip label="Template" value={currentTemplate?.shortLabel ?? 'None'} active={open === 'template'} onClick={() => toggle('template')} />
          {open === 'template' && <Popover templateGrid>
            <Option selected={template === 'blank'} onClick={() => { onTemplate('blank'); setOpen(null) }}><i className="design-option-icon"><Palette size={15} /></i>Blank canvas</Option>
            {ALL_TEMPLATES.map(item => <Option key={item.type} selected={template === item.type} onClick={() => { onTemplate(item.type); setOpen(null) }}><i style={{ color: item.accent }}>{item.thumb}</i>{item.label}</Option>)}
          </Popover>}
        </div>
        <div className="flex-1" />
        <div className="design-popover-anchor">
          <ControlChip label="Model" value={currentModel?.split('/').pop() || 'No model'} active={open === 'model'} onClick={() => toggle('model')} />
          {open === 'model' && <Popover align="right" wide>
            {displayModels.map(modelId => {
              const gate = modelGates[modelId]
              return <Option key={modelId} selected={currentModel === modelId} disabled={unlockingModel === modelId} onClick={async () => {
                if (gate?.locked) { await unlockModel(modelId); return }
                onModel(modelId); setOpen(null)
              }}>{gate?.locked ? 'Locked · ' : ''}{modelId}</Option>
            })}
            {displayModels.length === 0 && <p className="design-popover-empty">Add models in Settings.</p>}
          </Popover>}
        </div>
        <button className="design-send-button" onClick={onSubmit} disabled={creating || (!input.trim() && drop.files.length === 0)} aria-label="Create design">
          {creating ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={16} />}
        </button>
      </div>
      {creating && <div className="design-generation-state"><span /><strong>Preparing {currentTemplate?.label ?? 'blank canvas'}</strong><small>Workspace, renderer, and design context</small></div>}
    </div>
  )
}

function ControlChip({ label, value, active, onClick }: { label: string; value: string; active: boolean; onClick: () => void }) {
  return <button className="design-control-chip" aria-expanded={active} onClick={onClick}><span><small>{label}</small><strong>{value}</strong></span><ChevronDown size={11} /></button>
}
function Popover({ children, wide, templateGrid, align = 'left' }: { children: React.ReactNode; wide?: boolean; templateGrid?: boolean; align?: 'left' | 'right' }) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<React.CSSProperties>({ visibility: 'hidden' })
  useLayoutEffect(() => {
    const place = () => {
      const popover = ref.current
      const anchor = popover?.parentElement
      if (!popover || !anchor) return
      const anchorBounds = anchor.getBoundingClientRect()
      const width = popover.offsetWidth
      const minimumTop = 52
      const maximumHeight = Math.max(120, window.innerHeight - minimumTop - 8)
      const height = Math.min(popover.scrollHeight, maximumHeight)
      const gap = 7
      const above = anchorBounds.top - gap - height
      const below = anchorBounds.bottom + gap
      const fitsAbove = above >= minimumTop
      const fitsBelow = below + height <= window.innerHeight - 8
      const preferAbove = fitsAbove || (!fitsBelow && anchorBounds.top - minimumTop > window.innerHeight - anchorBounds.bottom - 8)
      const top = Math.min(
        Math.max(preferAbove ? above : below, minimumTop),
        Math.max(minimumTop, window.innerHeight - height - 8),
      )
      const desiredLeft = align === 'right' ? anchorBounds.right - width : anchorBounds.left
      const left = Math.min(Math.max(desiredLeft, 8), Math.max(8, window.innerWidth - width - 8))
      setPosition({
        position: 'absolute',
        top: top - anchorBounds.top,
        left: left - anchorBounds.left,
        right: 'auto',
        bottom: 'auto',
        maxHeight: maximumHeight,
        overflow: 'auto',
        visibility: 'visible',
      })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [align])
  return <div ref={ref} style={position} className={`design-popover ${wide ? 'is-wide' : ''} ${templateGrid ? 'is-template-grid' : ''} ${align === 'right' ? 'is-right' : ''}`}>{children}</div>
}
function Option({ children, selected, disabled, onClick }: { children: React.ReactNode; selected?: boolean; disabled?: boolean; onClick: () => void }) {
  return <button role="option" aria-selected={!!selected} className="design-option" disabled={disabled} onClick={onClick}>{selected ? <Check size={12} /> : <span className="option-spacer" />}{children}</button>
}

function TemplateRail({ selected, onPick }: { selected: DesignTemplateType; onPick: (type: DesignTemplateType) => void }) {
  const railRef = useRef<HTMLDivElement>(null)
  const [edge, setEdge] = useState({ start: true, end: false })
  const updateEdge = () => {
    const rail = railRef.current
    if (!rail) return
    setEdge({ start: rail.scrollLeft <= 2, end: rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 2 })
  }
  const scroll = (direction: -1 | 1) => {
    const rail = railRef.current
    if (!rail) return
    const visibleCards = Math.max(1, Math.floor((rail.clientWidth - 40) / 150))
    rail.scrollBy({ left: direction * visibleCards * 150, behavior: 'smooth' })
  }
  useEffect(() => {
    const rail = railRef.current
    if (!rail) return
    updateEdge()
    const resize = new ResizeObserver(updateEdge)
    resize.observe(rail)
    rail.addEventListener('scroll', updateEdge, { passive: true })
    return () => { resize.disconnect(); rail.removeEventListener('scroll', updateEdge) }
  }, [])
  useEffect(() => {
    if (selected === 'blank') return
    const card = railRef.current?.querySelector<HTMLElement>(`[data-template="${selected}"]`)
    card?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [selected])
  return <div className="design-template-rail-wrap">
    <button className="design-rail-arrow is-left" aria-label="Previous templates" disabled={edge.start} onClick={() => scroll(-1)}><ArrowLeft size={16} /></button>
    <div className="design-template-rail" ref={railRef}>
      {ALL_TEMPLATES.map((item, index) => <button
        key={item.type} data-template={item.type} className="design-template-card" aria-pressed={selected === item.type}
        style={{ '--template-accent': item.accent, animationDelay: `${Math.min(index * 28, 220)}ms` } as React.CSSProperties}
        onClick={() => onPick(selected === item.type ? 'blank' : item.type)}
      >
        <span className="design-template-art">{item.thumb}</span>
        <span className="design-template-card-label">{item.label}</span>
        <small>{item.renderMode}</small>
      </button>)}
    </div>
    <button className="design-rail-arrow is-right" aria-label="Next templates" disabled={edge.end} onClick={() => scroll(1)}><ArrowRight size={16} /></button>
  </div>
}

function ProjectLibrary({ projects, loading, view, renaming, onOpen, onTogglePin, onMenu, onRenameChange, onRenameCommit, onRenameCancel }: {
  projects: DesignProjectRecord[]; loading: boolean; view: 'list' | 'grid'; renaming: { id: string; name: string } | null
  onOpen: (project: DesignProjectRecord) => void; onTogglePin: (project: DesignProjectRecord) => void
  onMenu: (id: string, x: number, y: number) => void; onRenameChange: (name: string) => void; onRenameCommit: () => void; onRenameCancel: () => void
}) {
  if (loading) return <div className="design-library-loading">{[0, 1, 2].map(item => <span key={item} />)}</div>
  if (!projects.length) return <EmptyState title="No projects yet" text="Describe an idea above or choose a template to begin." />
  if (view === 'grid') return <div className="design-project-grid">{projects.map(project => {
    const meta = templateFor(project.designType)
    return <button key={project.id} className="design-project-card" onClick={() => onOpen(project)} onContextMenu={event => { event.preventDefault(); onMenu(project.id, event.clientX, event.clientY) }}>
      <span className="design-project-cover" style={{ '--project-accent': meta?.accent ?? '#90755f' } as React.CSSProperties}>{meta?.thumb ?? project.icon ?? '✦'}</span>
      <span><strong>{project.name}</strong><small>{meta?.label ?? 'Blank canvas'} · {formatDate(project.updated_at)}</small></span>
    </button>
  })}</div>
  return <div className="design-project-list">
    <div className="design-table-head"><span>Name</span><span>Template</span><span>Last viewed</span><span /></div>
    {projects.map(project => {
      const meta = templateFor(project.designType)
      return <div key={project.id} className="design-project-row" onClick={() => onOpen(project)}>
        <div className="design-project-name"><span className="design-project-thumb" style={{ color: meta?.accent }}>{meta?.thumb ?? project.icon ?? '✦'}</span>{renaming?.id === project.id ? <input autoFocus value={renaming.name} onChange={e => onRenameChange(e.target.value)} onBlur={onRenameCommit} onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Enter') onRenameCommit(); if (e.key === 'Escape') onRenameCancel() }} /> : <strong>{project.name}</strong>}</div>
        <span>{meta?.label ?? 'Blank canvas'}</span><span>{formatDate(project.updated_at)}</span>
        <div className="design-row-actions"><button onClick={event => { event.stopPropagation(); onTogglePin(project) }} aria-label={project.pinned ? 'Unpin' : 'Pin'}><Star size={13} fill={project.pinned ? 'currentColor' : 'none'} /></button><button onClick={event => { event.stopPropagation(); onMenu(project.id, event.clientX, event.clientY) }} aria-label="Project menu"><MoreHorizontal size={14} /></button></div>
      </div>
    })}
  </div>
}

function SystemLibrary({ systems, onCreate, onDelete }: { systems: DesignSystemRecord[]; onCreate: () => void; onDelete: (id: string) => Promise<void> }) {
  if (!systems.length) return <EmptyState title="No design systems" text="Capture brand rules once, then apply them to every generation." action="Create design system" onAction={onCreate} />
  return <div className="design-system-list">
    <div className="design-table-head system"><span /><span>Name</span><span>Updated</span><span>Access</span><span /></div>
    {systems.map((system, index) => {
      const included = system.id.startsWith('builtin_')
      return <div className="design-system-row" key={system.id}>
        <span className="design-system-swatch" style={{ '--system-index': index } as React.CSSProperties}><i /><i /><i /></span>
        <div><strong>{system.name}</strong>{system.blurb && <small>{system.blurb}</small>}</div>
        <span>{included ? '—' : formatDate(system.createdAt)}</span>
        <span>{included ? 'Included' : 'You'}</span>
        {!included && <button className="design-icon-button" onClick={() => onDelete(system.id)} aria-label={`Delete ${system.name}`}><Trash2 size={13} /></button>}
      </div>
    })}
  </div>
}

function EmptyState({ title, text, action, onAction }: { title: string; text: string; action?: string; onAction?: () => void }) {
  return <div className="design-empty"><Palette size={24} /><strong>{title}</strong><p>{text}</p>{action && <button className="design-secondary-button" onClick={onAction}>{action}</button>}</div>
}

function DesignSystemSetup({ onBack, onCreate }: { onBack: () => void; onCreate: (data: { name: string; blurb: string; notes: string }) => void }) {
  const [name, setName] = useState('')
  const [blurb, setBlurb] = useState('')
  const [notes, setNotes] = useState('')
  return <>
    <DesignTopBar border left={<button className="design-back-button" onClick={onBack}><ArrowLeft size={14} /> Back</button>} right={<button className="design-primary-button" disabled={!name.trim()} onClick={() => onCreate({ name: name.trim(), blurb: blurb.trim(), notes: notes.trim() })}>Create design system</button>} />
    <main className="design-system-setup">
      <p className="design-eyebrow">Reusable visual context</p><h1 className="design-serif">Build your design system</h1><p className="intro">Give every template same visual DNA. Cowrangler applies these rules during generation, not after.</p>
      <label><span>Name</span><small>Company, product, or visual language</small><input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Northstar product system" /></label>
      <label><span>What is it?</span><small>Audience, product, and job it performs</small><textarea rows={3} value={blurb} onChange={e => setBlurb(e.target.value)} placeholder="A calm operations platform for distributed field teams…" /></label>
      <label><span>Visual and voice rules</span><small>Palette, typography, spacing, components, imagery, tone</small><textarea rows={8} value={notes} onChange={e => setNotes(e.target.value)} placeholder={'Palette: mineral blue, warm grey, signal orange\nType: sturdy grotesk with editorial serif accents\nComponents: compact, squared, information-first\nVoice: direct, calm, specific'} /></label>
    </main>
  </>
}

function formatDate(value?: number) {
  if (!value) return '—'
  const date = new Date(value)
  const diff = Date.now() - date.getTime()
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
