import { IpcMain } from 'electron'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { getProjectDB } from '../project_db.js'

const GLOBAL_DIR = path.join(os.homedir(), '.cowrangler')
const GLOBAL_MEMORY_FILE = path.join(GLOBAL_DIR, 'memory.md')
const TODO_FILE = path.join(GLOBAL_DIR, 'AGENT_TODO.md')

export function registerMemoryIPC(ipcMain: IpcMain): void {
  // Global memory (~/.cowrangler/memory.md)
  ipcMain.handle('memory:readGlobal', async () => {
    try {
      if (!fs.existsSync(GLOBAL_MEMORY_FILE)) return ''
      return fs.readFileSync(GLOBAL_MEMORY_FILE, 'utf-8')
    } catch { return '' }
  })

  ipcMain.handle('memory:writeGlobal', async (_, content: string) => {
    fs.mkdirSync(GLOBAL_DIR, { recursive: true })
    fs.writeFileSync(GLOBAL_MEMORY_FILE, content, 'utf-8')
    return { ok: true }
  })

  // Project memory (project workdir/.cowrangler/memory.md)
  ipcMain.handle('memory:readProject', async (_, projectId: string) => {
    const db = getProjectDB()
    const project = db.get(projectId)
    if (!project?.workdir) return ''

    const memFile = path.join(project.workdir, '.cowrangler', 'memory.md')
    try {
      if (!fs.existsSync(memFile)) return ''
      return fs.readFileSync(memFile, 'utf-8')
    } catch { return '' }
  })

  ipcMain.handle('memory:writeProject', async (_, projectId: string, content: string) => {
    const db = getProjectDB()
    const project = db.get(projectId)
    if (!project?.workdir) return { ok: false, error: 'No workdir' }

    const memDir = path.join(project.workdir, '.cowrangler')
    fs.mkdirSync(memDir, { recursive: true })
    fs.writeFileSync(path.join(memDir, 'memory.md'), content, 'utf-8')
    return { ok: true }
  })

  // TODO progress (legacy) — global AGENT_TODO.md modeli, session-scoped
  // görevlerle (agent:getTodo) değiştirildi. Bu kanalın canlı bir tüketicisi
  // yok; API yüzeyini kırmamak için boş liste döndürür.
  ipcMain.handle('memory:readTodo', async () => {
    return []
  })
}
