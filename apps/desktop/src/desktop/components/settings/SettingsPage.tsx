import React from 'react'
import { X, Cpu, Palette, ShieldCheck, Box, GitBranch, SlidersHorizontal } from 'lucide-react'
import { ModelsTab } from './ModelsTab'
import { AppearanceTab } from './AppearanceTab'
import { PermissionsTab } from './PermissionsTab'
import { SandboxTab } from './SandboxTab'
import { GitTab } from './GitTab'
import { AdvancedTab } from './AdvancedTab'
import { useUIStore } from '../../stores/ui.store'
import { FEATURES } from '../../lib/features'

// WP-6: code-geliştirme akışına ait sekmeler (Git/Sandbox/Permissions) şimdilik
// gizli — FEATURES.code ile geri gelir. Kod silinmedi. Bkz. HIDDEN_SETTINGS_README.md
const CODE_TAB_IDS = new Set(['permissions', 'sandbox', 'git'])

const ALL_TABS = [
  { id: 'models', label: 'Models & API', icon: Cpu },
  { id: 'permissions', label: 'Permissions', icon: ShieldCheck },
  { id: 'sandbox', label: 'Sandbox', icon: Box },
  { id: 'git', label: 'Git', icon: GitBranch },
  { id: 'advanced', label: 'Advanced', icon: SlidersHorizontal },
  { id: 'appearance', label: 'Appearance', icon: Palette },
] as const

type TabId = typeof ALL_TABS[number]['id']

const TABS = ALL_TABS.filter(t => FEATURES.code || !CODE_TAB_IDS.has(t.id))

export function SettingsPage() {
  const { settingsPage, openSettings, closeSettings } = useUIStore()
  const requested = (settingsPage || 'models') as TabId
  // Gizli code sekmesine yönlendirilirse Models'e düş (blank ekran olmasın).
  const mainTab: TabId =
    !FEATURES.code && CODE_TAB_IDS.has(requested) ? 'models' : requested

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
              {mainTab === 'sandbox' && <SandboxTab />}
              {mainTab === 'git' && <GitTab />}
              {mainTab === 'advanced' && <AdvancedTab />}
              {mainTab === 'appearance' && <AppearanceTab />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
