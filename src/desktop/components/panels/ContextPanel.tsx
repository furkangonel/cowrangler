import React, { useEffect, useState } from 'react'
import { Brain, BookOpen, RefreshCw, Edit2, Save, X, ChevronDown, ChevronRight, Folder, FolderOpen, ExternalLink, Plus } from 'lucide-react'
import { ipc, FileNode } from '../../lib/ipc'
import { useSessionsStore } from '../../stores/sessions.store'
import { useAgentStore } from '../../stores/agent.store'
import { useProjectsStore } from '../../stores/projects.store'
import { useUIStore } from '../../stores/ui.store'
import { File } from 'lucide-react'
import { GLOBAL_PROJECT_ID } from '../session/GlobalChatView'

interface Props {
  projectId: string | null
  isSession?: boolean
}

export function ContextPanel({ projectId, isSession = false }: Props) {
  return (
    <div className="py-3 px-4 flex flex-col gap-4">
      <MemorySection projectId={projectId} />
      {isSession ? (
        <SkillsSection />
      ) : (
        <WorkingFoldersManager projectId={projectId} />
      )}
    </div>
  )
}

// ─── Memory ──────────────────────────────────────────────────────────────────

function MemorySection({ projectId }: { projectId: string | null }) {
  const [content, setContent] = useState('')
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(true)
  const isGlobalChat = !projectId || projectId === GLOBAL_PROJECT_ID
  const [mode, setMode] = useState<'project' | 'global'>(isGlobalChat ? 'global' : 'project')

  async function load() {
    setLoading(true)
    try {
      const text = mode === 'global'
        ? await ipc.memory.readGlobal()
        : projectId && !isGlobalChat ? await ipc.memory.readProject(projectId) : ''
      setContent(text)
      setDraft(text)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(); setEditing(false) }, [projectId, mode])

  async function save() {
    setSaving(true)
    try {
      if (mode === 'global') await ipc.memory.writeGlobal(draft)
      else if (projectId && !isGlobalChat) await ipc.memory.writeProject(projectId, draft)
      setContent(draft)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-2 mb-2">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1.5 flex-1 min-w-0">
          {open ? <ChevronDown size={11} className="text-text-muted flex-shrink-0" /> : <ChevronRight size={11} className="text-text-muted flex-shrink-0" />}
          <Brain size={12} className="text-text-muted flex-shrink-0" />
          <span className="text-2xs font-semibold text-text-muted uppercase tracking-wide">Memory</span>
        </button>
        <div className="flex items-center gap-0.5">
          <button onClick={load} className="p-0.5 text-text-muted hover:text-text-secondary transition-colors rounded">
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
          </button>
          {!editing ? (
            <button onClick={() => { setDraft(content); setEditing(true); setOpen(true) }}
              className="p-0.5 text-text-muted hover:text-accent transition-colors rounded">
              <Edit2 size={10} />
            </button>
          ) : (
            <>
              <button onClick={() => setEditing(false)} className="p-0.5 text-text-muted rounded"><X size={10} /></button>
              <button onClick={save} disabled={saving} className="p-0.5 text-accent rounded"><Save size={10} /></button>
            </>
          )}
        </div>
      </div>

      {open && (
        <>
          {/* Mode toggle */}
          <div className="flex gap-1 mb-2">
            {(['project', 'global'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                disabled={m === 'project' && (!projectId || isGlobalChat)}
                className={`px-2 py-0.5 rounded text-2xs font-medium transition-colors disabled:opacity-40 ${
                  mode === m ? 'bg-accent/20 text-accent' : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover'
                }`}
              >
                {m === 'global' ? 'Global' : 'Project'}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-2xs text-text-muted">Loading…</p>
          ) : editing ? (
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={6}
              className="w-full bg-bg-tertiary border border-border rounded-lg p-2.5 text-2xs text-text-primary placeholder-text-muted resize-none focus:border-accent transition-colors font-mono"
              placeholder="The agent references these notes…"
            />
          ) : content ? (
            <div className="text-2xs text-text-secondary whitespace-pre-wrap leading-relaxed font-mono bg-bg-tertiary/50 rounded-lg p-2.5 max-h-40 overflow-y-auto selectable">
              {content}
            </div>
          ) : (
            <p className="text-2xs text-text-muted opacity-50 italic">
              Appears here when the agent calls <code className="font-mono text-accent/80">manage_memory</code>.
            </p>
          )}
        </>
      )}
    </div>
  )
}

// ─── Skills ──────────────────────────────────────────────────────────────────

function SkillsSection() {
  const { messages } = useSessionsStore()
  const { toolCalls, timelines } = useAgentStore()
  
  const usedTools = new Set<string>()
  const usedSkills = new Set<string>()
  
  // Extract tools and skills from DB messages (role is 'tool_call', not 'tool')
  messages.forEach(m => {
    if (m.role === 'tool_call' && m.tool_name) {
      usedTools.add(m.tool_name)
      if (m.tool_name === 'utilize_skill') {
        try {
          const args = JSON.parse(m.content)
          const skillName = args?.skill_name || args?.skillId
          if (skillName && typeof skillName === 'string') {
            usedSkills.add(skillName)
          }
        } catch {}
      }
    }
  })
  
  // Extract from timelines
  Object.values(timelines).forEach(segments => {
    segments.forEach(seg => {
      if (seg.kind === 'tools') {
        seg.calls.forEach(c => {
          usedTools.add(c.name)
          if (c.name === 'utilize_skill') {
            const skillName = c.args?.skill_name || c.args?.skillId
            if (skillName && typeof skillName === 'string') {
              usedSkills.add(skillName)
            }
          }
        })
      }
    })
  })
  
  // Extract from active tool calls
  toolCalls.forEach(c => {
    usedTools.add(c.name)
    if (c.name === 'utilize_skill') {
      const skillName = c.args?.skill_name || c.args?.skillId
      if (skillName && typeof skillName === 'string') {
        usedSkills.add(skillName)
      }
    }
  })

  const toolList = Array.from(usedTools).sort()
  const skillList = Array.from(usedSkills).sort()
  const hasSkills = toolList.includes('utilize_skill')
  const displayTools = toolList.filter(t => t !== 'utilize_skill' && t !== 'send_message')

  if (!hasSkills && displayTools.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 py-2 opacity-60 pt-4 border-t border-border-subtle">
        <div className="flex gap-1 mb-1">
          <svg width="80" height="48" viewBox="0 0 80 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-text-muted">
            <rect x="0.5" y="12.5" width="24" height="24" rx="3.5" stroke="currentColor" strokeDasharray="2 2"/>
            <rect x="6" y="18" width="13" height="2" rx="1" fill="currentColor"/>
            <rect x="6" y="23" width="13" height="2" rx="1" fill="currentColor"/>
            <rect x="6" y="28" width="9" height="2" rx="1" fill="currentColor"/>
            
            <rect x="28.5" y="4.5" width="28" height="32" rx="3.5" stroke="currentColor"/>
            <path d="M28.5 14.5H56.5" stroke="currentColor"/>
            <circle cx="34" cy="9.5" r="1.5" fill="currentColor"/>
            <circle cx="39" cy="9.5" r="1.5" fill="currentColor"/>
            
            <rect x="44.5" y="24.5" width="35" height="23" rx="3.5" stroke="currentColor" strokeDasharray="2 2"/>
            <circle cx="62" cy="36" r="4" stroke="currentColor"/>
            <path d="M59 36H65M62 33V39" stroke="currentColor"/>
          </svg>
        </div>
        <p className="text-xs text-text-muted">
          Track tools and referenced files used in this task.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4 pt-4 border-t border-border-subtle">
      {hasSkills && (
        <div>
          <p className="text-xs font-medium text-text-secondary mb-2">Used Skills</p>
          <div className="flex flex-wrap gap-2">
            {skillList.length > 0 ? (
              skillList.map(skill => (
                <span key={skill} className="px-2 py-1 rounded bg-accent/10 text-accent text-xs border border-accent/20 flex items-center gap-1.5">
                  <BookOpen size={12} />
                  {skill}
                </span>
              ))
            ) : (
              <span className="px-2 py-1 rounded bg-accent/10 text-accent text-xs border border-accent/20 flex items-center gap-1.5">
                <BookOpen size={12} />
                Skill System Active
              </span>
            )}
          </div>
        </div>
      )}
      
      {displayTools.length > 0 && (
        <div>
          <p className="text-xs font-medium text-text-secondary mb-2">Tools & MCPs Invoked</p>
          <div className="flex flex-wrap gap-2">
            {displayTools.map(t => (
              <span key={t} className="px-2 py-1 rounded bg-bg-tertiary text-text-secondary text-xs border border-border-subtle">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Working Folders Manager (Project Home Only) ─────────────────────────────

function WorkingFoldersManager({ projectId }: { projectId: string | null }) {
  const { folders, loadFolders, removeFolder } = useProjectsStore()
  const [open, setOpen] = useState(true)

  useEffect(() => {
    if (projectId) loadFolders(projectId)
  }, [projectId])

  const projectFolders = projectId ? (folders[projectId] ?? []) : []

  async function addFolder() {
    if (!projectId) return
    const path = await ipc.fs.pickFolder()
    if (path) await useProjectsStore.getState().addFolder(projectId, path)
  }

  return (
    <div className="pt-4 border-t border-border-subtle">
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1.5">
          {open ? <ChevronDown size={11} className="text-text-muted flex-shrink-0" /> : <ChevronRight size={11} className="text-text-muted flex-shrink-0" />}
          <FolderOpen size={12} className="text-text-muted flex-shrink-0" />
          <span className="text-2xs font-semibold text-text-muted uppercase tracking-wide">Working Folders</span>
        </button>
        <button onClick={addFolder} className="p-0.5 text-text-muted hover:text-accent transition-colors rounded">
          <Plus size={12} />
        </button>
      </div>

      {open && (
        <div className="flex flex-col">
          {projectFolders.length === 0 ? (
            <p className="text-2xs text-text-muted py-1 italic">No folders added yet.</p>
          ) : (
            projectFolders.map(folder => (
              <ProjectHomeFolderItem key={folder.id} folder={folder} projectId={projectId} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

function ProjectHomeFolderItem({ folder, projectId }: { folder: any, projectId: string }) {
  const { removeFolder } = useProjectsStore()
  const [expanded, setExpanded] = useState(false)
  const [tree, setTree] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(false)

  async function toggle() {
    if (!expanded && tree.length === 0) {
      setLoading(true)
      try {
        const res = await ipc.fs.fileTree(folder.folder_path, 2)
        setTree(res)
      } finally {
        setLoading(false)
      }
    }
    setExpanded(!expanded)
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 group py-1.5 hover:bg-bg-hover/50 px-1.5 rounded transition-colors cursor-pointer" onClick={toggle}>
        {expanded ? <ChevronDown size={12} className="text-text-muted flex-shrink-0" /> : <ChevronRight size={12} className="text-text-muted flex-shrink-0" />}
        <span className="text-xs font-medium text-text-secondary truncate flex-1" title={folder.folder_path}>
          {folder.folder_path.split('/').pop() || folder.folder_path}
        </span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); ipc.fs.openInFinder(folder.folder_path) }}
            className="p-1 text-text-muted hover:text-text-secondary rounded"
            title="Open in Finder"
          >
            <ExternalLink size={10} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); removeFolder(projectId, folder.folder_path) }}
            className="p-1 text-text-muted hover:text-error rounded"
            title="Remove"
          >
            <X size={10} />
          </button>
        </div>
      </div>
      
      {expanded && (
        <div className="ml-2 border-l border-border-subtle pl-1 mt-1 mb-1">
          {loading ? (
            <p className="text-2xs text-text-muted italic py-1 pl-4">Loading...</p>
          ) : tree.length === 0 ? (
            <p className="text-2xs text-text-muted italic py-1 pl-4">Empty folder</p>
          ) : (
            tree.map(node => (
              <FileTreeNode key={node.path} node={node} depth={0} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

function FileTreeNode({ node, depth }: { node: FileNode; depth: number }) {
  const [open, setOpen] = useState(false)
  const { setPreviewFile } = useUIStore()
  const children = node.children ?? []

  function toggle() {
    if (node.type === 'file') {
      setPreviewFile(node.path)
      return
    }
    setOpen(!open)
  }

  const indent = depth * 10

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1 pr-2 rounded hover:bg-bg-hover/50 cursor-pointer group transition-colors"
        style={{ paddingLeft: `${indent + 8}px` }}
        onClick={toggle}
      >
        {node.type === 'directory' && (
          <>{open ? <ChevronDown size={12} className="text-text-muted flex-shrink-0" /> : <ChevronRight size={12} className="text-text-muted flex-shrink-0" />}</>
        )}
        {node.type === 'file' && (
          <File size={12} className="text-text-muted flex-shrink-0" />
        )}
        <span className="text-[12px] text-text-secondary truncate group-hover:text-text-primary transition-colors">
          {node.name}
        </span>
        {node.type === 'file' && (
          <button 
            onClick={(e) => { e.stopPropagation(); ipc.fs.openInFinder(node.path) }}
            className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-text-secondary ml-auto transition-opacity"
            title="Open in Finder"
          >
            <ExternalLink size={9} />
          </button>
        )}
      </div>
      {open && children.length > 0 && (
        <div>
          {children.map(child => (
            <FileTreeNode key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}
