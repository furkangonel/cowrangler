import React, { useMemo } from 'react'
import { Check, X, FileText, Plus, Minus } from 'lucide-react'
import { ActiveToolCall } from '../../stores/agent.store'
import { useUIStore } from '../../stores/ui.store'
import { extractEdit } from '../../lib/codeEdit'
import { computeLineDiff, DiffLine } from '../../lib/diff'

/**
 * WP-3 — Code arayüzü inline diff kartı.
 *
 * Bir Edit/Write tool çağrısını dosya + before/after satır diff'i olarak gösterir;
 * satır bazında renklendirir ve Accept/Reject düğmeleri sunar. Kararlar ui.store'da
 * tool çağrısı id'sine göre tutulur (kalıcı iş mantığı WP-7 checkpoint'e ait).
 */
export function DiffCard({ toolCall }: { toolCall: ActiveToolCall }) {
  const decisions = useUIStore(s => s.diffDecisions)
  const setDiffDecision = useUIStore(s => s.setDiffDecision)

  const edit = useMemo(() => extractEdit(toolCall.name, toolCall.args), [toolCall.name, toolCall.args])
  const diff = useMemo(
    () => (edit ? computeLineDiff(edit.before, edit.after) : null),
    [edit],
  )

  if (!edit || !diff) return null

  const decision = decisions[toolCall.id]

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-elevated overflow-hidden max-w-[95%]">
      {/* Başlık */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-subtle bg-bg-tertiary/40">
        <FileText size={12} className="text-text-muted flex-shrink-0" />
        <span className="text-[11px] font-mono text-text-secondary truncate flex-1" title={edit.filePath}>
          {edit.fileName || 'file'}
        </span>
        {diff.added > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-emerald-500 font-medium">
            <Plus size={9} />{diff.added}
          </span>
        )}
        {diff.removed > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-red-500 font-medium">
            <Minus size={9} />{diff.removed}
          </span>
        )}
        {edit.isFullContent && (
          <span className="text-[9px] uppercase tracking-wide text-text-muted/70">new file</span>
        )}
      </div>

      {/* Diff satırları */}
      <div className="font-mono text-[11.5px] leading-[1.5] max-h-72 overflow-auto custom-scrollbar">
        {diff.lines.map((line, i) => (
          <DiffRow key={i} line={line} />
        ))}
      </div>

      {/* Accept / Reject */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-t border-border-subtle bg-bg-tertiary/30">
        {decision ? (
          <span
            className={`text-[11px] font-medium flex items-center gap-1 ${
              decision === 'accepted' ? 'text-emerald-500' : 'text-red-500'
            }`}
          >
            {decision === 'accepted' ? <Check size={12} /> : <X size={12} />}
            {decision === 'accepted' ? 'Accepted' : 'Rejected'}
          </span>
        ) : (
          <>
            <button
              onClick={() => setDiffDecision(toolCall.id, 'accepted')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-emerald-600 border border-emerald-500/30 hover:bg-emerald-500/10 transition-colors"
            >
              <Check size={12} /> Accept
            </button>
            <button
              onClick={() => setDiffDecision(toolCall.id, 'rejected')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-red-500 border border-red-500/30 hover:bg-red-500/10 transition-colors"
            >
              <X size={12} /> Reject
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function DiffRow({ line }: { line: DiffLine }) {
  const sign = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '
  const rowClass =
    line.type === 'add'
      ? 'bg-emerald-500/10 text-emerald-200'
      : line.type === 'del'
      ? 'bg-red-500/10 text-red-200'
      : 'text-text-secondary'
  const signClass =
    line.type === 'add' ? 'text-emerald-500' : line.type === 'del' ? 'text-red-500' : 'text-text-muted/40'

  return (
    <div className={`flex ${rowClass}`}>
      <span className="w-9 flex-shrink-0 text-right pr-2 select-none text-text-muted/40 tabular-nums">
        {line.type === 'add' ? line.afterLine : line.beforeLine}
      </span>
      <span className={`w-4 flex-shrink-0 text-center select-none ${signClass}`}>{sign}</span>
      <span className="whitespace-pre-wrap break-all pr-3 flex-1">{line.text || ' '}</span>
    </div>
  )
}
