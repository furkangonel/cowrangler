/**
 * Export / download IPC — converts design files to PDF / PNG / PPTX and saves
 * them through a native save dialog. Rendering is done in Electron's own
 * offscreen renderer (no external headless browser), so a self-contained HTML
 * file becomes a pixel-perfect slide, page or image.
 *
 * Reliability notes (these were the source of the "file won't save" bugs):
 *
 *  1. capturePage() on a `show:false` window returns a blank/never-painted
 *     frame on macOS, which made PPTX/PNG/per-slide-PDF silently produce empty
 *     or failed output. We now create the window off-screen and call
 *     showInactive() so the compositor actually paints — without stealing the
 *     user's focus — then wait for fonts + a couple of frames before capturing.
 *
 *  2. pptxgenjs is loaded through createRequire() so we always get its CommonJS
 *     build (dist/pptxgen.cjs.js). A bare `import('pptxgenjs')` resolves the ESM
 *     build inside an ESM main process and emits the noisy "set type:module"
 *     warning while being flakier. We also write the deck with pptx.writeFile()
 *     which writes straight to disk and removes a Buffer round-trip.
 *
 *  3. Every dialog is parented to the focused window, carries the correct
 *     extension filter + default filename, so the native picker opens already
 *     pointed at the right format.
 */
import { ipcMain, dialog, BrowserWindow, clipboard, nativeImage } from 'electron'
import { createRequire } from 'module'
import { PDFDocument } from 'pdf-lib'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { exportSource, readInlined } from './asset_inline.js'
import { bundle } from '@remotion/bundler'
import { renderMedia, selectComposition } from '@remotion/renderer'

function writeTempHtml(html: string): string {
  const tmpPath = path.join(os.tmpdir(), `cowr_exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.html`)
  fs.writeFileSync(tmpPath, html, 'utf-8')
  return tmpPath
}

// CommonJS require bound to this module — used only for pptxgenjs so we load its
// CJS entry point reliably from an ESM main process.
// Do not name this binding `require`. electron-vite's CommonJS transform scans
// that identifier and used to inject its node:module shim at the last apparent
// import in this file — which happened to be inside our Remotion entry-point
// template string. The generated composition then contained a Node-only import
// and webpack failed with UnhandledSchemeError.
const nodeRequire = createRequire(import.meta.url)

// Defensive print stylesheet: neutralises viewport-locked / scroll-snap decks
// so a single multi-section HTML file still paginates when printed to PDF.
const PRINT_FIX = `<style id="__cowrangler_print_fix">@media print{
  html,body{height:auto!important;max-height:none!important;overflow:visible!important;}
  [class*="deck"],[class*="reveal"],[class*="slides"],[class*="carousel"],[class*="scroller"],[class*="scroll-"]{
    height:auto!important;overflow:visible!important;transform:none!important;scroll-snap-type:none!important;display:block!important;}
  section,[class*="slide"],[class*="Slide"],[data-slide],[class*="page-"],.page{
    break-after:page;page-break-after:always;break-inside:avoid;page-break-inside:avoid;}
}</style>`

/**
 * Create an off-screen, non-focusable render window. If useOSR is true (default),
 * it uses Electron's native offscreen rendering (required for capturePage to work on macOS
 * without showing the window). If useOSR is false, it uses a standard hidden window
 * positioned offscreen (required for printToPDF to work since Chromium's print pipeline
 * fails on offscreen webContents).
 */
function offscreenWindow(width = 1280, height = 800, useOSR = true): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    width,
    height,
    x: -32000,
    y: -32000,
    frame: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: { sandbox: true, backgroundThrottling: false, offscreen: useOSR },
  })
  win.setIgnoreMouseEvents(true)
  return win
}

function injectPrintFix(html: string): string {
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${PRINT_FIX}</head>`)
  return PRINT_FIX + html
}

/** Wait for the page to load, fonts to be ready, and a few frames to paint. */
async function settle(win: BrowserWindow): Promise<void> {
  try {
    await win.webContents.executeJavaScript(
      'document.fonts && document.fonts.ready ? document.fonts.ready.then(()=>true).catch(()=>true) : true',
    )
  } catch { /* page may not expose document.fonts */ }
  // With native offscreen rendering enabled, we do not call showInactive().
  // Simply wait a brief period for background composited paints to complete.
  await new Promise(r => setTimeout(r, 380))
}

/** Capture the current window content as a PNG buffer at an exact size. */
async function capture(win: BrowserWindow, width: number, height: number): Promise<Buffer> {
  const img = await win.webContents.capturePage({ x: 0, y: 0, width, height })
  return img.toPNG()
}

async function htmlToPdf(html: string, landscape: boolean): Promise<Buffer> {
  const win = offscreenWindow(1280, 800, false)
  const tmpPath = writeTempHtml(injectPrintFix(html))
  try {
    await win.loadFile(tmpPath)
    await settle(win)
    return (await win.webContents.printToPDF({ printBackground: true, landscape, preferCSSPageSize: true })) as Buffer
  } finally {
    try { fs.rmSync(tmpPath, { force: true }) } catch {}
    win.destroy()
  }
}

async function htmlToPng(html: string, width: number, height: number): Promise<Buffer> {
  const win = offscreenWindow(width, height)
  const tmpPath = writeTempHtml(html)
  try {
    await win.loadFile(tmpPath)
    win.setContentSize(width, height)
    await settle(win)
    return await capture(win, width, height)
  } finally {
    try { fs.rmSync(tmpPath, { force: true }) } catch {}
    win.destroy()
  }
}

/** Render a self-contained HTML file to a fixed-size PNG (one slide / page). */
async function fileToPng(filePath: string, width: number, height: number): Promise<Buffer> {
  const win = offscreenWindow(width, height)
  // Yerel görseller gömülü, tam self-contained bir kopya üzerinden render et.
  const src = exportSource(filePath)
  try {
    await win.loadFile(src.path)
    win.setContentSize(width, height)
    await settle(win)
    return await capture(win, width, height)
  } finally { src.cleanup(); win.destroy() }
}

/** Render a self-contained HTML file to a NativeImage (for JPEG / clipboard). */
async function fileToNativeImage(filePath: string, width: number, height: number): Promise<Electron.NativeImage> {
  const win = offscreenWindow(width, height)
  const src = exportSource(filePath)
  try {
    await win.loadFile(src.path)
    win.setContentSize(width, height)
    await settle(win)
    return await win.webContents.capturePage({ x: 0, y: 0, width, height })
  } finally { src.cleanup(); win.destroy() }
}

interface AdvPdfOpts { pageSize?: 'fit' | 'a4' | 'letter'; landscape?: boolean; marginIn?: number; scale?: number; fitW?: number; fitH?: number }

/**
 * Print ONE file to a PDF page into an already-open, reused window. Reusing the
 * window (instead of one per file) is what makes large decks — e.g. 19 pages —
 * reliable: no window-count blow-up, one debugger session. Screen media is
 * emulated so the PDF matches the on-canvas preview.
 */
async function renderPdfPage(win: BrowserWindow, filePath: string, o: AdvPdfOpts): Promise<Buffer> {
  const fitW = o.fitW ?? 794
  const fitH = o.fitH ?? 1123
  const wc = win.webContents
  // Yerel görselleri gömülü kopyadan yükle; shared.css enjeksiyonu ÖZGÜN yolu
  // kullanmaya devam eder (kardeş dosya orada).
  const src = exportSource(filePath)
  try {
    await win.loadFile(src.path)
  } finally { src.cleanup() }
  win.setContentSize(fitW, fitH)
  await settle(win)
  // Emulated media resets on navigation → re-apply per page (best-effort).
  try { await wc.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'screen' }) } catch { /* debugger not attached */ }
  // Inject sibling shared.css (theme vars) so the export matches the canvas.
  try {
    const sharedPath = filePath.replace(/[^/\\]+$/, 'shared.css')
    if (fs.existsSync(sharedPath)) {
      const shared = fs.readFileSync(sharedPath, 'utf-8')
      await wc.executeJavaScript(`(function(){var s=document.createElement('style');s.textContent=${JSON.stringify(shared)};document.head.insertBefore(s,document.head.firstChild);return true;})()`)
      await new Promise(r => setTimeout(r, 40))
    }
  } catch { /* no shared.css → file is self-contained */ }
  // The design canvas treats each file as one fixed page. Chromium print can add
  // a trailing blank page for tiny overflow caused by default body margins,
  // borders, or sub-pixel layout. Clamp the root to the render frame before
  // printing so one design file stays one PDF page.
  await wc.executeJavaScript(`(function(){
    var s=document.createElement('style');
    s.textContent='html,body{margin:0!important;padding:0!important;'+
      'width:${fitW}px!important;height:${fitH}px!important;'+
      'max-width:${fitW}px!important;max-height:${fitH}px!important;'+
      'overflow:hidden!important;}';
    document.head.appendChild(s);
    window.scrollTo(0,0);
    return true;
  })()`)
  await new Promise(r => setTimeout(r, 60))
  let pageSize: any
  if (o.pageSize === 'a4') pageSize = 'A4'
  else if (o.pageSize === 'letter') pageSize = 'Letter'
  else pageSize = { width: fitW / 96, height: fitH / 96 } // 'fit' → content size in inches
  const m = Math.max(0, o.marginIn ?? 0)
  const printed = (await wc.printToPDF({
    printBackground: true,
    landscape: !!o.landscape,
    pageSize,
    margins: { top: m, bottom: m, left: m, right: m },
    scale: Math.min(2, Math.max(0.1, o.scale ?? 1)),
    preferCSSPageSize: false,
  })) as Buffer
  return await firstPdfPageOnly(printed, filePath)
}

async function renderPdfPageInFreshWindow(filePath: string, o: AdvPdfOpts): Promise<Buffer> {
  const win = offscreenWindow(o.fitW ?? 794, o.fitH ?? 1123, false)
  const wc = win.webContents
  let attached = false
  try {
    try { wc.debugger.attach('1.3'); attached = true } catch { /* print media fallback */ }
    return await renderPdfPage(win, filePath, o)
  } finally {
    if (attached) { try { wc.debugger.detach() } catch {} }
    win.destroy()
  }
}

async function renderPdfPageWithRetry(win: BrowserWindow, filePath: string, o: AdvPdfOpts): Promise<Buffer> {
  try {
    return await renderPdfPage(win, filePath, o)
  } catch (first: any) {
    console.warn('[export:toPdfAdvanced] reused window failed, retrying fresh window:', filePath, first?.message ?? first)
    return await renderPdfPageInFreshWindow(filePath, o)
  }
}

async function countPdfPages(buf: Buffer): Promise<number> {
  const doc = await PDFDocument.load(buf)
  return doc.getPageCount()
}

async function firstPdfPageOnly(buf: Buffer, sourceLabel: string): Promise<Buffer> {
  const src = await PDFDocument.load(buf)
  const count = src.getPageCount()
  if (count <= 1) return buf
  console.warn(`[export:toPdfAdvanced] ${path.basename(sourceLabel)} produced ${count} pages; keeping first page`)
  const out = await PDFDocument.create()
  const [first] = await out.copyPages(src, [0])
  out.addPage(first)
  return Buffer.from(await out.save())
}

/** Build a multi-page PDF where each page is exactly one slide image. */
async function imagesToPdf(pngs: Buffer[], w: number, h: number): Promise<Buffer> {
  const imgs = pngs.map(b => `<img src="data:image/png;base64,${b.toString('base64')}">`).join('')
  const html = `<!doctype html><meta charset="utf-8"><style>
    @page{size:${w}px ${h}px;margin:0}
    html,body{margin:0;padding:0;background:#fff}
    img{display:block;width:${w}px;height:${h}px;page-break-after:always;break-after:page}
    img:last-child{page-break-after:auto;break-after:auto}
  </style>${imgs}`
  const win = offscreenWindow(w, h, false)
  const tmpPath = writeTempHtml(html)
  try {
    await win.loadFile(tmpPath)
    await new Promise(r => setTimeout(r, 250))
    return (await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true })) as Buffer
  } finally {
    try { fs.rmSync(tmpPath, { force: true }) } catch {}
    win.destroy()
  }
}

/**
 * Print a self-contained HTML document to a VECTOR PDF, PAGINATED across as many
 * A4 pages as the content needs. Keeps text selectable and layout pixel-exact
 * (no screenshot drift). This is the document path.
 *
 * Pagination model — handles BOTH authoring styles without clipping:
 *  • Explicit pages: content wrapped in `.page` blocks (794×1123 each). Each
 *    `.page` maps 1:1 to a PDF sheet via `break-after:page`. WYSIWYG.
 *  • Long single flow (legacy): no `.page` blocks → Chromium's paged-media engine
 *    slices the tall body into A4 sheets automatically. Nothing is lost.
 *
 * The old behaviour clamped the root to ONE 1123px page with `overflow:hidden`
 * and kept only the first PDF page — so anything past the first sheet was
 * silently thrown away. That was the "document scrolls too long → broken PDF"
 * bug. We now emit every page.
 */
async function fileToPdfVector(
  filePath: string,
  opts: { landscape?: boolean; widthPx?: number; heightPx?: number; marginIn?: number; scale?: number } = {},
): Promise<Buffer> {
  // Design pages are authored at 794×1123 CSS px (A4 @96dpi).
  const wPx = opts.widthPx ?? 794
  const hPx = opts.heightPx ?? 1123
  const marginIn = Math.max(0, opts.marginIn ?? 0)
  // printToPDF needs a real (offscreen-positioned) window, not OSR.
  const win = offscreenWindow(wPx, hPx, false)
  const wc = win.webContents
  let attached = false
  const src = exportSource(filePath)
  try {
    try { await win.loadFile(src.path) } finally { src.cleanup() }
    win.setContentSize(wPx, hPx)
    await settle(win)
    // Inject sibling shared.css (theme vars) so the export matches the canvas.
    try {
      const sharedPath = filePath.replace(/[^/\\]+$/, 'shared.css')
      if (fs.existsSync(sharedPath)) {
        const shared = fs.readFileSync(sharedPath, 'utf-8')
        await wc.executeJavaScript(`(function(){var s=document.createElement('style');s.textContent=${JSON.stringify(shared)};document.head.insertBefore(s,document.head.firstChild);return true;})()`)
        await new Promise(r => setTimeout(r, 40))
      }
    } catch { /* no shared.css → file is self-contained */ }
    // CRITICAL: the canvas preview renders SCREEN styles. printToPDF defaults to
    // PRINT media, so any `@media print` overrides in the file make the PDF look
    // different from the canvas. Force screen emulation so export == preview.
    try {
      wc.debugger.attach('1.3')
      attached = true
      await wc.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'screen' })
    } catch { /* debugger unavailable → fall back to print media */ }

    // Paged-media setup. Drive page size via CSS `@page` + preferCSSPageSize so
    // both `.page` blocks and long flow content paginate at exactly wPx×hPx.
    // Do NOT clamp html/body height or set overflow:hidden — that is what
    // truncated multi-page documents before.
    await wc.executeJavaScript(`(function(){
      var s=document.createElement('style');
      s.textContent=
        '@page{size:${wPx}px ${hPx}px;margin:0;}'+
        'html,body{margin:0!important;padding:0!important;background:#fff;}'+
        // Explicit page blocks map 1:1 to sheets.
        '.page{box-sizing:border-box;width:${wPx}px;min-height:${hPx}px;overflow:hidden;'+
        'break-after:page;page-break-after:always;break-inside:avoid;}'+
        '.page:last-child{break-after:auto;page-break-after:auto;}'+
        // For legacy long-flow docs, avoid ugly splits mid-element.
        'tr,img,figure,pre,table,blockquote{break-inside:avoid;}'+
        'h1,h2,h3,h4{break-after:avoid;}';
      document.head.appendChild(s);
      window.scrollTo(0,0);
      return true;
    })()`)
    await new Promise(r => setTimeout(r, 60))

    return (await wc.printToPDF({
      printBackground: true,
      landscape: !!opts.landscape,
      // preferCSSPageSize honours the injected @page size; pageSize is a fallback.
      pageSize: { width: wPx / 96, height: hPx / 96 }, // inches
      margins: { top: marginIn, bottom: marginIn, left: marginIn, right: marginIn },
      preferCSSPageSize: true,
      scale: Math.min(2, Math.max(0.1, opts.scale ?? 1)),
    })) as Buffer
  } finally {
    if (attached) { try { wc.debugger.detach() } catch {} }
    win.destroy()
  }
}

/** Concatenate several PDF buffers into one, preserving vector content. */
async function mergePdfs(buffers: Buffer[]): Promise<Buffer> {
  if (buffers.length === 1) return buffers[0]
  const out = await PDFDocument.create()
  for (const buf of buffers) {
    const src = await PDFDocument.load(buf)
    const pages = await out.copyPages(src, src.getPageIndices())
    for (const pg of pages) out.addPage(pg)
  }
  return Buffer.from(await out.save())
}

/**
 * Detect whether a single HTML file is a multi-slide/multi-page deck and, if so,
 * capture each slide to its own image (showing one slide at a time, full-window,
 * so the deck's own layout/transitions don't matter). Returns the slide images
 * plus their natural size (which also gives the orientation). Falls back to a
 * single full-window shot.
 */
async function detectAndCaptureSlides(
  filePath: string, fallbackW: number, fallbackH: number,
): Promise<{ pngs: Buffer[]; w: number; h: number; multi: boolean }> {
  const win = offscreenWindow(fallbackW, fallbackH)
  const src = exportSource(filePath)
  try {
    try { await win.loadFile(src.path) } finally { src.cleanup() }
    await settle(win)
    const info = await win.webContents.executeJavaScript(`(function(){
      const sels=['[data-slide]','.slide','section.slide','.slides > section','.slides > div','.deck > section','.reveal .slides > section','section','.page','[class*="slide"]'];
      let nodes=[];
      for(const s of sels){ try{ const n=[...document.querySelectorAll(s)].filter(e=>e.offsetWidth>80&&e.offsetHeight>80); if(n.length>1){ nodes=n; break; } }catch(e){} }
      if(nodes.length<2) return {count:0};
      nodes.forEach((el,i)=>el.setAttribute('data-cowr-slide',String(i)));
      const r=nodes[0].getBoundingClientRect();
      return {count:nodes.length, w:Math.max(320,Math.round(r.width)), h:Math.max(240,Math.round(r.height))};
    })()`) as { count: number; w?: number; h?: number }

    if (!info || info.count < 2) {
      win.setContentSize(fallbackW, fallbackH)
      await new Promise(r => setTimeout(r, 120))
      return { pngs: [await capture(win, fallbackW, fallbackH)], w: fallbackW, h: fallbackH, multi: false }
    }

    const w = info.w ?? fallbackW, h = info.h ?? fallbackH
    win.setContentSize(w, h)
    await new Promise(r => setTimeout(r, 200))
    const pngs: Buffer[] = []
    for (let i = 0; i < info.count; i++) {
      await win.webContents.executeJavaScript(`(function(){
        document.querySelectorAll('[data-cowr-slide]').forEach(el=>{ el.style.display='none'; });
        const cur=document.querySelector('[data-cowr-slide="'+${i}+'"]');
        if(cur){ cur.style.display='block'; cur.style.position='fixed'; cur.style.left='0'; cur.style.top='0'; cur.style.margin='0'; cur.style.width='100vw'; cur.style.height='100vh'; cur.style.transform='none'; cur.style.opacity='1'; cur.style.visibility='visible'; }
        window.scrollTo(0,0);
      })()`)
      await new Promise(r => setTimeout(r, 200))
      pngs.push(await capture(win, w, h))
    }
    return { pngs, w, h, multi: true }
  } finally { win.destroy() }
}

function baseName(srcPath?: string, name?: string): string {
  if (name) return name.replace(/[^\w.\- ]+/g, '_').trim() || 'export'
  if (srcPath) return path.basename(srcPath).replace(/\.[^.]+$/, '')
  return 'export'
}

/** Build a parented, correctly-typed native save dialog. */
async function askSavePath(defaultName: string, label: string, exts: string[]): Promise<string | null> {
  const parent = BrowserWindow.getFocusedWindow() ?? undefined
  const opts = {
    defaultPath: defaultName,
    buttonLabel: 'Export',
    nameFieldLabel: 'Export As:',
    filters: [{ name: label, extensions: exts }],
    properties: ['createDirectory', 'showOverwriteConfirmation'] as any,
  }
  const r = parent ? await dialog.showSaveDialog(parent, opts) : await dialog.showSaveDialog(opts)
  if (r.canceled || !r.filePath) return null
  // Guarantee the chosen path carries the right extension.
  const want = '.' + exts[0]
  return r.filePath.toLowerCase().endsWith(want) ? r.filePath : r.filePath + want
}

/** Assemble PNG slide images into a .pptx written straight to disk. */
async function writePptx(filePath: string, pngs: Buffer[], w: number, h: number): Promise<void> {
  const PptxGenJS = nodeRequire('pptxgenjs')
  const Ctor = PptxGenJS.default ?? PptxGenJS
  const pptx = new Ctor()
  const inW = 13.333, inH = +(inW * (h / w)).toFixed(3)
  pptx.defineLayout({ name: 'COWR', width: inW, height: inH })
  pptx.layout = 'COWR'
  for (const png of pngs) {
    const slide = pptx.addSlide()
    slide.addImage({ data: 'data:image/png;base64,' + png.toString('base64'), x: 0, y: 0, w: inW, h: inH })
  }
  // writeFile writes to disk itself — the most reliable path on every platform.
  await pptx.writeFile({ fileName: filePath })
}

interface Payload { srcPath?: string; html?: string; name?: string; landscape?: boolean; width?: number; height?: number; document?: boolean; format?: 'png' | 'jpeg'; scale?: number; quality?: number }
interface DeckPayload { files: string[]; name?: string; slideW?: number; slideH?: number; document?: boolean }
interface AdvPdfPayload { files: string[]; name?: string; pageSize?: 'fit' | 'a4' | 'letter'; landscape?: boolean; marginIn?: number; scale?: number; fitW?: number; fitH?: number; document?: boolean }

export function registerExportIPC(): void {
  // Plain "Save a copy" of the source HTML file.
  ipcMain.handle('export:saveCopy', async (_, { srcPath }: { srcPath: string }) => {
    if (!srcPath || !fs.existsSync(srcPath)) return { ok: false, error: 'File not found' }
    const ext = (path.extname(srcPath).replace('.', '') || 'html').toLowerCase()
    const filePath = await askSavePath(path.basename(srcPath), ext.toUpperCase(), [ext])
    if (!filePath) return { ok: false }
    try { fs.copyFileSync(srcPath, filePath); return { ok: true, path: filePath } }
    catch (e: any) { return { ok: false, error: e.message } }
  })

  // Single screen → PDF. A multi-slide HTML paginates one slide per page; a flat
  // document is printed directly (keeping selectable text + proper page size).
  ipcMain.handle('export:toPdf', async (_, p: Payload) => {
    const filePath = await askSavePath(baseName(p.srcPath, p.name) + '.pdf', 'PDF', ['pdf'])
    if (!filePath) return { ok: false }
    try {
      // Documents: print the file itself to a VECTOR A4 PDF (selectable text,
      // pixel-exact). Skip the raster/slide-detection path that caused drift and
      // wrongly split a page's <section>s into separate rasterized "slides".
      if (p.document && p.srcPath && fs.existsSync(p.srcPath)) {
        const pdf = await fileToPdfVector(p.srcPath, { landscape: false, widthPx: 794, heightPx: 1123 })
        fs.writeFileSync(filePath, pdf)
        return { ok: true, path: filePath, count: await countPdfPages(pdf) }
      }
      if (p.srcPath && fs.existsSync(p.srcPath)) {
        const det = await detectAndCaptureSlides(p.srcPath, p.landscape ? 1280 : 794, p.landscape ? 720 : 1123)
        if (det.multi) {
          fs.writeFileSync(filePath, await imagesToPdf(det.pngs, det.w, det.h))
          return { ok: true, path: filePath, count: det.pngs.length }
        }
      }
      // Dosyadan geliyorsa yerel görselleri göm: htmlToPdf içeriği tmp'ye yazıp
      // yüklüyor, orada göreli/mutlak yerel yollar çözülemezdi.
      const html = p.html ?? (p.srcPath ? readInlined(p.srcPath).content : '')
      if (!html) return { ok: false, error: 'Nothing to export' }
      fs.writeFileSync(filePath, await htmlToPdf(html, !!p.landscape))
      return { ok: true, path: filePath, count: 1 }
    } catch (e: any) { return { ok: false, error: e.message } }
  })

  // Single HTML file → PPTX. Multi-slide files become one slide per page.
  ipcMain.handle('export:fileToPptx', async (_, p: Payload) => {
    if (!p.srcPath || !fs.existsSync(p.srcPath)) return { ok: false, error: 'File not found' }
    const filePath = await askSavePath(baseName(p.srcPath, p.name) + '.pptx', 'PowerPoint', ['pptx'])
    if (!filePath) return { ok: false }
    try {
      const det = await detectAndCaptureSlides(p.srcPath, p.width ?? 1280, p.height ?? 720)
      await writePptx(filePath, det.pngs, det.w, det.h)
      return { ok: true, path: filePath, count: det.pngs.length }
    } catch (e: any) { return { ok: false, error: e.message } }
  })

  // Single screen → PNG / JPEG image (optional hi-res scale for crisp output).
  ipcMain.handle('export:toImage', async (_, p: Payload) => {
    const fmt = p.format === 'jpeg' ? 'jpeg' : 'png'
    const ext = fmt === 'jpeg' ? 'jpg' : 'png'
    const scale = Math.min(4, Math.max(1, p.scale ?? 1))
    const W = Math.round((p.width ?? 1280) * scale)
    const H = Math.round((p.height ?? 800) * scale)
    const filePath = await askSavePath(baseName(p.srcPath, p.name) + '.' + ext, fmt.toUpperCase(), [ext])
    if (!filePath) return { ok: false }
    try {
      const img = p.srcPath && fs.existsSync(p.srcPath)
        ? await fileToNativeImage(p.srcPath, W, H)
        : nativeImage.createFromBuffer(await htmlToPng(p.html ?? '', W, H))
      const buf = fmt === 'jpeg' ? img.toJPEG(Math.min(100, Math.max(1, p.quality ?? 92))) : img.toPNG()
      fs.writeFileSync(filePath, buf)
      return { ok: true, path: filePath }
    } catch (e: any) { return { ok: false, error: e.message } }
  })

  // Single screen → copy PNG to the system clipboard.
  ipcMain.handle('export:copyImage', async (_, p: Payload) => {
    try {
      const W = p.width ?? 1280, H = p.height ?? 800
      const img = p.srcPath && fs.existsSync(p.srcPath)
        ? await fileToNativeImage(p.srcPath, W, H)
        : nativeImage.createFromBuffer(await htmlToPng(p.html ?? '', W, H))
      clipboard.writeImage(img)
      return { ok: true }
    } catch (e: any) { return { ok: false, error: e.message } }
  })

  // Advanced PDF: one or many screens → PDF with page size, orientation, margin
  // and scale from the export-preview dialog. Each file becomes one page; merged.
  ipcMain.handle('export:toPdfAdvanced', async (_, p: AdvPdfPayload) => {
    const files = (p.files ?? []).filter(f => fs.existsSync(f))
    if (files.length === 0) return { ok: false, error: 'No screens to export' }
    const filePath = await askSavePath(baseName(undefined, p.name) + '.pdf', 'PDF', ['pdf'])
    if (!filePath) return { ok: false }

    // ── Documents: paginate ────────────────────────────────────────────────
    // A document section is NOT one fixed page — it flows across as many A4
    // sheets as its content needs. Print each file paginated, merge in order,
    // and do NOT enforce "one page per file" (that check clipped long docs).
    if (p.document) {
      try {
        const parts: Buffer[] = []
        const failures: string[] = []
        for (const f of files) {
          try {
            parts.push(await fileToPdfVector(f, {
              landscape: !!p.landscape,
              widthPx: p.fitW ?? 794,
              heightPx: p.fitH ?? 1123,
              marginIn: p.marginIn,
              scale: p.scale,
            }))
          } catch (e: any) {
            failures.push(`${path.basename(f)}: ${e?.message ?? e}`)
          }
        }
        if (failures.length > 0) return { ok: false, error: `PDF export incomplete: ${failures.join('; ')}` }
        const merged = await mergePdfs(parts)
        fs.writeFileSync(filePath, merged)
        return { ok: true, path: filePath, count: await countPdfPages(merged) }
      } catch (e: any) {
        return { ok: false, error: e.message }
      }
    }

    // ── Slides / screens: exactly one page per file ─────────────────────────
    // ONE reused offscreen window + one debugger session for the whole deck.
    const win = offscreenWindow(p.fitW ?? 794, p.fitH ?? 1123, false)
    const wc = win.webContents
    let attached = false
    try {
      try { wc.debugger.attach('1.3'); attached = true } catch { /* print media fallback */ }
      const parts: Buffer[] = []
      const failures: string[] = []
      for (const f of files) {
        try {
          parts.push(await renderPdfPageWithRetry(win, f, p))
        } catch (e: any) {
          const msg = `${path.basename(f)}: ${e?.message ?? e}`
          failures.push(msg)
          console.error('[export:toPdfAdvanced] page failed after retry:', f, e?.message ?? e)
        }
      }
      if (failures.length > 0) return { ok: false, error: `PDF export incomplete: ${failures.join('; ')}` }
      const merged = await mergePdfs(parts)
      const pageCount = await countPdfPages(merged)
      if (pageCount !== files.length) {
        return { ok: false, error: `PDF export page mismatch: expected ${files.length} pages, rendered ${pageCount}` }
      }
      fs.writeFileSync(filePath, merged)
      return { ok: true, path: filePath, count: pageCount }
    } catch (e: any) {
      return { ok: false, error: e.message }
    } finally {
      if (attached) { try { wc.debugger.detach() } catch {} }
      win.destroy()
    }
  })

  // Whole deck → one multi-page PDF (each file = one page, rendered as an image).
  ipcMain.handle('export:deckToPdf', async (_, p: DeckPayload) => {
    const files = (p.files ?? []).filter(f => fs.existsSync(f))
    if (files.length === 0) return { ok: false, error: 'No screens to export' }
    const w = p.slideW ?? 1280, h = p.slideH ?? 720
    const filePath = await askSavePath(baseName(undefined, p.name) + '.pdf', 'PDF', ['pdf'])
    if (!filePath) return { ok: false }
    try {
      // Documents: print each page to a VECTOR A4 PDF, then merge into one — the
      // pages are the files themselves, not screenshots. No raster drift.
      if (p.document) {
        const parts: Buffer[] = []
        for (const f of files) parts.push(await fileToPdfVector(f, { landscape: false, widthPx: 794, heightPx: 1123 }))
        const merged = await mergePdfs(parts)
        fs.writeFileSync(filePath, merged)
        // Her dosya artık birden çok A4 sayfaya bölünebilir — gerçek sayfa sayısını döndür.
        return { ok: true, path: filePath, count: await countPdfPages(merged) }
      }
      const pngs: Buffer[] = []
      for (const f of files) pngs.push(await fileToPng(f, w, h))
      fs.writeFileSync(filePath, await imagesToPdf(pngs, w, h))
      return { ok: true, path: filePath, count: files.length }
    } catch (e: any) { return { ok: false, error: e.message } }
  })

  // Whole deck → PPTX (each file = one full-bleed slide image).
  ipcMain.handle('export:deckToPptx', async (_, p: DeckPayload) => {
    const files = (p.files ?? []).filter(f => fs.existsSync(f))
    if (files.length === 0) return { ok: false, error: 'No screens to export' }
    const w = p.slideW ?? 1280, h = p.slideH ?? 720
    const filePath = await askSavePath(baseName(undefined, p.name) + '.pptx', 'PowerPoint', ['pptx'])
    if (!filePath) return { ok: false }
    try {
      const pngs: Buffer[] = []
      for (const f of files) pngs.push(await fileToPng(f, w, h))
      await writePptx(filePath, pngs, w, h)
      return { ok: true, path: filePath, count: files.length }
    } catch (e: any) { return { ok: false, error: e.message } }
  })

  // ── Animation → WebM video (frame-by-frame capture + MediaRecorder) ──────
  ipcMain.handle('export:toLegacyVideo', async (_, p: { srcPath: string; name?: string; width?: number; height?: number; fps?: number; durationInFrames?: number }) => {
    if (!p.srcPath || !fs.existsSync(p.srcPath)) return { ok: false, error: 'File not found' }
    const w = p.width ?? 1280, h = p.height ?? 720
    const fps = Math.max(1, p.fps ?? 30)
    const totalFrames = Math.max(1, p.durationInFrames ?? fps * 5)
    const filePath = await askSavePath(baseName(p.srcPath, p.name) + '.webm', 'WebM Video', ['webm'])
    if (!filePath) return { ok: false }
    // 1. Capture every frame as PNG
    const renderWin = offscreenWindow(w, h)
    const src = exportSource(p.srcPath)
    const framePngs: Buffer[] = []
    try {
      await renderWin.loadFile(src.path)
      renderWin.setContentSize(w, h)
      await settle(renderWin)
      // Inject sibling shared.css for consistent theming.
      try {
        const sharedPath = p.srcPath.replace(/[^/\\]+$/, 'shared.css')
        if (fs.existsSync(sharedPath)) {
          const shared = fs.readFileSync(sharedPath, 'utf-8')
          await renderWin.webContents.executeJavaScript(`(function(){var s=document.createElement('style');s.textContent=${JSON.stringify(shared)};document.head.insertBefore(s,document.head.firstChild);return true;})()`)
          await new Promise(r => setTimeout(r, 40))
        }
      } catch { /* no shared.css */ }
      for (let frame = 0; frame < totalFrames; frame++) {
        const time = frame / fps
        const last = Math.max(1, totalFrames - 1)
        const progress = frame / last
        await renderWin.webContents.executeJavaScript(`(function(){
          var root=document.documentElement;
          root.style.setProperty('--cw-frame','${frame}');
          root.style.setProperty('--cw-time','${time}');
          root.style.setProperty('--cw-progress','${progress}');
          window.dispatchEvent(new CustomEvent('cowrangler:frame',{detail:{frame:${frame},fps:${fps},time:${time},progress:${progress},durationInFrames:${totalFrames}}}));
        })()`)
        await new Promise(r => setTimeout(r, 60))
        framePngs.push(await capture(renderWin, w, h))
      }
    } finally { src.cleanup(); renderWin.destroy() }

    // 2. Encode PNGs → WebM via an offscreen canvas + MediaRecorder
    const encoderHtml = `<!doctype html><html><head><meta charset="utf-8"></head><body>
      <canvas id="c" width="${w}" height="${h}"></canvas>
      <script>
        window.__encodeVideo = async function(pngDataUrls, fps) {
          const canvas = document.getElementById('c');
          const ctx = canvas.getContext('2d');
          const frameDuration = 1000 / fps;
          const stream = canvas.captureStream(0);
          const recorder = new MediaRecorder(stream, {
            mimeType: 'video/webm;codecs=vp8',
            videoBitsPerSecond: 8_000_000,
          });
          const chunks = [];
          recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
          const done = new Promise(resolve => { recorder.onstop = () => resolve(); });
          recorder.start();
          for (let i = 0; i < pngDataUrls.length; i++) {
            await new Promise((resolve, reject) => {
              const img = new Image();
              img.onload = () => { ctx.drawImage(img, 0, 0, canvas.width, canvas.height); resolve(); };
              img.onerror = reject;
              img.src = pngDataUrls[i];
            });
            stream.getVideoTracks()[0].requestFrame();
            await new Promise(r => setTimeout(r, frameDuration));
          }
          recorder.stop();
          await done;
          const blob = new Blob(chunks, { type: 'video/webm' });
          const buf = await blob.arrayBuffer();
          return btoa(String.fromCharCode(...new Uint8Array(buf)));
        };
      </script>
    </body></html>`
    const encWin = offscreenWindow(w, h)
    const tmpEncoder = writeTempHtml(encoderHtml)
    try {
      await encWin.loadFile(tmpEncoder)
      await new Promise(r => setTimeout(r, 200))
      // Convert PNG buffers to data URLs in batches to avoid IPC size limits.
      const BATCH = 30
      const dataUrls: string[] = []
      for (let i = 0; i < framePngs.length; i += BATCH) {
        const batch = framePngs.slice(i, i + BATCH).map(b => 'data:image/png;base64,' + b.toString('base64'))
        await encWin.webContents.executeJavaScript(`window.__frameBatch = window.__frameBatch || []; window.__frameBatch.push(...${JSON.stringify(batch)}); true`)
      }
      const b64 = await encWin.webContents.executeJavaScript(`window.__encodeVideo(window.__frameBatch, ${fps})`)
      const videoBuf = Buffer.from(b64, 'base64')
      fs.writeFileSync(filePath, videoBuf)
      return { ok: true, path: filePath }
    } catch (e: any) {
      return { ok: false, error: e.message }
    } finally {
      try { fs.rmSync(tmpEncoder, { force: true }) } catch {}
      encWin.destroy()
    }
  })

  // A real Remotion render. Preview and export execute the same finite React
  // composition, so frame timing no longer depends on capture speed or a
  // MediaRecorder wall clock.
  ipcMain.handle('export:toVideo', async (event, p: { srcPath: string; name?: string; width?: number; height?: number; fps?: number; durationInFrames?: number; tweakVars?: Record<string, string> }) => {
    if (!p.srcPath || !fs.existsSync(p.srcPath)) return { ok: false, error: 'File not found' }
    if (!/\.tsx$/i.test(p.srcPath)) {
      return { ok: false, error: 'This is a legacy browser animation. Convert it to a Remotion .tsx composition before exporting.' }
    }
    const width = Math.max(1, p.width ?? 1280)
    const height = Math.max(1, p.height ?? 720)
    const fps = Math.max(1, p.fps ?? 30)
    const durationInFrames = Math.max(1, p.durationInFrames ?? fps * 5)
    const filePath = await askSavePath(baseName(p.srcPath, p.name) + '.mp4', 'MP4 Video', ['mp4'])
    if (!filePath) return { ok: false }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cowr-remotion-'))
    const entryPoint = path.join(tempDir, 'index.tsx')
    const projectRoot = path.dirname(path.dirname(p.srcPath))
    const publicDir = path.join(projectRoot, 'public')
    let lastPhase = ''
    let lastProgress = -1
    let lastReportAt = 0
    const report = (phase: 'bundling' | 'browser' | 'rendering', progress: number) => {
      const normalized = Math.max(0, Math.min(1, progress))
      const now = Date.now()
      if (phase === lastPhase && normalized < 1 && normalized - lastProgress < 0.005 && now - lastReportAt < 120) return
      lastPhase = phase
      lastProgress = normalized
      lastReportAt = now
      if (!event.sender.isDestroyed()) event.sender.send('export:videoProgress', { srcPath: p.srcPath, phase, progress: normalized })
    }
    // Keep the import token split in this source file. electron-vite's global
    // CommonJS pass otherwise mistakes imports inside this template for imports
    // of the Electron main module and injects a node:module shim into the
    // generated browser composition.
    const importKeyword = ['im', 'port'].join('')
    fs.writeFileSync(entryPoint, `
${importKeyword} React from 'react';
${importKeyword} {AbsoluteFill, Composition, registerRoot} from 'remotion';
${importKeyword} CowranglerComposition from ${JSON.stringify(path.resolve(p.srcPath))};

const PreviewMatchedComposition = () => (
  <AbsoluteFill style={${JSON.stringify(p.tweakVars ?? {})}}>
    <CowranglerComposition />
  </AbsoluteFill>
);

const Root = () => (
  <Composition
    id="CowranglerAnimation"
    component={PreviewMatchedComposition}
    width={${width}}
    height={${height}}
    fps={${fps}}
    durationInFrames={${durationInFrames}}
  />
);

registerRoot(Root);
`, 'utf-8')

    try {
      const serveUrl = await bundle({
        entryPoint,
        rootDir: projectRoot,
        publicDir: fs.existsSync(publicDir) ? publicDir : null,
        onProgress: progress => report('bundling', progress / 100),
      })
      const onBrowserDownload = () => ({ onProgress: progress => report('browser', progress.percent), version: null })
      report('rendering', 0)
      const composition = await selectComposition({
        serveUrl,
        id: 'CowranglerAnimation',
        onBrowserDownload,
      })
      await renderMedia({
        serveUrl,
        composition,
        codec: 'h264',
        outputLocation: filePath,
        overwrite: true,
        pixelFormat: 'yuv420p',
        crf: 18,
        onBrowserDownload,
        onProgress: progress => report('rendering', progress.progress),
      })
      return { ok: true, path: filePath }
    } catch (e: any) {
      // Never leave a corrupt partial video at a path the user selected.
      try { fs.rmSync(filePath, { force: true }) } catch {}
      return { ok: false, error: e?.message ?? String(e) }
    } finally {
      try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}
    }
  })
}
