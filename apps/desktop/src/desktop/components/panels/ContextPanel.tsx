import React, { useEffect, useState } from 'react'
import { Brain, BookOpen, RefreshCw, Edit2, Save, X, ChevronDown, ChevronRight, Folder, FolderOpen, ExternalLink, Plus, ListChecks, Boxes } from 'lucide-react'
import { ipc, FileNode, MCPServerInfo } from '../../lib/ipc'
import { useSessionsStore } from '../../stores/sessions.store'
import { useAgentStore } from '../../stores/agent.store'
import { useProjectsStore } from '../../stores/projects.store'
import { useUIStore } from '../../stores/ui.store'
import { File } from 'lucide-react'

interface Props {
  projectId: string | null
  isSession?: boolean
  /** Oturum kimliği override — Code tabı activeCodeSessionId geçirir
   *  (sessions store'un activeSessionId'i cowork'e ait, Code'a değil). */
  sessionId?: string | null
}

export function ContextPanel({ projectId, isSession = false, sessionId }: Props) {
  return (
    <div className="py-3 px-4 flex flex-col gap-4">
      <MemorySection projectId={projectId} />
      {isSession ? (
        <>
          <PlanSection projectId={projectId} sessionId={sessionId} />
          <SkillsSection projectId={projectId} sessionId={sessionId} />
        </>
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
  // Proje yoksa yalnız global memory kapsamı kullanılabilir.
  const isGlobalChat = !projectId
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

// ─── Plan ────────────────────────────────────────────────────────────────────

function riskBadge(risk?: string): string {
  return risk === 'high' ? '🔴' : risk === 'medium' ? '🟡' : '🟢'
}

const PLAN_STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-500 border-amber-500/25',
  approved: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25',
  rejected: 'bg-red-500/15 text-red-500 border-red-500/25',
  modify: 'bg-blue-500/15 text-blue-500 border-blue-500/25',
}

function PlanSection({ projectId, sessionId }: { projectId: string | null; sessionId?: string | null }) {
  const { currentPlan, setCurrentPlan } = useAgentStore()
  const storeSessionId = useSessionsStore(s => s.activeSessionId)
  const activeSessionId = sessionId !== undefined ? sessionId : storeSessionId
  const [open, setOpen] = useState(true)

  // Plan her oturuma özel izole — task yapısı gibi. Oturum değişince başka
  // oturumun (bayat) canlı planını temizle ve bu oturumun disk planını yükle.
  useEffect(() => {
    let cancelled = false
    // Farklı oturuma ait plan store'da asılı kaldıysa hemen düşür.
    if (currentPlan && currentPlan.sessionId && currentPlan.sessionId !== activeSessionId) {
      setCurrentPlan(null)
    }
    async function load() {
      if (!projectId || !activeSessionId) return
      // Bu oturumun planı zaten yüklüyse tekrar okuma.
      if (currentPlan && currentPlan.sessionId === activeSessionId) return
      try {
        const persisted = await ipc.agent.getPlan(projectId, activeSessionId)
        if (!cancelled && persisted) {
          // Diskten gelen plan yalnız markdown taşır; panelde metin olarak gösterilir.
          setCurrentPlan({
            title: '', summary: '', steps: [], markdown: persisted.markdown,
            status: 'pending', sessionId: activeSessionId, createdAt: new Date().toISOString(),
          })
        }
      } catch { /* plan yoksa sorun değil */ }
    }
    load()
    return () => { cancelled = true }
  }, [projectId, activeSessionId])

  // Yalnız aktif oturuma ait planı göster (başka oturumun canlı planı sızmasın).
  const plan =
    currentPlan && (!currentPlan.sessionId || currentPlan.sessionId === activeSessionId)
      ? currentPlan
      : null
  if (!plan) {
    return (
      <div className="pt-4 border-t border-border-subtle">
        <div className="flex items-center gap-1.5 mb-2">
          <ListChecks size={12} className="text-text-muted flex-shrink-0" />
          <span className="text-2xs font-semibold text-text-muted uppercase tracking-wide">Plan</span>
        </div>
        <p className="text-2xs text-text-muted opacity-50 italic">
          Appears here when the agent calls <code className="font-mono text-accent/80">write_plan</code>.
        </p>
      </div>
    )
  }

  const hasStructuredSteps = plan.steps && plan.steps.length > 0

  return (
    <div className="pt-4 border-t border-border-subtle">
      <div className="flex items-center gap-2 mb-2">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1.5 flex-1 min-w-0">
          {open ? <ChevronDown size={11} className="text-text-muted flex-shrink-0" /> : <ChevronRight size={11} className="text-text-muted flex-shrink-0" />}
          <ListChecks size={12} className="text-text-muted flex-shrink-0" />
          <span className="text-2xs font-semibold text-text-muted uppercase tracking-wide">Plan</span>
        </button>
        <span className={`px-1.5 py-0.5 rounded text-2xs font-medium border ${PLAN_STATUS_STYLE[plan.status] ?? PLAN_STATUS_STYLE.pending}`}>
          {plan.status}
        </span>
      </div>

      {open && (
        <div className="bg-bg-tertiary/50 rounded-lg p-2.5">
          {plan.title ? <p className="text-xs font-semibold text-text-primary mb-0.5">{plan.title}</p> : null}
          {plan.summary ? <p className="text-2xs text-text-secondary mb-2 leading-relaxed">{plan.summary}</p> : null}
          {plan.estimated_duration ? (
            <p className="text-2xs text-text-muted mb-2">⏱ {plan.estimated_duration}</p>
          ) : null}

          {hasStructuredSteps ? (
            <ol className="flex flex-col gap-1.5">
              {plan.steps.map(s => (
                <li key={s.step} className="text-2xs text-text-secondary leading-relaxed">
                  <span className="text-text-muted">{s.step}.</span> {riskBadge(s.risk)} {s.description}
                  {s.files && s.files.length > 0 && (
                    <span className="block ml-4 mt-0.5 text-text-muted font-mono truncate">{s.files.join(', ')}</span>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <pre className="text-2xs text-text-secondary whitespace-pre-wrap leading-relaxed font-mono max-h-64 overflow-y-auto selectable">{plan.markdown}</pre>
          )}

          {plan.notes ? (
            <p className="text-2xs text-text-muted mt-2 pt-2 border-t border-border-subtle">📝 {plan.notes}</p>
          ) : null}

          {plan.status === 'pending' && (
            <div className="flex gap-1.5 mt-3 pt-2.5 border-t border-border-subtle/50">
              <button
                onClick={async () => {
                  await ipc.agent.answerQuestion(JSON.stringify({ kind: 'choice', selected: ['Go ahead'] }))
                }}
                className="flex-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-3xs font-medium transition-colors"
              >
                Approve
              </button>
              <button
                onClick={async () => {
                  await ipc.agent.answerQuestion(JSON.stringify({ kind: 'choice', selected: ['Modify plan'] }))
                }}
                className="px-2 py-1 border border-border-subtle text-text-secondary hover:bg-bg-hover hover:text-text-primary rounded text-3xs font-medium transition-colors"
              >
                Modify
              </button>
              <button
                onClick={async () => {
                  await ipc.agent.answerQuestion(JSON.stringify({ kind: 'choice', selected: ['Cancel'] }))
                }}
                className="px-2 py-1 border border-border-subtle text-error hover:bg-bg-hover rounded text-3xs font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Skills ──────────────────────────────────────────────────────────────────

function SkillsSection({ projectId, sessionId }: { projectId: string | null; sessionId?: string | null }) {
  const { messages } = useSessionsStore()
  const storeSessionId = useSessionsStore(s => s.activeSessionId)
  const activeSessionId = sessionId !== undefined ? sessionId : storeSessionId
  const { toolCalls, timelines } = useAgentStore()

  // Bu oturumda aktif olan (auto-load veya utilize_skill ile CONTEXT'e giren)
  // skill'ler. Session panelinde proje/genel skill kataloğu gösterilmez.
  const [contextSkills, setContextSkills] = useState<string[]>([])
  const [mcpServers, setMcpServers] = useState<MCPServerInfo[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        if (projectId && activeSessionId) {
          const ctx = await ipc.skills.context(projectId, activeSessionId)
          if (!cancelled) setContextSkills(ctx)
        } else if (!cancelled) {
          setContextSkills([])
        }
      } catch { /* context yoksa sorun değil */ }
      try {
        const servers = await ipc.mcp.list()
        if (!cancelled) setMcpServers(servers)
      } catch { /* MCP yoksa sorun değil */ }
    }
    load()
    return () => { cancelled = true }
  }, [projectId, activeSessionId, messages.length, toolCalls.length])

  const usedTools = new Set<string>()
  const usedSkills = new Set<string>()
  // Auto-load / utilize ile CONTEXT'e giren skill'ler de "aktif" sayılır.
  contextSkills.forEach(s => usedSkills.add(s))
  
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
  // Aktif skill var mı: utilize_skill çağrıldıysa VEYA CONTEXT'e skill girdiyse.
  const hasSkills = toolList.includes('utilize_skill') || skillList.length > 0

  // WP-5: tek-tek tool DÖKÜMÜ YOK. MCP tool'ları (mcp_<server>_<tool>) ait
  // oldukları sunucu altında sayaçla özetlenir; builtin tool'lar listelenmez.
  // Yalnız bu session'ın tool history'sinde kullanılan MCP'ler görünür.
  const mcpUsage = new Map<string, number>()
  const knownMcpNames = mcpServers.map(s => s.name).sort((a, b) => b.length - a.length)
  for (const tName of usedTools) {
    if (!tName.startsWith('mcp_')) continue
    const key = knownMcpNames.find(name => tName.startsWith(`mcp_${name}_`)) ?? tName.slice(4).split('_')[0]
    mcpUsage.set(key, (mcpUsage.get(key) ?? 0) + 1)
  }
  const mcpNames = Array.from(mcpUsage.keys()).sort()
  const hasMcp = mcpNames.length > 0

  if (!hasSkills && !hasMcp) {
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
          <p className="text-xs font-medium text-text-secondary mb-2">Active Skills</p>
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

      {hasMcp && (
        <div>
          <p className="text-xs font-medium text-text-secondary mb-2">MCP Servers</p>
          <div className="flex flex-wrap gap-2">
            {mcpNames.map(name => {
              const count = mcpUsage.get(name) ?? 0
              return (
                <span
                  key={name}
                  className="px-2 py-1 rounded bg-bg-tertiary text-text-secondary text-xs border border-border-subtle flex items-center gap-1.5"
                  title="Used this session"
                >
                  <Boxes size={12} className="text-text-muted" />
                  {name}
                  {count > 0 && <span className="text-text-muted">· {count}</span>}
                </span>
              )
            })}
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
            projectId && projectFolders.map(folder => (
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
