import { create } from 'zustand'
import { ipc, ApiKeyInfo, ModelInfo } from '../lib/ipc'
import { applyTheme, applyFontSize, ThemePref } from '../lib/theme'

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
  refreshModels: () => Promise<void>

  getTheme: () => ThemePref
  setTheme: (theme: ThemePref) => Promise<void>
  getFontSize: () => string
  setFontSize: (size: string) => Promise<void>
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
    // Tema + font tercihini DOM'a uygula
    applyTheme((config['desktop.theme'] as ThemePref) || 'light')
    applyFontSize((config['desktop.fontSize'] as string) || 'normal')
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
