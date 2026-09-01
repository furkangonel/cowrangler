import { IpcMain, dialog, shell } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { getProjectDB } from '../project_db.js'
import { getCodeWorkdir } from './code_workdir.js'
import { openAllowedExternalUrl } from './security.js'
import { projectStoreDirFor } from '@cowrangler/core/project_context.js'
import { MAX_UPLOAD_BYTES, UPLOADS_DIR_NAME, uniqueUploadName } from './upload_hygiene.js'
import { runHousekeeping, storageStats } from '../housekeeping.js'

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

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate))
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
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

function escapePreviewHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}

function decodeXmlText(value: string): string {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
}

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

  // Drag-drop / attach: keep copied files in the machine-local project store,
  // never in the user's source tree. The absolute support path is referenced in
  // chat; core accepts it only when it is inside this project's store.
  ipcMain.handle('fs:addFiles', async (_, payload: { projectId: string; paths: string[] }) => {
    const wd = workdirFor(payload?.projectId)
    if (!wd) return { ok: false, error: 'No workdir for project', files: [] as { name: string; relPath: string }[] }
    const dest = path.join(projectStoreDirFor(wd), UPLOADS_DIR_NAME)
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
        out.push({ name, relPath: path.join(dest, name) })
      } catch { /* tek dosya hatası tüm işlemi bozmasın */ }
    }
    return { ok: out.length > 0, files: out }
  })

  // Disk yolu olmayan sürüklemeler (tarayıcı/canvas görselleri) için: base64
  // byte'ları makine-lokal proje deposundaki uploads/ altına yaz.
  ipcMain.handle('fs:addFileBytes', async (_, payload: { projectId: string; files: { name: string; dataBase64: string }[] }) => {
    const wd = workdirFor(payload?.projectId)
    if (!wd) return { ok: false, error: 'No workdir for project', files: [] as { name: string; relPath: string }[] }
    const dest = path.join(projectStoreDirFor(wd), UPLOADS_DIR_NAME)
    try { fs.mkdirSync(dest, { recursive: true }) } catch { /* yoksay */ }
    const out: { name: string; relPath: string }[] = []
    for (const f of payload?.files ?? []) {
      try {
        if (!f?.name || !f?.dataBase64) continue
        const buf = Buffer.from(f.dataBase64, 'base64')
        if (buf.length === 0 || buf.length > MAX_UPLOAD_BYTES) continue
        const name = uniqueUploadName(dest, f.name)
        fs.writeFileSync(path.join(dest, name), buf)
        out.push({ name, relPath: path.join(dest, name) })
      } catch { /* tek dosya hatası tüm işlemi bozmasın */ }
    }
    return { ok: out.length > 0, files: out }
  })

  // A composer attachment that is removed before sending is disposable. Only
  // permit deletion from this project's managed uploads directory.
  ipcMain.handle('fs:discardUpload', async (_, payload: { projectId: string; filePath: string }) => {
    const wd = workdirFor(payload?.projectId)
    if (!wd || !payload?.filePath) return { ok: false }
    const uploads = path.join(projectStoreDirFor(wd), UPLOADS_DIR_NAME)
    if (!isInside(uploads, payload.filePath)) return { ok: false }
    try {
      fs.rmSync(payload.filePath, { force: true })
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Attachment could not be removed.' }
    }
  })

  ipcMain.handle('fs:storageStats', async () => storageStats())
  ipcMain.handle('fs:cleanStorage', async () => runHousekeeping())

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

  ipcMain.handle('fs:previewFile', async (_, filePath: string) => {
    try {
      const stat = fs.statSync(filePath)
      if (!stat.isFile()) return { kind: 'unsupported', error: 'Not a file' }
      const ext = path.extname(filePath).toLowerCase()
      if (stat.size > 50 * 1024 * 1024) return { kind: 'unsupported', error: 'File too large to preview (>50MB)', size: stat.size }

      const mimeByExt: Record<string, string> = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.bmp': 'image/bmp', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
        '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg',
      }
      const mime = mimeByExt[ext]
      if (mime) {
        const family = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'pdf'
        return { kind: family, mime, dataUrl: `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`, size: stat.size }
      }

      if (ext === '.docx') {
        const module = await import('mammoth')
        const mammoth = (module as any).default ?? module
        const result = await mammoth.convertToHtml({ path: filePath })
        return { kind: 'document', content: result.value, warnings: result.messages?.map((message: any) => message.message) ?? [], size: stat.size }
      }

      if (ext === '.xlsx' || ext === '.xls') {
        const module = await import('exceljs')
        const Excel = (module as any).default ?? module
        const workbook = new Excel.Workbook()
        await workbook.xlsx.readFile(filePath)
        const sheets: string[] = []
        workbook.worksheets.slice(0, 5).forEach((sheet: any) => {
          const rows: string[] = []
          sheet.eachRow({ includeEmpty: false }, (row: any, rowNumber: number) => {
            if (rowNumber > 200) return
            const cells = Array.from({ length: Math.min(Math.max(row.cellCount, 1), 30) }, (_, index) => {
              const value = row.getCell(index + 1).text || row.getCell(index + 1).value || ''
              const tag = rowNumber === 1 ? 'th' : 'td'
              return `<${tag}>${escapePreviewHtml(value)}</${tag}>`
            }).join('')
            rows.push(`<tr>${cells}</tr>`)
          })
          sheets.push(`<section class="office-sheet"><h2>${escapePreviewHtml(sheet.name)}</h2><div class="office-table-wrap"><table>${rows.join('')}</table></div></section>`)
        })
        return { kind: 'spreadsheet', content: sheets.join(''), size: stat.size }
      }

      if (ext === '.pptx') {
        const module = await import('jszip')
        const Zip = (module as any).default ?? module
        const zip = await Zip.loadAsync(fs.readFileSync(filePath))
        const slideNames = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/slide(\d+)/)?.[1] ?? 0) - Number(b.match(/slide(\d+)/)?.[1] ?? 0))
        const slides = await Promise.all(slideNames.map(async (name, index) => {
          const xml = await zip.file(name)!.async('string')
          const lines = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(match => decodeXmlText(match[1])).filter(Boolean)
          return `<section class="office-slide"><span>Slide ${index + 1}</span>${lines.map((line, lineIndex) => lineIndex === 0 ? `<h2>${escapePreviewHtml(line)}</h2>` : `<p>${escapePreviewHtml(line)}</p>`).join('')}</section>`
        }))
        return { kind: 'presentation', content: slides.join(''), size: stat.size }
      }

      const textExtensions = new Set(['.html', '.htm', '.md', '.markdown', '.txt', '.json', '.csv', '.tsv', '.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.less', '.py', '.rb', '.rs', '.go', '.java', '.kt', '.swift', '.sh', '.zsh', '.fish', '.sql', '.xml', '.yaml', '.yml', '.toml', '.ini', '.env', '.log'])
      if (textExtensions.has(ext) || stat.size < 1024 * 1024) {
        const content = fs.readFileSync(filePath, 'utf-8')
        return { kind: ext === '.html' || ext === '.htm' ? 'html' : ext === '.md' || ext === '.markdown' ? 'markdown' : 'text', content, size: stat.size }
      }
      return { kind: 'unsupported', size: stat.size }
    } catch (err: any) {
      return { kind: 'unsupported', error: err?.message || 'Preview failed' }
    }
  })

  // İkili dosyayı data: URL olarak döndürür. Renderer'da yerel görselleri
  // göstermenin tek güvenilir yolu: CSP `img-src` `file:` şemasını kabul etmiyor
  // ve geliştirme modunda sayfa http://localhost olduğundan `file://` alt
  // kaynakları Chromium tarafından da engelleniyor.
  ipcMain.handle('fs:readFileDataUrl', async (_, filePath: string) => {
    const MIME: Record<string, string> = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
      '.bmp': 'image/bmp', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.mov': 'video/quicktime',
      '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
    }
    try {
      const mime = MIME[path.extname(filePath || '').toLowerCase()]
      if (!mime) return { error: 'Unsupported file type' }
      const stat = fs.statSync(filePath)
      if (!stat.isFile()) return { error: 'Not a file' }
      if (stat.size > MAX_UPLOAD_BYTES) return { error: 'File too large' }
      return { dataUrl: `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}` }
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
