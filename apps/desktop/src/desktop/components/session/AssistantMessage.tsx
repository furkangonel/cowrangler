import React, { useMemo } from 'react'
import { CheckCircle2, Circle, Info, AlertTriangle, Lightbulb, AlertCircle } from 'lucide-react'
import { renderMarkdown } from '../../lib/markdown'
import { useUIStore } from '../../stores/ui.store'
import { useProjectsStore } from '../../stores/projects.store'

interface Props {
  content: string
  isStreaming?: boolean
}

// Regex to detect markdown task list items
const TASK_RE = /^- \[( |x|X|\/)\] (.*)$/gm

// GitHub-style callout: > [!NOTE], > [!WARNING], > [!TIP], > [!IMPORTANT]
const CALLOUT_RE = /^> \[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]\n((?:> .*\n?)*)/gm

type CalloutType = 'NOTE' | 'TIP' | 'WARNING' | 'IMPORTANT' | 'CAUTION'

const CALLOUT_CONFIG: Record<CalloutType, { icon: React.ReactNode; label: string; bg: string; border: string; iconColor: string }> = {
  NOTE:      { icon: <Info size={13} />,          label: 'Note',      bg: 'var(--bg-secondary)', border: 'rgb(var(--accent))',   iconColor: 'rgb(var(--accent))' },
  TIP:       { icon: <Lightbulb size={13} />,     label: 'Tip',       bg: 'var(--bg-secondary)', border: '#22c55e',              iconColor: '#22c55e' },
  WARNING:   { icon: <AlertTriangle size={13} />, label: 'Warning',   bg: 'var(--bg-secondary)', border: '#f59e0b',              iconColor: '#f59e0b' },
  IMPORTANT: { icon: <AlertCircle size={13} />,   label: 'Important', bg: 'var(--bg-secondary)', border: '#8b5cf6',              iconColor: '#8b5cf6' },
  CAUTION:   { icon: <AlertTriangle size={13} />, label: 'Caution',   bg: 'var(--bg-secondary)', border: '#ef4444',              iconColor: '#ef4444' },
}

interface ParsedCallout { type: CalloutType; body: string; raw: string }

function parseCallouts(text: string): { cleaned: string; callouts: ParsedCallout[] } {
  const callouts: ParsedCallout[] = []
  const cleaned = text.replace(CALLOUT_RE, (raw, type: string, body: string) => {
    const bodyText = body.replace(/^> ?/gm, '').trim()
    callouts.push({ type: type as CalloutType, body: bodyText, raw })
    return `\x00CALLOUT_${callouts.length - 1}\x00`
  })
  return { cleaned, callouts }
}

export function AssistantMessage({ content, isStreaming }: Props) {
  const { setPreviewFile } = useUIStore()
  const { projects, activeProjectId } = useProjectsStore()

  const { cleanContent, tasks, callouts } = useMemo(() => {
    if (!content) return { cleanContent: '', tasks: [], callouts: [] }

    // 1. Extract task list items
    const extractedTasks: { status: 'todo' | 'in_progress' | 'done', text: string }[] = []
    let modified = content.replace(TASK_RE, (_m, statusChar, text) => {
      const status = statusChar.toLowerCase() === 'x' ? 'done' : statusChar === '/' ? 'in_progress' : 'todo'
      extractedTasks.push({ status, text: text.trim() })
      return ''
    })

    // 2. Extract GitHub-style callouts
    const { cleaned, callouts: extractedCallouts } = parseCallouts(modified)

    // 3. Tidy up blank lines
    const tidied = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n')

    return { cleanContent: tidied, tasks: extractedTasks, callouts: extractedCallouts }
  }, [content])

  const html = useMemo(() => (cleanContent ? renderMarkdown(cleanContent) : ''), [cleanContent])

  // Split html on callout placeholders so we can interleave rendered callout cards
  const htmlSegments = useMemo(() => {
    if (callouts.length === 0) return [{ kind: 'html' as const, value: html }]
    return html.split(/\x00CALLOUT_(\d+)\x00/).map((part, i) => {
      if (i % 2 === 0) return { kind: 'html' as const, value: part }
      return { kind: 'callout' as const, index: parseInt(part, 10) }
    })
  }, [html, callouts])

  if (!content) {
    return (
      <div className="flex items-center gap-2 py-1.5">
        <ThinkingDots />
        <span className="text-xs text-text-muted">Thinking…</span>
      </div>
    )
  }

  const doneCount = tasks.filter(t => t.status === 'done').length
  const progressPct = tasks.length > 0 ? (doneCount / tasks.length) * 100 : 0
  const hasActive = tasks.some(t => t.status === 'in_progress')

  return (
    <div className="space-y-3">
      {/* ── Task panel ─────────────────────────────────────────────────────── */}
      {tasks.length > 0 && (
        <div className="rounded-xl overflow-hidden border border-border" style={{ background: 'var(--bg-secondary)' }}>
          {/* Thin progress bar */}
          <div className="h-0.5 bg-border-subtle">
            <div
              className="h-full transition-all duration-700 ease-out"
              style={{ width: `${progressPct}%`, background: 'rgb(var(--accent))' }}
            />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border" style={{ background: 'var(--bg-tertiary)' }}>
            <div className="flex items-center gap-2">
              <span className="text-2xs font-semibold uppercase tracking-wider text-text-muted">Tasks</span>
              {hasActive && (
                <span className="flex items-center gap-1 text-2xs font-medium px-1.5 py-0.5 rounded-full"
                  style={{ background: 'rgb(var(--accent) / 0.12)', color: 'rgb(var(--accent))' }}>
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'rgb(var(--accent))' }} />
                  Running
                </span>
              )}
            </div>
            <span className="text-2xs text-text-muted tabular-nums">
              {doneCount}/{tasks.length}
            </span>
          </div>

          {/* Task rows */}
          <div className="flex flex-col divide-y divide-border/40">
            {tasks.map((task, i) => {
              const isActive = task.status === 'in_progress'
              const isDone   = task.status === 'done'
              return (
                <div
                  key={i}
                  className="flex items-start gap-2.5 px-3 py-2.5 transition-colors"
                  style={{
                    background: isActive ? 'rgb(var(--accent) / 0.05)' : isDone ? 'var(--bg-primary)' : 'transparent',
                    borderLeft: isActive ? '2px solid rgb(var(--accent))' : '2px solid transparent',
                  }}
                >
                  {isDone ? (
                    <CheckCircle2 size={15} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--color-success, #22c55e)' }} />
                  ) : isActive ? (
                    <div className="w-3.5 h-3.5 rounded-full border-[1.5px] border-t-transparent animate-spin flex-shrink-0 mt-1"
                      style={{ borderColor: 'rgb(var(--accent))', borderTopColor: 'transparent' }} />
                  ) : (
                    <Circle size={15} className="text-border flex-shrink-0 mt-0.5" />
                  )}
                  <span
                    className={`text-sm leading-snug ${
                      isDone   ? 'text-text-muted line-through' :
                      isActive ? 'text-text-primary font-medium' :
                                 'text-text-secondary'
                    }`}
                  >
                    {task.text}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Main content with interleaved callouts ──────────────────────────── */}
      {htmlSegments.map((seg, i) => {
        if (seg.kind === 'callout') {
          const c = callouts[seg.index]
          if (!c) return null
          const cfg = CALLOUT_CONFIG[c.type]
          return (
            <CalloutCard key={i} type={c.type} body={c.body} />
          )
        }
        return seg.value ? (
          <div
            key={i}
            className={`prose selectable ${isStreaming && i === htmlSegments.length - 1 ? 'cursor-after' : ''}`}
            dangerouslySetInnerHTML={{ __html: seg.value }}
          />
        ) : null
      })}
    </div>
  )
}

function CalloutCard({ type, body }: { type: CalloutType; body: string }) {
  const cfg = CALLOUT_CONFIG[type]
  const bodyHtml = useMemo(() => renderMarkdown(body), [body])
  return (
    <div
      className="rounded-xl overflow-hidden my-1"
      style={{ border: `1px solid ${cfg.border}30`, background: `${cfg.border}08` }}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: `${cfg.border}25` }}>
        <span style={{ color: cfg.iconColor }}>{cfg.icon}</span>
        <span className="text-xs font-semibold" style={{ color: cfg.iconColor }}>{cfg.label}</span>
      </div>
      <div
        className="px-3 py-2.5 prose prose-sm selectable"
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    </div>
  )
}

function ThinkingDots() {
  return (
    <div className="flex gap-1 items-center">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"
          style={{ animationDelay: `${i * 0.18}s` }}
        />
      ))}
    </div>
  )
}
