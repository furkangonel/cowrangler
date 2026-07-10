import { IpcMain, dialog, shell } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { getProjectDB } from '../project_db.js'
import { getCodeWorkdir } from './code_workdir.js'
import { openAllowedExternalUrl } from './security.js'
import { MAX_UPLOAD_BYTES, UPLOADS_DIR_NAME, uniqueUploadName, uploadRelPath } from './upload_hygiene.js'

/** Renderer'daki GLOBAL_PROJECT_ID ile aynı — projesiz genel sohbet. */
const GLOBAL_PROJECT_ID = '__global__'
/** Code sekmesi sabit projectId — agent.ipc ile aynı. */
const CODE_PROJECT_ID = '__code__'

function globalWorkdir(): string {
  const dir = path.join(os.homedir(), '.cowrangler', 'global-workspace')
  try { fs.mkdirSync(dir, { recursive: true }) } catch { /* yoksay */ }
  return dir
}

/** projectId → çalışma dizini (proje workdir'i ya da global çalışma alanı). */
function workdirFor(projectId: string): string | null {
  if (projectId === GLOBAL_PROJECT_ID) return globalWorkdir()
  // Code sekmesi: DB kaydı yok. Kullanıcının seçtiği klasör, yoksa global alan.
  // agent.ipc ile aynı çözüm → drop dosyası agent'ın çalıştığı dizine düşer.
  if (projectId === CODE_PROJECT_ID) {
    const cw = getCodeWorkdir()
    if (cw && fs.existsSync(cw)) return cw
    return globalWorkdir()
  }
  const wd = getProjectDB().get(projectId)?.workdir
  return wd && fs.existsSync(wd) ? wd : null
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
    const dest = path.join(wd, UPLOADS_DIR_NAME)
    try { fs.mkdirSync(dest, { recursive: true }) } catch { /* yoksay */ }
    const out: { name: string; relPath: string }[] = []
    for (const src of payload?.paths ?? []) {
      try {
        if (!src || !fs.existsSync(src)) continue
        const stat = fs.statSync(src)
        if (!stat.isFile()) continue                 // klasör sürüklemeyi atla
        if (stat.size > MAX_UPLOAD_BYTES) continue    // 50MB üstünü atla
        const name = uniqueUploadName(dest, path.basename(src))
        fs.copyFileSync(src, path.join(dest, name))
        out.push({ name, relPath: uploadRelPath(name) })
      } catch { /* tek dosya hatası tüm işlemi bozmasın */ }
    }
    return { ok: out.length > 0, files: out }
  })

  // Disk yolu olmayan sürüklemeler (tarayıcı/canvas görselleri) için: base64
  // byte'ları uploads/ altına yaz. addFiles ile aynı sözleşmeyi döndürür.
  ipcMain.handle('fs:addFileBytes', async (_, payload: { projectId: string; files: { name: string; dataBase64: string }[] }) => {
    const wd = workdirFor(payload?.projectId)
    if (!wd) return { ok: false, error: 'No workdir for project', files: [] as { name: string; relPath: string }[] }
    const dest = path.join(wd, UPLOADS_DIR_NAME)
    try { fs.mkdirSync(dest, { recursive: true }) } catch { /* yoksay */ }
    const out: { name: string; relPath: string }[] = []
    for (const f of payload?.files ?? []) {
      try {
        if (!f?.name || !f?.dataBase64) continue
        const buf = Buffer.from(f.dataBase64, 'base64')
        if (buf.length === 0 || buf.length > MAX_UPLOAD_BYTES) continue
        const name = uniqueUploadName(dest, f.name)
        fs.writeFileSync(path.join(dest, name), buf)
        out.push({ name, relPath: uploadRelPath(name) })
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
    await openAllowedExternalUrl(url)
    return { ok: true }
  })
}
