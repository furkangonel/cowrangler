import React, { useState, useEffect } from 'react'
import { Eye, EyeOff, Check, Plus, Trash2, AlertCircle, Database, Wrench, Image, Brain } from 'lucide-react'
import { useSettingsStore } from '../../stores/settings.store'
import { ipc, ModelCapabilities } from '../../lib/ipc'

/**
 * ModelCapabilityBadges — WP-5/WP-6 yetenek göstergesi.
 * Modelin yeteneklerini (prompt cache / native tool-calling / vision / thinking)
 * tek kaynaktan (core/model_metadata) IPC ile çekip küçük rozetler gösterir.
 */
function ModelCapabilityBadges({ modelId }: { modelId: string }) {
  const [caps, setCaps] = useState<ModelCapabilities | null>(null)
  useEffect(() => {
    let alive = true
    ipc.settings.modelCapabilities(modelId).then(c => { if (alive) setCaps(c) }).catch(() => {})
    return () => { alive = false }
  }, [modelId])
  if (!caps) return null
  const items: { on: boolean; icon: React.ReactNode; label: string }[] = [
    { on: caps.supportsPromptCache, icon: <Database size={10} />, label: 'prompt cache' },
    { on: caps.nativeToolCalling, icon: <Wrench size={10} />, label: 'native tool-calling' },
    { on: caps.supportsVision, icon: <Image size={10} />, label: 'vision' },
    { on: caps.supportsThinking, icon: <Brain size={10} />, label: 'reasoning/effort' },
  ]
  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      {items.filter(i => i.on).map((i, idx) => (
        <span
          key={idx}
          title={`${i.label} ✓`}
          className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-accent-subtle text-accent text-2xs"
        >
          {i.icon}
        </span>
      ))}
    </div>
  )
}

export function ModelsTab() {
  const { apiKeys, savedModels, setApiKey, removeApiKey, addSavedModel, removeSavedModel } = useSettingsStore()
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [keyMsg, setKeyMsg] = useState<Record<string, { ok: boolean; text: string }>>({})
  const [newModelId, setNewModelId] = useState('')
  const [newModelCtx, setNewModelCtx] = useState('')
  const [addingModel, setAddingModel] = useState(false)

  async function saveKey(provider: string) {
    const key = keyInputs[provider]?.trim()
    if (!key) return
    setSaving(s => ({ ...s, [provider]: true }))
    setKeyMsg(m => ({ ...m, [provider]: undefined as any }))
    const res = await setApiKey(provider, key)
    setSaving(s => ({ ...s, [provider]: false }))
    if (res && res.ok === false) {
      // Geçersiz key kaydedilmedi — hatayı göster, input'u koru.
      setKeyMsg(m => ({ ...m, [provider]: { ok: false, text: res.error || 'Key doğrulanamadı.' } }))
      return
    }
    setKeyInputs(k => ({ ...k, [provider]: '' }))
    const n = res?.models?.length
    setKeyMsg(m => ({
      ...m,
      [provider]: { ok: true, text: n ? `Doğrulandı — ${n} model erişilebilir.` : 'Kaydedildi.' },
    }))
  }

  async function handleAddModel() {
    const id = newModelId.trim()
    if (!id) return
    setAddingModel(true)
    const ctxNum = parseInt(newModelCtx, 10)
    await addSavedModel(id, ctxNum > 0 ? ctxNum : undefined)
    setNewModelId('')
    setNewModelCtx('')
    setAddingModel(false)
  }

  return (
    <div className="p-6 space-y-8 max-w-2xl">

      {/* Saved Models */}
      <section>
        <h4 className="text-sm font-semibold text-text-primary mb-1">Saved Models</h4>
        <div className="text-xs text-text-muted mb-3 space-y-1.5">
          <p>
            Models you've saved appear in all model pickers. Enter a full provider/model-id (e.g.{' '}
            <code className="font-mono text-2xs">anthropic/claude-opus-4-6</code>).
          </p>
          <p className="p-2.5 bg-bg-secondary rounded-lg border border-border leading-relaxed">
            <strong className="text-text-primary font-medium">Local Models:</strong> You can run local models seamlessly without API keys by using the{' '}
            <code className="font-mono text-2xs bg-bg-primary border border-border px-1 py-0.5 rounded">ollama/</code>,{' '}
            <code className="font-mono text-2xs bg-bg-primary border border-border px-1 py-0.5 rounded">lmstudio/</code>, or{' '}
            <code className="font-mono text-2xs bg-bg-primary border border-border px-1 py-0.5 rounded">local/</code> prefixes 
            (e.g., <code className="font-mono text-2xs bg-bg-primary border border-border px-1 py-0.5 rounded">ollama/deepseek-r1:8b</code>).
          </p>
        </div>

        {/* Add model input */}
        <div className="flex gap-2 mb-3">
          <input
            value={newModelId}
            onChange={e => setNewModelId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddModel()}
            placeholder="provider/model-id"
            className="flex-1 px-3 py-2 bg-bg-tertiary border border-border rounded-xl text-sm text-text-primary placeholder-text-muted font-mono focus:border-accent/60 outline-none transition-colors"
          />
          <input
            value={newModelCtx}
            onChange={e => setNewModelCtx(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={e => e.key === 'Enter' && handleAddModel()}
            placeholder="Context (opt)"
            title="Optional context window size (e.g. 1000000)"
            className="w-28 px-2.5 py-2 bg-bg-tertiary border border-border rounded-xl text-sm text-text-primary placeholder-text-muted font-mono focus:border-accent/60 outline-none transition-colors text-center"
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
                <div className="flex items-center gap-2 flex-shrink-0">
                  <ModelCapabilityBadges modelId={modelId} />
                  <button
                    onClick={() => removeSavedModel(modelId)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-error transition-all"
                    title="Remove"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
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

              {keyMsg[key.id] && (
                <p className={`mt-1.5 text-2xs flex items-center gap-1 ${keyMsg[key.id].ok ? 'text-success' : 'text-error'}`}>
                  {keyMsg[key.id].ok ? <Check size={10} /> : <AlertCircle size={10} />}
                  {keyMsg[key.id].text}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
