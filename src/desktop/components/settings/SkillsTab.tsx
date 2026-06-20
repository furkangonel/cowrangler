import React, { useEffect, useRef, useState } from 'react'
import { Search, BookOpen, FolderOpen, Plus, Trash2, X, PenLine, Upload } from 'lucide-react'
import { ipc, SkillDef } from '../../lib/ipc'

const SOURCE_LABEL: Record<string, string> = {
  bundled: 'Built-in',
  global: 'Global  (~/.cowrangler/skills)',
  local: 'Project  (.cowrangler/skills)',
}

export function SkillsTab() {
  const [skills, setSkills] = useState<SkillDef[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<SkillDef | null>(null)
  const [content, setContent] = useState('')
  const [active, setActive] = useState<Record<string, boolean>>({})
  const [creating, setCreating] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  function load() {
    setLoading(true)
    ipc.skills.list()
      .then(s => {
        const list = Array.isArray(s) ? s : []
        setSkills(list)
        const map: Record<string, boolean> = {}
        list.forEach(sk => { map[sk.id] = sk.active !== false })
        setActive(map)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }
  useEffect(load, [])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function selectSkill(skill: SkillDef) {
    setSelected(skill)
    setCreating(false)
    const c = await ipc.skills.getContent(skill.id)
    setContent(c ?? skill.content ?? '')
  }

  async function toggle(skill: SkillDef, e: React.MouseEvent) {
    e.stopPropagation()
    const next = !active[skill.id]
    setActive(a => ({ ...a, [skill.id]: next }))
    try { await ipc.skills.toggle(skill.id, next) } catch { setActive(a => ({ ...a, [skill.id]: !next })) }
  }

  async function removeSkill(skill: SkillDef, e: React.MouseEvent) {
    e.stopPropagation()
    if (skill.source === 'bundled') return
    const res = await ipc.skills.remove(skill.id)
    if (res.ok) {
      if (selected?.id === skill.id) setSelected(null)
      load()
    }
  }

  async function uploadSkill() {
    setMenuOpen(false)
    setUploadError('')
    const res = await ipc.skills.upload()
    if (res.ok) { load() }
    else if (res.error && res.error !== 'canceled') setUploadError(res.error)
  }

  const filtered = skills.filter(s =>
    search === '' || s.id.toLowerCase().includes(search.toLowerCase()) || s.description.toLowerCase().includes(search.toLowerCase())
  )
  const grouped: Record<string, SkillDef[]> = {}
  filtered.forEach(s => { (grouped[s.source] ??= []).push(s) })
  const activeCount = Object.values(active).filter(Boolean).length

  return (
    <div className="flex h-full">
      {/* List */}
      <div className="w-60 flex-shrink-0 border-r border-border-subtle flex flex-col">
        <div className="p-3 border-b border-border-subtle space-y-2">
          <div className="flex gap-1.5">
            <div className="relative flex-1" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(o => !o)}
                className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-accent text-accent-fg text-2xs rounded-lg hover:bg-accent-hover transition-colors font-medium"
              >
                <Plus size={12} /> New skill
              </button>
              {menuOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-bg-secondary border border-border rounded-lg shadow-pop overflow-hidden animate-slide-up">
                  <button
                    onClick={() => { setMenuOpen(false); setCreating(true); setSelected(null) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-2xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
                  >
                    <PenLine size={12} /> Write instructions
                  </button>
                  <button
                    onClick={uploadSkill}
                    className="w-full flex items-center gap-2 px-3 py-2 text-2xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors border-t border-border-subtle"
                  >
                    <Upload size={12} /> Upload a skill
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => ipc.skills.openFolder()}
              className="flex items-center justify-center gap-1 px-2.5 py-1.5 border border-border text-text-secondary text-2xs rounded-lg hover:text-text-primary hover:border-accent/40 transition-colors"
              title="Open skills folder"
            >
              <FolderOpen size={12} />
            </button>
          </div>
          {uploadError && <p className="text-2xs text-error px-0.5">{uploadError}</p>}
          <div className="flex items-center gap-2 px-2.5 py-1.5 bg-bg-tertiary rounded-lg border border-border-subtle focus-within:border-accent/40 transition-colors">
            <Search size={12} className="text-text-muted" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search skills"
              className="flex-1 bg-transparent text-xs text-text-primary placeholder-text-muted outline-none"
            />
          </div>
          <p className="text-2xs text-text-muted px-0.5">{activeCount} active · {skills.length} skills</p>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="space-y-1.5 p-1">{[0,1,2,3].map(i => <div key={i} className="h-8 rounded-lg shimmer" />)}</div>
          ) : (
            Object.entries(grouped).map(([source, items]) => (
              <div key={source} className="mb-3">
                <p className="text-2xs text-text-muted uppercase tracking-wider px-2 mb-1 font-semibold">{SOURCE_LABEL[source] ?? source}</p>
                {items.map(skill => {
                  const on = active[skill.id]
                  return (
                    <div
                      key={skill.id}
                      onClick={() => selectSkill(skill)}
                      className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors mb-0.5 ${
                        selected?.id === skill.id ? 'bg-accent-subtle' : 'hover:bg-bg-hover'
                      }`}
                    >
                      <BookOpen size={12} className={`flex-shrink-0 ${selected?.id === skill.id ? 'text-accent' : 'text-text-muted'}`} />
                      <span className={`truncate text-xs flex-1 ${on ? 'text-text-primary' : 'text-text-muted'}`}>{skill.id}</span>
                      {skill.source !== 'bundled' && (
                        <button onClick={(e) => removeSkill(skill, e)} className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-error transition-all" title="Delete">
                          <Trash2 size={11} />
                        </button>
                      )}
                      <Toggle on={!!on} onClick={(e) => toggle(skill, e)} />
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Detail / Create */}
      <div className="flex-1 p-5 overflow-y-auto">
        {creating ? (
          <CreateSkill onCancel={() => setCreating(false)} onCreated={() => { setCreating(false); load() }} />
        ) : selected ? (
          <div>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h4 className="text-sm font-semibold text-text-primary">{selected.id}</h4>
                <p className="text-xs text-text-secondary mt-1 leading-relaxed">{selected.description}</p>
                <div className="flex items-center gap-2 mt-2.5">
                  <span className="text-2xs px-2 py-0.5 rounded-full bg-bg-tertiary border border-border text-text-muted">{SOURCE_LABEL[selected.source] ?? selected.source}</span>
                  <span className={`text-2xs px-2 py-0.5 rounded-full ${active[selected.id] ? 'bg-success/15 text-success' : 'bg-bg-tertiary text-text-muted'}`}>
                    {active[selected.id] ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
              <Toggle on={!!active[selected.id]} onClick={(e) => toggle(selected, e)} large />
            </div>
            <div className="bg-bg-tertiary border border-border rounded-xl p-4">
              <pre className="text-2xs text-text-secondary font-mono whitespace-pre-wrap leading-relaxed selectable">{content}</pre>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <BookOpen size={34} className="text-text-muted opacity-50" />
            <p className="text-xs text-text-muted max-w-xs leading-relaxed">
              Select a skill to view it, toggle it on/off, or use <span className="text-accent">New skill</span> to write or upload your own.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function CreateSkill({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function create() {
    if (!name.trim()) { setError('Name required'); return }
    setBusy(true); setError('')
    const res = await ipc.skills.create({ name: name.trim(), description: description.trim(), content: content.trim() || undefined })
    setBusy(false)
    if (res.ok && res.id) onCreated(res.id)
    else setError(res.error || 'Could not create')
  }

  return (
    <div className="max-w-lg">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-text-primary">New skill</h4>
        <button onClick={onCancel} className="p-1 text-text-muted hover:text-text-primary rounded-lg hover:bg-bg-hover"><X size={15} /></button>
      </div>
      <div className="space-y-3.5">
        <div>
          <label className="text-xs text-text-secondary font-medium block mb-1.5">Name <span className="text-accent">*</span></label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. github-pr-workflow"
            className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded-lg text-sm text-text-primary placeholder-text-muted focus:border-accent transition-colors" />
          <p className="text-2xs text-text-muted mt-1">The folder name is derived automatically (kebab-case).</p>
        </div>
        <div>
          <label className="text-xs text-text-secondary font-medium block mb-1.5">Description</label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="One-sentence summary"
            className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded-lg text-sm text-text-primary placeholder-text-muted focus:border-accent transition-colors" />
        </div>
        <div>
          <label className="text-xs text-text-secondary font-medium block mb-1.5">Content (SKILL.md body)</label>
          <textarea value={content} onChange={e => setContent(e.target.value)} rows={9} placeholder={'# Skill\n\n## When to Use\n...\n\n## How to Run\n...'}
            className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded-lg text-xs text-text-primary placeholder-text-muted focus:border-accent transition-colors font-mono resize-none" />
          <p className="text-2xs text-text-muted mt-1">Leave empty to generate a starter template.</p>
        </div>
        {error && <p className="text-xs text-error">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-hover transition-colors">Cancel</button>
          <button onClick={create} disabled={!name.trim() || busy}
            className="px-4 py-2 text-sm font-medium bg-accent text-accent-fg rounded-lg disabled:opacity-40 hover:bg-accent-hover transition-colors">
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Toggle({ on, onClick, large }: { on: boolean; onClick: (e: React.MouseEvent) => void; large?: boolean }) {
  const w = large ? 'w-9 h-5' : 'w-7 h-4'
  const knob = large ? 'w-4 h-4' : 'w-3 h-3'
  const move = large ? 'translate-x-4' : 'translate-x-3'
  return (
    <button
      onClick={onClick}
      className={`relative ${w} rounded-full transition-colors flex-shrink-0 ${on ? 'bg-accent' : 'bg-bg-hover border border-border'}`}
    >
      <span className={`absolute top-0.5 left-0.5 ${knob} rounded-full bg-white shadow-sm transition-transform ${on ? move : ''}`} />
    </button>
  )
}
