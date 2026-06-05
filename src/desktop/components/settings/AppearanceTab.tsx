import React from 'react'

export function AppearanceTab() {
  return (
    <div className="p-5 space-y-4">
      <div>
        <h4 className="text-xs font-semibold text-text-primary mb-2">Tema</h4>
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: 'dark', label: 'Koyu', bg: '#0f0f0f', accent: '#e05c2a' },
            { id: 'darker', label: 'Daha Koyu', bg: '#080808', accent: '#e05c2a' },
            { id: 'midnight', label: 'Gece Yarısı', bg: '#0d1117', accent: '#58a6ff' },
          ].map(theme => (
            <button
              key={theme.id}
              className="p-3 rounded-lg border border-border hover:border-accent/40 transition-colors text-left"
              style={{ background: theme.bg }}
            >
              <div className="w-full h-12 rounded mb-2" style={{ background: `linear-gradient(135deg, ${theme.bg}, ${theme.accent}33)` }} />
              <p className="text-xs text-text-primary">{theme.label}</p>
            </button>
          ))}
        </div>
      </div>
      <div>
        <h4 className="text-xs font-semibold text-text-primary mb-2">Font Boyutu</h4>
        <div className="flex gap-2">
          {['Küçük', 'Normal', 'Büyük'].map(size => (
            <button
              key={size}
              className={`px-3 py-1.5 rounded-lg text-xs border border-border transition-colors ${size === 'Normal' ? 'border-accent/50 text-accent bg-accent/10' : 'text-text-muted hover:text-text-secondary hover:border-accent/30'}`}
            >
              {size}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
