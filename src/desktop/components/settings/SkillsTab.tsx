import React, { useEffect, useState } from 'react'
import { Search, ChevronRight, BookOpen } from 'lucide-react'
import { ipc, SkillDef } from '../../lib/ipc'

export function SkillsTab() {
  const [skills, setSkills] = useState<SkillDef[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<SkillDef | null>(null)
  const [content, setContent] = useState('')

  useEffect(() => {
    setLoading(true)
    ipc.skills.list()
      .then(s => { setSkills(Array.isArray(s) ? s : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function selectSkill(skill: SkillDef) {
    setSelected(skill)
    const c = await ipc.skills.getContent(skill.id)
    setContent(c ?? '')
  }

  const filtered = skills.filter(s =>
    search === '' ||
    s.id.toLowerCase().includes(search.toLowerCase()) ||
    s.description.toLowerCase().includes(search.toLowerCase())
  )

  const grouped: Record<string, SkillDef[]> = {}
  filtered.forEach(s => {
    const g = s.source
    if (!grouped[g]) grouped[g] = []
    grouped[g].push(s)
  })

  const sourceLabel: Record<string, string> = {
    bundled: 'Yerleşik',
    global: `Global (~/.cowrangler/skills)`,
    local: 'Proje (.cowrangler/skills)',
  }

  return (
    <div className="flex h-full">
      {/* Skill list */}
      <div className="w-52 flex-shrink-0 border-r border-border flex flex-col">
        <div className="p-3 border-b border-border">
          <div className="flex items-center gap-2 px-2 py-1.5 bg-bg-tertiary rounded border border-border-subtle">
            <Search size={11} className="text-text-muted" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Skill ara..."
              className="flex-1 bg-transparent text-xs text-text-primary placeholder-text-muted outline-none"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <p className="text-xs text-text-muted text-center py-4">Yükleniyor...</p>
          ) : (
            Object.entries(grouped).map(([source, items]) => (
              <div key={source} className="mb-3">
                <p className="text-2xs text-text-muted uppercase tracking-wide px-2 mb-1 font-medium">
                  {sourceLabel[source] ?? source}
                </p>
                {items.map(skill => (
                  <button
                    key={skill.id}
                    onClick={() => selectSkill(skill)}
                    className={`w-full flex items-center gap-2 px-2 py-2 rounded text-left text-xs transition-colors mb-0.5 ${
                      selected?.id === skill.id
                        ? 'bg-accent/15 text-accent'
                        : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                    }`}
                  >
                    <BookOpen size={11} className="flex-shrink-0" />
                    <span className="truncate">{skill.id}</span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Skill detail */}
      <div className="flex-1 p-4 overflow-y-auto">
        {selected ? (
          <div>
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-text-primary">{selected.id}</h4>
              <p className="text-xs text-text-muted mt-0.5">{selected.description}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-2xs px-2 py-0.5 rounded-full bg-bg-tertiary border border-border text-text-muted">
                  {sourceLabel[selected.source] ?? selected.source}
                </span>
              </div>
            </div>
            <div className="bg-bg-tertiary border border-border rounded-lg p-3">
              <pre className="text-2xs text-text-secondary font-mono whitespace-pre-wrap leading-relaxed selectable">
                {content}
              </pre>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center opacity-60">
            <BookOpen size={32} className="text-text-muted" />
            <p className="text-xs text-text-muted">Detayı görmek için bir skill seçin.</p>
          </div>
        )}
      </div>
    </div>
  )
}
