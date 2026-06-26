import React, { useState } from 'react'
import { ChevronRight, CheckCircle2 } from 'lucide-react'
import { ActiveToolCall } from '../../stores/agent.store'
import { ToolTrace } from './ToolTrace'

function getGroupLabel(calls: ActiveToolCall[]): string {
  let editCount = 0
  let cmdCount = 0
  let otherCount = 0
  
  calls.forEach(c => {
    const n = c.name.toLowerCase()
    if (n.includes('edit') || n.includes('write') || n.includes('replace') || n.includes('create') || n.includes('multi_replace')) editCount++
    else if (n.includes('run') || n.includes('execute') || n.includes('bash')) cmdCount++
    else otherCount++
  })

  const parts = []
  if (cmdCount > 0) parts.push(cmdCount === 1 ? 'Ran a command' : `Ran ${cmdCount} commands`)
  if (editCount > 0) parts.push(editCount === 1 ? 'edited a file' : `edited ${editCount} files`)
  if (otherCount > 0) parts.push(otherCount === 1 ? 'used a tool' : `used ${otherCount} tools`)

  if (parts.length === 0) return 'Used tools'
  
  let label = parts.join(', ')
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function ToolGroup({ calls }: { calls: ActiveToolCall[] }) {
  const running = calls.some(c => c.status === 'running')
  const [userOpen, setUserOpen] = useState<boolean | null>(null)
  const open = userOpen ?? running
  const label = getGroupLabel(calls)

  return (
    <div className="mb-4">
      <button
        onClick={() => setUserOpen(!open)}
        className="flex items-center gap-1.5 text-text-muted hover:text-text-primary transition-colors mb-3 text-[13px]"
      >
        <span>{label}</span>
        <ChevronRight size={14} className={`transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="relative pl-6 space-y-2">
          {/* Vertical Line */}
          <div className="absolute left-[8px] top-2 bottom-4 w-px bg-border-subtle" />
          
          {calls.map(c => <ToolTrace key={c.id} toolCall={c} />)}
          
          {!running && (
            <div className="relative flex items-center gap-3 text-text-muted text-[13px] pt-1 pb-2">
              <div className="absolute -left-[24.5px] bg-bg-primary rounded-full p-0.5 text-text-muted">
                <CheckCircle2 size={15} strokeWidth={1.5} />
              </div>
              <span>Done</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
