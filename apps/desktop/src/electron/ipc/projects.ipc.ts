import { IpcMain, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { getProjectDB, CreateProjectInput } from '../project_db.js'
import { projectStoreDirFor } from '@cowrangler/core/project_context.js'
import { getSessionDB } from '@cowrangler/core/session_db.js'

export function registerProjectsIPC(ipcMain: IpcMain): void {
  const db = getProjectDB()

  ipcMain.handle('projects:list', async () => db.list())

  ipcMain.handle('projects:get', async (_, id: string) => db.get(id))

  ipcMain.handle('projects:create', async (_, input: CreateProjectInput) => {
    const project = db.create(input)
    if (project.workdir) db.addFolder(project.id, project.workdir, 'Primary source')
    return db.get(project.id) ?? project
  })

  // Backwards-compatible method. Code projects are local-folder backed now;
  // never create a surprise directory when a project has no source folder.
  ipcMain.handle('projects:ensureWorkdir', async (_, id: string) => {
    return db.get(id)
  })

  ipcMain.handle('projects:update', async (_, id: string, data: any) => {
    db.update(id, data)
    return db.get(id)
  })

  ipcMain.handle('projects:delete', async (_, id: string) => {
    const project = db.get(id)
    const projectFolders = db.getFolders(id)
    const sessionIds = db.getSessionIds(id)
    const sessionDB = getSessionDB()
    for (const sessionId of sessionIds) {
      try { sessionDB.deleteSession(sessionId) } catch { /* best-effort cleanup */ }
    }
    db.delete(id)
    // Remove machine-local agent state, never the user's source folder.
    const supportRoots = new Set(projectFolders.map(folder => folder.folder_path))
    if (project?.workdir) supportRoots.add(project.workdir)
    for (const root of supportRoots) {
      try { fs.rmSync(projectStoreDirFor(root), { recursive: true, force: true }) } catch { /* best effort */ }
    }
    return { ok: true }
  })

  ipcMain.handle('projects:reveal', async (_, id: string) => {
    const project = db.get(id)
    if (!project?.workdir || !fs.existsSync(project.workdir)) {
      return { ok: false, error: 'Project folder is not available on this machine.' }
    }
    await shell.openPath(project.workdir)
    return { ok: true }
  })

  ipcMain.handle('projects:addFolder', async (_, id: string, folderPath: string) => {
    return db.addFolder(id, folderPath)
  })

  ipcMain.handle('projects:removeFolder', async (_, id: string, folderPath: string) => {
    db.removeFolder(id, folderPath)
    return { ok: true }
  })

  ipcMain.handle('projects:setPrimaryFolder', async (_, id: string, folderPath: string) => {
    const folder = db.setPrimaryFolder(id, folderPath)
    return folder ? { ok: true, folder, project: db.get(id) } : { ok: false, error: 'Folder does not belong to this project.' }
  })

  ipcMain.handle('projects:resolveFile', async (_, id: string, reference: string) => {
    const cleaned = String(reference ?? '').trim().replace(/^file:\/\//, '').replace(/^['"`]|['"`]$/g, '')
    if (!cleaned) return { ok: false, error: 'Empty file reference.' }
    const roots = db.getFolders(id).map(folder => path.resolve(folder.folder_path))
    const isWithin = (root: string, candidate: string) => {
      const relative = path.relative(root, candidate)
      return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
    }
    const candidates = path.isAbsolute(cleaned)
      ? [path.resolve(cleaned)]
      : roots.map(root => path.resolve(root, cleaned.replace(/^\.\//, '')))
    for (const candidate of candidates) {
      if (!roots.some(root => isWithin(root, candidate))) continue
      try {
        if (fs.statSync(candidate).isFile()) return { ok: true, path: candidate }
      } catch { /* try next workspace */ }
    }
    return { ok: false, error: 'File was not found in this project.' }
  })

  ipcMain.handle('projects:getFolders', async (_, id: string) => {
    return db.getFolders(id)
  })

  ipcMain.handle('projects:getInstructions', async (_, id: string) => {
    return db.getInstructions(id)
  })

  ipcMain.handle('projects:setInstructions', async (_, id: string, content: string) => {
    db.setInstructions(id, content)
    return { ok: true }
  })

  ipcMain.handle('projects:outputs', async (_, id: string) => {
    const project = db.get(id)
    if (!project?.workdir) return []

    const outputExts = ['.md', '.pdf', '.docx', '.xlsx', '.pptx', '.txt', '.json', '.csv', '.png', '.jpg', '.jpeg']
    const outputs = new Map<string, { name: string; path: string; ext: string; mtime: number }>()
    const roots = db.getFolders(id).map(folder => folder.folder_path)
    if (!roots.includes(project.workdir)) roots.unshift(project.workdir)

    for (const root of roots) {
      const cowranglerDir = path.join(root, '.cowrangler')
      try {
        if (fs.existsSync(cowranglerDir)) {
          const files = fs.readdirSync(cowranglerDir)
          for (const f of files) {
            const ext = path.extname(f).toLowerCase()
            if (outputExts.includes(ext)) {
              const filePath = path.join(cowranglerDir, f)
              const stat = fs.statSync(filePath)
              outputs.set(filePath, { name: f, path: filePath, ext, mtime: stat.mtimeMs })
            }
          }
        }

        const rootFiles = fs.readdirSync(root)
        for (const f of rootFiles) {
          const ext = path.extname(f).toLowerCase()
          if (['.md', '.txt'].includes(ext) && !f.startsWith('.')) {
            const filePath = path.join(root, f)
            const stat = fs.statSync(filePath)
            if (stat.isFile()) outputs.set(filePath, { name: f, path: filePath, ext, mtime: stat.mtimeMs })
          }
        }
      } catch {
        // One unavailable secondary folder must not hide outputs from the rest.
      }
    }

    return [...outputs.values()].sort((a, b) => b.mtime - a.mtime).slice(0, 20)
  })
}
