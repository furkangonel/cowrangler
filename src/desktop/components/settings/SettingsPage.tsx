import React from 'react'
import { X, Cpu, Palette, Boxes, ShieldCheck } from 'lucide-react'
import { ModelsTab } from './ModelsTab'
import { AppearanceTab } from './AppearanceTab'
import { PermissionsTab } from './PermissionsTab'
import { useUIStore } from '../../stores/ui.store'

const TABS = [
  { id: 'models', label: 'Models & API', icon: Cpu },
  { id: 'permissions', label: 'Permissions', icon: ShieldCheck },
  { id: 'appearance', label: 'Appearance', icon: Palette },
] as const

type TabId = typeof TABS[number]['id']

export function SettingsPage() {
  const { settingsPage, openSettings, closeSettings } = useUIStore()
  const mainTab = (settingsPage || 'models') as TabId

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
      onMouseDown={closeSettings}
    >
      <div
        className="bg-bg-secondary border border-border rounded-2xl shadow-panel flex overflow-hidden animate-slide-up"
        style={{ width: '1000px', height: '680px', maxWidth: '94vw', maxHeight: '90vh' }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Left nav */}
        <nav className="w-52 flex-shrink-0 border-r border-border-subtle bg-bg-primary flex flex-col py-4 px-2.5">
          <h2 className="text-sm font-semibold text-text-primary px-3 mb-3 brand-serif">Settings</h2>
          {TABS.map(tab => {
            const Icon = tab.icon
            const active = mainTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => openSettings(tab.id)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors mb-0.5 ${
                  active
                    ? 'bg-accent-subtle text-accent font-medium'
                    : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                }`}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            )
          })}
        </nav>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle flex-shrink-0">
            <h3 className="text-sm font-semibold text-text-primary">
              {TABS.find(t => t.id === mainTab)?.label}
            </h3>
            <button
              onClick={closeSettings}
              aria-label="Close settings"
              className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors rounded-lg"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto">
              {mainTab === 'models' && <ModelsTab />}
              {mainTab === 'permissions' && <PermissionsTab />}
              {mainTab === 'appearance' && <AppearanceTab />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
