import { IpcMain, dialog, shell } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { getProjectDB } from '../project_db.js'

/** Renderer'daki GLOBAL_PROJECT_ID ile aynı — projesiz genel sohbet. */
const GLOBAL_PROJECT_ID = '__global__'

function globalWorkdir(): string {
  const dir = path.join(os.homedir(), '.cowrangler', 'global-workspace')
  try { fs.mkdirSync(dir, { recursive: true }) } catch { /* yoksay */ }
  return dir
}

/** projectId → çalışma dizini (proje workdir'i ya da global çalışma alanı). */
function workdirFor(projectId: string): string | null {
  if (projectId === GLOBAL_PROJECT_ID) return globalWorkdir()
  const wd = getProjectDB().get(projectId)?.workdir
  return wd && fs.existsSync(wd) ? wd : null
}

/** İsim çakışmasında "ad-1.ext", "ad-2.ext" … üretir. */
function uniqueName(dir: string, name: string): string {
  const ext = path.extname(name)
  const base = path.basename(name, ext).replace(/[^\w.\- ]+/g, '_') || 'file'
  let candidate = base + ext
  let i = 1
  while (fs.existsSync(path.join(dir, candidate))) candidate = `${base}-${i++}${ext}`
  return candidate
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  size?: number
  mtime?: number
}

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.next', '__pycache__', '.venv', 'venv',
  'dist', 'build', 'out', '.nyc_output', 'coverage', '.turbo',
  '.cache', 'tmp', 'temp', '.DS_Store',
])

function readTree(dirPath: string, depth: number = 2, currentDepth = 0): FileNode[] {
  if (currentDepth >= depth) return []
  if (!fs.existsSync(dirPath)) return []

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
  } catch { return [] }

  const nodes: FileNode[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.cowrangler') continue
    if (IGNORED_DIRS.has(entry.name)) continue

    const fullPath = path.join(dirPath, entry.name)

    if (entry.isDirectory()) {
      const children = readTree(fullPath, depth, currentDepth + 1)
      nodes.push({ name: entry.name, path: fullPath, type: 'directory', children })
    } else {
      try {
        const stat = fs.statSync(fullPath)
        nodes.push({
          name: entry.name,
          path: fullPath,
          type: 'file',
          size: stat.size,
          mtime: stat.mtimeMs,
        })
      } catch {
        nodes.push({ name: entry.name, path: fullPath, type: 'file' })
      }
    }
  }

  // Dizinler önce, sonra dosyalar
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export function registerFSIPC(ipcMain: IpcMain): void {
  ipcMain.handle('fs:pickFolder', async (event) => {
    const win = (event.sender as any).getOwnerBrowserWindow?.() ?? null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Çalışma klasörü seç',
    })
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths[0]
  })

  ipcMain.handle('fs:pickFile', async (event) => {
    const win = (event.sender as any).getOwnerBrowserWindow?.() ?? null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      title: 'Dosya seç',
    })
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths[0]
  })

  // Drag-drop / attach: copy dropped files into the project's workdir under
  // uploads/ so the agent (which has read access to the workdir) can open them.
  // Returns each file's path relative to the workdir for referencing in chat.
  ipcMain.handle('fs:addFiles', async (_, payload: { projectId: string; paths: string[] }) => {
    const wd = workdirFor(payload?.projectId)
    if (!wd) return { ok: false, error: 'No workdir for project', files: [] as { name: string; relPath: string }[] }
    const dest = path.join(wd, 'uploads')
    try { fs.mkdirSync(dest, { recursive: true }) } catch { /* yoksay */ }
    const out: { name: string; relPath: string }[] = []
    for (const src of payload?.paths ?? []) {
      try {
        if (!src || !fs.existsSync(src)) continue
        const stat = fs.statSync(src)
        if (!stat.isFile()) continue                 // klasör sürüklemeyi atla
        if (stat.size > 50 * 1024 * 1024) continue    // 50MB üstünü atla
        const name = uniqueName(dest, path.basename(src))
        fs.copyFileSync(src, path.join(dest, name))
        out.push({ name, relPath: path.posix.join('uploads', name) })
      } catch { /* tek dosya hatası tüm işlemi bozmasın */ }
    }
    return { ok: out.length > 0, files: out }
  })

  ipcMain.handle('fs:fileTree', async (_, dirPath: string, depth: number = 2) => {
    return readTree(dirPath, Math.min(depth, 4))
  })

  ipcMain.handle('fs:readFile', async (_, filePath: string) => {
    try {
      const stat = fs.statSync(filePath)
      if (stat.size > 5 * 1024 * 1024) return { error: 'File too large (>5MB)' }
      return { content: fs.readFileSync(filePath, 'utf-8') }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('fs:writeFile', async (_, filePath: string, content: string) => {
    try {
      fs.writeFileSync(filePath, content, 'utf-8')
      return { ok: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('fs:openInFinder', async (_, filePath: string) => {
    shell.showItemInFolder(filePath)
    return { ok: true }
  })

  ipcMain.handle('fs:openExternal', async (_, url: string) => {
    shell.openExternal(url)
    return { ok: true }
  })
}
