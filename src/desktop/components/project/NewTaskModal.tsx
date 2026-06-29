import React, { useState, useEffect, useRef } from 'react'
import { X, ArrowUp, BookOpen, CornerDownLeft } from 'lucide-react'
import { useUIStore } from '../../stores/ui.store'
import { useProjectsStore } from '../../stores/projects.store'
import { useSettingsStore } from '../../stores/settings.store'
import { useSessionsStore } from '../../stores/sessions.store'
import { useAgentStore } from '../../stores/agent.store'
import { ipc, SkillDef } from '../../lib/ipc'

export function NewTaskModal() {
  const { newTaskModalOpen, newTaskPreselectedProjectId, closeNewTask } = useUIStore()
  const { projects, setActiveProject } = useProjectsStore()
  const { setActiveSession } = useSessionsStore()
  const { savedModels, getModel } = useSettingsStore()

  const [message, setMessage] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>('')
  
  // Slash commands state
  const [skills, setSkills] = useState<SkillDef[]>([])
  const [slashOpen, setSlashOpen] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const [confirmedSkills, setConfirmedSkills] = useState<SkillDef[]>([])
  
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (slashOpen) {
      ipc.skills.list().then(s => setSkills(Array.isArray(s) ? s : [])).catch(() => {})
    }
  }, [slashOpen])

  useEffect(() => {
    ipc.skills.list().then(s => setSkills(Array.isArray(s) ? s : [])).catch(() => {})
  }, [])

  // Reset form when modal opens
  useEffect(() => {
    if (newTaskModalOpen) {
      setSelectedProjectId(newTaskPreselectedProjectId)
      setMessage('')
      setSelectedModel('')
      setConfirmedSkills([])
      setSlashOpen(false)
      requestAnimationFrame(() => textareaRef.current?.focus())
    }
  }, [newTaskModalOpen, newTaskPreselectedProjectId])

  const hasContent = !!message.trim() || confirmedSkills.length > 0
  const canStart = hasContent && !!selectedProjectId

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
    if (!canStart) return
    const pid = selectedProjectId!

    await ipc.agent.newSession(pid)
    useAgentStore.getState().setStatus('idle')
    useAgentStore.getState().clearToolCalls()
    useAgentStore.getState().clearTimelines()
    useSessionsStore.getState().clearUIMessages()

    const skillPart = confirmedSkills.map(s => `/${s.id}`).join(' ')
    const textPart = message.trim()
    const msg = [skillPart, textPart].filter(Boolean).join(skillPart && textPart ? '\n\n' : '')

    // Store pending message and model for SessionView to pick up
    sessionStorage.setItem(`pendingMessage_${pid}`, msg)
    if (selectedModel) {
      sessionStorage.setItem(`pendingModel_${pid}`, selectedModel)
    }

    setActiveProject(pid)
    setActiveSession('__new__')
    closeNewTask()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (slashOpen && filtered.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => (i + 1) % filtered.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => (i - 1 + filtered.length) % filtered.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickSkill(filtered[activeIdx]); return }
      if (e.key === 'Escape') { e.preventDefault(); setSlashOpen(false); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleStart() }
    if (e.key === 'Escape') { e.preventDefault(); closeNewTask() }
  }

  if (!newTaskModalOpen) return null

  const preselectedProject = newTaskPreselectedProjectId
    ? projects.find(p => p.id === newTaskPreselectedProjectId)
    : null

  const activeProjects = projects.filter(p => !p.archived)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-overlay/80 backdrop-blur-sm"
      onClick={closeNewTask}
    >
      <div
        className="relative bg-bg-primary border border-border rounded-3xl shadow-xl w-full max-w-2xl mx-4 px-10 py-10 animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={closeNewTask}
          className="absolute top-5 right-5 p-2 text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors"
        >
          <X size={16} />
        </button>

        {/* Heading */}
        <h1 className="text-3xl font-semibold text-text-primary brand-serif text-center mb-1">
          What do you want to do?
        </h1>
        {preselectedProject ? (
          <p className="text-sm text-text-muted text-center mb-8">
            in <span className="text-text-secondary font-medium">{preselectedProject.icon} {preselectedProject.name}</span>
          </p>
        ) : (
          <p className="text-sm text-text-muted text-center mb-8">Start a new task</p>
        )}

        {/* Slash skill dropdown */}
        {slashOpen && filtered.length > 0 && (
          <div className="absolute bottom-[230px] mb-2 left-10 right-10 bg-bg-elevated border border-border rounded-xl overflow-hidden animate-slide-up z-30"
            style={{ boxShadow: '0 8px 28px color-mix(in srgb, var(--shadow-rgb) 14%, transparent), 0 2px 6px color-mix(in srgb, var(--shadow-rgb) 6%, transparent)' }}
          >
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
        <div className="bg-bg-secondary border border-border rounded-2xl overflow-hidden shadow-card focus-within:border-accent/50 transition-colors mb-5">
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
            placeholder="Describe your task…  ( call a skill with / )"
            rows={4}
            className="w-full bg-transparent text-md text-text-primary placeholder-text-muted resize-none outline-none selectable px-5 py-4"
          />

          {/* Footer row: project selector · model selector · start button */}
          <div className="flex items-center gap-2.5 px-4 py-3 border-t border-border-subtle">
            {/* Project selector — only shown when not pre-selected */}
            {!newTaskPreselectedProjectId ? (
              <select
                value={selectedProjectId ?? ''}
                onChange={e => setSelectedProjectId(e.target.value || null)}
                className="flex-1 bg-bg-tertiary border border-border rounded-lg text-xs text-text-secondary px-2.5 py-1.5 outline-none focus:border-accent/40 cursor-pointer"
              >
                <option value="">Choose project…</option>
                {activeProjects.map(p => (
                  <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
                ))}
              </select>
            ) : (
              <div className="flex-1" />
            )}

            {/* Model selector */}
            <select
              value={selectedModel}
              onChange={e => setSelectedModel(e.target.value)}
              className="bg-bg-tertiary border border-border rounded-lg text-xs text-text-secondary px-2.5 py-1.5 outline-none focus:border-accent/40 cursor-pointer max-w-[210px] truncate"
            >
              <option value="">Global ({getModel()?.split('/').pop() ?? 'default'})</option>
              {savedModels.map(m => (
                <option key={m} value={m}>{m.split('/').pop() ?? m}</option>
              ))}
            </select>

            <button
              onClick={handleStart}
              disabled={!canStart}
              className="flex items-center gap-1.5 px-4 py-2 bg-accent text-accent-fg rounded-xl text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-accent-hover transition-colors flex-shrink-0"
            >
              Start <ArrowUp size={13} />
            </button>
          </div>
        </div>

        <p className="text-2xs text-text-muted text-center">
          Enter to start · Shift+Enter new line · Esc to cancel
        </p>
      </div>
    </div>
  )
}
