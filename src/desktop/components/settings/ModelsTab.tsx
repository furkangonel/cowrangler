import React, { useState } from 'react'
import { Eye, EyeOff, Check, AlertCircle, ArrowRight, RefreshCw } from 'lucide-react'
import { useSettingsStore } from '../../stores/settings.store'



export function ModelsTab() {
  const { apiKeys, models, setApiKey, removeApiKey, setModel, getModel, config, setConfig } = useSettingsStore()
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [manualModel, setManualModel] = useState('')
  const [manualContextWindow, setManualContextWindow] = useState('')

  const currentModel = getModel()
  const currentModelInfo = models.find(m => m.id === currentModel)

  async function saveKey(provider: string) {
    const key = keyInputs[provider]?.trim()
    if (!key) return
    setSaving(s => ({ ...s, [provider]: true }))
    await setApiKey(provider, key)
    setKeyInputs(k => ({ ...k, [provider]: '' }))
    setSaving(s => ({ ...s, [provider]: false }))
  }

  async function useManualModel() {
    const id = manualModel.trim()
    if (!id) return
    await setModel(id)
    
    if (manualContextWindow.trim()) {
      const cw = parseInt(manualContextWindow.trim(), 10)
      if (!isNaN(cw)) {
        const currentCustomCWs = config['custom_context_windows'] || {}
        await setConfig('custom_context_windows', { ...currentCustomCWs, [id]: cw })
      }
    }
    
    setManualModel('')
    setManualContextWindow('')
  }



  return (
    <div className="p-6 space-y-8 max-w-2xl">
      {/* Default model — manual entry on top */}
      <section>
        <h4 className="text-sm font-semibold text-text-primary mb-1">Default model</h4>
        <p className="text-xs text-text-muted mb-3">Model used for new chats. Type any model id, or pick from the discovered list below.</p>

        <div className="flex gap-2">
          <input
            value={manualModel}
            onChange={e => setManualModel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && useManualModel()}
            placeholder="provider/model-id  (e.g. anthropic/claude-opus-4-6)"
            className="flex-[4] px-3 py-2.5 bg-bg-tertiary border border-border rounded-xl text-sm text-text-primary placeholder-text-muted font-mono focus:border-accent transition-colors"
          />
          <select
            value={manualContextWindow}
            onChange={e => setManualContextWindow(e.target.value)}
            className="flex-1 px-3 py-2.5 bg-bg-tertiary border border-border rounded-xl text-sm text-text-primary font-mono focus:border-accent transition-colors"
          >
            <option value="">Default Size</option>
            <option value="4096">4,096 (4K)</option>
            <option value="8192">8,192 (8K)</option>
            <option value="16384">16,384 (16K)</option>
            <option value="32768">32,768 (32K)</option>
            <option value="65536">65,536 (64K)</option>
            <option value="128000">128,000 (128K)</option>
            <option value="200000">200,000 (200K)</option>
            <option value="1000000">1,000,000 (1M)</option>
            <option value="2000000">2,000,000 (2M)</option>
          </select>
          <button
            onClick={useManualModel}
            disabled={!manualModel.trim()}
            className="px-3.5 py-2.5 bg-accent text-accent-fg text-sm rounded-xl disabled:opacity-40 hover:bg-accent-hover transition-colors flex items-center gap-1.5 font-medium"
          >
            Use <ArrowRight size={14} />
          </button>
        </div>

        <div className="mt-2.5 flex items-center gap-2 text-xs">
          <span className="text-text-muted">Current:</span>
          <span className="font-mono text-text-primary truncate">
            {currentModelInfo?.label ?? (currentModel || '— none selected —')}
            {config['custom_context_windows']?.[currentModel] ? ` (Custom context: ${config['custom_context_windows'][currentModel]})` : ''}
          </span>
        </div>
        {currentModelInfo && !currentModelInfo.available && (
          <p className="text-2xs text-warning mt-2 flex items-center gap-1">
            <AlertCircle size={11} /> Add the matching API key below to use this model.
          </p>
        )}
      </section>



      {/* API keys */}
      <section>
        <h4 className="text-sm font-semibold text-text-primary mb-1">API keys</h4>
        <p className="text-xs text-text-muted mb-3">Keys are stored locally on your machine.</p>
        <div className="space-y-3">
          {apiKeys.map(key => (
            <div key={key.id} className="p-3.5 bg-bg-tertiary border border-border rounded-xl">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-text-primary">{key.label}</span>
                  {key.set ? (
                    <span className="flex items-center gap-1 text-2xs text-success"><Check size={10} /> Set</span>
                  ) : (
                    <span className="text-2xs text-text-muted">Not set</span>
                  )}
                </div>
                {key.set && (
                  <button onClick={() => removeApiKey(key.id)} className="text-2xs text-error hover:opacity-80 transition-opacity">
                    Remove
                  </button>
                )}
              </div>

              {key.set && (
                <code className="block text-2xs text-text-muted font-mono bg-bg-primary px-2.5 py-1.5 rounded-lg mb-2">
                  {showKeys[key.id] ? key.value : '•'.repeat(24)}
                </code>
              )}

              <div className="flex gap-2">
                <input
                  type={showKeys[key.id] ? 'text' : 'password'}
                  value={keyInputs[key.id] ?? ''}
                  onChange={e => setKeyInputs(k => ({ ...k, [key.id]: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && saveKey(key.id)}
                  placeholder={`${key.prefix}…`}
                  className="flex-1 px-2.5 py-1.5 bg-bg-primary border border-border rounded-lg text-xs text-text-primary placeholder-text-muted focus:border-accent transition-colors font-mono"
                />
                <button
                  onClick={() => setShowKeys(s => ({ ...s, [key.id]: !s[key.id] }))}
                  className="px-2 text-text-muted hover:text-text-secondary transition-colors"
                >
                  {showKeys[key.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button
                  onClick={() => saveKey(key.id)}
                  disabled={!keyInputs[key.id]?.trim() || saving[key.id]}
                  className="px-3 py-1.5 bg-accent text-accent-fg text-xs rounded-lg disabled:opacity-40 hover:bg-accent-hover transition-colors font-medium"
                >
                  {saving[key.id] ? '…' : 'Save'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
