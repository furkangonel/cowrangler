import { useCallback, useEffect, useRef, useState } from 'react'
import { ipc } from './ipc'

export interface AttachedFile {
  name: string
  /** Agent mesajına eklenecek proje-destek dosyası yolu. */
  relPath: string
  /** Görseller için anlık önizleme (object URL). Yalnızca UI; gönderime girmez. */
  previewUrl?: string
}

function isImageName(name: string): boolean {
  return /\.(png|jpe?g|webp|gif)$/i.test(name)
}

/** DataTransfer gerçekten dosya mı taşıyor? (metin/URL sürüklemede tetiklenmesin) */
function hasFiles(e: React.DragEvent): boolean {
  const t = e.dataTransfer?.types
  return !!t && Array.from(t).includes('Files')
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/**
 * Chat/design/code composer'ları için ortak dosya sürükle-bırak mantığı.
 *
 * İki yol:
 *  1) Disk yolu OLAN dosyalar (Finder/Explorer) → `fs:addFiles` ile kopyalanır.
 *     Yol, önce Electron `webUtils.getPathForFile`, olmazsa `File.path` ile bulunur;
 *     kopya kaynak ağacına değil makine-lokal proje deposuna alınır.
 *  2) Disk yolu OLMAYAN sürüklemeler (tarayıcı sekmesi, design canvas, gömülü
 *     görsel) → byte'lar okunur ve `fs:addFileBytes` ile uploads/'a yazılır.
 *
 * Dönen `relPath`'ler gönderimde mesaja iliştirilir. Hata olursa sessizce
 * yutulmaz; `error` state'ine yazılır.
 */
export function useFileDrop(projectId?: string) {
  const [isDragging, setIsDragging] = useState(false)
  const [files, setFiles] = useState<AttachedFile[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const filesRef = useRef<AttachedFile[]>([])

  useEffect(() => { filesRef.current = files }, [files])
  useEffect(() => () => {
    // The composer disappeared without sending: release previews and discard
    // its managed copies. Sent attachments are removed from this ref by clear().
    for (const file of filesRef.current) {
      if (file.previewUrl) URL.revokeObjectURL(file.previewUrl)
      if (projectId) void ipc.fs.discardUpload({ projectId, filePath: file.relPath })
    }
    filesRef.current = []
  }, [projectId])

  const attachPaths = useCallback(async (paths: string[]) => {
    setError(null)
    if (!projectId) { setError('Open a project before attaching files.'); return false }
    if (!paths.length) return false
    setBusy(true)
    try {
      const res = await ipc.fs.addFiles({ projectId, paths })
      if (!res?.ok || !res.files?.length) {
        setError(res?.error || 'The selected file could not be attached.')
        return false
      }
      setFiles((current) => {
        const seen = new Set(current.map((file) => file.relPath))
        return [...current, ...res.files.filter((file) => !seen.has(file.relPath))]
      })
      return true
    } catch (cause: any) {
      setError(cause?.message || 'The selected file could not be attached.')
      return false
    } finally {
      setBusy(false)
    }
  }, [projectId])

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
    setError(null)
    if (!projectId) { setError('No active project to attach to'); return }

    // React synthetic event await sonrası havuzlanır → File'ları önce yakala.
    const dropped = Array.from(e.dataTransfer.files)
    if (!dropped.length) return

    const paths: string[] = []
    const blobs: File[] = []
    for (const f of dropped) {
      let p = ''
      try { p = ipc.fs.pathForFile(f) } catch { /* webUtils yoksa */ }
      if (!p) p = (f as unknown as { path?: string }).path || ''
      if (p) paths.push(p)
      else blobs.push(f) // yol yok → byte olarak gönder
    }

    // Görseller için anlık önizleme URL'leri (bırakma sırasına göre).
    const previews = dropped
      .filter(f => f.type.startsWith('image/'))
      .map(f => URL.createObjectURL(f))

    setBusy(true)
    try {
      const collected: AttachedFile[] = []
      let lastError: string | undefined

      if (paths.length) {
        const res = await ipc.fs.addFiles({ projectId, paths })
        if (res?.files?.length) collected.push(...res.files)
        if (res && !res.ok) lastError = res.error
      }
      if (blobs.length) {
        const encoded = await Promise.all(
          blobs.map(async (f) => ({ name: f.name || 'image.png', dataBase64: await fileToBase64(f) })),
        )
        const res = await ipc.fs.addFileBytes({ projectId, files: encoded })
        if (res?.files?.length) collected.push(...res.files)
        if (res && !res.ok) lastError = res.error
      }

      if (collected.length) {
        // Görsel olan sonuçlara önizleme URL'lerini sırayla ata.
        let pi = 0
        const withPreview = collected.map(cf =>
          isImageName(cf.relPath) && pi < previews.length ? { ...cf, previewUrl: previews[pi++] } : cf,
        )
        // Eşleşmeyen fazladan önizleme kalırsa sız(dır)ma → serbest bırak.
        for (; pi < previews.length; pi++) URL.revokeObjectURL(previews[pi])
        setFiles(prev => {
          const seen = new Set(prev.map(f => f.relPath))
          return [...prev, ...withPreview.filter(f => !seen.has(f.relPath))]
        })
      } else {
        for (const u of previews) URL.revokeObjectURL(u)
        setError(lastError || 'Could not attach the dropped file(s)')
      }
    } catch (err: any) {
      for (const u of previews) URL.revokeObjectURL(u)
      setError(err?.message || 'Attach failed')
    } finally {
      setBusy(false)
    }
  }, [projectId])

  const remove = useCallback((relPath: string) => {
    setFiles(prev => {
      const gone = prev.find(f => f.relPath === relPath)
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl)
      if (gone && projectId) void ipc.fs.discardUpload({ projectId, filePath: gone.relPath })
      const next = prev.filter(f => f.relPath !== relPath)
      filesRef.current = next
      return next
    })
  }, [projectId])

  const clear = useCallback(() => {
    setFiles(prev => {
      for (const f of prev) if (f.previewUrl) URL.revokeObjectURL(f.previewUrl)
      filesRef.current = []
      return []
    })
    setError(null)
  }, [])

  /** Gönderilecek mesaja eklenecek referans bloğu (dosya yoksa boş). */
  const refText = useCallback(() => {
    if (!files.length) return ''
    return 'Attached files:\n' + files.map(f => `- ${f.relPath}`).join('\n')
  }, [files])

  return {
    isDragging,
    busy,
    files,
    error,
    attachPaths,
    remove,
    clear,
    refText,
    /** Composer'ın en dış sarmalayıcısına yayılacak drag/drop handler'ları. */
    dropBind: { onDragOver, onDragLeave, onDrop },
  }
}
