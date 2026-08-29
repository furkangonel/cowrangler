/**
 * Yerel görsel/stil varlıklarını data: URL olarak gömme (main process).
 *
 * NEDEN GEREKLİ
 *  • Design canvas ekranları `srcDoc` iframe'inde render edilir. srcDoc'un base
 *    URL'i yoktur → göreli yollar çözülemez; uygulamanın CSP'si de `file:`
 *    şemasını img-src'e almaz. Yani ajanın tasarıma koyduğu yerel görsel
 *    önizlemede ASLA görünmez.
 *  • Dışa aktarma (PDF/PNG/PPTX) dosyayı file:// olarak yüklediği için orada
 *    çoğu yol çözülür; yine de aynı gömme uygulanınca önizleme ile export
 *    birebir aynı çıktıyı verir ve taşınabilir olur.
 *
 * NE YAPAR
 *  `<img src>`, `<source src>`, `poster`, SVG `<image href/xlink:href>`,
 *  CSS `url(...)` ve `<link rel="stylesheet" href>` hedeflerinden YEREL olanları
 *  data: URL'e çevirir. http(s)/data/blob/# hedeflerine dokunmaz.
 *
 * GÜVENLİK
 *  Yalnızca izin verilen kökler altındaki dosyalar gömülür (tasarım projesinin
 *  kendi klasörü + ~/.cowrangler proje deposu, yani eklerin durduğu yer).
 */
import fs from 'fs'
import os from 'os'
import path from 'path'

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
}

/** Tek dosya üst sınırı (data: URL şişmesin). */
const MAX_ASSET_BYTES = 12 * 1024 * 1024
/** Bir belgede gömülecek toplam üst sınır. */
const MAX_TOTAL_BYTES = 48 * 1024 * 1024

export interface InlineResult {
  content: string
  /** En az bir varlık gerçekten gömüldü mü? */
  changed: boolean
}

function isRemote(url: string): boolean {
  return /^(https?:|data:|blob:|about:|mailto:|tel:|#|\/\/)/i.test(url.trim())
}

/** ~/.cowrangler proje deposu (ekli dosyalar burada yaşar). */
function globalStoreRoot(): string {
  return path.join(os.homedir(), '.cowrangler')
}

function allowedRoots(baseDir: string): string[] {
  const roots = [path.resolve(baseDir), path.resolve(baseDir, '..'), globalStoreRoot()]
  return roots.filter(Boolean)
}

function underAnyRoot(abs: string, roots: string[]): boolean {
  return roots.some(r => abs === r || abs.startsWith(r + path.sep))
}

/** URL/attribute değerini gerçek bir disk yoluna çevirir (yoksa null). */
function toLocalPath(rawUrl: string, baseDir: string, roots: string[]): string | null {
  let url = rawUrl.trim()
  if (!url || isRemote(url)) return null
  // Sorgu/hash parçalarını at (cache-buster'lar).
  url = url.replace(/[?#].*$/, '')
  if (!url) return null

  if (/^file:\/\//i.test(url)) url = url.replace(/^file:\/\//i, '')
  try { url = decodeURI(url) } catch { /* zaten decode */ }

  const candidates: string[] = []
  if (path.isAbsolute(url)) candidates.push(path.resolve(url))
  else {
    candidates.push(path.resolve(baseDir, url))
    // Ajan "uploads/x.png" gibi depo-göreli yazarsa da bulunsun.
    candidates.push(path.resolve(baseDir, '..', url))
  }

  for (const abs of candidates) {
    if (!underAnyRoot(abs, roots)) continue
    try {
      const st = fs.statSync(abs)
      if (st.isFile() && st.size <= MAX_ASSET_BYTES) return abs
    } catch { /* yok → sıradaki aday */ }
  }
  return null
}

/**
 * Kaynak metindeki yerel varlık referanslarını data: URL ile değiştirir.
 * `baseDir` göreli yolların çözüleceği dizin (ekran dosyasının bulunduğu yer).
 */
export function inlineLocalAssets(source: string, baseDir: string): InlineResult {
  if (!source) return { content: source, changed: false }
  const roots = allowedRoots(baseDir)
  const cache = new Map<string, string | null>()
  let total = 0
  let changed = false

  const dataUrlFor = (rawUrl: string): string | null => {
    if (cache.has(rawUrl)) return cache.get(rawUrl) ?? null
    let out: string | null = null
    const abs = toLocalPath(rawUrl, baseDir, roots)
    if (abs) {
      const ext = path.extname(abs).toLowerCase()
      const mime = MIME[ext]
      if (mime) {
        try {
          const buf = fs.readFileSync(abs)
          if (total + buf.length <= MAX_TOTAL_BYTES) {
            total += buf.length
            out = `data:${mime};base64,${buf.toString('base64')}`
          }
        } catch { /* okunamadı → dokunma */ }
      }
    }
    cache.set(rawUrl, out)
    return out
  }

  let out = source

  // 1) <link rel="stylesheet" href="..."> → <style>…</style> (CSS içindeki
  //    url() referansları da aşağıdaki adımda gömülür).
  out = out.replace(
    /<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi,
    (tag) => {
      const m = tag.match(/href=["']([^"']+)["']/i)
      if (!m || isRemote(m[1])) return tag
      const abs = toLocalPath(m[1], baseDir, roots)
      if (!abs || path.extname(abs).toLowerCase() !== '.css') return tag
      try {
        changed = true
        return `<style>\n${fs.readFileSync(abs, 'utf-8')}\n</style>`
      } catch { return tag }
    },
  )

  // 2) src / poster / xlink:href attribute'ları  (<a href> gibi indirme
  //    bağlantılarına dokunmuyoruz — yalnız gömülü medya hedefleri)
  out = out.replace(
    /\b(src|poster|xlink:href)\s*=\s*(["'])([^"']+)\2/gi,
    (whole, attr: string, q: string, url: string) => {
      const data = dataUrlFor(url)
      if (!data) return whole
      changed = true
      return `${attr}=${q}${data}${q}`
    },
  )

  // 3) SVG <image href="…"> (xlink'siz modern biçim)
  out = out.replace(/<image\b[^>]*>/gi, (tag) => {
    const m = tag.match(/\shref\s*=\s*(["'])([^"']+)\1/i)
    if (!m) return tag
    const data = dataUrlFor(m[2])
    if (!data) return tag
    changed = true
    return tag.replace(m[0], ` href=${m[1]}${data}${m[1]}`)
  })

  // 4) CSS url(...) — tırnaklı ve tırnaksız
  out = out.replace(
    /url\(\s*(["']?)([^"')]+)\1\s*\)/gi,
    (whole, q: string, url: string) => {
      const data = dataUrlFor(url)
      if (!data) return whole
      changed = true
      return `url(${q || "'"}${data}${q || "'"})`
    },
  )

  return { content: out, changed }
}

/** Dosyayı okuyup varlıkları gömülü haliyle döndürür. */
export function readInlined(filePath: string): InlineResult {
  const raw = fs.readFileSync(filePath, 'utf-8')
  return inlineLocalAssets(raw, path.dirname(filePath))
}

/**
 * Dışa aktarma için kaynak dosya yolu. Yerel varlık varsa gömülmüş bir geçici
 * kopya üretir (tam self-contained → tmp'de güvenle render edilir); yoksa
 * özgün dosyayı aynen kullanır.
 *
 * `cleanup()` çağrılmadan bırakılırsa yalnız geçici dosya kalır, veri kaybı olmaz.
 */
export function exportSource(filePath: string): { path: string; cleanup: () => void } {
  const noop = { path: filePath, cleanup: () => {} }
  try {
    const ext = path.extname(filePath).toLowerCase()
    if (ext !== '.html' && ext !== '.htm' && ext !== '.svg') return noop
    const { content, changed } = readInlined(filePath)
    if (!changed) return noop
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-export-'))
    const out = path.join(dir, path.basename(filePath))
    fs.writeFileSync(out, content, 'utf-8')
    return {
      path: out,
      cleanup: () => { try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* yoksay */ } },
    }
  } catch {
    return noop
  }
}
