/**
 * TerminalPanel — sağ panel Code sekmesindeki çok-sekmeli gerçek pty terminali.
 *
 *   • Her sekme, oturumun proje dizininde (workdir) çalışan bağımsız bir pty.
 *   • "+" ile yeni terminal eklenir, her sekme ayrı süreç.
 *   • xterm.js render, node-pty (main) ile çift yönlü akış (term:* IPC).
 *
 * Terminaller sekme gizlense de canlı kalır (display:none); yeniden görünürken
 * FitAddon ile boyutlanır.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, X, TerminalSquare } from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { ipc } from '../../lib/ipc'
import { useGitStore } from '../../stores/git.store'

interface TabInfo { id: string; title: string }

let seq = 0
function newId(): string {
  seq += 1
  return `term-${Date.now()}-${seq}`
}

export function TerminalPanel() {
  const workdir = useGitStore((s) => s.workdir)
  const [tabs, setTabs] = useState<TabInfo[]>(() => [{ id: newId(), title: 'Terminal 1' }])
  const [activeId, setActiveId] = useState<string>(() => tabs[0].id)

  const addTab = () => {
    const id = newId()
    setTabs((t) => [...t, { id, title: `Terminal ${t.length + 1}` }])
    setActiveId(id)
  }

  const closeTab = (id: string) => {
    ipc.terminal.kill(id).catch(() => {})
    setTabs((t) => {
      const next = t.filter((x) => x.id !== id)
      if (next.length === 0) {
        const nid = newId()
        setActiveId(nid)
        return [{ id: nid, title: 'Terminal 1' }]
      }
      if (id === activeId) setActiveId(next[next.length - 1].id)
      return next
    })
  }

  return (
    <div className="flex flex-col h-full bg-[#0e0e10]">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border-subtle bg-bg-secondary flex-shrink-0 overflow-x-auto">
        <TerminalSquare size={13} className="text-text-muted mr-1 flex-shrink-0" />
        {tabs.map((t) => (
          <div
            key={t.id}
            onClick={() => setActiveId(t.id)}
            className={`group flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-md text-xs cursor-pointer transition-colors flex-shrink-0 ${
              t.id === activeId
                ? 'bg-bg-tertiary text-text-primary'
                : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover/50'
            }`}
          >
            <span className="truncate max-w-[110px]">{t.title}</span>
            <button
              onClick={(e) => { e.stopPropagation(); closeTab(t.id) }}
              className="p-0.5 rounded hover:bg-bg-hover opacity-50 group-hover:opacity-100 transition-opacity"
              title="Close terminal"
            >
              <X size={11} />
            </button>
          </div>
        ))}
        <button
          onClick={addTab}
          className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors flex-shrink-0"
          title="New terminal"
        >
          <Plus size={13} />
        </button>
      </div>

      {/* Bodies — hepsi canlı, yalnız aktif görünür */}
      <div className="flex-1 relative min-h-0">
        {tabs.map((t) => (
          <TerminalInstance
            key={t.id}
            id={t.id}
            cwd={workdir}
            active={t.id === activeId}
          />
        ))}
      </div>
    </div>
  )
}

/* ── Tek pty terminali ────────────────────────────────────────────────────── */
function TerminalInstance({ id, cwd, active }: { id: string; cwd: string | null; active: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const [exited, setExited] = useState<number | null>(null)

  const theme = useMemo(
    () => ({
      background: '#0e0e10',
      foreground: '#e6e6e6',
      cursor: '#e05c2a',
      selectionBackground: 'rgba(224,92,42,0.3)',
      black: '#0e0e10',
      brightBlack: '#5c5c5c',
    }),
    [],
  )

  // Kur — bir kez.
  useEffect(() => {
    if (!containerRef.current) return
    const term = new Terminal({
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 12,
      cursorBlink: true,
      allowProposedApi: true,
      theme,
      scrollback: 5000,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    try { fit.fit() } catch { /* layout hazır değilse */ }
    termRef.current = term
    fitRef.current = fit

    // pty başlat
    ipc.terminal
      .create({ id, cwd, cols: term.cols, rows: term.rows })
      .catch(() => {})

    // klavye → pty
    const onKey = term.onData((data: string) => { ipc.terminal.input(id, data).catch(() => {}) })

    // pty → ekran
    const offData = ipc.terminal.onData((p) => { if (p.id === id) term.write(p.data) })
    const offExit = ipc.terminal.onExit((p) => {
      if (p.id === id) {
        setExited(p.code)
        term.writeln(`\r\n\x1b[90m[process exited with code ${p.code}]\x1b[0m`)
      }
    })

    // yeniden boyutlandırma
    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
        ipc.terminal.resize(id, term.cols, term.rows).catch(() => {})
      } catch { /* yoksay */ }
    })
    ro.observe(containerRef.current)

    return () => {
      onKey.dispose()
      offData()
      offExit()
      ro.disconnect()
      ipc.terminal.kill(id).catch(() => {})
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Aktif olunca odak + fit (gizliyken layout 0'dı).
  useEffect(() => {
    if (active && termRef.current && fitRef.current) {
      requestAnimationFrame(() => {
        try {
          fitRef.current!.fit()
          ipc.terminal.resize(id, termRef.current!.cols, termRef.current!.rows).catch(() => {})
          termRef.current!.focus()
        } catch { /* yoksay */ }
      })
    }
  }, [active, id])

  return (
    <div
      className="absolute inset-0 p-1.5"
      style={{ display: active ? 'block' : 'none' }}
    >
      <div ref={containerRef} className="w-full h-full" />
      {exited !== null && (
        <div className="absolute bottom-2 right-3 text-[10px] text-text-muted">exited ({exited})</div>
      )}
    </div>
  )
}
