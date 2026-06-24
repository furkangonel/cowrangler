import React, { useEffect, useState } from 'react'
import { useAgentStore } from '../../stores/agent.store'
import { useProjectsStore } from '../../stores/projects.store'
import { useSettingsStore } from '../../stores/settings.store'
import { ipc } from '../../lib/ipc'
import { formatTokenCount, contextPercent, contextBarColor } from '../../lib/tokens'
import { formatDuration } from '../../lib/time'

export function StatusBar() {
  const { activeProjectId } = useProjectsStore()
  const { contextSnapshot, status, toolCalls } = useAgentStore()
  const { getModel } = useSettingsStore()
  const [sessionDuration, setSessionDuration] = useState(0)
  const [sessionStart] = useState(Date.now())

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
      {/* Model */}
      <span className="flex items-center gap-1.5 font-medium text-text-secondary">
        {/* Cowrangler lasso mark — original brand glyph (replaces Hermes ⚕) */}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
             className="text-accent flex-shrink-0" aria-hidden="true">
          <ellipse cx="12" cy="8.5" rx="6.5" ry="5" />
          <path d="M12 13.5 C 12 17, 10 19, 8 21.5" />
        </svg>
        {shortModel}
      </span>

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
