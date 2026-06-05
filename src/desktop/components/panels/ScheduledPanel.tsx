import React from 'react'
import { Clock, Plus } from 'lucide-react'

export function ScheduledPanel() {
  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-text-primary">Scheduled</h3>
        <button className="p-1 text-text-muted hover:text-accent transition-colors rounded" title="Yeni görev">
          <Plus size={13} />
        </button>
      </div>
      <div className="text-center py-6">
        <Clock size={24} className="text-text-muted mx-auto mb-2 opacity-40" />
        <p className="text-xs text-text-muted">Zamanlanmış görev yok.</p>
        <p className="text-2xs text-text-muted mt-1">
          CLI'de <code className="font-mono text-accent">cowrangler cron add</code> komutuyla ekleyebilirsiniz.
        </p>
      </div>
    </div>
  )
}
