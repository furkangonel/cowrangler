/**
 * CodePlanPanel — Code sağ panelinin aktif "Plan" yüzeyi.
 *
 * write_plan ile üretilen aktif planı (agentStore.currentPlan) gösterir:
 * başlık + özet + adımlar (dosya/risk rozetleriyle) ile Approve/Modify/Cancel onay butonlarını sunar.
 */
import React from 'react'
import { ListChecks, FileText, X } from 'lucide-react'
import { useAgentStore } from '../../stores/agent.store'
import { useUIStore } from '../../stores/ui.store'
import { ipc } from '../../lib/ipc'

const RISK_COLOR: Record<string, string> = {
  low: 'text-emerald-500 bg-emerald-500/10',
  medium: 'text-amber-500 bg-amber-500/10',
  high: 'text-red-500 bg-red-500/10',
}

export function CodePlanPanel() {
  const plan = useAgentStore((s) => s.currentPlan)
  const setCodeRightTab = useUIStore((s) => s.setCodeRightTab)

  return (
    <div className="flex flex-col h-full bg-bg-secondary">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border-subtle flex-shrink-0">
        <ListChecks size={13} className="text-accent flex-shrink-0" />
        <span className="text-xs font-semibold text-text-primary">Plan</span>
        {plan?.status && plan.status !== 'pending' && (
          <span className="text-[10px] uppercase tracking-wide text-text-muted ml-1">{plan.status}</span>
        )}
        <button
          onClick={() => setCodeRightTab(null)}
          title="Close"
          className="ml-auto p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary"
        >
          <X size={13} />
        </button>
      </div>

      {/* Body */}
      {!plan ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-text-muted h-full">
          <ListChecks size={20} />
          <p className="text-xs text-center px-6">No plan yet. It appears here when the agent writes one for a multi-step task.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <h3 className="text-sm font-semibold text-text-primary brand-serif leading-snug">{plan.title}</h3>
          {plan.summary && (
            <p className="text-xs text-text-secondary leading-relaxed mt-1.5">{plan.summary}</p>
          )}
          {plan.estimated_duration && (
            <p className="text-[11px] text-text-muted mt-1">~ {plan.estimated_duration}</p>
          )}

          <div className="mt-3 flex flex-col gap-2">
            {plan.steps?.map((s) => (
              <div key={s.step} className="rounded-lg border border-border-subtle/60 bg-bg-elevated/50 p-2.5">
                <div className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-accent-subtle text-accent text-[11px] font-semibold flex items-center justify-center mt-[1px]">
                    {s.step}
                  </span>
                  <span className="text-xs text-text-primary leading-relaxed flex-1">{s.description}</span>
                  {s.risk && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${RISK_COLOR[s.risk] ?? 'text-text-muted bg-bg-hover'}`}>
                      {s.risk}
                    </span>
                  )}
                </div>
                {s.files && s.files.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5 pl-7">
                    {s.files.map((f) => (
                      <span key={f} className="flex items-center gap-1 text-[10px] font-mono text-text-muted bg-bg-hover/60 px-1.5 py-0.5 rounded">
                        <FileText size={9} /> {f}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {plan.notes && (
            <p className="text-[11px] text-text-muted leading-relaxed mt-3 border-t border-border-subtle/40 pt-2 whitespace-pre-wrap">
              {plan.notes}
            </p>
          )}

          {plan.status === 'pending' && (
            <div className="flex gap-2 mt-4 pt-3 border-t border-border-subtle/40">
              <button
                onClick={async () => {
                  await ipc.agent.answerQuestion(JSON.stringify({ kind: 'choice', selected: ['Go ahead'] }))
                }}
                className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold shadow-sm transition-colors"
              >
                Approve
              </button>
              <button
                onClick={async () => {
                  await ipc.agent.answerQuestion(JSON.stringify({ kind: 'choice', selected: ['Modify plan'] }))
                }}
                className="px-3 py-1.5 border border-border-subtle text-text-secondary hover:bg-bg-hover hover:text-text-primary rounded-md text-xs font-semibold transition-colors"
              >
                Modify
              </button>
              <button
                onClick={async () => {
                  await ipc.agent.answerQuestion(JSON.stringify({ kind: 'choice', selected: ['Cancel'] }))
                }}
                className="px-3 py-1.5 border border-border-subtle text-error hover:bg-bg-hover rounded-md text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
