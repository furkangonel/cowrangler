import React, { useRef, useState, useCallback, useEffect } from 'react'
import { ArrowUp, Square, Paperclip, BookOpen, CornerDownLeft, X, Plus, Box, Plug, ChevronRight } from 'lucide-react'
import { ipc, SkillDef } from '../../lib/ipc'

interface Props {
  onSend: (message: string) => void
  onInterrupt: () => void
  disabled: boolean
  projectId: string
}

export function InputArea({ onSend, onInterrupt, disabled, projectId }: Props) {
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
  const [mcpServers, setMcpServers] = useState<any[]>([])
  const plusMenuRef = useRef<HTMLDivElement>(null)

  // Clicking outside to close plus menu
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setPlusMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    ipc.skills.list().then(s => setSkills(Array.isArray(s) ? s : [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (plusMenuOpen) {
      ipc.mcp.list().then(s => setMcpServers(Array.isArray(s) ? s : [])).catch(() => {})
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

  const hasContent = value.trim().length > 0 || confirmedSkills.length > 0 || confirmedConnectors.length > 0 || confirmedPlugins.length > 0

  const handleSend = useCallback(() => {
    if (!hasContent || disabled) return
    // Skill'leri mesajın başına ekle
    const skillPart = confirmedSkills.map(s => `/${s.id}`).join(' ')
    const connPart = confirmedConnectors.map(c => `/${c.name}`).join(' ')
    const plugPart = confirmedPlugins.map(p => `/${p.id}`).join(' ')
    const parts = [skillPart, connPart, plugPart].filter(Boolean).join(' ')
    const textPart = value.trim()
    const msg = [parts, textPart].filter(Boolean).join(parts && textPart ? '\n\n' : '')
    onSend(msg)
    setValue('')
    setConfirmedSkills([])
    setConfirmedConnectors([])
    setConfirmedPlugins([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [value, confirmedSkills, confirmedConnectors, confirmedPlugins, disabled, onSend, hasContent])

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
        {/* Slash skill menüsü */}
        {slashOpen && filtered.length > 0 && (
          <div className="absolute bottom-full mb-2 left-0 right-0 bg-bg-secondary border border-border rounded-xl shadow-pop overflow-hidden animate-slide-up z-30">
            <div className="px-3 py-2 border-b border-border-subtle flex items-center gap-1.5">
              <BookOpen size={11} className="text-accent" />
              <span className="text-2xs text-text-muted font-medium uppercase tracking-wider">Invoke skill</span>
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {filtered.map((s, i) => (
                <button
                  key={s.id}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => pickSkill(s)}
                  className={`w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors ${
                    i === activeIdx ? 'bg-bg-hover' : ''
                  }`}
                >
                  <BookOpen size={13} className={`mt-0.5 flex-shrink-0 ${i === activeIdx ? 'text-accent' : 'text-text-muted'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-text-primary truncate">/{s.id}</p>
                    <p className="text-2xs text-text-muted truncate">{s.description}</p>
                  </div>
                  {i === activeIdx && <CornerDownLeft size={11} className="text-text-muted mt-1 flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Plus Menu */}
        {plusMenuOpen && (
          <div 
            ref={plusMenuRef}
            className="absolute bottom-full mb-3 left-4 w-64 bg-bg-secondary border border-border rounded-xl shadow-pop overflow-hidden animate-slide-up z-30"
          >
            <div className="py-1">
              <button
                className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-bg-hover transition-colors"
                onClick={async () => { await ipc.fs.pickFile(); setPlusMenuOpen(false); }}
              >
                <div className="flex items-center gap-2.5">
                  <Paperclip size={14} className="text-text-muted" />
                  <span className="text-sm text-text-primary">Upload Project Files</span>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Composer */}
        <div className="flex flex-col bg-bg-secondary border border-border rounded-2xl shadow-card focus-within:border-accent/50 transition-colors">
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
              className={`p-2 rounded-lg transition-colors flex-shrink-0 ${plusMenuOpen ? 'bg-bg-hover text-text-primary' : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover'}`}
              title="Add Context"
              onClick={() => setPlusMenuOpen(!plusMenuOpen)}
            >
              <Plus size={16} />
            </button>

            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              placeholder={disabled ? 'Agent is working…' : 'Type a task…  ( call a skill with / )'}
              rows={1}
              className="flex-1 bg-transparent text-md text-text-primary placeholder-text-muted resize-none outline-none max-h-[220px] overflow-y-auto selectable py-1.5 disabled:opacity-60"
              style={{ minHeight: '28px' }}
            />

            {disabled ? (
              <button
                onClick={onInterrupt}
                className="flex items-center justify-center w-9 h-9 rounded-xl bg-error/15 text-error hover:bg-error/25 transition-colors flex-shrink-0"
                title="Durdur (Esc)"
              >
                <Square size={15} className="fill-current" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!hasContent}
                className="flex items-center justify-center w-9 h-9 rounded-xl bg-accent text-accent-fg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-accent-hover transition-colors flex-shrink-0"
                title="Send (Enter)"
              >
                <ArrowUp size={17} />
              </button>
            )}
          </div>
        </div>

        <p className="text-2xs text-text-muted text-center mt-2">
          {disabled
            ? 'Agent is working — press ■ to stop'
            : 'Enter to send · Shift+Enter new line · / for skills'}
        </p>
      </div>
    </div>
  )
}
