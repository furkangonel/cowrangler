import React, { useState } from 'react'
import { ChevronRight, Loader2, Wrench } from 'lucide-react'
import { ActiveToolCall } from '../../stores/agent.store'
import { ToolTrace } from './ToolTrace'
import { formatDuration } from '../../lib/time'

/**
 * ToolGroup — bir asistan turundaki ardışık tool çağrılarının kronolojik bloğu.
 *   • Tek çağrı → düz, kompakt bir satır kartı.
 *   • Birden fazla çağrı → "Ran N tools" başlıklı, açılır/kapanır accordion
 *     (çalışırken otomatik açık, bitince kapanır; kullanıcı tıklayarak değiştirebilir).
 */
export function ToolGroup({ calls }: { calls: ActiveToolCall[] }) {
  const running = calls.some(c => c.status === 'running')
  const [userOpen, setUserOpen] = useState<boolean | null>(null)
  const open = userOpen ?? running

  // Tek çağrı: accordion'a gerek yok, satırı doğrudan göster.
  if (calls.length === 1) {
    return (
      <div className="rounded-lg border border-border-subtle bg-bg-secondary/60 px-2.5 py-1.5">
        <ToolTrace toolCall={calls[0]} />
      </div>
    )
  }

  const doneCount = calls.filter(c => c.status !== 'running').length
  const totalMs = calls.reduce((n, c) => n + (c.durationMs ?? 0), 0)

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-secondary/60 overflow-hidden">
      <button
        onClick={() => setUserOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left hover:bg-bg-hover/40 transition-colors"
      >
        <ChevronRight size={13} className={`text-text-muted transition-transform duration-150 flex-shrink-0 ${open ? 'rotate-90' : ''}`} />
        {running
          ? <Loader2 size={12} className="text-accent animate-spin flex-shrink-0" />
          : <Wrench size={12} className="text-text-muted flex-shrink-0" />}
        <span className="text-xs font-medium text-text-primary">
          {running ? `Running ${calls.length} tools…` : `Ran ${calls.length} tools`}
        </span>
        <span className="text-2xs text-text-muted tabular-nums ml-auto flex-shrink-0">
          {running ? `${doneCount}/${calls.length}` : totalMs > 0 ? formatDuration(totalMs) : null}
        </span>
      </button>

      {open && (
        <div className="px-2.5 pb-1.5 pt-0.5">
          <div className="border-l border-border-subtle pl-2.5 space-y-0.5">
            {calls.map(c => <ToolTrace key={c.id} toolCall={c} />)}
          </div>
        </div>
      )}
    </div>
  )
}
