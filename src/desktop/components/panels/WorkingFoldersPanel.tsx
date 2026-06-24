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
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-text-primary">Context</h3>
        <button
          onClick={addFolder}
          className="p-1 text-text-muted hover:text-accent transition-colors rounded"
          title="Add folder"
        >
          <Plus size={13} />
        </button>
      </div>

      {projectFolders.length === 0 ? (
        <div className="flex flex-col gap-2 text-center py-4">
          <span className="text-2xl opacity-40">📂</span>
          <p className="text-xs text-text-muted">No folders added yet.</p>
          <button
            onClick={addFolder}
            className="text-xs text-accent hover:text-accent-hover transition-colors"
          >
            + Add folder
          </button>
        </div>
      ) : (
        <div>
          <p className="text-2xs text-text-muted uppercase tracking-wide mb-2 font-medium">On your computer</p>
          {projectFolders.map(folder => (
            <div key={folder.id} className="mb-2">
              {/* Folder header */}
              <div className="flex items-center gap-1.5 group cursor-pointer py-1 hover:bg-bg-hover rounded px-1 transition-colors">
                <button onClick={() => toggleFolder(folder.folder_path)} className="flex items-center gap-1.5 flex-1 min-w-0">
                  {expanded[folder.folder_path]
                    ? <ChevronDown size={11} className="text-text-muted flex-shrink-0" />
                    : <ChevronRight size={11} className="text-text-muted flex-shrink-0" />
                  }
                  <FolderOpen size={12} className="text-accent flex-shrink-0" />
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
                <div className="ml-4 mt-0.5">
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
        className="flex items-center gap-1.5 py-0.5 px-1 rounded hover:bg-bg-hover cursor-pointer group transition-colors"
        style={{ paddingLeft: `${indent + 4}px` }}
        onClick={toggle}
      >
        {node.type === 'directory' ? (
          <>
            {open ? <ChevronDown size={10} className="text-text-muted flex-shrink-0" /> : <ChevronRight size={10} className="text-text-muted flex-shrink-0" />}
            <Folder size={11} className="text-yellow-500/70 flex-shrink-0" />
          </>
        ) : (
          <>
            <span className="w-2.5 flex-shrink-0" />
            <File size={11} className="text-text-muted flex-shrink-0" />
          </>
        )}
        <span className="text-2xs text-text-secondary truncate group-hover:text-text-primary transition-colors">
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
