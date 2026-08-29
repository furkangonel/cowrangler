import React, { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Gauge, SearchCheck, ShieldCheck, Sparkles, WandSparkles } from 'lucide-react'
import { DashboardStats, ipc } from '../../lib/ipc'

const STARTERS = [
  {
    icon: SearchCheck,
    label: 'Inspect',
    title: 'Audit this workspace',
    detail: 'Find broken flows, dead code, security gaps and resource waste.',
    prompt: 'Audit this workspace end to end. Find broken flows, dead code, security gaps, unnecessary complexity, and resource waste. Prioritize the findings, then implement the safest high-impact fixes and verify them.',
  },
  {
    icon: WandSparkles,
    label: 'Improve',
    title: 'Make an experience clearer',
    detail: 'Trace a user journey, remove friction and polish the implementation.',
    prompt: 'Review the main user journey in this project. Identify confusing or unnecessary steps, simplify the experience, implement the improvements, and verify that every visible control works.',
  },
  {
    icon: Gauge,
    label: 'Optimize',
    title: 'Reduce resource use',
    detail: 'Profile likely hotspots and apply measurable, low-risk optimizations.',
    prompt: 'Audit this project for avoidable CPU, memory, disk, cache, and network usage. Implement low-risk optimizations, add sensible bounds and cleanup, then run the relevant checks.',
  },
] as const

export function StatsDashboard({
  userName,
  projectId,
  onPrompt,
}: {
  userName?: string | null
  projectId: string
  onPrompt: (prompt: string) => void
}) {
  const [stats, setStats] = useState<DashboardStats | null>(null)

  useEffect(() => {
    let cancelled = false
    ipc.sessions.dashboardStats(undefined, projectId)
      .then((value) => { if (!cancelled) setStats(value) })
      .catch(() => { if (!cancelled) setStats(null) })
    return () => { cancelled = true }
  }, [projectId])

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
    return userName ? `${part}, ${userName}` : part
  }, [userName])

  return (
    <div className="workbench-home">
      <div className="workbench-intro">
        <div className="workbench-eyebrow"><Sparkles size={13} /> Local AI workbench</div>
        <h1>{greeting}.<br /><span>What should move forward?</span></h1>
        <p>Describe the outcome in your own words. Cowrangler can inspect, change and verify the work while your files stay on this machine.</p>
      </div>

      <div className="workbench-rail" aria-label="Suggested starting points">
        <div className="workbench-rail__line" aria-hidden="true" />
        {STARTERS.map((starter, index) => {
          const Icon = starter.icon
          return (
            <button key={starter.label} onClick={() => onPrompt(starter.prompt)} className="workbench-action">
              <span className="workbench-action__node">{index + 1}</span>
              <span className="workbench-action__icon"><Icon size={18} /></span>
              <span className="workbench-action__copy">
                <small>{starter.label}</small>
                <strong>{starter.title}</strong>
                <span>{starter.detail}</span>
              </span>
              <ArrowUpRight size={17} className="workbench-action__arrow" />
            </button>
          )
        })}
      </div>

      <div className="workbench-foot">
        <div><ShieldCheck size={15} /><span><strong>Local by default</strong> Your source folder is never copied or uploaded by Cowrangler.</span></div>
        <div className="workbench-foot__activity">
          <span><strong>{stats?.totals.sessions ?? 0}</strong> conversations</span>
          <span><strong>{stats?.active_days ?? 0}</strong> active days</span>
        </div>
      </div>
    </div>
  )
}
