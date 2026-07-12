import React, { useEffect, useState, useMemo } from 'react'
import { File, ChevronRight, ChevronDown, ExternalLink } from 'lucide-react'
import { useProjectsStore } from '../../stores/projects.store'
import { useAgentStore } from '../../stores/agent.store'
import { ipc, FileNode, ProjectFolder } from '../../lib/ipc'
import { useUIStore } from '../../stores/ui.store'
import { useSessionsStore } from '../../stores/sessions.store'

interface Props { projectId: string | null }

export function WorkingFoldersPanel({ projectId }: Props) {
  const { folders, loadFolders, getActiveProject } = useProjectsStore()
  const { toolCalls, timelines, currentPlan } = useAgentStore()
  const activeSessionId = useSessionsStore(s => s.activeSessionId)
  const project = getActiveProject()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [persistedPlanPath, setPersistedPlanPath] = useState<string | null>(null)

  useEffect(() => {
    if (projectId) loadFolders(projectId)
  }, [projectId])

  const projectFolders = projectId ? (folders[projectId] ?? []) : []
  const planPath = useMemo(() => {
    if (!project?.workdir || !activeSessionId || activeSessionId === '__new__') return null
    return `${project.workdir.replace(/\/+$/, '')}/.cowrangler/plans/${activeSessionId}.md`
  }, [project?.workdir, activeSessionId])

  useEffect(() => {
    let cancelled = false
    async function loadPlanPath() {
      setPersistedPlanPath(null)
      if (!projectId || !activeSessionId || activeSessionId === '__new__' || !planPath) return
      try {
        const plan = await ipc.agent.getPlan(projectId, activeSessionId)
        if (!cancelled && plan) setPersistedPlanPath(planPath)
      } catch { /* plan yoksa sorun değil */ }
    }
    loadPlanPath()
    return () => { cancelled = true }
  }, [projectId, activeSessionId, planPath])

  const activePlanPath =
    currentPlan?.sessionId === activeSessionId && planPath ? planPath : persistedPlanPath
  const visibleFolders = useMemo(() => {
    if (!activePlanPath || !project?.workdir) return projectFolders
    const normalizedPlan = activePlanPath.replace(/\/+$/, '')
    const containsPlan = projectFolders.some(folder => {
      const root = folder.folder_path.replace(/\/+$/, '')
      return normalizedPlan === root || normalizedPlan.startsWith(`${root}/`)
    })
    if (containsPlan) return projectFolders
    const synthetic: ProjectFolder = {
      id: '__project_workdir__',
      project_id: projectId ?? '',
      folder_path: project.workdir,
      label: null,
      added_at: 0,
    }
    return [...projectFolders, synthetic]
  }, [activePlanPath, project?.workdir, projectFolders, projectId])

  // Extract all file paths from tool arguments that the agent has interacted with
  const { messages } = useSessionsStore()
  const touchedFiles = useMemo(() => {
    const paths = new Set<string>()

    const FILE_TOOLS = new Set([
      'read_file',
      'write_file',
      'edit_file',
      'apply_patch',
      'append_to_file',
      'create_folder',
      'move_item',
      'delete_file',
      'file_info',
      'view_file',
      'replace_file_content',
      'multi_replace_file_content',
      'write_to_file',
    ])

    if (activePlanPath) paths.add(activePlanPath)

    const scanArgs = (obj: any, parentKey?: string, toolName?: string) => {
      // If we know the tool name, and it's not a file manipulation tool, skip it.
      // This prevents 'grep_search', 'run_command', 'ls', etc. from polluting the working folders.
      if (toolName && !FILE_TOOLS.has(toolName)) return

      if (!obj) return
      if (typeof obj === 'string') {
        let val = obj
        try {
          const parsed = JSON.parse(val)
          if (typeof parsed === 'object' && parsed !== null) {
            scanArgs(parsed, parentKey, toolName)
            return
          }
        } catch(e) {}

        if (val.startsWith('file://')) val = val.substring(7)
        val = val.trim().replace(/^"|"$/g, '')
        if (val.includes('\n')) return
        if (val.length > 255) return
        if (val === '.' || val === './' || val.includes('*')) return

        const isPathKey = parentKey && /path|file|dir|cwd/i.test(parentKey)

        if (isPathKey || val.startsWith('/') || val.match(/^[a-zA-Z]:[\\/]/)) {
          paths.add(val)
        }
      } else if (Array.isArray(obj)) {
        obj.forEach(item => scanArgs(item, parentKey, toolName))
      } else if (typeof obj === 'object') {
        Object.entries(obj).forEach(([key, value]) => scanArgs(value, key, toolName))
      }
    }

    // Check active tool calls
    toolCalls.forEach(c => scanArgs(c.args, undefined, c.name))

    // Check timeline tool calls
    Object.values(timelines).forEach(segments => {
      segments.forEach(seg => {
        if (seg.kind === 'tools') {
          seg.calls.forEach(c => scanArgs(c.args, undefined, c.name))
        }
      })
    })

    // Check messages just in case
    messages.forEach(m => {
      if (m.role === 'tool_call' && m.content) {
        try { scanArgs(JSON.parse(m.content), undefined, m.tool_name ?? undefined) } catch {}
      } else if (m.role === 'assistant' && m.content) {
        try { scanArgs(JSON.parse(m.content)) } catch {} // fallback if plain text has tool calls embedded somehow
      }
    })

    return Array.from(paths)
  }, [toolCalls, timelines, messages, activePlanPath])

  // Build a virtual file tree for each root folder based ONLY on touched files
  const trees = useMemo(() => {
    const newTrees: Record<string, FileNode[]> = {}

    visibleFolders.forEach(folder => {
      // normalize rootPath
      let rootPath = folder.folder_path.replace(/\/+$/, '')
      let rootName = rootPath.split('/').pop() || ''
      
      const rootNode: FileNode = { name: 'root', path: rootPath, type: 'directory', children: [] }

      // Filter touched files that belong to this root folder, translating relative paths to absolute
      const relevantFiles = touchedFiles.map(f => {
        if (f.startsWith(rootPath + '/') || f === rootPath) return f
        
        // If relative path starts with folder name (e.g. "VibeCap/Views/...")
        if (rootName && f.startsWith(rootName + '/')) {
          return rootPath + '/' + f.substring(rootName.length + 1)
        }
        
        // If it's a relative path (doesn't start with / or C:\)
        if (!f.startsWith('/') && !f.match(/^[a-zA-Z]:[\\/]/)) {
          return rootPath + '/' + f
        }
        
        return null
      }).filter(Boolean) as string[]

      relevantFiles.forEach(filePath => {
        if (filePath === rootPath) return // Root itself

        const relativePath = filePath.substring(rootPath.length + 1)
        const parts = relativePath.split('/')
        
        let currentNode = rootNode
        let currentPath = rootPath

        parts.forEach((part, index) => {
          currentPath = `${currentPath}/${part}`
          const isFile = index === parts.length - 1 // Assume last part is a file (unless it's a directory tool, but this is a virtual view)
          
          if (!currentNode.children) currentNode.children = []
          
          let nextNode = currentNode.children.find(c => c.name === part)
          if (!nextNode) {
            nextNode = {
              name: part,
              path: currentPath,
              type: isFile ? 'file' : 'directory',
              children: isFile ? undefined : []
            }
            currentNode.children.push(nextNode)
          }
          
          // If a subsequent path reveals this was actually a directory, ensure it acts like one
          if (!isFile && nextNode.type === 'file') {
            nextNode.type = 'directory'
            nextNode.children = []
          }

          currentNode = nextNode
        })
      })

      newTrees[folder.folder_path] = rootNode.children || []
    })

    return newTrees
  }, [visibleFolders, touchedFiles])

  function toggleFolder(folderPath: string) {
    setExpanded(e => ({ ...e, [folderPath]: !e[folderPath] }))
  }

  return (
    <div className="py-2 pb-3">
      {visibleFolders.length === 0 ? (
        <div className="flex flex-col gap-2 text-center py-2">
          <p className="text-xs text-text-muted">No folders added.</p>
          <p className="text-2xs text-text-muted/60 px-4">Go to Project Home to manage Working Folders.</p>
        </div>
      ) : (
        <div className="flex flex-col">
          {visibleFolders.map(folder => {
            const hasTouchedFiles = trees[folder.folder_path] && trees[folder.folder_path].length > 0
            return (
              <div key={folder.id}>
                {/* Folder header */}
                <div className="flex items-center gap-2 group cursor-pointer py-1.5 hover:bg-bg-hover/50 px-3 transition-colors">
                  <button onClick={() => toggleFolder(folder.folder_path)} className="flex items-center gap-2 flex-1 min-w-0">
                    {expanded[folder.folder_path]
                      ? <ChevronDown size={14} className="text-text-muted flex-shrink-0" />
                      : <ChevronRight size={14} className="text-text-muted flex-shrink-0" />
                    }
                    <span className="text-xs font-medium text-text-secondary truncate">
                      {folder.folder_path.split('/').pop() || folder.folder_path}
                    </span>
                  </button>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => ipc.fs.openInFinder(folder.folder_path)}
                      className="p-0.5 text-text-muted hover:text-text-secondary"
                      title="Open in Finder"
                    >
                      <ExternalLink size={10} />
                    </button>
                  </div>
                </div>

                {/* File tree */}
                {expanded[folder.folder_path] && (
                  <div className="ml-2">
                    {!hasTouchedFiles ? (
                      <p className="text-2xs text-text-muted italic py-1 pl-6">No files touched yet.</p>
                    ) : (
                      trees[folder.folder_path].map(node => (
                        <FileTreeNode key={node.path} node={node} depth={0} />
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function FileTreeNode({ node, depth }: { node: FileNode; depth: number }) {
  const [open, setOpen] = useState(true) // Auto-open virtual directories
  const { setPreviewFile } = useUIStore()
  const children = node.children ?? []

  function toggle() {
    if (node.type === 'file') {
      setPreviewFile(node.path)
      return
    }
    setOpen(!open)
  }

  const indent = depth * 12

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5 pr-2 rounded hover:bg-bg-hover/50 cursor-pointer group transition-colors"
        style={{ paddingLeft: `${indent + 12}px` }}
        onClick={toggle}
      >
        {node.type === 'directory' && (
          <>{open ? <ChevronDown size={14} className="text-text-muted flex-shrink-0" /> : <ChevronRight size={14} className="text-text-muted flex-shrink-0" />}</>
        )}
        {node.type === 'file' && (
          <File size={14} className="text-text-muted flex-shrink-0" />
        )}
        <span className="text-[13px] text-text-secondary truncate group-hover:text-text-primary transition-colors">
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
