import React, { useState, useEffect, useRef } from 'react'
import { Search, Plus, Settings, Upload, X, Box, Plug, BookOpen, ChevronRight, ChevronLeft, ChevronDown, Eye, Code, Copy, FolderOpen, FileText, FileCode, FileJson, FolderIcon, FolderOpenIcon, Github, ExternalLink } from 'lucide-react'
import { ipc, ConnectorCatalogInfo, SkillDef } from '../../lib/ipc'
import { useUIStore } from '../../stores/ui.store'
import { MarkdownRenderer } from '../shared/MarkdownRenderer'

// ── Plugin catalog (bundled) ─────────────────────────────────────────────────
interface BundledPlugin {
  id: string
  name: string
  description: string
  author: 'cowrangler'
  signed: true
  category: 'dev' | 'writing' | 'data' | 'productivity' | 'ops'
  skills: string[]
  connectors: string[]
  enabledByDefault: boolean
}

const BUNDLED_PLUGINS: BundledPlugin[] = [
  {
    id: 'dev-toolkit', name: 'Developer Toolkit',
    description: 'Kod yazma, inceleme, hata ayıklama ve git akışı için skill + connector paketi.',
    author: 'cowrangler', signed: true, category: 'dev',
    skills: ['software-development','code-review','github-pr-workflow','github-code-review','git-workflow','debugging','refactoring','qa-testing','testing'],
    connectors: ['github','git','filesystem'], enabledByDefault: true,
  },
  {
    id: 'writing-suite', name: 'Writing Suite',
    description: 'Profesyonel iletişim, kopya düzenleme ve dokümantasyon için yazım paketi.',
    author: 'cowrangler', signed: true, category: 'writing',
    skills: ['professional-communicator','copy-editor','documentation','executive-summarizer','simplify','email'],
    connectors: ['fetch'], enabledByDefault: true,
  },
  {
    id: 'data-pack', name: 'Data Pack',
    description: 'Veri bilimi ve MLOps iş akışları + veritabanı bağlantısı.',
    author: 'cowrangler', signed: true, category: 'data',
    skills: ['data-science','mlops'], connectors: ['postgres','filesystem'], enabledByDefault: false,
  },
  {
    id: 'devops-pack', name: 'DevOps Pack',
    description: 'Dağıtım, altyapı ve operasyon skill\'leri.',
    author: 'cowrangler', signed: true, category: 'ops',
    skills: ['devops','api-design'], connectors: ['github','git'], enabledByDefault: false,
  },
  {
    id: 'productivity-pack', name: 'Productivity Pack',
    description: 'Not alma, üretkenlik ve görev yönetimi skill\'leri.',
    author: 'cowrangler', signed: true, category: 'productivity',
    skills: ['note-taking','productivity'], connectors: ['notion','linear'], enabledByDefault: false,
  },
]

const PLUGIN_CATEGORY_LABELS: Record<string, string> = {
  dev: 'Development', writing: 'Writing', data: 'Data', productivity: 'Productivity', ops: 'DevOps',
}

// ── Category definitions ─────────────────────────────────────────────────────
const SKILL_CATEGORIES = ['all', 'bundled', 'global', 'local'] as const
type SkillCategory = typeof SKILL_CATEGORIES[number]
const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  all: 'All', bundled: 'Bundled', global: 'Global', local: 'Local',
}

const CONNECTOR_CATEGORIES = ['all', 'dev', 'web', 'data', 'ai', 'files', 'productivity', 'communication', 'design', 'business'] as const
type ConnectorCategory = typeof CONNECTOR_CATEGORIES[number]
const CONNECTOR_CATEGORY_LABELS: Record<string, string> = {
  all: 'All', dev: 'Dev', web: 'Web', data: 'Data', ai: 'AI', files: 'Files',
  productivity: 'Productivity', communication: 'Communication', design: 'Design', business: 'Business',
}

type Tab = 'skills' | 'connectors' | 'plugins'

export function DirectoryPage() {
  const { customizeOpen, closeCustomize } = useUIStore()
  const [tab, setTab] = useState<Tab>('skills')
  const [query, setQuery] = useState('')
  const [connectors, setConnectors] = useState<ConnectorCatalogInfo[]>([])
  const [skills, setSkills] = useState<SkillDef[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSkill, setSelectedSkill] = useState<SkillDef | null>(null)
  const [selectedConnector, setSelectedConnector] = useState<ConnectorCatalogInfo | null>(null)
  const [showAddCustomMcpModal, setShowAddCustomMcpModal] = useState(false)
  const [enabledPlugins, setEnabledPlugins] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {}
    BUNDLED_PLUGINS.forEach(p => { map[p.id] = p.enabledByDefault })
    return map
  })
  const [skillCategory, setSkillCategory] = useState<SkillCategory>('all')
  const [connectorCategory, setConnectorCategory] = useState<ConnectorCategory>('all')

  // Upload / import state
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showGithubModal, setShowGithubModal] = useState(false)
  const [githubUrl, setGithubUrl] = useState('')
  const [githubBusy, setGithubBusy] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const addMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!customizeOpen) return
    setLoading(true)
    Promise.all([
      ipc.connectors.catalog(),
      ipc.skills.list()
    ])
    .then(([cat, slist]) => {
      setConnectors(Array.isArray(cat) ? cat : [])
      setSkills(Array.isArray(slist) ? slist : [])
    })
    .catch(console.error)
    .finally(() => setLoading(false))
  }, [customizeOpen])

  // Close add menu on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) setShowAddMenu(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function reloadSkills() {
    ipc.skills.list().then(slist => {
      setSkills(Array.isArray(slist) ? slist : [])
    }).catch(console.error)
  }

  async function uploadSkill() {
    setUploadError('')
    const res = await ipc.skills.upload()
    if (res.ok) { setShowUploadModal(false); reloadSkills() }
    else if (res.error && res.error !== 'canceled') setUploadError(res.error)
  }

  async function submitGithub() {
    if (!githubUrl.trim()) return
    setGithubBusy(true); setUploadError('')
    const res = await ipc.skills.downloadGithub(githubUrl.trim())
    setGithubBusy(false)
    if (res.ok) { setShowGithubModal(false); setGithubUrl(''); reloadSkills() }
    else setUploadError(res.error || 'Failed to download GitHub repository')
  }

  function handleDragOver(e: React.DragEvent) { e.preventDefault(); setIsDragging(true) }
  function handleDragLeave(e: React.DragEvent) { e.preventDefault(); setIsDragging(false) }
  async function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    setUploadError('')
    const res = await ipc.skills.importFile((file as any).path)
    if (res.ok) { setShowUploadModal(false); reloadSkills() }
    else setUploadError(res.error || 'Failed to import dropped file')
  }

  if (!customizeOpen) return null

  // Filter skills by category and search
  const filteredSkills = skills.filter(s => {
    if (skillCategory !== 'all' && s.source !== skillCategory) return false
    if (query && !s.name.toLowerCase().includes(query.toLowerCase()) && !s.description?.toLowerCase().includes(query.toLowerCase())) return false
    return true
  })

  // Filter connectors by category and search
  const filteredConnectors = connectors.filter(c => {
    if (connectorCategory !== 'all' && c.category !== connectorCategory) return false
    if (query && !c.name.toLowerCase().includes(query.toLowerCase()) && !c.description?.toLowerCase().includes(query.toLowerCase())) return false
    return true
  })

  // Unique connector categories from data
  const availableConnCategories = ['all', ...Array.from(new Set(connectors.map(c => c.category))).sort()] as ConnectorCategory[]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
      onMouseDown={closeCustomize}
    >
      <div
        className="bg-bg-primary border border-border rounded-2xl shadow-panel flex overflow-hidden animate-slide-up relative"
        style={{ width: '1000px', height: '680px', maxWidth: '94vw', maxHeight: '90vh' }}
        onMouseDown={e => e.stopPropagation()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <button
          onClick={closeCustomize}
          className="absolute top-4 right-4 p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors rounded-lg z-10"
        >
          <X size={16} />
        </button>

        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-bg-primary/80 backdrop-blur-sm border-2 border-dashed border-accent rounded-2xl m-2 pointer-events-none">
            <div className="flex flex-col items-center text-accent">
              <Upload size={40} className="mb-3 animate-bounce" />
              <h3 className="text-lg font-bold">Drop skill to install</h3>
              <p className="text-sm mt-1 opacity-80">Folders, .md, .zip, .skill</p>
            </div>
          </div>
        )}

        {/* Sidebar */}
        <div className="w-56 flex-shrink-0 border-r border-border-subtle p-4 flex flex-col gap-1 bg-bg-secondary">
          <h2 className="text-xl font-semibold mb-6 px-2 brand-serif">Customize</h2>
          <SidebarItem active={tab === 'skills' && !selectedSkill && !selectedConnector} icon={<BookOpen size={16} />} label="Skills" onClick={() => { setTab('skills'); setSelectedSkill(null); setSelectedConnector(null); setQuery('') }} />
          <SidebarItem active={tab === 'connectors' && !selectedSkill && !selectedConnector} icon={<Box size={16} />} label="Connectors" onClick={() => { setTab('connectors'); setSelectedSkill(null); setSelectedConnector(null); setQuery('') }} />
          <SidebarItem active={tab === 'plugins' && !selectedSkill && !selectedConnector} icon={<Plug size={16} />} label="Plugins" onClick={() => { setTab('plugins'); setSelectedSkill(null); setSelectedConnector(null); setQuery('') }} />
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 bg-bg-primary overflow-hidden">
          {selectedSkill ? (
            <SkillDetailView 
              skill={selectedSkill} 
              onBack={() => setSelectedSkill(null)} 
              onToggle={async (active) => {
                await ipc.skills.toggle(selectedSkill.id, active)
                setSelectedSkill({ ...selectedSkill, active })
                setSkills(s => s.map(x => x.id === selectedSkill.id ? { ...x, active } : x))
              }} 
            />
          ) : selectedConnector ? (
            <ConnectorDetailView 
              connector={selectedConnector} 
              onBack={() => setSelectedConnector(null)} 
              onUpdate={(updated) => {
                setSelectedConnector(updated)
                setConnectors(c => c.map(x => x.id === updated.id ? updated : x))
              }}
            />
          ) : (
            <div className="flex-1 flex flex-col p-8 overflow-y-auto">
              <div className="max-w-4xl w-full mx-auto space-y-5">
                {/* Search + Add button */}
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
                    <input 
                      type="text" 
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={`Search ${tab}...`}
                      className="w-full bg-bg-secondary text-text-primary rounded-lg pl-9 pr-4 py-2 text-sm border border-transparent focus:border-border-subtle focus:outline-none transition-colors"
                    />
                  </div>
                  {tab === 'skills' && (
                    <div className="relative" ref={addMenuRef}>
                      <button
                        onClick={() => setShowAddMenu(o => !o)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-accent text-accent-fg text-sm rounded-lg hover:bg-accent-hover transition-colors font-medium"
                      >
                        <Plus size={14} /> Add
                      </button>
                      {showAddMenu && (
                        <div className="absolute top-full right-0 mt-1 z-20 bg-bg-secondary border border-border rounded-lg shadow-pop overflow-hidden animate-slide-up w-52">
                          <button
                            onClick={() => { setShowAddMenu(false); setShowUploadModal(true); setUploadError('') }}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
                          >
                            <Upload size={14} /> Upload skill
                          </button>
                          <button
                            onClick={() => { setShowAddMenu(false); setShowGithubModal(true); setUploadError('') }}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors border-t border-border-subtle"
                          >
                            <Github size={14} /> Import from GitHub
                          </button>
                          <button
                            onClick={() => { setShowAddMenu(false); ipc.skills.openFolder() }}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors border-t border-border-subtle"
                          >
                            <FolderOpen size={14} /> Open skills folder
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {tab === 'connectors' && (
                    <div className="relative" ref={addMenuRef}>
                      <button
                        onClick={() => setShowAddMenu(o => !o)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-accent text-accent-fg text-sm rounded-lg hover:bg-accent-hover transition-colors font-medium"
                      >
                        <Plus size={14} /> Add
                      </button>
                      {showAddMenu && (
                        <div className="absolute top-full right-0 mt-1 z-20 bg-bg-secondary border border-border rounded-lg shadow-pop overflow-hidden animate-slide-up w-52">
                          <button
                            onClick={() => { setShowAddMenu(false); setShowAddCustomMcpModal(true) }}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
                          >
                            <Plus size={14} /> Add custom connector
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Category chips */}
                {tab === 'skills' && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {SKILL_CATEGORIES.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setSkillCategory(cat)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          skillCategory === cat
                            ? 'bg-accent text-accent-fg'
                            : 'bg-bg-secondary text-text-secondary hover:text-text-primary hover:bg-bg-hover border border-border-subtle'
                        }`}
                      >
                        {SKILL_CATEGORY_LABELS[cat]}
                      </button>
                    ))}
                  </div>
                )}

                {tab === 'connectors' && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {availableConnCategories.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setConnectorCategory(cat)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors capitalize ${
                          connectorCategory === cat
                            ? 'bg-accent text-accent-fg'
                            : 'bg-bg-secondary text-text-secondary hover:text-text-primary hover:bg-bg-hover border border-border-subtle'
                        }`}
                      >
                        {CONNECTOR_CATEGORY_LABELS[cat] || cat}
                      </button>
                    ))}
                  </div>
                )}

                {/* Grid */}
                {tab === 'connectors' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredConnectors.map(c => <ConnectorCard key={c.id} c={c} onClick={() => setSelectedConnector(c)} />)}
                    {filteredConnectors.length === 0 && (
                      <div className="col-span-2 py-8 text-center text-text-muted text-sm">No connectors found.</div>
                    )}
                  </div>
                )}
                
                {tab === 'skills' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredSkills.map(s => <SkillCard key={s.id} s={s} onClick={() => setSelectedSkill(s)} />)}
                    {filteredSkills.length === 0 && (
                      <div className="col-span-2 py-8 text-center text-text-muted text-sm">No skills found.</div>
                    )}
                  </div>
                )}

                {tab === 'plugins' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {BUNDLED_PLUGINS.map(p => (
                      <PluginCard
                        key={p.id}
                        plugin={p}
                        enabled={!!enabledPlugins[p.id]}
                        onToggle={() => setEnabledPlugins(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Upload Modal */}
        {showUploadModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowUploadModal(false)}>
            <div className="bg-bg-secondary border border-border rounded-xl p-6 shadow-2xl w-[440px] max-w-full relative" onClick={e => e.stopPropagation()}>
              <button onClick={() => setShowUploadModal(false)} className="absolute top-4 right-4 text-text-muted hover:text-text-primary transition-colors"><X size={16} /></button>
              <h3 className="text-base font-semibold mb-6">Upload skill</h3>
              <div 
                className={`border border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-colors mb-6
                  ${isDragging ? 'border-accent bg-accent/5' : 'border-border-subtle hover:border-accent/50 hover:bg-bg-tertiary'}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={uploadSkill}
              >
                <div className="w-10 h-10 rounded-lg bg-bg-tertiary flex items-center justify-center mb-4 border border-border-subtle">
                  <Plus size={20} className="text-text-secondary" />
                </div>
                <p className="text-sm text-text-secondary">Drag and drop or click to upload</p>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-text-muted font-medium">File requirements</p>
                <ul className="text-xs text-text-muted list-disc list-inside space-y-1">
                  <li>.md file must contain skill name and description formatted in YAML</li>
                  <li>.zip or .skill file must include a SKILL.md file</li>
                </ul>
              </div>
              {uploadError && <p className="text-xs text-warning mt-4">{uploadError}</p>}
            </div>
          </div>
        )}

        {/* GitHub Modal */}
        {showGithubModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setShowGithubModal(false); setGithubUrl('') }}>
            <div className="bg-bg-secondary border border-border rounded-xl p-5 shadow-2xl w-96 max-w-full" onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-semibold mb-2">Import from GitHub</h3>
              <p className="text-xs text-text-muted mb-4">Enter the URL of a GitHub repository containing a SKILL.md.</p>
              <input 
                autoFocus
                value={githubUrl}
                onChange={e => setGithubUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submitGithub()}
                placeholder="https://github.com/user/repo"
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded-lg text-sm text-text-primary placeholder-text-muted focus:border-accent transition-colors mb-4"
              />
              {uploadError && <p className="text-xs text-warning mb-4">{uploadError}</p>}
              <div className="flex justify-end gap-2">
                <button onClick={() => { setShowGithubModal(false); setGithubUrl('') }} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-hover transition-colors">Cancel</button>
                <button onClick={submitGithub} disabled={!githubUrl.trim() || githubBusy} className="px-4 py-2 text-sm font-medium bg-accent text-accent-fg rounded-lg disabled:opacity-40 hover:bg-accent-hover transition-colors">
                  {githubBusy ? 'Importing…' : 'Import'}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Add Custom Connector Modal */}
        {showAddCustomMcpModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowAddCustomMcpModal(false)}>
            <AddCustomMcpModal 
              onClose={() => setShowAddCustomMcpModal(false)}
              onSuccess={async () => {
                setShowAddCustomMcpModal(false)
                await loadData()
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function AddCustomMcpModal({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'stdio' | 'http' | 'sse'>('stdio')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) return setError('Name is required.')
    
    setBusy(true)
    setError('')
    try {
      const config: any = { name: name.trim(), type }
      if (type === 'stdio') {
        if (!command.trim()) throw new Error('Command is required for stdio.')
        config.command = command.trim()
        config.args = args.trim().split(' ').filter(a => a)
      } else {
        if (!url.trim()) throw new Error('URL is required for http/sse.')
        config.url = url.trim()
      }
      
      const res = await ipc.mcp.add(config)
      if (res.ok) {
        onSuccess()
      } else {
        setError('Failed to add custom connector. Check your config.')
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-bg-secondary border border-border rounded-xl p-6 shadow-2xl w-[440px] max-w-full relative" onClick={e => e.stopPropagation()}>
      <button onClick={onClose} className="absolute top-4 right-4 text-text-muted hover:text-text-primary transition-colors"><X size={16} /></button>
      <h3 className="text-base font-semibold mb-6">Add custom connector</h3>
      
      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Name (ID)</label>
          <input 
            value={name} onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded-lg text-sm text-text-primary focus:border-accent transition-colors"
            placeholder="my-connector"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Type</label>
          <select 
            value={type} onChange={e => setType(e.target.value as any)}
            className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded-lg text-sm text-text-primary focus:border-accent transition-colors"
          >
            <option value="stdio">stdio</option>
            <option value="sse">sse</option>
            <option value="http">http</option>
          </select>
        </div>

        {type === 'stdio' ? (
          <>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Command</label>
              <input 
                value={command} onChange={e => setCommand(e.target.value)}
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded-lg text-sm text-text-primary focus:border-accent transition-colors"
                placeholder="npx"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Args (space separated)</label>
              <input 
                value={args} onChange={e => setArgs(e.target.value)}
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded-lg text-sm text-text-primary focus:border-accent transition-colors"
                placeholder="-y @modelcontextprotocol/server-postgres"
              />
            </div>
          </>
        ) : (
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">URL</label>
            <input 
              value={url} onChange={e => setUrl(e.target.value)}
              className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded-lg text-sm text-text-primary focus:border-accent transition-colors"
              placeholder="http://localhost:3000/sse"
            />
          </div>
        )}

        {error && <p className="text-xs text-warning mt-2">{error}</p>}
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-hover transition-colors">Cancel</button>
        <button onClick={handleSave} disabled={busy || !name.trim()} className="px-4 py-2 text-sm font-medium bg-accent text-accent-fg rounded-lg disabled:opacity-40 hover:bg-accent-hover transition-colors">
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SidebarItem({ active, icon, label, onClick }: { active: boolean, icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        active ? 'bg-bg-hover text-text-primary' : 'text-text-secondary hover:bg-bg-subtle hover:text-text-primary'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function ConnectorCard({ c, onClick }: { c: ConnectorCatalogInfo, onClick: () => void }) {
  const [imgError, setImgError] = useState(false)

  return (
    <div 
      onClick={onClick}
      className="bg-bg-secondary rounded-xl p-4 flex flex-col justify-between border border-transparent hover:border-border-subtle transition-colors cursor-pointer group"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-white flex items-center justify-center overflow-hidden shadow-sm border border-neutral-200 dark:border-white/10">
            {c.logo && !imgError ? (
              <img src={c.logo} alt="" className="w-full h-full object-cover" onError={() => setImgError(true)} />
            ) : (
              <Box size={16} className="text-neutral-400" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-text-primary text-sm">{c.name}</h3>
            <span className="text-xs text-text-muted capitalize">{c.category}</span>
          </div>
        </div>
        <button className="text-text-muted hover:text-text-primary opacity-0 group-hover:opacity-100 transition-opacity">
          {c.connected ? <Settings size={14} /> : <Plus size={14} />}
        </button>
      </div>
      <p className="text-text-secondary text-xs line-clamp-2 mt-2 leading-relaxed">
        {c.description}
      </p>
    </div>
  )
}

function SkillCard({ s, onClick }: { s: SkillDef, onClick: () => void }) {
  const isActive = s.active !== false
  return (
    <div 
      onClick={onClick}
      className="bg-bg-secondary rounded-xl p-4 border border-transparent hover:border-border-subtle transition-colors cursor-pointer group"
    >
      <div className="flex items-start justify-between mb-1">
        <h3 className="font-semibold text-text-primary text-sm truncate pr-4">{s.name}</h3>
        <button className="text-text-muted hover:text-text-primary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {isActive ? <Settings size={14} /> : <Plus size={14} />}
        </button>
      </div>
      <div className="flex items-center gap-2 text-xs text-text-muted mb-3">
        <span className="capitalize">{s.source}</span>
      </div>
      <p className="text-text-secondary text-xs line-clamp-2 leading-relaxed">
        {s.description || 'No description provided.'}
      </p>
    </div>
  )
}

function PluginCard({ plugin, enabled, onToggle }: { plugin: BundledPlugin; enabled: boolean; onToggle: () => void }) {
  return (
    <div className="bg-bg-secondary rounded-xl p-4 border border-transparent hover:border-border-subtle transition-colors cursor-pointer group">
      <div className="flex items-start justify-between mb-1">
        <h3 className="font-semibold text-text-primary text-sm">{plugin.name}</h3>
        <button
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          className={`text-2xs px-2 py-0.5 rounded-full flex-shrink-0 transition-colors ${
            enabled ? 'bg-success/15 text-success hover:bg-success/25' : 'bg-bg-tertiary text-text-muted hover:bg-bg-hover'
          }`}
        >
          {enabled ? 'Active' : 'Inactive'}
        </button>
      </div>
      <div className="flex items-center gap-2 text-xs text-text-muted mb-3">
        <span className="capitalize">{PLUGIN_CATEGORY_LABELS[plugin.category] || plugin.category}</span>
        <span>·</span>
        <span>{plugin.author}</span>
      </div>
      <p className="text-text-secondary text-xs line-clamp-2 leading-relaxed mb-3">
        {plugin.description}
      </p>
      <div className="flex items-center gap-1.5 flex-wrap">
        {plugin.skills.slice(0, 4).map(sid => (
          <span key={sid} className="text-2xs px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted border border-border-subtle">{sid}</span>
        ))}
        {plugin.skills.length > 4 && (
          <span className="text-2xs text-text-muted">+{plugin.skills.length - 4}</span>
        )}
      </div>
    </div>
  )
}

// ── Skill Detail View ──────────────────────────────────────────────────────────

function SkillDetailView({ skill, onBack, onToggle }: { skill: SkillDef, onBack: () => void, onToggle: (active: boolean) => void }) {
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview')
  const [copied, setCopied] = useState(false)
  const [fileTree, setFileTree] = useState<any[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)

  // Load file tree when skill changes
  useEffect(() => {
    setFileTree([])
    setSelectedFile(null)
    setFileContent(null)
    ipc.skills.fileTree(skill.id)
      .then(tree => setFileTree(Array.isArray(tree) ? tree : []))
      .catch(() => setFileTree([]))
  }, [skill.id])

  // Load file content when a file is selected from tree
  useEffect(() => {
    if (!selectedFile) { setFileContent(null); return }
    ipc.fs.readFile(selectedFile)
      .then(res => setFileContent(res.content ?? null))
      .catch(() => setFileContent(null))
  }, [selectedFile])

  const handleCopy = () => {
    const text = selectedFile && fileContent !== null ? fileContent : (skill.content || skill.description)
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Determine content to display
  const displayContent = selectedFile && fileContent !== null ? fileContent : (skill.content || skill.description || '')
  const displayFilename = selectedFile ? selectedFile.split('/').pop() || 'SKILL.md' : 'SKILL.md'
  const isMarkdown = displayFilename.endsWith('.md')

  return (
    <div className="flex flex-col h-full bg-bg-primary overflow-hidden">
      {/* Top Header */}
      <div className="p-8 pb-6 flex-shrink-0">
        <button 
          onClick={onBack}
          className="flex items-center gap-1.5 text-text-muted hover:text-text-primary transition-colors text-sm font-medium mb-5"
        >
          <ChevronLeft size={16} />
          Back
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">{skill.name}</h1>
            <div className="text-text-muted text-sm mt-1 capitalize">{skill.source}</div>
          </div>
          <button 
            onClick={() => onToggle(!skill.active)}
            className="px-4 py-1.5 rounded-lg bg-bg-secondary text-text-primary text-sm font-medium hover:bg-bg-hover transition-colors"
          >
            {skill.active !== false ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>

      {/* Two Columns */}
      <div className="flex-1 flex overflow-hidden border-t border-border-subtle mx-8">
        {/* Left Column (File Tree) */}
        <div className="w-56 flex-shrink-0 border-r border-border-subtle py-4 pr-4 overflow-y-auto">
          {fileTree.length === 0 ? (
            <div
              onClick={() => { setSelectedFile(null); setFileContent(null) }}
              className="px-3 py-1.5 rounded-md bg-bg-secondary text-text-primary text-sm font-medium flex items-center justify-between cursor-pointer"
            >
              SKILL.md
              <ChevronRight size={14} className="text-text-muted rotate-90" />
            </div>
          ) : (
            <div className="space-y-0.5">
              {fileTree.map(node => (
                <FileTreeNode
                  key={node.path}
                  node={node}
                  depth={0}
                  selectedPath={selectedFile}
                  onSelect={(path) => {
                    setSelectedFile(path)
                    setViewMode('preview')
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right Column (Content) */}
        <div className="flex-1 overflow-y-auto pl-6 py-4">
          <div className="bg-bg-secondary rounded-xl p-5 border border-border-subtle h-full flex flex-col">
            <div className="flex items-center justify-between mb-4 border-b border-border-subtle pb-4 shrink-0">
              <div className="flex items-center gap-1.5 text-text-muted text-sm">
                <span className="font-mono text-xs">{displayFilename}</span>
              </div>
              <div className="flex items-center gap-1 bg-bg-primary rounded-md p-0.5 border border-border-subtle">
                <button 
                  onClick={() => setViewMode('preview')}
                  className={`p-1.5 rounded transition-colors ${viewMode === 'preview' ? 'bg-bg-hover text-text-primary' : 'text-text-muted hover:text-text-primary'}`}
                  title="Preview"
                >
                  <Eye size={14} />
                </button>
                <button 
                  onClick={() => setViewMode('code')}
                  className={`p-1.5 rounded transition-colors ${viewMode === 'code' ? 'bg-bg-hover text-text-primary' : 'text-text-muted hover:text-text-primary'}`}
                  title="Source"
                >
                  <Code size={14} />
                </button>
                <button 
                  onClick={handleCopy}
                  className="p-1.5 rounded text-text-muted hover:text-text-primary transition-colors"
                  title="Copy"
                >
                  {copied ? <span className="text-[10px] font-bold text-green-500 uppercase">Copied</span> : <Copy size={14} />}
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {viewMode === 'preview' && isMarkdown ? (
                <MarkdownRenderer content={displayContent} className="text-sm" />
              ) : (
                <div className="prose prose-sm prose-invert max-w-none text-text-secondary whitespace-pre-wrap font-mono text-xs">
                  {displayContent}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── File Tree ──────────────────────────────────────────────────────────────────

function FileTreeNode({ node, depth, selectedPath, onSelect }: { node: any; depth: number; selectedPath: string | null; onSelect: (path: string) => void }) {
  const [open, setOpen] = useState(depth === 0)
  const isDir = node.type === 'directory'
  const indent = depth * 12
  const isSelected = !isDir && node.path === selectedPath

  function getFileIcon(name: string) {
    if (name.endsWith('.md')) return <FileText size={12} className="text-blue-400 flex-shrink-0" />
    if (name.endsWith('.ts') || name.endsWith('.js') || name.endsWith('.py') || name.endsWith('.sh'))
      return <FileCode size={12} className="text-green-400 flex-shrink-0" />
    if (name.endsWith('.json') || name.endsWith('.yaml') || name.endsWith('.yml'))
      return <FileJson size={12} className="text-yellow-400 flex-shrink-0" />
    return <FileText size={12} className="text-text-muted flex-shrink-0" />
  }

  return (
    <div>
      <button
        onClick={() => {
          if (isDir) { setOpen(o => !o) }
          else { onSelect(node.path) }
        }}
        className={`flex items-center gap-1.5 w-full px-1.5 py-1 rounded-md text-left transition-colors text-sm ${
          isSelected ? 'bg-bg-hover text-text-primary' : isDir ? 'hover:bg-bg-hover cursor-pointer' : 'hover:bg-bg-hover/50 cursor-pointer'
        }`}
        style={{ paddingLeft: `${4 + indent}px` }}
      >
        {isDir ? (
          open
            ? <ChevronDown size={12} className="text-text-muted flex-shrink-0" />
            : <ChevronRight size={12} className="text-text-muted flex-shrink-0" />
        ) : (
          <span className="w-3 flex-shrink-0" />
        )}
        {isDir
          ? (open
              ? <FolderOpenIcon size={12} className="text-accent flex-shrink-0" />
              : <FolderIcon size={12} className="text-accent flex-shrink-0" />)
          : getFileIcon(node.name)
        }
        <span className={`truncate text-xs ${isDir ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>
          {node.name}
        </span>
      </button>
      {isDir && open && node.children?.map((child: any) => (
        <FileTreeNode key={child.path} node={child} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} />
      ))}
    </div>
  )
}

function ConnectorDetailView({ connector, onBack, onUpdate }: { connector: ConnectorCatalogInfo, onBack: () => void, onUpdate: (c: ConnectorCatalogInfo) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pathArg, setPathArg] = useState('')
  const [secrets, setSecrets] = useState<Record<string, string>>({})

  async function handlePickFolder() {
    try {
      const folder = await ipc.fs.pickFolder()
      if (folder) setPathArg(folder)
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function handleConnect() {
    setBusy(true)
    setError('')
    try {
      let res;
      if (connector.auth === 'oauth') {
        res = await ipc.connectors.authorize(connector.id)
      } else {
        if (connector.requiresPathArg && !pathArg.trim()) {
          throw new Error('Please select a folder path to continue.')
        }
        res = await ipc.connectors.add({
          id: connector.id,
          pathArg: pathArg.trim() || undefined,
          secrets: Object.keys(secrets).length > 0 ? secrets : undefined
        })
      }
      
      if (res.ok) {
        onUpdate({ ...connector, connected: true, authorized: connector.auth === 'oauth' ? true : undefined, toolCount: res.toolCount || connector.toolCount })
      } else {
        setError(res.error || 'Failed to connect. Please check logs or try again.')
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDisconnect() {
    setBusy(true)
    setError('')
    try {
      const res = await ipc.connectors.remove(connector.id)
      if (res.ok) {
        onUpdate({ ...connector, connected: false, authorized: false })
      } else {
        // Even if there's an error, maybe it's not found, treat as disconnected locally or show error.
        setError('Failed to disconnect. Please try again.')
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-bg-primary overflow-hidden">
      <div className="p-8 pb-6 flex-shrink-0">
        <button 
          onClick={onBack}
          className="flex items-center gap-1.5 text-text-muted hover:text-text-primary transition-colors text-sm font-medium mb-5"
        >
          <ChevronLeft size={16} />
          Back
        </button>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-white flex items-center justify-center overflow-hidden shadow-sm border border-neutral-200 dark:border-white/10 flex-shrink-0">
              {connector.logo ? <img src={connector.logo} alt="" className="w-full h-full object-cover" /> : <Box size={24} className="text-neutral-400" />}
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-text-primary">{connector.name}</h1>
              <div className="text-text-muted text-sm mt-1 capitalize">{connector.category} · {connector.transport}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {connector.connected && (
              <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-success/10 text-success cursor-default">
                Connected
              </span>
            )}
            <button 
              onClick={connector.connected ? handleDisconnect : handleConnect}
              disabled={busy}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                connector.connected 
                  ? 'border border-red-500/20 text-red-500 hover:bg-red-500/10' 
                  : 'bg-accent text-accent-fg hover:bg-accent-hover'
              }`}
            >
              {busy ? (connector.connected ? 'Disconnecting...' : 'Connecting...') : (connector.connected ? 'Disconnect' : 'Connect')}
            </button>
          </div>
        </div>
        {error && <div className="mt-4 text-sm text-red-500 bg-red-500/10 p-3 rounded-lg border border-red-500/20">{error}</div>}
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <div className="max-w-2xl">
          
          {/* Configuration Section for Unconnected Connectors */}
          {!connector.connected && (connector.requiresPathArg || (connector.authFields && connector.authFields.length > 0)) && (
            <section className="mb-8">
              <h3 className="text-sm font-semibold text-text-primary mb-3">Configuration</h3>
              <div className="bg-bg-secondary rounded-xl p-5 border border-border-subtle space-y-4">
                {connector.requiresPathArg && (
                  <div>
                    <label className="block text-xs font-medium text-text-primary mb-1.5">Target Directory</label>
                    <div className="flex items-center gap-2">
                      <input 
                        value={pathArg}
                        onChange={e => setPathArg(e.target.value)}
                        placeholder="Select or enter path..."
                        className="flex-1 px-3 py-2 bg-bg-tertiary border border-border rounded-lg text-sm text-text-primary focus:border-accent transition-colors"
                      />
                      <button 
                        onClick={handlePickFolder}
                        className="px-3 py-2 bg-bg-tertiary border border-border rounded-lg text-sm font-medium hover:bg-bg-hover transition-colors"
                      >
                        Browse
                      </button>
                    </div>
                  </div>
                )}
                {connector.authFields && connector.authFields.map(field => (
                  <div key={field.envKey}>
                    <label className="block text-xs font-medium text-text-primary mb-1.5">
                      {field.label}
                    </label>
                    <input 
                      type="password"
                      value={secrets[field.envKey] || ''}
                      onChange={e => setSecrets(s => ({ ...s, [field.envKey]: e.target.value }))}
                      placeholder={field.hint || "Enter secret..."}
                      className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded-lg text-sm text-text-primary focus:border-accent transition-colors"
                    />
                    {field.hint && <p className="text-xs text-text-muted mt-1.5">{field.hint}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="mb-8">
            <h3 className="text-sm font-semibold text-text-primary mb-2">Key features</h3>
            <div className="text-sm text-text-secondary leading-relaxed">
              <MarkdownRenderer content={connector.description} />
            </div>
          </section>

          <section className="mb-8">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Details</h3>
            <div className="bg-bg-secondary rounded-xl p-4 space-y-3 border border-border-subtle">
              <div className="flex justify-between">
                <span className="text-sm text-text-muted">Authentication</span>
                <span className="text-sm text-text-primary font-medium capitalize">{connector.auth}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-text-muted">Transport</span>
                <span className="text-sm text-text-primary font-medium uppercase">{connector.transport}</span>
              </div>
              {connector.toolCount !== undefined && (
                <div className="flex justify-between">
                  <span className="text-sm text-text-muted">Tools Provided</span>
                  <span className="text-sm text-text-primary font-medium">{connector.toolCount}</span>
                </div>
              )}
                {connector.popular !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-sm text-text-muted">Popularity</span>
                    <span className="text-sm text-text-primary font-medium">{connector.popular}</span>
                  </div>
                )}
                {connector.author && (
                  <div className="flex justify-between">
                    <span className="text-sm text-text-muted">Author</span>
                    <span className="text-sm text-text-primary font-medium">{connector.author}</span>
                  </div>
                )}
                {connector.capabilities && connector.capabilities.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-sm text-text-muted">Capabilities</span>
                    <span className="text-sm text-text-primary font-medium">{connector.capabilities.join(', ')}</span>
                  </div>
                )}
                {connector.repoUrl && (
                  <div className="flex justify-between">
                    <span className="text-sm text-text-muted">Connector URL</span>
                    <a href={connector.repoUrl} target="_blank" rel="noreferrer" className="text-sm text-accent hover:underline flex items-center gap-1 font-medium">
                      {connector.repoUrl}
                    </a>
                  </div>
                )}
              </div>
            </section>

            {(connector.docsUrl || connector.supportUrl || connector.privacyUrl) && (
              <section className="mb-8">
                <h3 className="text-sm font-semibold text-text-primary mb-3">More info</h3>
                <div className="flex flex-col gap-2">
                  {connector.docsUrl && (
                    <a href={connector.docsUrl} target="_blank" rel="noreferrer" className="text-sm text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5 w-max">
                      Documentation <ExternalLink size={12} />
                    </a>
                  )}
                  {connector.supportUrl && (
                    <a href={connector.supportUrl} target="_blank" rel="noreferrer" className="text-sm text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5 w-max">
                      Support <ExternalLink size={12} />
                    </a>
                  )}
                  {connector.privacyUrl && (
                    <a href={connector.privacyUrl} target="_blank" rel="noreferrer" className="text-sm text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5 w-max">
                      Privacy Policy <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
    </div>
  )
}


