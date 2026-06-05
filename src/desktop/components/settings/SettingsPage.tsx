import React from 'react'
import { X, Cpu, Puzzle, BookOpen, Palette, User } from 'lucide-react'
import { ModelsTab } from './ModelsTab'
import { MCPTab } from './MCPTab'
import { SkillsTab } from './SkillsTab'
import { AppearanceTab } from './AppearanceTab'
import { useUIStore } from '../../stores/ui.store'

const TABS = [
  { id: 'models', label: 'Modeller & API', icon: Cpu },
  { id: 'mcp', label: 'MCP Servers', icon: Puzzle },
  { id: 'skills', label: 'Skills', icon: BookOpen },
  { id: 'appearance', label: 'Görünüm', icon: Palette },
] as const

type TabId = typeof TABS[number]['id']

export function SettingsPage() {
  const { settingsPage, openSettings, closeSettings } = useUIStore()
  const activeTab = (settingsPage || 'models') as TabId

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in">
      <div
        className="bg-bg-secondary border border-border rounded-xl shadow-2xl flex overflow-hidden"
        style={{ width: '780px', height: '580px' }}
      >
        {/* Left nav */}
        <nav className="w-48 flex-shrink-0 border-r border-border bg-bg-primary flex flex-col py-4 px-2">
          <h2 className="text-sm font-semibold text-text-primary px-3 mb-3">Ayarlar</h2>
          {TABS.map(tab => {
            const Icon = tab.icon
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => openSettings(tab.id)}
                className={`
                  flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors mb-0.5
                  ${active
                    ? 'bg-accent/15 text-accent font-medium'
                    : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                  }
                `}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            )
          })}
        </nav>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
            <h3 className="text-sm font-semibold text-text-primary">
              {TABS.find(t => t.id === activeTab)?.label}
            </h3>
            <button
              onClick={closeSettings}
              className="p-1.5 text-text-muted hover:text-text-secondary transition-colors rounded"
            >
              <X size={16} />
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'models' && <ModelsTab />}
            {activeTab === 'mcp' && <MCPTab />}
            {activeTab === 'skills' && <SkillsTab />}
            {activeTab === 'appearance' && <AppearanceTab />}
          </div>
        </div>
      </div>
    </div>
  )
}
