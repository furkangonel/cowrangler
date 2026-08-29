/**
 * Mesaja iliştirilen dosyalar için ortak yardımcılar.
 *
 * Composer (`useFileDrop.refText`) gönderilen metnin sonuna şu bloğu ekler:
 *
 *   Attached files:
 *   - /abs/path/one.png
 *   - /abs/path/two.pdf
 *
 * Bu blok modelin dosyayı bulabilmesi için gereklidir; ama kullanıcıya ham
 * yol listesi olarak gösterilmemeli. Aşağıdaki yardımcılar bloğu metinden
 * ayırır, böylece arayüz görselleri gerçek görsel olarak (composer chip'inde
 * olduğu gibi) render edebilir.
 */

import { useEffect, useState } from 'react'
import { ipc } from './ipc'

const ATTACH_HEADER = 'Attached files:'
const IMAGE_RE = /\.(png|jpe?g|webp|gif|svg|bmp|avif)$/i

export function isImagePath(p: string): boolean {
  return IMAGE_RE.test(p.trim())
}

export function fileName(p: string): string {
  return p.split(/[\\/]/).pop() || p
}

/**
 * Yerel görseli <img src> için kullanılabilir bir data: URL'e çevirir.
 *
 * NEDEN data:  Uygulamanın CSP'sinde `img-src` `file:` şemasını içermiyor;
 * ayrıca geliştirme modunda sayfa http://localhost olduğu için Chromium
 * `file://` alt kaynaklarını zaten engelliyor. Tek taşınabilir yol: ana
 * süreçten byte'ları okuyup data: URL üretmek.
 *
 * Aynı yol için sonuç modül düzeyinde önbelleklenir (mesaj listesi her
 * render'da yeniden okumasın).
 */
const MAX_CACHE_ITEMS = 24
const MAX_CACHE_BYTES = 32 * 1024 * 1024
const dataUrlCache = new Map<string, { url: string; bytes: number }>()
const inFlight = new Map<string, Promise<string>>()
let cachedBytes = 0

function cachedUrl(p: string): string | undefined {
  const hit = dataUrlCache.get(p)
  if (!hit) return undefined
  dataUrlCache.delete(p)
  dataUrlCache.set(p, hit)
  return hit.url
}

function rememberUrl(p: string, url: string): void {
  const bytes = Math.ceil(url.length * 0.75)
  const previous = dataUrlCache.get(p)
  if (previous) cachedBytes -= previous.bytes
  dataUrlCache.delete(p)
  dataUrlCache.set(p, { url, bytes })
  cachedBytes += bytes
  while (dataUrlCache.size > MAX_CACHE_ITEMS || cachedBytes > MAX_CACHE_BYTES) {
    const oldest = dataUrlCache.entries().next().value as [string, { url: string; bytes: number }] | undefined
    if (!oldest) break
    dataUrlCache.delete(oldest[0])
    cachedBytes -= oldest[1].bytes
  }
}

export function loadLocalImage(p: string): Promise<string> {
  const cached = cachedUrl(p)
  if (cached) return Promise.resolve(cached)
  const running = inFlight.get(p)
  if (running) return running
  const task = ipc.fs
    .readFileDataUrl(p)
    .then(r => {
      if (!r?.dataUrl) throw new Error(r?.error || 'Image could not be read')
      rememberUrl(p, r.dataUrl)
      return r.dataUrl
    })
    .finally(() => { inFlight.delete(p) })
  inFlight.set(p, task)
  return task
}

/** Yerel görsel yolunu <img src> değerine çeviren hook. */
export function useLocalImage(p: string | undefined): { src: string; failed: boolean } {
  const [src, setSrc] = useState(() => (p ? cachedUrl(p) ?? '' : ''))
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!p) { setSrc(''); setFailed(false); return }
    // Zaten bir data:/http(s) URL'i (ör. sürükle-bırak object URL'i) → aynen kullan.
    if (/^(data|https?|blob):/i.test(p)) { setSrc(p); setFailed(false); return }
    const hit = cachedUrl(p)
    if (hit) { setSrc(hit); setFailed(false); return }
    let alive = true
    setSrc(''); setFailed(false)
    loadLocalImage(p)
      .then(url => { if (alive) setSrc(url) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [p])
  return { src, failed }
}

export interface ParsedMessage {
  /** Ek bloğu çıkarılmış, gösterilecek metin. */
  text: string
  /** Ek olarak iliştirilen mutlak dosya yolları. */
  files: string[]
}

/** Mesaj içeriğini "gösterilecek metin" + "ek dosyalar" olarak ayırır. */
export function parseAttachments(content: string): ParsedMessage {
  const idx = content.lastIndexOf(ATTACH_HEADER)
  if (idx === -1) return { text: content, files: [] }

  const tail = content.slice(idx + ATTACH_HEADER.length)
  const lines = tail.split('\n').map((l) => l.trim()).filter(Boolean)
  // Blok yalnızca "- yol" satırlarından oluşmalı; değilse dokunma (yanlış pozitif).
  if (!lines.length || !lines.every((l) => l.startsWith('- '))) {
    return { text: content, files: [] }
  }

  return {
    text: content.slice(0, idx).trimEnd(),
    files: lines.map((l) => l.slice(2).trim()).filter(Boolean),
  }
}
