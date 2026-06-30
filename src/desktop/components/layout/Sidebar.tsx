import React, { useEffect, useState, useRef } from 'react'
import {
  Settings, Plus, Search, Pin, MessageSquare, Home, FolderPlus,
  ChevronRight, MessagesSquare, FolderKanban, PenLine, Trash2,
  Boxes, Palette, Sparkles, Archive, SlidersHorizontal, CircleDashed, TriangleAlert, MoreHorizontal,
  ChevronDown, ArrowUpRight, Circle
} from 'lucide-react'
import { useProjectsStore } from '../../stores/projects.store'
import { useSessionsStore } from '../../stores/sessions.store'
import { useUIStore } from '../../stores/ui.store'
import { useAgentStore } from '../../stores/agent.store'
import { ipc } from '../../lib/ipc'
import { GLOBAL_PROJECT_ID } from '../session/GlobalChatView'
import { formatRelative } from '../../lib/time'
import { UpdateBanner } from '../UpdateBanner'

/* ── Template-card style SVG project icons ──────────────────────────────── */
// Renk sistemi: CSS değişkenleri — light/dark'a göre otomatik adapte olur.
// Stroke: text-secondary düzeyi (template'in rgba(33,29,24,0.42) karşılığı)
// Fill:   text-muted/10 düzeyi (template'in rgba(33,29,24,0.10) karşılığı)

/* ── Template-card stilinde ikon varyantları ─────────────────────────────
   Tüm ikon SVG'leri `currentColor` kullanır — renk parent'daki text-color CSS
   class'ından gelir (active → text-accent, normal → text-text-muted).
   fillOpacity ile yarı saydam alanlar — SVG presentation attribute olarak
   her browser'da güvenle çalışır.
   ──────────────────────────────────────────────────────────────────────── */
const ICON_VARIANTS: React.FC[] = [
  // 0 — Folder with content lines
  () => (
    <svg viewBox="0 0 20 20" fill="none" width="100%" height="100%">
      <path
        d="M2 7.5C2 6.7 2.7 6 3.5 6H7.5L9 8H17C17.8 8 18.5 8.7 18.5 9.5V15.5C18.5 16.3 17.8 17 17 17H3.5C2.7 17 2 16.3 2 15.5V7.5Z"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
        fill="currentColor" fillOpacity="0.12"
      />
      <line x1="5.5" y1="11.5" x2="12.5" y2="11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="5.5" y1="13.5" x2="10"   y2="13.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  // 1 — Document with fold corner (closest to "Document" template card)
  () => (
    <svg viewBox="0 0 20 20" fill="none" width="100%" height="100%">
      <path
        d="M5 3h8l4 4v11a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
        fill="currentColor" fillOpacity="0.10"
      />
      <path d="M13 3v4h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="7" y1="10.5" x2="13"  y2="10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="7" y1="13"   x2="13"  y2="13"   stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="7" y1="15.5" x2="10.5" y2="15.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  // 2 — Stacked documents (depth / multi-file feel)
  () => (
    <svg viewBox="0 0 20 20" fill="none" width="100%" height="100%">
      <rect x="4" y="6.5" width="13" height="10" rx="1.5"
        fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeWidth="1.3" />
      <rect x="3" y="4.5" width="11" height="9" rx="1.5"
        fill="currentColor" fillOpacity="0.10" stroke="currentColor" strokeWidth="1.3" />
      <rect x="2.5" y="3" width="10" height="8.5" rx="1.5"
        fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="1.4" />
      <line x1="5"   y1="6.5" x2="9.5" y2="6.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <line x1="5"   y1="8.5" x2="9.5" y2="8.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  ),
  // 3 — Code / terminal (like "Animation" card but code-flavored)
  () => (
    <svg viewBox="0 0 20 20" fill="none" width="100%" height="100%">
      <rect x="2" y="4" width="16" height="12" rx="2"
        fill="currentColor" fillOpacity="0.10" stroke="currentColor" strokeWidth="1.4" />
      <line x1="2" y1="8" x2="18" y2="8" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.5" />
      <circle cx="4.5" cy="6" r="0.9" fill="currentColor" />
      <circle cx="7"   cy="6" r="0.9" fill="currentColor" />
      <circle cx="9.5" cy="6" r="0.9" fill="currentColor" />
      <path d="M5.5 11.5L8 13.5 5.5 15.5"
        stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="10" y1="15" x2="14.5" y2="15" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  // 4 — Grid / dashboard (like "Prototype" card dual-panel)
  () => (
    <svg viewBox="0 0 20 20" fill="none" width="100%" height="100%">
      <rect x="2" y="3" width="16" height="14" rx="2"
        fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeWidth="1.4" />
      <rect x="4" y="5.5" width="5" height="4" rx="1" fill="currentColor" fillOpacity="0.28" />
      <rect x="11" y="5.5" width="5" height="4" rx="1" fill="currentColor" fillOpacity="0.16" />
      <rect x="4" y="11" width="5" height="4" rx="1" fill="currentColor" fillOpacity="0.16" />
      <rect x="11" y="11" width="5" height="4" rx="1" fill="currentColor" fillOpacity="0.28" />
    </svg>
  ),
]

/** Proje adından deterministik bir ikon varyantı seç */
function pickVariant(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return Math.abs(hash) % ICON_VARIANTS.length
}

/** Template card stilinde proje ikonu */
function ProjectIcon({
  icon, name, active, size = 32,
}: {
  icon?: string; name: string; active: boolean; size?: number
}) {
  // Emoji varsa (📁 default harici), emoji göster
  const isCustomEmoji = icon && icon !== '📁' && /\p{Emoji}/u.test(icon)
  const variant = pickVariant(name)
  const IconComp = ICON_VARIANTS[variant]

  return (
    <div
      className={`project-icon-box${active ? ' active' : ''}`}
      style={{ width: size, height: size }}
    >
      {isCustomEmoji ? (
        <span style={{ fontSize: size * 0.48, lineHeight: 1 }}>{icon}</span>
      ) : (
        // currentColor → parent class'tan miras alır
        <div
          className={active ? 'text-accent' : 'text-text-muted'}
          style={{ width: size * 0.68, height: size * 0.68 }}
        >
          <IconComp />
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════ */

export function Sidebar() {
  const { projects, activeProjectId, setActiveProject, loading } = useProjectsStore()
  const { setActiveSession, activeSessionId, sessionsByProject, loadSessions } = useSessionsStore()
  const { setNewProjectModal, openSettings, openCustomize, openNewTask, sidebarCollapsed, activeTab, setActiveTab } = useUIStore()
  const [search, setSearch] = useState('')

  const filtered = projects.filter(p =>
    search === '' || p.name.toLowerCase().includes(search.toLowerCase())
  )
  const pinned   = filtered.filter(p => p.pinned)
  const unpinned = filtered.filter(p => !p.pinned)

  function selectProject(id: string) {
    setActiveProject(id)
    setActiveSession(null)
    loadSessions(id)
  }

  /* ── Collapsed rail ─────────────────────────────────────────────────── */
  if (sidebarCollapsed) {
    return (
      <aside
        className="flex flex-col flex-shrink-0 border-r border-border-subtle bg-bg-secondary items-center py-3 gap-1.5"
        style={{ width: '52px' }}
      >
        <NavIconBtn
          onClick={() => setActiveTab('projects')}
          active={activeTab === 'projects'}
          title="Projects"
          icon={<FolderKanban size={16} />}
        />
        <NavIconBtn
          onClick={() => setActiveTab('chats')}
          active={activeTab === 'chats'}
          title="Chats"
          icon={<MessagesSquare size={16} />}
        />

        <div className="flex-1" />
        <UpdateBanner collapsed />

        <button
          onClick={() => ipc.design.openWindow()}
          title="Design"
          className="w-9 h-9 flex items-center justify-center rounded-xl text-white transition-all hover:opacity-90 active:scale-95"
          style={{
            background: 'linear-gradient(145deg, rgb(var(--accent)) 0%, rgb(var(--accent-press)) 100%)',
            boxShadow: '0 2px 8px color-mix(in srgb, rgb(var(--accent)) 35%, transparent)',
          }}
        >
          <Palette size={15} />
        </button>

        <NavIconBtn onClick={() => openCustomize()} title="Customize" icon={<Boxes size={16} />} />
        <NavIconBtn onClick={() => openSettings('models')} title="Settings" icon={<Settings size={16} />} />
      </aside>
    )
  }

  /* ── Expanded sidebar ───────────────────────────────────────────────── */
  return (
    <aside
      className="flex flex-col flex-shrink-0 border-r border-border-subtle bg-bg-secondary transition-all duration-200"
      style={{ width: 'var(--sidebar-width)' }}
    >
      {/* ── New Task ── */}
      <div className="px-3 pt-3 pb-2">
        <button
          onClick={() => openNewTask()}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-white text-sm font-medium
                     transition-all hover:opacity-90 active:scale-[0.98] shadow-sm"
          style={{ backgroundColor: '#4176CF' }}
        >
          <Plus size={15} className="flex-shrink-0" />
          <span>New Task</span>
        </button>
      </div>

      {/* ── Tab switcher ── */}
      <div className="px-3 pb-2">
        <div className="flex rounded-lg bg-bg-tertiary border border-border-subtle p-0.5 gap-0.5">
          <TabBtn active={activeTab === 'chats'}    onClick={() => setActiveTab('chats')}    icon={<MessagesSquare size={12} />} label="Chat" />
          <TabBtn active={activeTab === 'projects'} onClick={() => setActiveTab('projects')} icon={<FolderKanban size={12} />}   label="Projects" />
        </div>
      </div>

      {/* ── Scrollable list ── */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">

        {activeTab === 'chats' && <GlobalChatsList />}

        {activeTab === 'projects' && (
          <>
            {/* Header */}
            <div className="mb-1.5 px-2 flex items-center justify-between">
              <p className="text-2xs text-text-muted font-semibold uppercase tracking-widest">Projects</p>
              <button
                onClick={() => setNewProjectModal(true)}
                className="p-1 rounded text-text-muted hover:text-accent transition-colors"
                title="New Project"
              >
                <FolderPlus size={12} />
              </button>
            </div>

            {/* Search */}
            <div className="px-1 pb-2">
              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-bg-tertiary rounded-lg border border-border-subtle
                              focus-within:border-accent/50 focus-within:bg-bg-elevated transition-all">
                <Search size={12} className="text-text-muted flex-shrink-0" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search projects…"
                  className="flex-1 bg-transparent text-xs text-text-primary placeholder-text-muted outline-none"
                />
              </div>
            </div>

            {/* Loading */}
            {loading && (
              <div className="space-y-1.5 px-1 py-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="flex items-center gap-2.5 p-2">
                    <div className="w-8 h-8 rounded-xl shimmer flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2.5 rounded shimmer w-3/4" />
                      <div className="h-2 rounded shimmer w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && projects.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 px-4 text-center">
                <div className="w-10 h-10 rounded-xl bg-bg-tertiary border border-border flex items-center justify-center">
                  <FolderPlus size={16} className="text-text-muted" />
                </div>
                <p className="text-xs text-text-muted">No projects yet</p>
                <button
                  onClick={() => setNewProjectModal(true)}
                  className="text-2xs text-accent hover:underline"
                >
                  Create your first project
                </button>
              </div>
            )}

            {pinned.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-text-muted px-2 py-1 mb-0.5">Pinned</p>
                {pinned.map(p => (
                  <PinnedProjectItem
                    key={p.id} project={p}
                    active={p.id === activeProjectId && !activeSessionId}
                    onSelect={() => { selectProject(p.id); setActiveSession(null) }}
                  />
                ))}
              </div>
            )}

            {filtered.length > 0 && (
              <div className="space-y-4">
                {filtered.map(p => (
                  <ProjectSection
                    key={p.id} project={p}
                    activeSessionId={activeSessionId}
                    sessions={sessionsByProject[p.id] ?? []}
                    onSession={(sid) => { selectProject(p.id); setActiveSession(sid) }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="border-t border-border-subtle pt-2 pb-3 flex flex-col">
        <UpdateBanner />
        <div className="px-2 space-y-0.5">
          <button
            onClick={() => ipc.design.openWindow()}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-accent-fg text-xs font-medium
                       transition-all hover:opacity-95 active:scale-[0.98]"
            style={{
              background: 'linear-gradient(145deg, rgb(var(--accent)) 0%, rgb(var(--accent-press)) 100%)',
              boxShadow: '0 2px 8px color-mix(in srgb, rgb(var(--accent)) 28%, transparent)',
            }}
          >
            <Palette size={13} className="flex-shrink-0" />
            <span>Design</span>
            <span className="ml-auto flex items-center gap-1 text-[10px] bg-white/20 rounded px-1.5 py-0.5 font-semibold leading-none">
              <Sparkles size={9} />New
            </span>
          </button>
          <FooterBtn onClick={() => openCustomize()}        icon={<Boxes size={13} />}    label="Customize" />
          <FooterBtn onClick={() => openSettings('models')} icon={<Settings size={13} />} label="Settings" />
        </div>
      </div>
    </aside>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   Helper bileşenler
   ══════════════════════════════════════════════════════════════════════════ */

function NavIconBtn({ onClick, active, title, icon }: {
  onClick: () => void; active?: boolean; title: string; icon: React.ReactNode
}) {
  return (
    <button
      onClick={onClick} title={title}
      className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
        active ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover'
      }`}
    >
      {icon}
    </button>
  )
}

function TabBtn({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all outline-none focus:outline-none ${
        active
          ? 'bg-bg-secondary text-text-primary shadow-sm border border-border-subtle'
          : 'text-text-muted hover:text-text-secondary border border-transparent'
      }`}
    >
      {icon}{label}
    </button>
  )
}

function FooterBtn({ onClick, icon, label }: {
  onClick: () => void; icon: React.ReactNode; label: string
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-text-muted
                 hover:bg-bg-hover hover:text-text-secondary transition-colors text-xs"
    >
      {icon}<span>{label}</span>
    </button>
  )
}

function GlobalChatsList() {
  const { sessionsByProject, loadSessions, renameSession, deleteSession } = useSessionsStore()
  const { activeGlobalSessionId, setActiveGlobalSession } = useUIStore()
  const { setActiveProject } = useProjectsStore()
  const agentStore = useAgentStore()
  const sessions = sessionsByProject[GLOBAL_PROJECT_ID] ?? []

  useEffect(() => { loadSessions(GLOBAL_PROJECT_ID) }, [])

  async function handleDelete(sid: string) {
    if (!window.confirm('Delete this chat and all its messages?')) return
    const wasActive = activeGlobalSessionId === sid
    await deleteSession(GLOBAL_PROJECT_ID, sid)
    if (wasActive) {
      await ipc.agent.newSession(GLOBAL_PROJECT_ID)
      agentStore.setStatus('idle')
      agentStore.clearToolCalls()
      agentStore.clearTimelines()
      useSessionsStore.getState().clearUIMessages()
      setActiveGlobalSession(null)
    }
  }

  if (sessions.length === 0) return null

  return (
    <div className="mb-3 space-y-0.5">
      {sessions.map(s => (
        <SessionRow
          key={s.id}
          session={s}
          active={activeGlobalSessionId === s.id}
          onSelect={() => { setActiveGlobalSession(s.id); setActiveProject(null) }}
          onRename={t => renameSession(s.id, t)}
          onDelete={() => handleDelete(s.id)}
          onPin={() => useSessionsStore.getState().pinSession(GLOBAL_PROJECT_ID, s.id, !s.pinned)}
        />
      ))}
    </div>
  )
}

function Section({ label, icon, children }: {
  label?: string; icon?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="mb-1">
      {label && (
        <p className="text-2xs text-text-muted px-2 py-1 font-semibold uppercase tracking-widest flex items-center gap-1.5">
          {icon}{label}
        </p>
      )}
      {children}
    </div>
  )
}

function PinnedProjectItem({ project, active, onSelect }: { project: any; active: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left transition-colors mb-0.5 ${
        active
          ? 'bg-bg-tertiary text-text-primary'
          : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
      }`}
    >
      <Archive size={14} className={active ? 'text-text-primary' : 'text-text-muted'} />
      <span className="text-xs truncate font-medium">{project.name}</span>
    </button>
  )
}

function ProjectSection({ project, activeSessionId, sessions, onSession }: {
  project: any; activeSessionId: string | null
  sessions: any[]; onSession: (id: string | null) => void
}) {
  const { renameSession, deleteSession, pinSession, loadSessions } = useSessionsStore()
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    loadSessions(project.id)
  }, [project.id])

  return (
    <div>
      {/* Header Row */}
      <div className="flex items-center justify-between px-2 mb-1 group cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-1.5 min-w-0 text-text-secondary group-hover:text-text-primary transition-colors">
          <span className="text-[11px] font-medium truncate">{project.name}</span>
          {expanded ? <ChevronDown size={10} className="text-text-muted" /> : <ChevronRight size={10} className="text-text-muted" />}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={(e) => { e.stopPropagation(); onSession(null) }} className="p-0.5 text-text-muted hover:text-accent transition-colors" title="Open Project">
            <ArrowUpRight size={12} />
          </button>
        </div>
      </div>
      
      {/* Sessions List */}
      {expanded && (
        <div className="space-y-0.5 ml-1">
          {sessions.slice(0, 12).map(s => (
            <SessionRow
              key={s.id}
              session={s}
              active={activeSessionId === s.id}
              onSelect={() => onSession(s.id)}
              onRename={t => renameSession(s.id, t)}
              onDelete={() => deleteSession(project.id, s.id)}
              onPin={() => pinSession(project.id, s.id, !s.pinned)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SessionRow({ session, active, onSelect, onRename, onDelete, onPin }: {
  session: any; active: boolean; onSelect: () => void
  onRename: (t: string) => void; onDelete: () => void; onPin: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(session.title || '')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  function commit() {
    const t = val.trim()
    if (t && t !== session.title) onRename(t)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          else if (e.key === 'Escape') { setVal(session.title || ''); setEditing(false) }
        }}
        className="w-full px-2 py-1.5 rounded-md text-xs bg-bg-elevated border border-accent/40 text-text-primary outline-none"
      />
    )
  }

  // Basic mock logic for triangle alert if title contains words like bug/migration
  const lowerTitle = (session.title || '').toLowerCase()
  const isAlert = lowerTitle.includes('bug') || lowerTitle.includes('migrati')
  const Icon = isAlert ? TriangleAlert : Circle

  return (
    <div className={`group relative flex items-center gap-2 w-full pl-3 pr-1 py-1 rounded-md text-[11px] transition-colors ${
      active
        ? 'text-text-primary bg-bg-hover font-medium'
        : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover/50'
    }`}>
      <button onClick={onSelect} className="flex items-center gap-2 flex-1 min-w-0 text-left">
        <Icon size={8} className={`flex-shrink-0 ${isAlert ? 'text-warning' : (active ? 'text-accent' : 'text-text-muted')} stroke-[3px]`} />
        <span className="truncate">{session.title || 'New Session'}</span>
      </button>

      {/* Menu Trigger */}
      <button
        onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
        className={`p-0.5 rounded text-text-muted hover:text-accent transition-all flex-shrink-0 ${menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
      >
        <MoreHorizontal size={14} />
      </button>

      {/* Dropdown Menu */}
      {menuOpen && (
        <div ref={menuRef} className="absolute right-6 top-0 mt-1 w-28 bg-bg-elevated border border-border-subtle rounded-lg shadow-lg py-1 z-50">
          <button onClick={(e) => { e.stopPropagation(); onPin(); setMenuOpen(false) }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-bg-hover text-text-secondary">
            {session.pinned ? 'Unpin' : 'Pin'}
          </button>
          <button onClick={(e) => { e.stopPropagation(); setVal(session.title || ''); setEditing(true); setMenuOpen(false) }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-bg-hover text-text-secondary">
            Rename
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); setMenuOpen(false) }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-bg-hover text-error">
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
