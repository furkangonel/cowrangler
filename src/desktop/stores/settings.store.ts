import { create } from 'zustand'
import { ipc, ApiKeyInfo, ModelInfo } from '../lib/ipc'

interface SettingsState {
  config: Record<string, any>
  apiKeys: ApiKeyInfo[]
  models: ModelInfo[]
  loading: boolean

  loadAll: () => Promise<void>
  setConfig: (key: string, value: any) => Promise<void>
  setApiKey: (provider: string, key: string) => Promise<void>
  removeApiKey: (provider: string) => Promise<void>
  getModel: () => string
  setModel: (modelId: string) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  config: {},
  apiKeys: [],
  models: [],
  loading: false,

  loadAll: async () => {
    set({ loading: true })
    const [config, apiKeys, models] = await Promise.all([
      ipc.settings.get(),
      ipc.settings.getApiKeys(),
      ipc.settings.getModels(),
    ])
    set({ config, apiKeys, models, loading: false })
  },

  setConfig: async (key, value) => {
    await ipc.settings.set(key, value)
    set(s => ({ config: { ...s.config, [key]: value } }))
  },

  setApiKey: async (provider, key) => {
    await ipc.settings.setApiKey(provider, key)
    const apiKeys = await ipc.settings.getApiKeys()
    const models = await ipc.settings.getModels()
    set({ apiKeys, models })
  },

  removeApiKey: async (provider) => {
    await ipc.settings.removeApiKey(provider)
    const apiKeys = await ipc.settings.getApiKeys()
    const models = await ipc.settings.getModels()
    set({ apiKeys, models })
  },

  getModel: () => {
    return get().config.model || 'openrouter/google/gemini-2.5-flash'
  },

  setModel: async (modelId) => {
    await get().setConfig('model', modelId)
  },
}))
