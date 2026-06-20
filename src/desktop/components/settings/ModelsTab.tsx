import React, { useState } from 'react'
import { Eye, EyeOff, Check, AlertCircle, ArrowRight, RefreshCw } from 'lucide-react'
import { useSettingsStore } from '../../stores/settings.store'

const PROVIDER_ORDER = ['anthropic', 'openai', 'google', 'openrouter', 'groq', 'xai', 'mistral']

function providerGroups(models: { provider: string }[]): string[] {
  const present = Array.from(new Set(models.map(m => m.provider)))
  const ordered = PROVIDER_ORDER.filter(p => present.includes(p))
  const rest = present.filter(p => !PROVIDER_ORDER.includes(p)).sort()
  return [...ordered, ...rest]
}

export function ModelsTab() {
  const { apiKeys, models, setApiKey, removeApiKey, setModel, getModel, refreshModels } = useSettingsStore()
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [manualModel, setManualModel] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const currentModel = getModel()
  const currentModelInfo = models.find(m => m.id === currentModel)
  const groups = providerGroups(models)

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
    setManualModel('')
  }

  async function refresh() {
    setRefreshing(true)
    try { await refreshModels() } finally { setRefreshing(false) }
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
            className="flex-1 px-3 py-2.5 bg-bg-tertiary border border-border rounded-xl text-sm text-text-primary placeholder-text-muted font-mono focus:border-accent transition-colors"
          />
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
          <span className="font-mono text-text-primary truncate">{currentModelInfo?.label ?? (currentModel || '— none selected —')}</span>
        </div>
        {currentModelInfo && !currentModelInfo.available && (
          <p className="text-2xs text-warning mt-2 flex items-center gap-1">
            <AlertCircle size={11} /> Add the matching API key below to use this model.
          </p>
        )}
      </section>

      {/* Discovered models list */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-text-primary">Available models</h4>
          <button onClick={refresh} className="flex items-center gap-1.5 text-2xs text-text-muted hover:text-text-secondary transition-colors">
            <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {models.length === 0 ? (
          <div className="text-center py-8 bg-bg-tertiary border border-border rounded-xl">
            <p className="text-xs text-text-muted">No models discovered yet.</p>
            <p className="text-2xs text-text-muted mt-1">Add an API key below — models are fetched live from each provider.</p>
          </div>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden divide-y divide-border-subtle max-h-80 overflow-y-auto">
            {groups.map(provider => {
              const providerModels = models.filter(m => m.provider === provider)
              if (!providerModels.length) return null
              return (
                <div key={provider}>
                  <p className="px-3 py-1.5 text-2xs text-text-muted uppercase tracking-wider font-semibold bg-bg-primary/60 sticky top-0">
                    {provider} <span className="text-text-muted/60 normal-case">· {providerModels.length}</span>
                  </p>
                  {providerModels.map(m => (
                    <button
                      key={m.id}
                      onClick={() => setModel(m.id)}
                      disabled={!m.available}
                      className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors ${
                        m.id === currentModel
                          ? 'bg-accent-subtle text-accent'
                          : m.available
                          ? 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                          : 'text-text-muted opacity-40 cursor-not-allowed'
                      }`}
                    >
                      <span className="truncate flex items-center gap-1.5">
                        {m.id === currentModel && <Check size={11} className="flex-shrink-0" />}
                        {m.label}
                      </span>
                      <span className="text-2xs text-text-muted flex-shrink-0 ml-2">{m.contextK}k</span>
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
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
