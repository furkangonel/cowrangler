import React from 'react'
import { Shield, ShieldAlert, ShieldCheck, Zap } from 'lucide-react'
import { useSettingsStore } from '../../stores/settings.store'

const MODES = [
  { id: 'default', label: 'Default', description: 'Ask for confirmation before executing any moderate or dangerous tool.', icon: ShieldAlert, color: 'text-orange-500' },
  { id: 'plan', label: 'Plan', description: 'Allow execution if part of an approved plan. Ask otherwise.', icon: Shield, color: 'text-blue-500' },
  { id: 'auto', label: 'Auto', description: 'Automatically allow safe and moderate actions. Block critical ones.', icon: ShieldCheck, color: 'text-green-500' },
  { id: 'bypass', label: 'Bypass', description: 'DANGER: Automatically allow all actions without any confirmation.', icon: Zap, color: 'text-red-500' },
]

export function PermissionsTab() {
  const { config, setConfig } = useSettingsStore()
  
  const permissionMode = config.permission_mode || 'default'
  const sandboxEnabled = config.sandbox?.enabled ?? true

  return (
    <div className="p-6 space-y-8 max-w-xl">
      <section>
        <h4 className="text-sm font-semibold text-text-primary mb-1">Permission Mode</h4>
        <p className="text-xs text-text-muted mb-4">Control how the agent requests permission to execute tools and commands.</p>
        
        <div className="grid grid-cols-1 gap-3">
          {MODES.map(m => {
            const Icon = m.icon
            const active = permissionMode === m.id
            return (
              <button
                key={m.id}
                onClick={() => setConfig('permission_mode', m.id)}
                className={`flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                  active ? 'border-accent bg-accent/5' : 'border-border hover:border-text-muted'
                }`}
              >
                <div className={`mt-0.5 ${active ? m.color : 'text-text-muted'}`}>
                  <Icon size={18} />
                </div>
                <div>
                  <div className={`text-sm font-medium ${active ? 'text-text-primary' : 'text-text-secondary'}`}>
                    {m.label}
                  </div>
                  <div className="text-xs text-text-muted mt-0.5">
                    {m.description}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <h4 className="text-sm font-semibold text-text-primary mb-1">Sandbox Protection</h4>
        <p className="text-xs text-text-muted mb-4">Additional security measures for executing terminal commands.</p>
        
        <label className="flex items-start gap-3 p-3 rounded-xl border-2 border-border cursor-pointer hover:border-text-muted transition-all">
          <input 
            type="checkbox" 
            className="mt-1"
            checked={sandboxEnabled}
            onChange={(e) => setConfig('sandbox', { ...(config.sandbox || {}), enabled: e.target.checked })}
          />
          <div>
            <div className="text-sm font-medium text-text-primary">Enable Pattern-Based Protection</div>
            <div className="text-xs text-text-muted mt-0.5">
              Automatically block dangerously recursive or destructive bash commands regardless of the permission mode.
            </div>
          </div>
        </label>
      </section>
    </div>
  )
}
