import React, { useRef, useState, useCallback, useEffect } from 'react'
import { ArrowUp, Square, Paperclip, BookOpen, CornerDownLeft, X, Plus, Box, Plug, ChevronRight, FileText, ChevronUp } from 'lucide-react'
import { ipc, SkillDef } from '../../lib/ipc'
import { useFileDrop } from '../../lib/useFileDrop'
import { useSettingsStore } from '../../stores/settings.store'

interface Props {
  onSend: (message: string) => void
  onInterrupt: () => void
  disabled: boolean
  projectId: string
  /** When true, hides the bottom model picker row. */
  hideModelPicker?: boolean
  placeholder?: string
}

export function InputArea({ onSend, onInterrupt, disabled, projectId, hideModelPicker, placeholder }: Props) {
  const [value, setValue] = useState('')
  const [skills, setSkills] = useState<SkillDef[]>([])
  const [slashOpen, setSlashOpen] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  // Onaylanan skill'ler — textarea'dan ayrı chip olarak gösterilir
  const [confirmedSkills, setConfirmedSkills] = useState<SkillDef[]>([])
  const [confirmedConnectors, setConfirmedConnectors] = useState<any[]>([])
  const [confirmedPlugins, setConfirmedPlugins] = useState<any[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [plusMenuOpen, setPlusMenuOpen] = useState(false)
  const [hoverMenu, setHoverMenu] = useState<string | null>(null)
  const [hoverPlugin, setHoverPlugin] = useState<string | null>(null)
  const [mcpServers, setMcpServers] = useState<any[]>([])
  const [pluginsData, setPluginsData] = useState<any[]>([])
  const plusMenuRef = useRef<HTMLDivElement>(null)
  const drop = useFileDrop(projectId)

  // Model picker
  const { getModel, setModel, savedModels } = useSettingsStore()
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const modelPickerRef = useRef<HTMLDivElement>(null)
  // Per-model gate state (locked plugin models pending an action, e.g. Sign-in)
  const [modelGates, setModelGates] = useState<Record<string, { locked: boolean; reason?: string; pluginId: string; actionId?: string }>>({})
  const [unlockingModel, setUnlockingModel] = useState<string | null>(null)
  // Models contributed by installed plugins — shown in the picker alongside
  // the user's saved models so they are discoverable right after install.
  const [pluginModels, setPluginModels] = useState<string[]>([])

  useEffect(() => {
    if (modelPickerOpen) {
      ipc.plugins.modelGates?.().then(g => setModelGates(g || {})).catch(() => {})
      ipc.plugins.models?.().then(m => setPluginModels(Array.isArray(m) ? m : [])).catch(() => {})
    }
  }, [modelPickerOpen])

  // Union of saved + plugin models, saved first, deduped.
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
      // If the gate cleared, select the model right away.
      if (res?.ok && !fresh[modelId]?.locked) {
        setModel(modelId)
        setModelPickerOpen(false)
      }
    } finally {
      setUnlockingModel(null)
    }
  }

  // Clicking outside to close plus menu
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setPlusMenuOpen(false)
      }
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setModelPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (slashOpen) {
      ipc.skills.list().then(s => setSkills(Array.isArray(s) ? s : [])).catch(() => {})
    }
  }, [slashOpen])

  useEffect(() => {
    ipc.skills.list().then(s => setSkills(Array.isArray(s) ? s : [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (plusMenuOpen) {
      ipc.mcp.list().then(s => setMcpServers(Array.isArray(s) ? s : [])).catch(() => {})
      ipc.plugins.listWithSkills?.().then(p => setPluginsData(Array.isArray(p) ? p : [])).catch(() => {})
    }
  }, [plusMenuOpen])

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
    setValue(newValue)
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 220) + 'px'
    detectSlash(newValue, el.selectionStart ?? newValue.length)
  }

  /** Dropdown'dan skill seçilince: textarea'dan /query sil → chip olarak ekle */
  function pickSkill(skill: SkillDef) {
    const el = textareaRef.current
    const caret = el?.selectionStart ?? value.length
    const upto = value.slice(0, caret)
    const rest = value.slice(caret)
    // /query kısmını sil, textarea'ya eklemiyoruz
    const cleaned = upto.replace(/(^|\s)\/([\w-]*)$/, '$1')
    const next = (cleaned + rest).replace(/^\s+/, '')
    setValue(next)
    // Aynı skill iki kez eklenmez
    setConfirmedSkills(prev =>
      prev.some(s => s.id === skill.id) ? prev : [...prev, skill]
    )
    setSlashOpen(false)
    requestAnimationFrame(() => {
      el?.focus()
      const pos = cleaned.length
      el?.setSelectionRange(pos, pos)
      if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 220) + 'px' }
    })
  }

  function removeSkill(skillId: string) {
    setConfirmedSkills(prev => prev.filter(s => s.id !== skillId))
  }

  function toggleConnector(connector: any) {
    setConfirmedConnectors(prev => 
      prev.some(c => c.name === connector.name) ? prev.filter(c => c.name !== connector.name) : [...prev, connector]
    )
  }

  const MOCK_PLUGINS = [
    { id: 'accessibility-review', name: 'accessibility-review' },
    { id: 'design-critique', name: 'design-critique' },
    { id: 'design-handoff', name: 'design-handoff' },
  ]

  function togglePlugin(plugin: any) {
    setConfirmedPlugins(prev => 
      prev.some(p => p.id === plugin.id) ? prev.filter(p => p.id !== plugin.id) : [...prev, plugin]
    )
  }

  const hasContent = value.trim().length > 0 || confirmedSkills.length > 0 || confirmedConnectors.length > 0 || confirmedPlugins.length > 0 || drop.files.length > 0

  const handleSend = useCallback(() => {
    if (!hasContent || disabled) return
    // Skill'leri mesajın başına ekle
    const skillPart = confirmedSkills.map(s => `/${s.id}`).join(' ')
    const connPart = confirmedConnectors.map(c => `/${c.name}`).join(' ')
    const plugPart = confirmedPlugins.map(p => `/${p.id}`).join(' ')
    const parts = [skillPart, connPart, plugPart].filter(Boolean).join(' ')
    const textPart = value.trim()
    const attachPart = drop.refText()
    const msg = [parts, textPart, attachPart].filter(Boolean).join('\n\n')
    onSend(msg)
    setValue('')
    setConfirmedSkills([])
    setConfirmedConnectors([])
    setConfirmedPlugins([])
    drop.clear()
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [value, confirmedSkills, confirmedConnectors, confirmedPlugins, disabled, onSend, hasContent, drop])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (slashOpen && filtered.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => (i + 1) % filtered.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => (i - 1 + filtered.length) % filtered.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickSkill(filtered[activeIdx]); return }
      if (e.key === 'Escape') { e.preventDefault(); setSlashOpen(false); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex-shrink-0 px-4 pb-4 pt-2 bg-bg-primary">
      <div className="max-w-3xl mx-auto relative">

        {/* ── Slash skill dropdown ── */}
        {slashOpen && filtered.length > 0 && (
          <div className="absolute bottom-full mb-2 left-0 right-0 bg-bg-elevated border border-border rounded-xl overflow-hidden animate-slide-up z-30"
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

        {/* ── Plus menu ── */}
        {plusMenuOpen && (
          <div
            ref={plusMenuRef}
            className="absolute bottom-full mb-3 left-0 w-60 bg-bg-elevated border border-border rounded-xl overflow-hidden animate-slide-up z-30"
            style={{ boxShadow: '0 8px 28px color-mix(in srgb, var(--shadow-rgb) 14%, transparent), 0 2px 6px color-mix(in srgb, var(--shadow-rgb) 6%, transparent)' }}
          >
            <div className="py-1">
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-bg-hover transition-colors"
                onClick={async () => { await ipc.fs.pickFile(); setPlusMenuOpen(false) }}
                onMouseEnter={() => setHoverMenu(null)}
              >
                <Paperclip size={14} className="text-text-muted" />
                <span className="text-sm text-text-primary">Upload Project Files</span>
              </button>

              <div
                className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-bg-hover transition-colors group relative cursor-pointer"
                onMouseEnter={() => setHoverMenu('plugins')}
              >
                <div className="flex items-center gap-2.5">
                  <Box size={14} className="text-text-muted" />
                  <span className="text-sm text-text-primary">Plugins</span>
                </div>
                <ChevronRight size={14} className="text-text-muted" />

                {hoverMenu === 'plugins' && (
                  <div className="absolute left-full top-0 ml-1 w-56 bg-bg-elevated border border-border rounded-xl shadow-pop overflow-visible animate-slide-up z-40">
                    <div className="py-1">
                      {pluginsData.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-text-muted">No plugins found</div>
                      ) : (
                        pluginsData.map(plugin => (
                          <div
                            key={plugin.id}
                            className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-bg-hover transition-colors relative cursor-pointer"
                            onMouseEnter={() => setHoverPlugin(plugin.id)}
                          >
                            <div className="flex items-center gap-2.5">
                              <Box size={13} className="text-text-secondary" />
                              <span className="text-sm text-text-primary truncate">{plugin.name}</span>
                            </div>
                            {plugin.skills?.length > 0 && (
                              <ChevronRight size={13} className="text-text-muted" />
                            )}

                            {hoverPlugin === plugin.id && plugin.skills?.length > 0 && (
                              <div className="absolute left-full top-0 ml-1 w-64 bg-bg-elevated border border-border rounded-xl shadow-pop overflow-hidden animate-slide-up z-50">
                                <div className="py-1 max-h-64 overflow-y-auto">
                                  {plugin.skills.map((skill: any) => (
                                    <button
                                      key={skill.id}
                                      className="w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-bg-hover transition-colors"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        pickSkill(skill)
                                        setPlusMenuOpen(false)
                                      }}
                                    >
                                      <BookOpen size={12} className="mt-0.5 text-accent flex-shrink-0" />
                                      <div className="min-w-0 flex-1">
                                        <p className="text-xs font-medium text-text-primary truncate">/{skill.id}</p>
                                        <p className="text-2xs text-text-muted line-clamp-2 mt-0.5">{skill.description}</p>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Composer ── */}
        <div
          {...drop.dropBind}
          className={`relative flex flex-col bg-bg-elevated border rounded-2xl composer-shadow focus-within:border-accent/45 focus-within:composer-shadow-focus transition-all ${drop.isDragging ? 'border-accent border-dashed' : 'border-border'}`}
        >
          {/* Sürükle-bırak kaplaması */}
          {drop.isDragging && (
            <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-accent/8 backdrop-blur-[1px] pointer-events-none">
              <div className="flex items-center gap-2 text-accent text-sm font-medium">
                <Paperclip size={15} /> Drop files to attach
              </div>
            </div>
          )}
          {/* Eklenen dosya chip'leri */}
          {drop.files.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 pt-2.5 pb-1">
              {drop.files.map(f => (
                <div key={f.relPath} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-bg-hover border border-border text-text-secondary text-xs font-medium max-w-[220px]">
                  <FileText size={10} className="flex-shrink-0 text-text-muted" />
                  <span className="truncate">{f.name}</span>
                  <button onClick={() => drop.remove(f.relPath)} className="ml-0.5 hover:text-text-primary transition-colors" title="Remove"><X size={10} /></button>
                </div>
              ))}
            </div>
          )}
          {/* Skill, Connector, Plugin chip'leri */}
          {(confirmedSkills.length > 0 || confirmedConnectors.length > 0 || confirmedPlugins.length > 0) && (
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
              {confirmedConnectors.map(c => (
                <div
                  key={`conn-${c.name}`}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/12 border border-accent/25 text-accent text-xs font-medium"
                >
                  <Plug size={10} className="flex-shrink-0" />
                  <span>/{c.name}</span>
                  <button
                    onClick={() => toggleConnector(c)}
                    className="ml-0.5 hover:text-accent-hover transition-colors"
                    title="Remove"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
              {confirmedPlugins.map(p => (
                <div
                  key={`plug-${p.id}`}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/12 border border-accent/25 text-accent text-xs font-medium"
                >
                  <Box size={10} className="flex-shrink-0" />
                  <span>/{p.id}</span>
                  <button
                    onClick={() => togglePlugin(p)}
                    className="ml-0.5 hover:text-accent-hover transition-colors"
                    title="Remove"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Textarea satırı */}
          <div className="flex items-end gap-2 px-2.5 py-2">
            <button
              onClick={() => setPlusMenuOpen(!plusMenuOpen)}
              title="Add context"
              className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
                plusMenuOpen
                  ? 'bg-accent/12 text-accent'
                  : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover'
              }`}
            >
              <Plus size={16} />
            </button>

            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              placeholder={placeholder || (disabled ? 'Agent is working…' : 'Type a task…  ( call a skill with / )')}
              rows={1}
              className="flex-1 bg-transparent text-md text-text-primary placeholder-text-muted resize-none outline-none max-h-[220px] overflow-y-auto selectable py-1.5 disabled:opacity-60"
              style={{ minHeight: '28px' }}
            />

            {disabled ? (
              <button
                onClick={onInterrupt}
                title="Stop (Esc)"
                className="flex items-center justify-center w-9 h-9 rounded-xl bg-error/12 text-error
                           hover:bg-error/22 transition-colors flex-shrink-0"
              >
                <Square size={14} className="fill-current" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!hasContent}
                title="Send (Enter)"
                className="flex items-center justify-center w-9 h-9 rounded-xl text-accent-fg
                           disabled:opacity-25 disabled:cursor-not-allowed transition-all active:scale-95 flex-shrink-0"
                style={hasContent ? {
                  background: 'linear-gradient(160deg, rgb(var(--accent)) 0%, rgb(var(--accent-press)) 100%)',
                  boxShadow: '0 2px 8px color-mix(in srgb, rgb(var(--accent)) 30%, transparent)',
                } : {
                  background: 'rgb(var(--bg-hover))',
                }}
              >
                <ArrowUp size={16} />
              </button>
            )}
          </div>
        </div>

        {/* ── Model seçici + hint ── */}
        {!hideModelPicker ? (
          <div className="flex items-center justify-between mt-2 px-0.5">
            {/* Model picker */}
            <div className="relative" ref={modelPickerRef}>
              <button
                onClick={() => setModelPickerOpen(o => !o)}
                disabled={disabled}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-colors disabled:opacity-50 text-[11px] font-medium select-none"
                title="Change active model"
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
                <div className="absolute bottom-full left-0 mb-1.5 z-50 bg-bg-secondary border border-border rounded-xl shadow-pop overflow-hidden animate-slide-up w-[30rem] max-w-[calc(100vw-2rem)]">
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

            <p className="text-2xs text-text-muted/70 select-none">
              {disabled
                ? 'Agent is working — press ■ to stop'
                : 'Enter ↵  ·  Shift+Enter for newline  ·  / for skills'}
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-end mt-2 px-0.5">
            <p className="text-2xs text-text-muted/70 select-none">
              {disabled
                ? 'Agent is working — press ■ to stop'
                : 'Enter ↵  ·  Shift+Enter for newline  ·  / for skills'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
