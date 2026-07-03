import { useCallback, useState } from 'react'
import { ipc } from './ipc'

export interface AttachedFile {
  name: string
  /** Proje workdir'ine göre yol, ör. "uploads/foo.png" */
  relPath: string
}

/** DataTransfer gerçekten dosya mı taşıyor? (metin/URL sürüklemede tetiklenmesin) */
function hasFiles(e: React.DragEvent): boolean {
  const t = e.dataTransfer?.types
  return !!t && Array.from(t).includes('Files')
}

/**
 * Chat composer'ları için ortak dosya sürükle-bırak mantığı.
 * Bırakılan dosyalar `fs:addFiles` ile proje workdir'ine (uploads/) kopyalanır;
 * agent bunları okuyabilir. Dönen `relPath`'ler gönderimde mesaja iliştirilir.
 */
export function useFileDrop(projectId?: string) {
  const [isDragging, setIsDragging] = useState(false)
  const [files, setFiles] = useState<AttachedFile[]>([])
  const [busy, setBusy] = useState(false)

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    // Sadece composer'ı gerçekten terk edince kapat (iç elemanlara girişte değil).
    if (e.currentTarget === e.target) setIsDragging(false)
  }, [])

  const onDrop = useCallback(async (e: React.DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    setIsDragging(false)
    if (!projectId) return
    const paths = Array.from(e.dataTransfer.files)
      .map(f => (f as unknown as { path?: string }).path)
      .filter((p): p is string => !!p)
    if (!paths.length) return
    setBusy(true)
    try {
      const res = await ipc.fs.addFiles({ projectId, paths })
      if (res?.files?.length) {
        setFiles(prev => {
          const seen = new Set(prev.map(f => f.relPath))
          return [...prev, ...res.files.filter(f => !seen.has(f.relPath))]
        })
      }
    } catch { /* sessizce geç */ }
    finally { setBusy(false) }
  }, [projectId])

  const remove = useCallback((relPath: string) => {
    setFiles(prev => prev.filter(f => f.relPath !== relPath))
  }, [])

  const clear = useCallback(() => setFiles([]), [])

  /** Gönderilecek mesaja eklenecek referans bloğu (dosya yoksa boş). */
  const refText = useCallback(() => {
    if (!files.length) return ''
    return 'Attached files:\n' + files.map(f => `- ${f.relPath}`).join('\n')
  }, [files])

  return {
    isDragging,
    busy,
    files,
    remove,
    clear,
    refText,
    /** Composer'ın en dış sarmalayıcısına yayılacak drag/drop handler'ları. */
    dropBind: { onDragOver, onDragLeave, onDrop },
  }
}
