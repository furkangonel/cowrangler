import React from 'react'
import { Check, Sun, Moon, Monitor } from 'lucide-react'
import { useSettingsStore } from '../../stores/settings.store'
import { ThemePref } from '../../lib/theme'

const THEMES: { id: ThemePref; label: string; icon: typeof Sun; swatch: { canvas: string; panel: string; text: string; accent: string } }[] = [
  { id: 'light', label: 'Light', icon: Sun, swatch: { canvas: '#FAF9F6', panel: '#F0EEE6', text: '#26241F', accent: '#E05C2A' } },
  { id: 'dark', label: 'Dark', icon: Moon, swatch: { canvas: '#262624', panel: '#1F1E1D', text: '#F5F4EE', accent: '#F26A38' } },
  { id: 'system', label: 'System', icon: Monitor, swatch: { canvas: 'linear-gradient(135deg,#FAF9F6 50%,#262624 50%)', panel: '#9b968b', text: '#808080', accent: '#E05C2A' } },
]

const FONT_SIZES = [
  { id: 'small', label: 'Small' },
  { id: 'normal', label: 'Normal' },
  { id: 'large', label: 'Large' },
]

export function AppearanceTab() {
  const { getTheme, setTheme, getFontSize, setFontSize } = useSettingsStore()
  const theme = getTheme()
  const fontSize = getFontSize()

  return (
    <div className="p-6 space-y-8 max-w-xl">
      {/* Tema */}
      <section>
        <h4 className="text-sm font-semibold text-text-primary mb-1">Appearance</h4>
        <p className="text-xs text-text-muted mb-4">Choose the color theme for the Cowrangler interface.</p>
        <div className="grid grid-cols-3 gap-3">
          {THEMES.map(t => {
            const Icon = t.icon
            const active = theme === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={`relative rounded-xl border-2 p-1.5 text-left transition-all ${
                  active ? 'border-accent' : 'border-border hover:border-text-muted'
                }`}
              >
                {/* Mini preview */}
                <div
                  className="h-20 rounded-lg overflow-hidden flex"
                  style={{ background: t.swatch.canvas }}
                >
                  <div className="w-1/3 h-full" style={{ background: t.swatch.panel }} />
                  <div className="flex-1 p-2 flex flex-col gap-1.5">
                    <div className="h-1.5 w-3/4 rounded-full" style={{ background: t.swatch.text, opacity: 0.55 }} />
                    <div className="h-1.5 w-1/2 rounded-full" style={{ background: t.swatch.text, opacity: 0.3 }} />
                    <div className="mt-auto h-3 w-10 rounded-md" style={{ background: t.swatch.accent }} />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-1.5 py-1.5">
                  <Icon size={13} className={active ? 'text-accent' : 'text-text-muted'} />
                  <span className={`text-xs font-medium ${active ? 'text-text-primary' : 'text-text-secondary'}`}>{t.label}</span>
                  {active && <Check size={13} className="text-accent ml-auto" />}
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* Font size */}
      <section>
        <h4 className="text-sm font-semibold text-text-primary mb-1">Font Size</h4>
        <p className="text-xs text-text-muted mb-4">Scale of message and interface text.</p>
        <div className="inline-flex rounded-lg border border-border bg-bg-tertiary p-1">
          {FONT_SIZES.map(s => (
            <button
              key={s.id}
              onClick={() => setFontSize(s.id)}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
                fontSize === s.id
                  ? 'bg-bg-primary text-text-primary shadow-card'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
