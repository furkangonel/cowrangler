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

function writeTempHtml(html: string): string {
  const tmpPath = path.join(os.tmpdir(), `cowr_exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.html`)
  fs.writeFileSync(tmpPath, html, 'utf-8')
  return tmpPath
}

// CommonJS require bound to this module — used only for pptxgenjs so we load its
// CJS entry point reliably from an ESM main process.
const require = createRequire(import.meta.url)

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
  try {
    await win.loadFile(filePath)
    win.setContentSize(width, height)
    await settle(win)
    return await capture(win, width, height)
  } finally { win.destroy() }
}

/** Render a self-contained HTML file to a NativeImage (for JPEG / clipboard). */
async function fileToNativeImage(filePath: string, width: number, height: number): Promise<Electron.NativeImage> {
  const win = offscreenWindow(width, height)
  try {
    await win.loadFile(filePath)
    win.setContentSize(width, height)
    await settle(win)
    return await win.webContents.capturePage({ x: 0, y: 0, width, height })
  } finally { win.destroy() }
}

/**
 * Print a file to PDF honouring user page settings (size, orientation, margin,
 * scale). Screen media is emulated so the PDF matches the on-canvas preview.
 */
async function fileToPdfAdvanced(
  filePath: string,
  o: { pageSize?: 'fit' | 'a4' | 'letter'; landscape?: boolean; marginIn?: number; scale?: number; fitW?: number; fitH?: number },
): Promise<Buffer> {
  const fitW = o.fitW ?? 794
  const fitH = o.fitH ?? 1123
  const win = offscreenWindow(fitW, fitH, false)
  const wc = win.webContents
  let attached = false
  try {
    await win.loadFile(filePath)
    win.setContentSize(fitW, fitH)
    await settle(win)
    try {
      wc.debugger.attach('1.3'); attached = true
      await wc.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'screen' })
    } catch { /* fall back to print media */ }
    // Inject sibling shared.css (theme vars) at the top of <head> so the export
    // matches the canvas, which inlines the same shared stylesheet.
    try {
      const sharedPath = filePath.replace(/[^/\\]+$/, 'shared.css')
      if (fs.existsSync(sharedPath)) {
        const shared = fs.readFileSync(sharedPath, 'utf-8')
        await wc.executeJavaScript(`(function(){var s=document.createElement('style');s.textContent=${JSON.stringify(shared)};document.head.insertBefore(s,document.head.firstChild);return true;})()`)
        await new Promise(r => setTimeout(r, 40))
      }
    } catch { /* no shared.css → file is self-contained */ }
    let pageSize: any
    if (o.pageSize === 'a4') pageSize = 'A4'
    else if (o.pageSize === 'letter') pageSize = 'Letter'
    else pageSize = { width: fitW / 96, height: fitH / 96 } // 'fit' → content size in inches
    const m = Math.max(0, o.marginIn ?? 0)
    return (await wc.printToPDF({
      printBackground: true,
      landscape: !!o.landscape,
      pageSize,
      margins: { top: m, bottom: m, left: m, right: m },
      scale: Math.min(2, Math.max(0.1, o.scale ?? 1)),
      preferCSSPageSize: false,
    })) as Buffer
  } finally {
    if (attached) { try { wc.debugger.detach() } catch {} }
    win.destroy()
  }
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
 * Print a self-contained HTML file straight to a VECTOR PDF at a fixed page size
 * (default A4). Unlike the raster path (capturePage → PNG → PDF), this keeps text
 * selectable and the layout pixel-exact — no scaling/clipping "drift". Used for
 * documents so the exported PDF is the file itself, not a screenshot of it.
 */
async function fileToPdfVector(
  filePath: string,
  opts: { landscape?: boolean; widthPx?: number; heightPx?: number } = {},
): Promise<Buffer> {
  // Design pages are authored at 794×1123 CSS px (A4 @96dpi). Print at EXACTLY
  // that size (converted to inches) so `100vh`, centering and fixed layouts map
  // 1:1 — a "pageSize:'A4'" string drifts by a hair and shifts vh-based layouts.
  const wPx = opts.widthPx ?? 794
  const hPx = opts.heightPx ?? 1123
  // printToPDF needs a real (offscreen-positioned) window, not OSR.
  const win = offscreenWindow(wPx, hPx, false)
  const wc = win.webContents
  let attached = false
  try {
    await win.loadFile(filePath)
    win.setContentSize(wPx, hPx)
    await settle(win)
    // CRITICAL: the canvas preview renders SCREEN styles. printToPDF defaults to
    // PRINT media, so any `@media print` overrides in the file make the PDF look
    // different from the canvas. Force screen emulation so export == preview.
    try {
      wc.debugger.attach('1.3')
      attached = true
      await wc.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'screen' })
    } catch { /* debugger unavailable → fall back to print media */ }

    // Keep EACH design page to EXACTLY ONE PDF page. A few px of overflow (body
    // margins, sub-pixel borders) otherwise spills into a near-blank 2nd page.
    // The canvas already shows each page inside a fixed ${wPx}×${hPx} frame with
    // overflow clipped, so we reproduce that exactly: zero margins + clamp the
    // root box to one page + hide the sliver. No scaling → export == canvas,
    // and never more than one page per file.
    await wc.executeJavaScript(`(function(){
      var s=document.createElement('style');
      s.textContent='html,body{margin:0!important;padding:0!important;'+
        'width:${wPx}px!important;height:${hPx}px!important;'+
        'max-height:${hPx}px!important;overflow:hidden!important;}';
      document.head.appendChild(s);
      return true;
    })()`)
    await new Promise(r => setTimeout(r, 60))

    return (await wc.printToPDF({
      printBackground: true,
      landscape: !!opts.landscape,
      pageSize: { width: wPx / 96, height: hPx / 96 }, // inches
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      preferCSSPageSize: false,
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
  try {
    await win.loadFile(filePath)
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
  const PptxGenJS = require('pptxgenjs')
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
interface AdvPdfPayload { files: string[]; name?: string; pageSize?: 'fit' | 'a4' | 'letter'; landscape?: boolean; marginIn?: number; scale?: number; fitW?: number; fitH?: number }

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
        fs.writeFileSync(filePath, await fileToPdfVector(p.srcPath, { landscape: false, widthPx: 794, heightPx: 1123 }))
        return { ok: true, path: filePath, count: 1 }
      }
      if (p.srcPath && fs.existsSync(p.srcPath)) {
        const det = await detectAndCaptureSlides(p.srcPath, p.landscape ? 1280 : 794, p.landscape ? 720 : 1123)
        if (det.multi) {
          fs.writeFileSync(filePath, await imagesToPdf(det.pngs, det.w, det.h))
          return { ok: true, path: filePath, count: det.pngs.length }
        }
      }
      const html = p.html ?? (p.srcPath ? fs.readFileSync(p.srcPath, 'utf-8') : '')
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
    try {
      const parts: Buffer[] = []
      for (const f of files) parts.push(await fileToPdfAdvanced(f, p))
      fs.writeFileSync(filePath, await mergePdfs(parts))
      return { ok: true, path: filePath, count: files.length }
    } catch (e: any) { return { ok: false, error: e.message } }
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
        fs.writeFileSync(filePath, await mergePdfs(parts))
        return { ok: true, path: filePath, count: files.length }
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
}
