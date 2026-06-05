import React, { useState } from 'react'
import { Eye, EyeOff, Check, AlertCircle, ChevronDown } from 'lucide-react'
import { useSettingsStore } from '../../stores/settings.store'

export function ModelsTab() {
  const { config, apiKeys, models, setApiKey, removeApiKey, setModel, getModel, loadAll } = useSettingsStore()
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [modelOpen, setModelOpen] = useState(false)

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

  async function selectModel(modelId: string) {
    await setModel(modelId)
    setModelOpen(false)
  }

  return (
    <div className="p-5 space-y-6">
      {/* Model selection */}
      <section>
        <h4 className="text-xs font-semibold text-text-primary mb-3">Varsayılan Model</h4>
        <div className="relative">
          <button
            onClick={() => setModelOpen(!modelOpen)}
            className="w-full flex items-center justify-between px-3 py-2.5 bg-bg-tertiary border border-border rounded-lg text-sm text-text-primary hover:border-accent/40 transition-colors"
          >
            <span>{currentModelInfo?.label ?? currentModel}</span>
            <ChevronDown size={14} className={`text-text-muted transition-transform ${modelOpen ? 'rotate-180' : ''}`} />
          </button>

          {modelOpen && (
            <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-bg-secondary border border-border rounded-lg shadow-xl max-h-60 overflow-y-auto animate-fade-in">
              {/* Group by provider */}
              {['anthropic', 'openai', 'google', 'openrouter', 'groq'].map(provider => {
                const providerModels = models.filter(m => m.provider === provider)
                if (!providerModels.length) return null
                return (
                  <div key={provider}>
                    <p className="px-3 py-1.5 text-2xs text-text-muted uppercase tracking-wide font-medium bg-bg-primary/50 border-b border-border-subtle">
                      {provider}
                    </p>
                    {providerModels.map(m => (
                      <button
                        key={m.id}
                        onClick={() => selectModel(m.id)}
                        disabled={!m.available}
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors ${
                          m.id === currentModel
                            ? 'bg-accent/10 text-accent'
                            : m.available
                            ? 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                            : 'text-text-muted opacity-40 cursor-not-allowed'
                        }`}
                      >
                        <span>{m.label}</span>
                        <span className="text-2xs text-text-muted">{m.contextK}k ctx</span>
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
        {!currentModelInfo?.available && (
          <p className="text-2xs text-warning mt-1.5 flex items-center gap-1">
            <AlertCircle size={11} /> Bu model için API key ayarlayın.
          </p>
        )}
      </section>

      {/* API Keys */}
      <section>
        <h4 className="text-xs font-semibold text-text-primary mb-3">API Anahtarları</h4>
        <div className="space-y-3">
          {apiKeys.map(key => (
            <div key={key.id} className="p-3 bg-bg-tertiary border border-border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-text-primary">{key.label}</span>
                  {key.set ? (
                    <span className="flex items-center gap-1 text-2xs text-success">
                      <Check size={10} /> Ayarlı
                    </span>
                  ) : (
                    <span className="text-2xs text-text-muted">Ayarlanmamış</span>
                  )}
                </div>
                {key.set && (
                  <button
                    onClick={() => removeApiKey(key.id)}
                    className="text-2xs text-error hover:text-error/80 transition-colors"
                  >
                    Kaldır
                  </button>
                )}
              </div>

              {key.set && (
                <div className="flex items-center gap-2 mb-2">
                  <code className="flex-1 text-2xs text-text-muted font-mono bg-bg-primary px-2 py-1 rounded">
                    {showKeys[key.id] ? '••••' : key.value}
                  </code>
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type={showKeys[key.id] ? 'text' : 'password'}
                  value={keyInputs[key.id] ?? ''}
                  onChange={e => setKeyInputs(k => ({ ...k, [key.id]: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && saveKey(key.id)}
                  placeholder={`${key.prefix}...`}
                  className="flex-1 px-2.5 py-1.5 bg-bg-primary border border-border rounded text-xs text-text-primary placeholder-text-muted focus:border-accent transition-colors font-mono"
                />
                <button
                  onClick={() => setShowKeys(s => ({ ...s, [key.id]: !s[key.id] }))}
                  className="px-2 text-text-muted hover:text-text-secondary transition-colors"
                >
                  {showKeys[key.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
                <button
                  onClick={() => saveKey(key.id)}
                  disabled={!keyInputs[key.id]?.trim() || saving[key.id]}
                  className="px-3 py-1.5 bg-accent text-white text-xs rounded disabled:opacity-40 hover:bg-accent-hover transition-colors"
                >
                  {saving[key.id] ? '...' : 'Kaydet'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
