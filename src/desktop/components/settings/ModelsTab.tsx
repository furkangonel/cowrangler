import React, { useState } from 'react'
import { Eye, EyeOff, Check, Plus, Trash2, AlertCircle } from 'lucide-react'
import { useSettingsStore } from '../../stores/settings.store'

export function ModelsTab() {
  const { apiKeys, savedModels, setApiKey, removeApiKey, addSavedModel, removeSavedModel } = useSettingsStore()
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [newModelId, setNewModelId] = useState('')
  const [addingModel, setAddingModel] = useState(false)

  async function saveKey(provider: string) {
    const key = keyInputs[provider]?.trim()
    if (!key) return
    setSaving(s => ({ ...s, [provider]: true }))
    await setApiKey(provider, key)
    setKeyInputs(k => ({ ...k, [provider]: '' }))
    setSaving(s => ({ ...s, [provider]: false }))
  }

  async function handleAddModel() {
    const id = newModelId.trim()
    if (!id) return
    setAddingModel(true)
    await addSavedModel(id)
    setNewModelId('')
    setAddingModel(false)
  }

  return (
    <div className="p-6 space-y-8 max-w-2xl">

      {/* Saved Models */}
      <section>
        <h4 className="text-sm font-semibold text-text-primary mb-1">Saved Models</h4>
        <p className="text-xs text-text-muted mb-3">
          Models you've saved appear in all model pickers. Enter a full provider/model-id (e.g.{' '}
          <code className="font-mono text-2xs">anthropic/claude-opus-4-6</code>).
        </p>

        {/* Add model input */}
        <div className="flex gap-2 mb-3">
          <input
            value={newModelId}
            onChange={e => setNewModelId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddModel()}
            placeholder="provider/model-id"
            className="flex-1 px-3 py-2 bg-bg-tertiary border border-border rounded-xl text-sm text-text-primary placeholder-text-muted font-mono focus:border-accent/60 outline-none transition-colors"
          />
          <button
            onClick={handleAddModel}
            disabled={!newModelId.trim() || addingModel}
            className="px-3.5 py-2 bg-accent text-accent-fg text-xs font-medium rounded-xl disabled:opacity-40 hover:bg-accent-hover transition-colors flex items-center gap-1.5"
          >
            <Plus size={13} /> Save
          </button>
        </div>

        {/* List of saved models */}
        {savedModels.length === 0 ? (
          <div className="flex items-start gap-2.5 px-3.5 py-3 bg-bg-tertiary border border-border rounded-xl">
            <AlertCircle size={14} className="text-text-muted mt-0.5 flex-shrink-0" />
            <p className="text-xs text-text-muted">
              No saved models yet. Add a model ID above to start — it will appear in all model pickers.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {savedModels.map(modelId => (
              <div
                key={modelId}
                className="group flex items-center justify-between px-3.5 py-2.5 bg-bg-secondary border border-border rounded-xl"
              >
                <span className="text-xs font-mono text-text-primary truncate">{modelId}</span>
                <button
                  onClick={() => removeSavedModel(modelId)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-error transition-all flex-shrink-0"
                  title="Remove"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* API Keys */}
      <section>
        <h4 className="text-sm font-semibold text-text-primary mb-1">API Keys</h4>
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
                  <button
                    onClick={() => removeApiKey(key.id)}
                    className="text-2xs text-error hover:opacity-80 transition-opacity"
                  >
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
                  className="flex-1 px-2.5 py-1.5 bg-bg-primary border border-border rounded-lg text-xs text-text-primary placeholder-text-muted focus:border-accent/60 outline-none transition-colors font-mono"
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
