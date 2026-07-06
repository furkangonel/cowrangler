/**
 * LivePreviewPanel — Code sağ panelindeki canlı önizleme (WP-5).
 *
 * Ekran görüntüsündeki "Setting up preview" akışını yakalar:
 *   • workdir'de çalışan dev-server portunu yoklar (preview:detect).
 *   • Bulununca iframe'de canlı uygulamayı gösterir; araç çubuğu: geri/ileri/
 *     yenile, cihaz genişliği (masaüstü/tablet/telefon), tarayıcıda aç, URL.
 *   • Server yoksa mascot + "Setting up preview" + yeniden dene (poll).
 */
import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  ArrowLeft, ArrowRight, RotateCw, ExternalLink,
  Monitor, Tablet, Smartphone,
} from 'lucide-react'
import { ipc } from '../../lib/ipc'
import { useGitStore } from '../../stores/git.store'
import { Octopus } from '../shared/Octopus'

type Device = 'desktop' | 'tablet' | 'mobile'
const DEVICE_WIDTH: Record<Device, number | null> = { desktop: null, tablet: 768, mobile: 390 }

export function LivePreviewPanel() {
  const workdir = useGitStore((s) => s.workdir)
  const [url, setUrl] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<'detecting' | 'ready' | 'none'>('detecting')
  const [device, setDevice] = useState<Device>('desktop')
  const [reloadKey, setReloadKey] = useState(0)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const pollRef = useRef<number | null>(null)

  const detect = useCallback(async () => {
    setStatus('detecting')
    const found = await ipc.preview.detect(workdir ?? undefined).catch(() => null)
    if (found) {
      setUrl(found.url)
      setInput(found.url)
      setStatus('ready')
      return true
    }
    setStatus('none')
    return false
  }, [workdir])

  // İlk tespit + server gelene kadar yokla (dev-server henüz başlıyor olabilir).
  useEffect(() => {
    let cancelled = false
    detect().then((ok) => {
      if (cancelled || ok) return
      pollRef.current = window.setInterval(async () => {
        const found = await ipc.preview.detect(workdir ?? undefined).catch(() => null)
        if (found) {
          setUrl(found.url); setInput(found.url); setStatus('ready')
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
        }
      }, 2500)
    })
    return () => {
      cancelled = true
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [detect, workdir])

  const go = (u: string) => {
    let full = u.trim()
    if (!full) return
    if (!/^https?:\/\//.test(full)) full = `http://${full}`
    setUrl(full)
    setStatus('ready')
    setReloadKey((k) => k + 1)
  }

  const reload = () => setReloadKey((k) => k + 1)
  const back = () => { try { iframeRef.current?.contentWindow?.history.back() } catch { /* cross-origin */ } }
  const forward = () => { try { iframeRef.current?.contentWindow?.history.forward() } catch { /* cross-origin */ } }
  const openExternal = () => { if (url) ipc.fs.openExternal(url) }

  const width = DEVICE_WIDTH[device]

  return (
    <div className="flex flex-col h-full bg-bg-secondary">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border-subtle flex-shrink-0">
        <ToolBtn onClick={back} title="Back"><ArrowLeft size={13} /></ToolBtn>
        <ToolBtn onClick={forward} title="Forward"><ArrowRight size={13} /></ToolBtn>
        <ToolBtn onClick={reload} title="Reload"><RotateCw size={13} /></ToolBtn>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') go(input) }}
          placeholder="localhost:5173"
          className="flex-1 min-w-0 mx-1 px-2 py-1 rounded-md bg-bg-primary border border-border-subtle font-mono text-[11px] focus:outline-none focus:border-accent"
        />
        <div className="flex items-center gap-0.5 mr-0.5">
          <ToolBtn onClick={() => setDevice('desktop')} title="Desktop" active={device === 'desktop'}><Monitor size={13} /></ToolBtn>
          <ToolBtn onClick={() => setDevice('tablet')} title="Tablet" active={device === 'tablet'}><Tablet size={13} /></ToolBtn>
          <ToolBtn onClick={() => setDevice('mobile')} title="Mobile" active={device === 'mobile'}><Smartphone size={13} /></ToolBtn>
        </div>
        <ToolBtn onClick={openExternal} title="Open in browser"><ExternalLink size={13} /></ToolBtn>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 bg-bg-primary flex items-center justify-center overflow-auto">
        {status === 'ready' && url ? (
          <iframe
            key={reloadKey}
            ref={iframeRef}
            src={url}
            title="Live preview"
            className="bg-white h-full border-0"
            style={{ width: width ? `${width}px` : '100%', maxWidth: '100%' }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          />
        ) : (
          <div className="flex flex-col items-center gap-3 text-center px-6">
            <Octopus size={44} className={status === 'detecting' ? 'animate-pulse' : ''} />
            <div className="flex items-center gap-2 text-xs text-text-muted">
              {status === 'detecting' && <span className="inline-block w-3 h-3 border-2 border-text-muted/40 border-t-accent rounded-full animate-spin" />}
              {status === 'detecting' ? 'Setting up preview…' : 'No dev server detected.'}
            </div>
            {status === 'none' && (
              <>
                <p className="text-[11px] text-text-muted max-w-[220px]">
                  Start your dev server (e.g. <span className="font-mono">npm run dev</span>) or enter a URL above.
                </p>
                <button
                  onClick={() => detect()}
                  className="px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors"
                >
                  Retry detection
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ToolBtn({ onClick, title, active, children }: { onClick: () => void; title: string; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-md transition-colors ${
        active ? 'bg-bg-tertiary text-text-primary' : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
      }`}
    >
      {children}
    </button>
  )
}
