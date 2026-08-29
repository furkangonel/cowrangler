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
    const sessionIds = db.getSessionIds(id)
    const sessionDB = getSessionDB()
    for (const sessionId of sessionIds) {
      try { sessionDB.deleteSession(sessionId) } catch { /* best-effort cleanup */ }
    }
    db.delete(id)
    // Remove machine-local agent state, never the user's source folder.
    if (project?.workdir) {
      try { fs.rmSync(projectStoreDirFor(project.workdir), { recursive: true, force: true }) } catch { /* best effort */ }
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
    const folder = db.addFolder(id, folderPath)
    const project = db.get(id)
    if (project && !project.workdir) db.update(id, { workdir: folderPath })
    return folder
  })

  ipcMain.handle('projects:removeFolder', async (_, id: string, folderPath: string) => {
    db.removeFolder(id, folderPath)
    const project = db.get(id)
    if (project?.workdir === folderPath) {
      const next = db.getFolders(id)[0]?.folder_path ?? null
      db.update(id, { workdir: next })
    }
    return { ok: true }
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
    const outputs: Array<{ name: string; path: string; ext: string; mtime: number }> = []

    const cowranglerDir = path.join(project.workdir, '.cowrangler')

    try {
      if (fs.existsSync(cowranglerDir)) {
        const files = fs.readdirSync(cowranglerDir)
        for (const f of files) {
          const ext = path.extname(f).toLowerCase()
          if (outputExts.includes(ext)) {
            const filePath = path.join(cowranglerDir, f)
            const stat = fs.statSync(filePath)
            outputs.push({ name: f, path: filePath, ext, mtime: stat.mtimeMs })
          }
        }
      }

      const rootFiles = fs.readdirSync(project.workdir)
      for (const f of rootFiles) {
        const ext = path.extname(f).toLowerCase()
        if (['.md', '.txt'].includes(ext) && !f.startsWith('.')) {
          const filePath = path.join(project.workdir, f)
          const stat = fs.statSync(filePath)
          outputs.push({ name: f, path: filePath, ext, mtime: stat.mtimeMs })
        }
      }
    } catch {
      // dizin okunamıyorsa boş döndür
    }

    return outputs.sort((a, b) => b.mtime - a.mtime).slice(0, 20)
  })
}
