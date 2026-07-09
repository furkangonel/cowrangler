import { useCallback, useState } from 'react'
import { ipc } from './ipc'

export interface PendingDrop {
  name: string
  /** Diskteki yol (varsa). Yoksa byte olarak gönderilir. */
  path?: string
  file: File
  /** Görsel önizleme (object URL). */
  previewUrl?: string
}

function hasFiles(e: React.DragEvent): boolean {
  const t = e.dataTransfer?.types
  return !!t && Array.from(t).includes('Files')
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(binary)
}

/**
 * Henüz projesi olmayan yüzeyler (ör. Design ana sayfası) için ertelenmiş
 * sürükle-bırak. Dosyalar bellekte tutulur; proje oluşunca `flush(projectId)`
 * ile workdir'e kopyalanır ve prompt'a iliştirilecek ref metni döner.
 */
export function useDeferredFileDrop() {
  const [isDragging, setDragging] = useState(false)
  const [files, setFiles] = useState<PendingDrop[]>([])

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    setDragging(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget === e.target) setDragging(false)
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    setDragging(false)
    const dropped = Array.from(e.dataTransfer.files)
    if (!dropped.length) return
    const add: PendingDrop[] = dropped.map(f => {
      let p = ''
      try { p = ipc.fs.pathForFile(f) } catch { /* webUtils yoksa */ }
      if (!p) p = (f as unknown as { path?: string }).path || ''
      return {
        name: f.name,
        path: p || undefined,
        file: f,
        previewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
      }
    })
    setFiles(prev => [...prev, ...add])
  }, [])

  const remove = useCallback((idx: number) => {
    setFiles(prev => {
      const gone = prev[idx]
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl)
      return prev.filter((_, i) => i !== idx)
    })
  }, [])

  const clear = useCallback(() => {
    setFiles(prev => { for (const f of prev) if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); return [] })
  }, [])

  /** Proje oluşunca: dosyaları workdir'e kopyalar, "Attached files:" metni döner. */
  const flush = useCallback(async (projectId: string): Promise<string> => {
    if (!files.length) return ''
    const paths = files.filter(f => f.path).map(f => f.path!)
    const blobs = files.filter(f => !f.path)
    const rel: string[] = []
    try {
      if (paths.length) {
        const r = await ipc.fs.addFiles({ projectId, paths })
        r?.files?.forEach(x => rel.push(x.relPath))
      }
      if (blobs.length) {
        const enc = await Promise.all(blobs.map(async b => ({ name: b.name || 'image.png', dataBase64: await fileToBase64(b.file) })))
        const r = await ipc.fs.addFileBytes({ projectId, files: enc })
        r?.files?.forEach(x => rel.push(x.relPath))
      }
    } catch { /* best-effort */ }
    if (!rel.length) return ''
    return 'Attached files:\n' + rel.map(p => `- ${p}`).join('\n')
  }, [files])

  return { isDragging, files, remove, clear, flush, dropBind: { onDragOver, onDragLeave, onDrop } }
}
