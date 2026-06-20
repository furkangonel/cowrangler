import { IpcMain, dialog, shell } from 'electron'
import fs from 'fs'
import path from 'path'

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

  ipcMain.handle('fs:openInFinder', async (_, filePath: string) => {
    shell.showItemInFolder(filePath)
    return { ok: true }
  })

  ipcMain.handle('fs:openExternal', async (_, url: string) => {
    shell.openExternal(url)
    return { ok: true }
  })
}
