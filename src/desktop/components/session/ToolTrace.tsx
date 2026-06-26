import React from 'react'
import { Terminal, PenLine, FileText, Globe, Search, Loader2, Code2 } from 'lucide-react'
import { ActiveToolCall } from '../../stores/agent.store'

function getToolIcon(name: string) {
  const n = name.toLowerCase()
  if (n.includes('edit') || n.includes('write') || n.includes('replace') || n.includes('create') || n.includes('multi_replace')) return PenLine
  if (n.includes('run') || n.includes('execute') || n.includes('bash')) return Terminal
  if (n.includes('read') || n.includes('list') || n.includes('view') || n.includes('grep')) return FileText
  if (n.includes('search') || n.includes('find')) return Search
  if (n.includes('web') || n.includes('http')) return Globe
  return Code2
}

function getToolLabel(name: string, args: any) {
  const n = name.toLowerCase()
  if (n.includes('edit') || n.includes('write') || n.includes('replace') || n.includes('multi_replace')) {
    const file = args?.path || args?.file_path || args?.TargetFile || ''
    const filename = file.split('/').pop()
    return filename ? `Edited ${filename}` : 'Edited a file'
  }
  if (n.includes('run') || n.includes('execute') || n.includes('bash')) {
    return 'Running command'
  }
  if (n.includes('read') || n.includes('view')) {
    const file = args?.path || args?.file_path || args?.AbsolutePath || ''
    const filename = file.split('/').pop()
    return filename ? `Read ${filename}` : 'Read file'
  }
  return name.replace(/_/g, ' ')
}

export function ToolTrace({ toolCall }: { toolCall: ActiveToolCall }) {
  const { name, args, status } = toolCall
  const Icon = getToolIcon(name)
  const label = getToolLabel(name, args)
  
  const isEdit = name.toLowerCase().includes('edit') || name.toLowerCase().includes('write') || name.toLowerCase().includes('replace') || name.toLowerCase().includes('multi_replace')
  const editFilename = isEdit ? (args?.path || args?.file_path || args?.TargetFile || '').split('/').pop() : ''

  const isCommand = name.toLowerCase().includes('run') || name.toLowerCase().includes('execute') || name.toLowerCase().includes('bash')
  const cmdString = args?.command || args?.CommandLine || args?.Command || ''
  
  return (
    <div className="relative text-[13px] text-text-secondary pb-4">
      {/* Icon placed on the timeline */}
      <div className="absolute -left-[24.5px] top-0.5 bg-bg-primary rounded-full p-0.5 text-text-muted">
        {status === 'running' ? (
          <Loader2 size={15} className="animate-spin text-accent" />
        ) : (
          <Icon size={15} strokeWidth={1.5} />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-text-secondary">{label}</span>
        
        {isEdit && editFilename && (
          <div className="self-start px-2 py-0.5 bg-bg-tertiary rounded-md text-text-muted text-[11px] font-mono">
            {editFilename}
          </div>
        )}

        {isCommand && (
          <div className="flex flex-col gap-2 w-full pr-4">
            <div className="self-start px-2 py-0.5 bg-bg-tertiary rounded-md text-text-muted text-[11px] font-mono">
              Script
            </div>
            {cmdString && (
              <div className="mt-1 bg-[#1a1a1a] rounded-lg border border-border-subtle overflow-hidden max-w-[95%]">
                <div className="px-3 py-1.5 border-b border-border-subtle text-[#8c8c8c] text-[11px]">
                  bash
                </div>
                <div className="px-3 py-2 font-mono text-[12px] text-[#e5e5e5] overflow-x-auto whitespace-pre custom-scrollbar">
                  {cmdString}
                </div>
                {status === 'done' && (
                  <>
                    <div className="px-3 py-1.5 border-t border-border-subtle text-[#8c8c8c] text-[11px] bg-[#1f1f1f]">
                      Output
                    </div>
                    <div className="px-3 py-2 font-mono text-[12px] text-[#8c8c8c] overflow-x-auto whitespace-pre custom-scrollbar">
                      (no output)
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Generic tool args if not edit or command */}
        {!isEdit && !isCommand && (
          <div className="text-text-muted font-mono text-[11px] truncate opacity-70">
            {Object.keys(args || {}).length > 0 ? JSON.stringify(args).slice(0, 60) + '...' : ''}
          </div>
        )}

        {status === 'error' && (
          <div className="text-error text-[12px] mt-1">Failed</div>
        )}
      </div>
    </div>
  )
}
