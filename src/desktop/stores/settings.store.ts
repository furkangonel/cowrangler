import { create } from 'zustand'
import { ipc, ApiKeyInfo, ModelInfo } from '../lib/ipc'
import { applyTheme, applyFontSize, ThemePref } from '../lib/theme'

interface SettingsState {
  config: Record<string, any>
  apiKeys: ApiKeyInfo[]
  models: ModelInfo[]
  savedModels: string[]
  loading: boolean

  loadAll: () => Promise<void>
  setConfig: (key: string, value: any) => Promise<void>
  setApiKey: (provider: string, key: string) => Promise<void>
  removeApiKey: (provider: string) => Promise<void>
  getModel: () => string
  setModel: (modelId: string) => Promise<void>
  refreshModels: () => Promise<void>
  loadSavedModels: () => Promise<void>
  addSavedModel: (modelId: string) => Promise<void>
  removeSavedModel: (modelId: string) => Promise<void>

  getTheme: () => ThemePref
  setTheme: (theme: ThemePref) => Promise<void>
  getFontSize: () => string
  setFontSize: (size: string) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  config: {},
  apiKeys: [],
  models: [],
  savedModels: [],
  loading: false,

  loadAll: async () => {
    set({ loading: true })
    const [config, apiKeys, models, savedModels] = await Promise.all([
      ipc.settings.get(),
      ipc.settings.getApiKeys(),
      ipc.settings.getModels(),
      ipc.settings.savedModels.list(),
    ])
    set({ config, apiKeys, models, savedModels, loading: false })
    // Tema + font tercihini DOM'a uygula
    applyTheme((config['desktop.theme'] as ThemePref) || 'light')
    applyFontSize((config['desktop.fontSize'] as string) || 'normal')
  },

  loadSavedModels: async () => {
    const savedModels = await ipc.settings.savedModels.list()
    set({ savedModels })
  },

  addSavedModel: async (modelId) => {
    await ipc.settings.savedModels.add(modelId)
    set(s => ({ savedModels: [...new Set([...s.savedModels, modelId.trim()])] }))
  },

  removeSavedModel: async (modelId) => {
    await ipc.settings.savedModels.remove(modelId)
    set(s => ({ savedModels: s.savedModels.filter(m => m !== modelId) }))
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
    // Hardcoded default KALDIRILDI. Yapılandırılmış model yoksa keşfedilen ilk
    // uygun modele düşülür; o da yoksa boş döner (UI kullanıcıyı seçime yönlendirir).
    const cfg = get().config.model
    if (cfg) return cfg
    const firstAvailable = get().models.find(m => (m as any).available)
    return firstAvailable?.id ?? ''
  },

  setModel: async (modelId) => {
    await get().setConfig('model', modelId)
  },

  refreshModels: async () => {
    const models = await ipc.settings.getModels({ refresh: true })
    set({ models })
  },

  getTheme: () => (get().config['desktop.theme'] as ThemePref) || 'light',

  setTheme: async (theme) => {
    applyTheme(theme)
    await get().setConfig('desktop.theme', theme)
  },

  getFontSize: () => (get().config['desktop.fontSize'] as string) || 'normal',

  setFontSize: async (size) => {
    applyFontSize(size)
    await get().setConfig('desktop.fontSize', size)
  },
}))
