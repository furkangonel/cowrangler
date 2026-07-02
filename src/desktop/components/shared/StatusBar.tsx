import React, { useEffect, useState, useRef } from 'react'
import { ChevronUp } from 'lucide-react'
import { useAgentStore } from '../../stores/agent.store'
import { useProjectsStore } from '../../stores/projects.store'
import { useSettingsStore } from '../../stores/settings.store'
import { ipc } from '../../lib/ipc'
import { formatTokenCount, contextPercent, contextBarColor } from '../../lib/tokens'
import { formatDuration } from '../../lib/time'

export function StatusBar() {
  const { activeProjectId } = useProjectsStore()
  const { contextSnapshot, status, toolCalls } = useAgentStore()
  const { getModel, setModel, savedModels } = useSettingsStore()
  const [sessionDuration, setSessionDuration] = useState(0)
  const [sessionStart] = useState(Date.now())
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const modelPickerRef = useRef<HTMLDivElement>(null)

  // Close picker on outside click
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setModelPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  // Refresh context snapshot periodically
  useEffect(() => {
    if (!activeProjectId) {
      useAgentStore.getState().setContextSnapshot(null)
      return
    }
    useAgentStore.getState().setContextSnapshot(null)
    const id = setInterval(async () => {
      const snap = await ipc.agent.getContextSnapshot(activeProjectId)
      if (snap) useAgentStore.getState().setContextSnapshot(snap)
    }, 2000)
    return () => clearInterval(id)
  }, [activeProjectId])

  // Session timer
  useEffect(() => {
    const id = setInterval(() => {
      setSessionDuration(Math.floor((Date.now() - sessionStart) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [sessionStart])

  const model = contextSnapshot?.model ?? getModel()
  const shortModel = model
    .replace('openrouter/', '')
    .replace('anthropic/', '')
    .replace('openai/', '')
    .replace('google/', '')
    .split('/').pop() ?? model

  const ctx = contextSnapshot
  const maxCtx = ctx ? (ctx.contextWindowSize ?? ctx.maxContextTokens ?? 128000) : 128000
  const pct = ctx ? contextPercent(ctx.contextTokens, maxCtx) : 0
  const barColor = contextBarColor(pct)

  function formatSessionTime(s: number) {
    const m = Math.floor(s / 60)
    const h = Math.floor(m / 60)
    if (h > 0) return `${h}:${pad(m % 60)}:${pad(s % 60)}`
    if (m > 0) return `${m}:${pad(s % 60)}`
    return `0:${pad(s)}`
  }

  function pad(n: number) { return String(n).padStart(2, '0') }

  const activeToolName = toolCalls.find(t => t.status === 'running')?.name

  return (
    <div
      className="flex items-center gap-3 px-4 border-t border-border bg-bg-secondary text-text-muted"
      style={{ height: 'var(--statusbar-height)', fontSize: '11px' }}
    >
      {/* Model Selector */}
      <div className="relative" ref={modelPickerRef}>
        <button
          onClick={() => setModelPickerOpen(o => !o)}
          disabled={status === 'thinking'}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-50 font-medium select-none"
          title="Change active model"
        >
          {/* Cowrangler lasso mark — original brand glyph */}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
               className="text-accent flex-shrink-0" aria-hidden="true">
            <ellipse cx="12" cy="8.5" rx="6.5" ry="5" />
            <path d="M12 13.5 C 12 17, 10 19, 8 21.5" />
          </svg>
          <span className="truncate max-w-[150px]">{shortModel}</span>
          <ChevronUp size={11} className={`transition-transform duration-200 text-text-muted/70 ${modelPickerOpen ? 'rotate-180' : ''}`} />
        </button>
        {modelPickerOpen && (
          <div className="absolute bottom-full left-0 mb-1.5 z-50 bg-bg-secondary border border-border rounded-xl shadow-pop overflow-hidden animate-slide-up w-80">
            <div className="p-2 space-y-0.5 max-h-60 overflow-y-auto">
              <p className="px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-text-muted select-none">Select active model</p>
              {savedModels.map(modelId => {
                const slash = modelId.indexOf('/')
                const provider = slash > 0 ? modelId.slice(0, slash) : null
                const name = slash > 0 ? modelId.slice(slash + 1) : modelId
                return (
                <button
                  key={modelId}
                  onClick={() => { setModel(modelId); setModelPickerOpen(false) }}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors ${
                    model === modelId ? 'bg-accent-subtle text-accent font-medium' : 'text-text-secondary hover:bg-bg-hover'
                  }`}
                >
                  {provider && (
                    <span className="flex-shrink-0 text-[8px] leading-none font-medium uppercase tracking-wide px-1 py-0.5 rounded bg-bg-tertiary text-text-muted/80 border border-border/50 max-w-[56px] truncate" title={provider}>
                      {provider}
                    </span>
                  )}
                  <span className="flex-1 truncate font-mono">{name}</span>
                  {model === modelId && <span className="text-2xs opacity-60">●</span>}
                </button>
                )
              })}
              {savedModels.length === 0 && (
                <p className="px-2.5 py-2 text-2xs text-text-muted italic">No saved models — add in Settings</p>
              )}
            </div>
          </div>
        )}
      </div>

      <span className="text-border">│</span>

      {/* Status */}
      {status === 'thinking' ? (
        <span className="text-accent animate-pulse">
          {activeToolName ? `${activeToolName}...` : 'Thinking...'}
        </span>
      ) : status === 'error' ? (
        <span className="text-error">Error</span>
      ) : (
        <span className="text-text-muted">Ready</span>
      )}

      {/* Context tokens */}
      {ctx && (
        <>
          <span className="text-border">│</span>
          <span>
            {formatTokenCount(ctx.contextTokens)}/{formatTokenCount(maxCtx)}
          </span>

          {/* Bar */}
          <div className="flex items-center gap-1">
            <div className="w-16 h-1.5 bg-bg-hover rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: barColor }}
              />
            </div>
            <span style={{ color: barColor }}>{pct}%</span>
          </div>

          {ctx.compressionCount > 0 && (
            <>
              <span className="text-border">│</span>
              <span title="Compression count">🗜️ {ctx.compressionCount}</span>
            </>
          )}
        </>
      )}

      {/* Session timer */}
      <span className="ml-auto font-mono">{formatSessionTime(sessionDuration)}</span>

      {/* Last round duration */}
      {ctx?.lastRoundDurationMs ? (
        <span className="text-text-muted">{formatDuration(ctx.lastRoundDurationMs)}</span>
      ) : null}
    </div>
  )
}
