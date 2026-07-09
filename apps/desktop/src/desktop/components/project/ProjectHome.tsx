import React, { useEffect, useState, useRef } from 'react'
import { Pin, MoreHorizontal, Plus, ArrowRight, Folder, Clock, ExternalLink, MessageSquare, BookOpen, CornerDownLeft, X, Play, ChevronUp, Paperclip, FileText } from 'lucide-react'
import { useFileDrop } from '../../lib/useFileDrop'
import { useProjectsStore } from '../../stores/projects.store'
import { useSessionsStore } from '../../stores/sessions.store'
import { useAgentStore } from '../../stores/agent.store'
import { useSettingsStore } from '../../stores/settings.store'
import { ipc, SkillDef } from '../../lib/ipc'
import { formatRelative } from '../../lib/time'
import { EditProjectModal } from './EditProjectModal'

interface Props { projectId: string }

export function ProjectHome({ projectId }: Props) {
  const { getActiveProject, loadFolders, folders, loadInstructions, updateProject, deleteProject, setActiveProject } = useProjectsStore()
  const { sessionsByProject, loadSessions, setActiveSession } = useSessionsStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const project = getActiveProject()
  const sessions = sessionsByProject[projectId] ?? []

  useEffect(() => {
    if (projectId) {
      loadSessions(projectId)
      loadFolders(projectId)
      loadInstructions(projectId)
    }
  }, [projectId])

  async function togglePin() {
    if (!project) return
    await updateProject(projectId, { pinned: project.pinned ? 0 : 1 })
  }

  async function handleDelete() {
    if (!project) return
    const ok = window.confirm(`Are you sure you want to delete the project "${project.name}"? This action cannot be undone.`)
    if (!ok) return
    setMenuOpen(false)
    await deleteProject(projectId)
    setActiveProject(null)
  }

  if (!project) return null
  const projectFolders = folders[projectId] ?? []
  const isPinned = !!project.pinned

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-bg-primary">
      <div className="max-w-2xl w-full mx-auto px-6 pt-24 pb-10 flex flex-col gap-7">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary brand-serif">{project.name}</h1>
            {project.description && (
              <p className="text-sm text-text-secondary mt-1 leading-relaxed">{project.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={togglePin}
              className={`p-2 rounded-lg transition-colors ${
                isPinned
                  ? 'text-accent bg-accent-subtle hover:bg-accent-subtle'
                  : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover'
              }`}
              title={isPinned ? 'Unpin' : 'Pin'}
            >
              <Pin size={15} className={isPinned ? 'fill-current' : ''} />
            </button>
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-2 text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-colors rounded-lg"
              >
                <MoreHorizontal size={15} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-10 z-20 bg-bg-secondary border border-border rounded-xl shadow-pop min-w-[170px] py-1 animate-slide-up">
                    <button
                      onClick={() => { setMenuOpen(false); setEditOpen(true) }}
                      className="w-full px-3 py-2 text-left text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                    >
                      Edit project
                    </button>
                    <button
                      onClick={handleDelete}
                      className="w-full px-3 py-2 text-left text-xs text-error hover:bg-error/10"
                    >
                      Delete project
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Inline New Task Form */}
        <InlineNewTask projectId={projectId} projectName={project.name} projectIcon={project.icon} />

        {/* Context folders */}
        <div className="flex items-center justify-between">
          <p className="text-2xs font-semibold text-text-muted uppercase tracking-wider">Context Folders</p>
          <button
            onClick={async () => {
              const path = await ipc.fs.pickFolder()
              if (path) await useProjectsStore.getState().addFolder(projectId, path)
            }}
            className="flex items-center gap-1 text-2xs text-text-muted hover:text-text-primary transition-colors"
          >
            <Plus size={11} /> Add
          </button>
        </div>

        {/* Context folders list */}
        {projectFolders.length > 0 ? (
          <div className="flex flex-col gap-1.5 -mt-4">
            {projectFolders.map(f => (
              <div key={f.id} className="flex items-center gap-2.5 px-3 py-2.5 bg-bg-secondary border border-border rounded-xl group">
                <Folder size={14} className="text-text-muted flex-shrink-0" />
                <span className="text-xs text-text-secondary truncate flex-1 font-mono">{f.folder_path}</span>
                <button
                  onClick={() => ipc.fs.openInFinder(f.folder_path)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-text-primary transition-all"
                >
                  <ExternalLink size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-2xs text-text-muted -mt-4">No folders added yet</p>
        )}

        {/* Recent chats */}
        {sessions.length > 0 && (
          <Section title="Recent chats">
            <div className="grid grid-cols-2 gap-2.5">
              {sessions.slice(0, 6).map(s => (
                <button
                  key={s.id}
                  onClick={() => setActiveSession(s.id)}
                  className="text-left px-3.5 py-3 bg-bg-secondary border border-border rounded-xl hover:border-accent/40 hover:bg-bg-hover transition-colors group"
                >
                  <div className="flex items-start gap-2.5">
                    <MessageSquare size={13} className="text-text-muted mt-0.5 flex-shrink-0 group-hover:text-accent transition-colors" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-text-primary truncate group-hover:text-accent transition-colors">
                        {s.title || 'Chat'}
                      </p>
                      <p className="text-2xs text-text-muted mt-1 flex items-center gap-1">
                        <Clock size={9} /> {formatRelative(s.started_at)}
                        {s.message_count > 0 && ` · ${s.message_count} messages`}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </Section>
        )}
      </div>

      {editOpen && <EditProjectModal projectId={projectId} onClose={() => setEditOpen(false)} />}
    </div>
  )
}

function InlineNewTask({ projectId, projectName, projectIcon }: { projectId: string, projectName: string, projectIcon: string }) {
  const { setActiveProject } = useProjectsStore()
  const { setActiveSession } = useSessionsStore()
  const { getModel, setModel, savedModels } = useSettingsStore()

  const [message, setMessage] = useState('')
  const drop = useFileDrop(projectId)

  const [skills, setSkills] = useState<SkillDef[]>([])
  const [slashOpen, setSlashOpen] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const [confirmedSkills, setConfirmedSkills] = useState<SkillDef[]>([])
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [modelGates, setModelGates] = useState<Record<string, { locked: boolean; reason?: string; pluginId: string; actionId?: string }>>({})
  const [unlockingModel, setUnlockingModel] = useState<string | null>(null)
  const [pluginModels, setPluginModels] = useState<string[]>([])
  
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const modelPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setModelPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (modelPickerOpen) {
      ipc.plugins.modelGates?.().then(g => setModelGates(g || {})).catch(() => {})
      ipc.plugins.models?.().then(m => setPluginModels(Array.isArray(m) ? m : [])).catch(() => {})
    }
  }, [modelPickerOpen])

  const displayModels = React.useMemo(
    () => [...new Set([...savedModels, ...pluginModels])],
    [savedModels, pluginModels],
  )

  async function handleUnlockModel(modelId: string, gate: { pluginId: string; actionId?: string }) {
    if (!gate.actionId) return
    setUnlockingModel(modelId)
    try {
      const res = await ipc.plugins.runAction(gate.pluginId, gate.actionId)
      const fresh: Record<string, { locked: boolean; reason?: string; pluginId: string; actionId?: string }> =
        (await ipc.plugins.modelGates?.().catch(() => ({}))) || {}
      setModelGates(fresh)
      if (res?.ok && !fresh[modelId]?.locked) {
        setModel(modelId)
        setModelPickerOpen(false)
      }
    } finally {
      setUnlockingModel(null)
    }
  }

  useEffect(() => {
    if (slashOpen) {
      ipc.skills.list().then(s => setSkills(Array.isArray(s) ? s : [])).catch(() => {})
    }
  }, [slashOpen])

  useEffect(() => {
    ipc.skills.list().then(s => setSkills(Array.isArray(s) ? s : [])).catch(() => {})
  }, [])

  const hasContent = !!message.trim() || confirmedSkills.length > 0 || drop.files.length > 0

  const filtered = skills
    .filter(s => {
      const q = slashQuery.toLowerCase()
      return q === '' || s.id.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
    })
    .slice(0, 8)

  function detectSlash(text: string, caret: number) {
    const upto = text.slice(0, caret)
    const m = upto.match(/(^|\s)\/([\w-]*)$/)
    if (m) {
      setSlashOpen(true)
      setSlashQuery(m[2])
      setActiveIdx(0)
    } else {
      setSlashOpen(false)
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const el = e.target
    const newValue = el.value
    setMessage(newValue)
    detectSlash(newValue, el.selectionStart ?? newValue.length)
  }

  function pickSkill(skill: SkillDef) {
    const el = textareaRef.current
    const caret = el?.selectionStart ?? message.length
    const upto = message.slice(0, caret)
    const rest = message.slice(caret)
    const cleaned = upto.replace(/(^|\s)\/([\w-]*)$/, '$1')
    const next = (cleaned + rest).replace(/^\s+/, '')
    setMessage(next)
    setConfirmedSkills(prev =>
      prev.some(s => s.id === skill.id) ? prev : [...prev, skill]
    )
    setSlashOpen(false)
    requestAnimationFrame(() => {
      el?.focus()
      const pos = cleaned.length
      el?.setSelectionRange(pos, pos)
    })
  }

  function removeSkill(skillId: string) {
    setConfirmedSkills(prev => prev.filter(s => s.id !== skillId))
  }


  async function handleStart() {
    if (!hasContent) return

    await ipc.agent.newSession(projectId)
    useAgentStore.getState().setStatus('idle')
    useAgentStore.getState().clearToolCalls()
    useAgentStore.getState().clearTimelines()
    useSessionsStore.getState().clearUIMessages()

    const skillPart = confirmedSkills.map(s => `/${s.id}`).join(' ')
    const textPart = message.trim()
    const attachPart = drop.refText()
    const msg = [skillPart, textPart, attachPart].filter(Boolean).join('\n\n')

    // Store pending message for SessionView to pick up
    sessionStorage.setItem(`pendingMessage_${projectId}`, msg)
    drop.clear()

    setActiveProject(projectId)
    setActiveSession('__new__')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (slashOpen && filtered.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => (i + 1) % filtered.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => (i - 1 + filtered.length) % filtered.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickSkill(filtered[activeIdx]); return }
      if (e.key === 'Escape') { e.preventDefault(); setSlashOpen(false); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleStart() }
  }

  return (
    <div className="relative">
      {/* Slash skill dropdown */}
      {slashOpen && filtered.length > 0 && (
        <div className="absolute top-full mt-2 left-4 right-4 bg-bg-elevated border border-border rounded-xl overflow-hidden animate-slide-up z-30 shadow-pop">
          <div className="px-3 py-2 border-b border-border-subtle flex items-center gap-1.5">
            <BookOpen size={11} className="text-accent" />
            <span className="text-2xs text-text-muted font-semibold uppercase tracking-widest">Invoke skill</span>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.map((s, i) => (
              <button
                key={s.id}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => pickSkill(s)}
                className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors ${
                  i === activeIdx ? 'bg-bg-hover' : 'hover:bg-bg-hover/60'
                }`}
              >
                <BookOpen size={13} className={`mt-0.5 flex-shrink-0 ${i === activeIdx ? 'text-accent' : 'text-text-muted'}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-text-primary truncate">/{s.id}</p>
                  <p className="text-2xs text-text-muted truncate mt-0.5">{s.description}</p>
                </div>
                {i === activeIdx && <CornerDownLeft size={11} className="text-text-muted mt-1 flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Composer card */}
      <div
        {...drop.dropBind}
        className={`relative bg-bg-secondary border rounded-2xl shadow-sm focus-within:border-accent/50 transition-colors mb-2 ${drop.isDragging ? 'border-accent border-dashed' : 'border-border'}`}
      >
        {drop.isDragging && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-accent/8 backdrop-blur-[1px] pointer-events-none">
            <div className="flex items-center gap-1.5 text-xs font-medium text-accent">
              <Paperclip size={15} /> Drop files to attach
            </div>
          </div>
        )}
        {drop.files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
            {drop.files.map(f => (
              <div key={f.relPath} className="flex items-center gap-1 pl-1 pr-2 py-0.5 rounded-md bg-bg-hover border border-border-subtle text-2xs text-text-secondary">
                {f.previewUrl
                  ? <img src={f.previewUrl} alt={f.name} className="w-5 h-5 rounded object-cover flex-shrink-0" />
                  : <FileText size={10} className="flex-shrink-0 text-text-muted" />}
                <span className="truncate max-w-[160px]">{f.name}</span>
                <button onClick={() => drop.remove(f.relPath)} className="ml-0.5 hover:text-text-primary transition-colors" title="Remove"><X size={10} /></button>
              </div>
            ))}
          </div>
        )}
        {drop.error && (
          <div className="px-3 pt-1 text-2xs text-red-400">{drop.error}</div>
        )}
        {confirmedSkills.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-2.5 pb-1">
            {confirmedSkills.map(skill => (
              <div
                key={skill.id}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/12 border border-accent/25 text-accent text-xs font-medium"
              >
                <BookOpen size={10} className="flex-shrink-0" />
                <span>/{skill.id}</span>
                <button
                  onClick={() => removeSkill(skill.id)}
                  className="ml-0.5 hover:text-accent-hover transition-colors"
                  title="Remove"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Start a new task… (call a skill with /)"
          rows={3}
          className="w-full bg-transparent text-sm text-text-primary placeholder-text-muted resize-none outline-none selectable px-4 py-3"
        />

        {/* Footer row */}
        <div className="flex items-center gap-2.5 px-3 py-2 border-t border-border-subtle bg-bg-tertiary rounded-b-2xl">
          <select
            disabled
            className="flex-1 bg-bg-secondary/50 border border-border-subtle rounded-lg text-xs text-text-muted px-2.5 py-1.5 outline-none cursor-not-allowed appearance-none opacity-80"
          >
            <option>{projectIcon} {projectName}</option>
          </select>

          {/* Model Selection */}
          <div className="relative" ref={modelPickerRef}>
            <button
              onClick={() => setModelPickerOpen(o => !o)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-text-secondary hover:text-text-primary rounded-lg border border-border-subtle hover:bg-bg-hover transition-all bg-bg-secondary/30"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                   className="text-accent/70 flex-shrink-0" aria-hidden="true">
                <ellipse cx="12" cy="8.5" rx="6.5" ry="5" />
                <path d="M12 13.5 C 12 17, 10 19, 8 21.5" />
              </svg>
              <span className="truncate max-w-[220px]">
                {(getModel().split('/').pop() || getModel() || 'No model') }
              </span>
              <ChevronUp size={10} className={`transition-transform text-text-muted/60 ${modelPickerOpen ? 'rotate-180' : ''}`} />
            </button>

            {modelPickerOpen && (
              <div className="absolute bottom-full right-0 mb-1.5 z-50 bg-bg-secondary border border-border rounded-xl shadow-pop overflow-hidden animate-slide-up w-[30rem] max-w-[calc(100vw-2rem)]">
                <div className="p-2 space-y-0.5 max-h-72 overflow-y-auto">
                  <p className="px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-text-muted select-none">Select active model</p>
                  {displayModels.map(modelId => {
                    const slash = modelId.indexOf('/')
                    const provider = slash > 0 ? modelId.slice(0, slash) : null
                    const name = slash > 0 ? modelId.slice(slash + 1) : modelId
                    const active = getModel() === modelId
                    const gate = modelGates[modelId]
                    const locked = !!gate?.locked
                    const unlocking = unlockingModel === modelId
                    return (
                      <button
                        key={modelId}
                        onClick={() => {
                          if (locked) { void handleUnlockModel(modelId, gate) }
                          else { setModel(modelId); setModelPickerOpen(false) }
                        }}
                        disabled={unlocking}
                        title={locked ? (gate?.reason || 'Sign-in required') : modelId}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors ${
                          active ? 'bg-accent-subtle text-accent font-medium' : 'text-text-secondary hover:bg-bg-hover'
                        } ${locked ? 'opacity-80' : ''}`}
                      >
                        {provider && (
                          <span className="flex-shrink-0 text-[8px] leading-none font-medium uppercase tracking-wide px-1 py-0.5 rounded bg-bg-tertiary text-text-muted/80 border border-border/50 max-w-[56px] truncate" title={provider}>
                            {provider}
                          </span>
                        )}
                        <span className={`flex-1 min-w-0 truncate font-mono ${locked ? 'text-text-muted' : ''}`}>{name}</span>
                        {locked ? (
                          unlocking ? (
                            <span className="flex items-center gap-1 text-[9px] text-amber-500">
                              <svg width="10" height="10" viewBox="0 0 24 24" className="animate-spin" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" /></svg>
                              Signing in…
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[9px] font-medium text-amber-500" title={gate?.reason || 'Sign-in required'}>
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" strokeLinecap="round" /></svg>
                              Sign in
                            </span>
                          )
                        ) : active && <span className="text-2xs opacity-60">●</span>}
                      </button>
                    )
                  })}
                  {displayModels.length === 0 && (
                    <p className="px-2.5 py-2 text-2xs text-text-muted italic">No saved models — add in Settings</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleStart}
            disabled={!hasContent}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-accent-fg text-xs font-medium rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:hover:bg-accent"
          >
            <Play size={12} className="fill-current" />
            <span>Start</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-2xs font-semibold text-text-muted uppercase tracking-wider mb-2.5">{title}</h3>
      {children}
    </div>
  )
}
