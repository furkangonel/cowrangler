import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Boxes, ChevronDown, ChevronRight, Folder, FolderOpen, MoreHorizontal,
  Palette, PenLine, Pin, PinOff, Plus, Search, Settings, Trash2, X,
} from 'lucide-react'
import { useProjectsStore } from '../../stores/projects.store'
import { useSessionsStore } from '../../stores/sessions.store'
import { useUIStore } from '../../stores/ui.store'
import { useAgentStore } from '../../stores/agent.store'
import { ipc, ProjectSummary, SessionRecord } from '../../lib/ipc'
import { startNewCodeTask } from '../session/CodeSessionView'
import { EditProjectModal } from '../project/EditProjectModal'
import { UpdateBanner } from '../UpdateBanner'

export function Sidebar() {
  const { projects, activeProjectId, setActiveProject, loading, updateProject, deleteProject } = useProjectsStore()
  const { sessionsByProject, loadSessions, deleteSession, renameSession, pinSession } = useSessionsStore()
  const { sidebarCollapsed, setNewProjectModal, openCustomize, openSettings, activeCodeSessionId, setActiveCodeSession } = useUIStore()
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [showAll, setShowAll] = useState<Set<string>>(() => new Set())
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ project: ProjectSummary; rect: DOMRect } | null>(null)

  useEffect(() => {
    if (!loading && projects.length > 0 && !activeProjectId) selectProject(projects[0].id)
  }, [loading, projects, activeProjectId])

  useEffect(() => {
    if (!activeProjectId) return
    setExpanded((current) => new Set(current).add(activeProjectId))
  }, [activeProjectId])

  function selectProject(projectId: string, sessionId: string | null = null) {
    const changedProject = projectId !== activeProjectId
    setActiveProject(projectId)
    if (changedProject || sessionId !== null) setActiveCodeSession(sessionId)
    void loadSessions(projectId)
  }

  async function newTask(projectId: string) {
    selectProject(projectId)
    await startNewCodeTask(projectId)
  }

  async function removeProject(project: ProjectSummary) {
    const confirmed = window.confirm(
      `Remove “${project.name}” from Cowrangler?\n\nLocal chat history and agent support data will be removed. Your source folder and files will not be deleted.`,
    )
    if (!confirmed) return
    setMenu(null)
    await deleteProject(project.id)
    setActiveCodeSession(null)
  }

  const filtered = projects.filter((project) => project.name.toLowerCase().includes(search.trim().toLowerCase()))

  if (sidebarCollapsed) {
    return (
      <aside className="flex w-[54px] shrink-0 flex-col items-center border-r border-border-subtle bg-bg-secondary py-3">
        <button onClick={() => setNewProjectModal(true)} title="Add project" className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"><Plus size={16} /></button>
        <div className="flex-1" />
        <button onClick={() => void ipc.design.openWindow()} title="Design" className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-bg-hover hover:text-text-primary"><Palette size={16} /></button>
        <button onClick={openCustomize} title="Customize" className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-bg-hover hover:text-text-primary"><Boxes size={16} /></button>
        <button onClick={() => openSettings('models')} title="Settings" className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-bg-hover hover:text-text-primary"><Settings size={16} /></button>
      </aside>
    )
  }

  return (
    <>
      <aside className="flex shrink-0 flex-col border-r border-border-subtle bg-bg-secondary" style={{ width: 'var(--sidebar-width)' }}>
        <div className="px-3 pb-2 pt-4">
          <div className="mb-3 flex items-center justify-between px-1">
            <span className="workbench-eyebrow">Workspaces</span>
            <button onClick={() => setNewProjectModal(true)} aria-label="Add project" title="Add project" className="grid h-7 w-7 place-items-center rounded-lg text-text-muted hover:bg-bg-hover hover:text-text-primary"><Plus size={14} /></button>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-bg-primary/60 px-2.5 py-2 text-text-muted transition-colors focus-within:border-accent/40 focus-within:bg-bg-elevated">
            <Search size={12} />
            <input aria-label="Search projects" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a project" className="min-w-0 flex-1 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted" />
            {search && <button onClick={() => setSearch('')} aria-label="Clear search"><X size={11} /></button>}
          </div>
        </div>

        {/* overflow-x-hidden is load-bearing: with only overflow-y-auto set, CSS
            computes the other axis as auto too, so anything reaching past the
            sidebar's right edge adds a horizontal scrollbar. Menus escape via a
            portal instead (see SessionRow / ProjectMenu). */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-4">
          {loading && <ProjectSkeleton />}
          {!loading && filtered.length === 0 && (
            <div className="mx-2 mt-10 text-center"><Folder size={22} className="mx-auto mb-3 text-text-muted" /><p className="text-xs text-text-muted">{projects.length ? 'No matching projects' : 'No projects yet'}</p></div>
          )}
          <div className="space-y-1">
            {filtered.map((project) => {
              const isExpanded = expanded.has(project.id)
              const active = project.id === activeProjectId
              const sessions = sessionsByProject[project.id] ?? []
              const visible = showAll.has(project.id) ? sessions : sessions.slice(0, 6)
              return (
                <div key={project.id} className={`project-accordion ${active ? 'is-active' : ''}`}>
                  <div className="group relative flex h-10 items-center rounded-xl px-2 transition-colors hover:bg-bg-hover">
                    {active && <span className="absolute bottom-2 left-0 top-2 w-[2px] rounded-full bg-accent" />}
                    <button
                      onClick={() => {
                        setExpanded((current) => { const next = new Set(current); isExpanded ? next.delete(project.id) : next.add(project.id); return next })
                        selectProject(project.id)
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      {isExpanded ? <ChevronDown size={12} className="shrink-0 text-text-muted" /> : <ChevronRight size={12} className="shrink-0 text-text-muted" />}
                      <FolderOpen size={17} className={`shrink-0 ${active ? 'text-text-primary' : 'text-text-muted'}`} />
                      <span className={`truncate text-[13px] ${active ? 'font-medium text-text-primary' : 'text-text-secondary'}`}>{project.name}</span>
                      {!!project.pinned && <Pin size={10} className="shrink-0 rotate-45 text-text-muted" />}
                    </button>
                    <div className={`flex items-center ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      <button onClick={() => void newTask(project.id)} title="New task" className="rounded-md p-1 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary"><PenLine size={13} /></button>
                      <button
                        onClick={(event) => { event.stopPropagation(); setMenu({ project, rect: event.currentTarget.getBoundingClientRect() }) }}
                        aria-label={`Project options for ${project.name}`}
                        className="rounded-md p-1 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary"
                      ><MoreHorizontal size={15} /></button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="ml-[30px] border-l border-border-subtle/70 py-1 pl-2">
                      {visible.map((session) => (
                        <SessionRow
                          key={session.id}
                          session={session}
                          active={active && activeCodeSessionId === session.id}
                          onSelect={() => selectProject(project.id, session.id)}
                          onRename={(title) => renameSession(session.id, title)}
                          onPin={() => pinSession(project.id, session.id, !session.pinned)}
                          onDelete={async () => {
                            await deleteSession(project.id, session.id)
                            if (activeCodeSessionId === session.id) setActiveCodeSession(null)
                          }}
                        />
                      ))}
                      {sessions.length === 0 && <button onClick={() => void newTask(project.id)} className="w-full rounded-lg px-2 py-1.5 text-left text-[11px] text-text-muted hover:bg-bg-hover hover:text-text-secondary">Start the first task</button>}
                      {sessions.length > 6 && (
                        <button onClick={() => setShowAll((current) => { const next = new Set(current); next.has(project.id) ? next.delete(project.id) : next.add(project.id); return next })} className="w-full px-2 py-1 text-left text-[11px] text-text-muted hover:text-text-secondary">
                          {showAll.has(project.id) ? 'Show less' : `Show ${sessions.length - 6} more`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="border-t border-border-subtle px-2 pb-3 pt-2">
          <UpdateBanner />
          <FooterButton icon={<Palette size={14} />} label="Design" onClick={() => void ipc.design.openWindow()} />
          <FooterButton icon={<Boxes size={14} />} label="Customize" onClick={openCustomize} />
          <FooterButton icon={<Settings size={14} />} label="Settings" onClick={() => openSettings('models')} />
        </div>
      </aside>

      {menu && (
        <ProjectMenu
          project={menu.project}
          rect={menu.rect}
          onClose={() => setMenu(null)}
          onPin={async () => { await updateProject(menu.project.id, { pinned: menu.project.pinned ? 0 : 1 }); setMenu(null) }}
          onReveal={async () => { await ipc.projects.reveal(menu.project.id); setMenu(null) }}
          onEdit={() => { setEditingProjectId(menu.project.id); setMenu(null) }}
          onRemove={() => void removeProject(menu.project)}
        />
      )}
      {editingProjectId && <EditProjectModal projectId={editingProjectId} onClose={() => setEditingProjectId(null)} />}
    </>
  )
}

function ProjectMenu({ project, rect, onClose, onPin, onReveal, onEdit, onRemove }: {
  project: ProjectSummary; rect: DOMRect; onClose: () => void; onPin: () => void; onReveal: () => void; onEdit: () => void; onRemove: () => void
}) {
  useEffect(() => {
    const close = () => onClose()
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => { window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true) }
  }, [onClose])
  return createPortal(
    <>
      <div className="fixed inset-0 z-[80]" onMouseDown={onClose} />
      <div className="fixed z-[81] w-56 rounded-2xl border border-border bg-bg-elevated p-1.5 shadow-pop animate-slide-up" style={{ top: Math.min(rect.bottom + 6, window.innerHeight - 230), left: rect.right + 8 }}>
        <MenuButton icon={project.pinned ? <PinOff size={16} /> : <Pin size={16} />} label={project.pinned ? 'Unpin project' : 'Pin project'} onClick={onPin} />
        <MenuButton icon={<FolderOpen size={16} />} label="Reveal in Finder" onClick={onReveal} />
        <MenuButton icon={<Settings size={16} />} label="Edit project" onClick={onEdit} />
        <div className="my-1 border-t border-border-subtle" />
        <MenuButton icon={<Trash2 size={16} />} label="Remove" danger onClick={onRemove} />
      </div>
    </>, document.body,
  )
}

function MenuButton({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-bg-hover ${danger ? 'text-error' : 'text-text-primary'}`}>{icon}{label}</button>
}

function SessionRow({ session, active, onSelect, onRename, onPin, onDelete }: {
  session: SessionRecord; active: boolean; onSelect: () => void; onRename: (title: string) => void; onPin: () => void; onDelete: () => void
}) {
  // The menu is portalled to <body>, so its position comes from the trigger's
  // rect rather than from the row it belongs to.
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(session.title || 'New task')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuOpen = menuRect !== null

  // A portalled menu lives outside `ref`, so a contains() check would treat a
  // click on the menu itself as an outside click and close it before the button
  // fired. The backdrop below handles dismissal instead; this only has to
  // follow the trigger when the layout moves out from under it.
  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuRect(null)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => { window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true) }
  }, [menuOpen])

  function commit() {
    const next = title.trim()
    if (next && next !== session.title) onRename(next)
    setEditing(false)
  }

  if (editing) return <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') commit(); if (event.key === 'Escape') setEditing(false) }} className="my-0.5 w-full rounded-lg border border-accent/40 bg-bg-tertiary px-2 py-1.5 text-[11px] text-text-primary outline-none" />

  return (
    <div className={`group relative flex items-center rounded-lg ${active ? 'bg-bg-hover text-text-primary' : 'text-text-muted hover:bg-bg-hover/60 hover:text-text-secondary'}`}>
      <button onClick={onSelect} className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-[11px]">{session.title || 'New task'}</button>
      {!!session.pinned && <Pin size={9} className="rotate-45" />}
      <button
        ref={triggerRef}
        onClick={() => setMenuRect((open) => (open ? null : triggerRef.current?.getBoundingClientRect() ?? null))}
        aria-label="Task options"
        aria-expanded={menuOpen}
        className={`mr-1 rounded p-0.5 transition-opacity hover:text-text-primary ${menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
      >
        <MoreHorizontal size={13} />
      </button>
      {menuRect && (
        <SessionMenu
          rect={menuRect}
          pinned={!!session.pinned}
          onClose={() => setMenuRect(null)}
          onPin={() => { onPin(); setMenuRect(null) }}
          onRename={() => { setEditing(true); setMenuRect(null) }}
          onDelete={() => { onDelete(); setMenuRect(null) }}
        />
      )}
    </div>
  )
}

/**
 * SessionMenu — the task row's Pin / Rename / Delete popover.
 *
 * Portalled to <body> and positioned from the trigger's viewport rect. Rendered
 * in place it sat outside the sidebar's right edge, which gave the sidebar a
 * horizontal scrollbar and let the menu scroll away from its own row.
 */
const SESSION_MENU_WIDTH = 128
const SESSION_MENU_HEIGHT = 108

function SessionMenu({ rect, pinned, onClose, onPin, onRename, onDelete }: {
  rect: DOMRect; pinned: boolean; onClose: () => void
  onPin: () => void; onRename: () => void; onDelete: () => void
}) {
  // Prefer opening to the right of the trigger; fall back to its left when
  // that would run past the window edge.
  const spillsRight = rect.right + 8 + SESSION_MENU_WIDTH > window.innerWidth - 8
  const left = spillsRight
    ? Math.max(8, rect.left - SESSION_MENU_WIDTH - 8)
    : rect.right + 8
  const top = Math.max(8, Math.min(rect.top, window.innerHeight - SESSION_MENU_HEIGHT - 8))

  return createPortal(
    <>
      <div className="fixed inset-0 z-[80]" onMouseDown={onClose} />
      <div
        role="menu"
        className="fixed z-[81] rounded-xl border border-border bg-bg-elevated p-1 shadow-pop animate-fade-in"
        style={{ top, left, width: SESSION_MENU_WIDTH }}
      >
        <button role="menuitem" onClick={onPin} className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-text-primary hover:bg-bg-hover">{pinned ? 'Unpin' : 'Pin'}</button>
        <button role="menuitem" onClick={onRename} className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-text-primary hover:bg-bg-hover">Rename</button>
        <button role="menuitem" onClick={onDelete} className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-error hover:bg-bg-hover">Delete</button>
      </div>
    </>, document.body,
  )
}

function FooterButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button onClick={onClick} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-text-muted transition-colors hover:bg-bg-hover hover:text-text-secondary">{icon}{label}</button>
}

function ProjectSkeleton() {
  return <div className="space-y-2 px-2 py-3">{[0, 1, 2].map((item) => <div key={item} className="h-9 rounded-xl shimmer" />)}</div>
}
