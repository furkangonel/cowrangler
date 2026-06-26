import React, { useEffect, useState } from 'react'
import { Plus, Folder, FolderOpen, File, ChevronRight, ChevronDown, ExternalLink, X } from 'lucide-react'
import { useProjectsStore } from '../../stores/projects.store'
import { ipc, FileNode } from '../../lib/ipc'

interface Props { projectId: string | null }

export function WorkingFoldersPanel({ projectId }: Props) {
  const { folders, loadFolders, removeFolder } = useProjectsStore()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [trees, setTrees] = useState<Record<string, FileNode[]>>({})

  useEffect(() => {
    if (projectId) loadFolders(projectId)
  }, [projectId])

  const projectFolders = projectId ? (folders[projectId] ?? []) : []

  async function addFolder() {
    if (!projectId) return
    const path = await ipc.fs.pickFolder()
    if (path) await useProjectsStore.getState().addFolder(projectId, path)
  }

  async function loadTree(folderPath: string) {
    if (trees[folderPath]) return
    const nodes = await ipc.fs.fileTree(folderPath, 2)
    setTrees(t => ({ ...t, [folderPath]: nodes }))
  }

  function toggleFolder(folderPath: string) {
    const next = !expanded[folderPath]
    setExpanded(e => ({ ...e, [folderPath]: next }))
    if (next) loadTree(folderPath)
  }

  return (
    <div className="py-2 pb-3">
      {projectFolders.length === 0 ? (
        <div className="flex flex-col gap-2 text-center py-2">
          <p className="text-xs text-text-muted">No folders added.</p>
          <button
            onClick={addFolder}
            className="text-xs text-accent hover:underline"
          >
            + Add folder
          </button>
        </div>
      ) : (
        <div className="flex flex-col">
          {projectFolders.map(folder => (
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
                  <button
                    onClick={() => projectId && removeFolder(projectId, folder.folder_path)}
                    className="p-0.5 text-text-muted hover:text-error"
                    title="Remove"
                  >
                    <X size={10} />
                  </button>
                </div>
              </div>

              {/* File tree */}
              {expanded[folder.folder_path] && trees[folder.folder_path] && (
                <div className="ml-2">
                  {trees[folder.folder_path].map(node => (
                    <FileTreeNode key={node.path} node={node} depth={0} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import { useUIStore } from '../../stores/ui.store'

function FileTreeNode({ node, depth }: { node: FileNode; depth: number }) {
  const [open, setOpen] = useState(false)
  const [children, setChildren] = useState<FileNode[]>(node.children ?? [])
  const { setPreviewFile } = useUIStore()

  async function toggle() {
    if (node.type === 'file') {
      setPreviewFile(node.path)
      return
    }
    if (!open && node.children === undefined) {
      const nodes = await ipc.fs.fileTree(node.path, 1)
      setChildren(nodes)
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
