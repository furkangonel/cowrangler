import { IpcMain } from 'electron'
import path from 'path'
import os from 'os'
import fs from 'fs'
import yaml from 'js-yaml'
import { getConfig } from '../../core/init.js'

const GLOBAL_DIR = path.join(os.homedir(), '.cowrangler')
const CONFIG_FILE = path.join(GLOBAL_DIR, 'config.yaml')
const CREDENTIALS_FILE = path.join(GLOBAL_DIR, 'credentials.env')

const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic', envKey: 'ANTHROPIC_API_KEY', prefix: 'sk-ant-' },
  { id: 'openai', label: 'OpenAI', envKey: 'OPENAI_API_KEY', prefix: 'sk-' },
  { id: 'google', label: 'Google AI', envKey: 'GOOGLE_GENERATIVE_AI_API_KEY', prefix: 'AIza' },
  { id: 'openrouter', label: 'OpenRouter', envKey: 'OPENROUTER_API_KEY', prefix: 'sk-or-' },
  { id: 'groq', label: 'Groq', envKey: 'GROQ_API_KEY', prefix: 'gsk_' },
  { id: 'github', label: 'GitHub Copilot', envKey: 'GITHUB_TOKEN', prefix: 'ghp_' },
]

// NOT: Hardcoded model listesi KALDIRILDI. Modeller artık tamamen dinamiktir —
// anahtarı girilmiş her provider'ın canlı /models endpoint'inden keşfedilir ve
// ~/.cowrangler/cache/models.json'a 24 saat cache'lenir. Anahtar yoksa liste boştur.

const MODELS_CACHE = path.join(GLOBAL_DIR, 'cache', 'models.json')
const MODELS_TTL_MS = 24 * 60 * 60 * 1000

interface DiscoveredModel {
  provider: string
  id: string
  label: string
  contextK: number
}

function readModelsCache(): { fetchedAt: number; models: DiscoveredModel[] } | null {
  try {
    if (fs.existsSync(MODELS_CACHE)) return JSON.parse(fs.readFileSync(MODELS_CACHE, 'utf-8'))
  } catch {}
  return null
}

function writeModelsCache(models: DiscoveredModel[]): void {
  try {
    fs.mkdirSync(path.dirname(MODELS_CACHE), { recursive: true })
    fs.writeFileSync(MODELS_CACHE, JSON.stringify({ fetchedAt: Date.now(), models }, null, 2), 'utf-8')
  } catch {}
}

/** Anahtarı olan her provider için canlı model keşfi. Hatalar sessizce atlanır. */
async function discoverModels(creds: Record<string, string>): Promise<DiscoveredModel[]> {
  const key = (envKey: string) => creds[envKey] || process.env[envKey] || ''
  const out: DiscoveredModel[] = []

  const anthropicKey = key('ANTHROPIC_API_KEY')
  const openaiKey = key('OPENAI_API_KEY')
  const googleKey = key('GOOGLE_GENERATIVE_AI_API_KEY')
  const openrouterKey = key('OPENROUTER_API_KEY')
  const groqKey = key('GROQ_API_KEY')

  const jobs: Promise<void>[] = []

  if (anthropicKey) jobs.push((async () => {
    try {
      const r = await fetch('https://api.anthropic.com/v1/models?limit=100', {
        headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      })
      if (!r.ok) return
      const j: any = await r.json()
      for (const m of j.data ?? []) out.push({ provider: 'anthropic', id: `anthropic/${m.id}`, label: m.display_name ?? m.id, contextK: 200 })
    } catch {}
  })())

  if (openaiKey) jobs.push((async () => {
    try {
      const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${openaiKey}` } })
      if (!r.ok) return
      const j: any = await r.json()
      for (const m of j.data ?? []) {
        if (/^(gpt|o[0-9]|chatgpt)/i.test(m.id)) out.push({ provider: 'openai', id: `openai/${m.id}`, label: m.id, contextK: 128 })
      }
    } catch {}
  })())

  if (googleKey) jobs.push((async () => {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${googleKey}`)
      if (!r.ok) return
      const j: any = await r.json()
      for (const m of j.models ?? []) {
        const id = String(m.name ?? '').replace(/^models\//, '')
        if (id) out.push({ provider: 'google', id: `google/${id}`, label: m.displayName ?? id, contextK: Math.round((m.inputTokenLimit ?? 128000) / 1000) })
      }
    } catch {}
  })())

  if (openrouterKey) jobs.push((async () => {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/models', { headers: { Authorization: `Bearer ${openrouterKey}` } })
      if (!r.ok) return
      const j: any = await r.json()
      for (const m of j.data ?? []) out.push({ provider: 'openrouter', id: `openrouter/${m.id}`, label: m.name ?? m.id, contextK: Math.round((m.context_length ?? 128000) / 1000) })
    } catch {}
  })())

  if (groqKey) jobs.push((async () => {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${groqKey}` } })
      if (!r.ok) return
      const j: any = await r.json()
      for (const m of j.data ?? []) out.push({ provider: 'groq', id: `groq/${m.id}`, label: m.id, contextK: Math.round((m.context_window ?? 128000) / 1000) })
    } catch {}
  })())

  await Promise.allSettled(jobs)
  return out
}

function readCredentials(): Record<string, string> {
  const creds: Record<string, string> = {}
  if (!fs.existsSync(CREDENTIALS_FILE)) return creds
  const lines = fs.readFileSync(CREDENTIALS_FILE, 'utf-8').split('\n')
  for (const line of lines) {
    const [key, ...rest] = line.trim().split('=')
    if (key && rest.length) creds[key.trim()] = rest.join('=').trim()
  }
  return creds
}

function writeCredential(envKey: string, value: string): void {
  fs.mkdirSync(GLOBAL_DIR, { recursive: true })
  let content = fs.existsSync(CREDENTIALS_FILE)
    ? fs.readFileSync(CREDENTIALS_FILE, 'utf-8')
    : ''

  const lines = content.split('\n').filter(l => !l.startsWith(`${envKey}=`))
  if (value.trim()) lines.push(`${envKey}=${value.trim()}`)
  fs.writeFileSync(CREDENTIALS_FILE, lines.filter(Boolean).join('\n') + '\n', 'utf-8')

  // Mevcut process'e yansıt
  if (value.trim()) {
    process.env[envKey] = value.trim()
  } else {
    delete process.env[envKey]
  }
}

function maskKey(key: string): string {
  if (!key || key.length < 8) return '••••••••'
  return key.slice(0, 6) + '••••••••' + key.slice(-4)
}

/** ~/.cowrangler/config.yaml içindeki `saved_models` listesini oku */
function readSavedModels(): string[] {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return []
    const config: any = yaml.load(fs.readFileSync(CONFIG_FILE, 'utf-8')) || {}
    return Array.isArray(config['saved_models']) ? config['saved_models'] : []
  } catch { return [] }
}

function writeSavedModels(models: string[]): void {
  fs.mkdirSync(GLOBAL_DIR, { recursive: true })
  let config: any = {}
  if (fs.existsSync(CONFIG_FILE)) {
    try { config = yaml.load(fs.readFileSync(CONFIG_FILE, 'utf-8')) as any || {} } catch {}
  }
  config['saved_models'] = [...new Set(models)]
  fs.writeFileSync(CONFIG_FILE, yaml.dump(config), 'utf-8')
}

export function registerSettingsIPC(ipcMain: IpcMain): void {
  ipcMain.handle('settings:get', async () => {
    try { return getConfig() } catch { return {} }
  })

  ipcMain.handle('settings:set', async (_, key: string, value: any) => {
    fs.mkdirSync(GLOBAL_DIR, { recursive: true })
    let config: any = {}
    if (fs.existsSync(CONFIG_FILE)) {
      try { config = yaml.load(fs.readFileSync(CONFIG_FILE, 'utf-8')) as any || {} } catch {}
    }
    config[key] = value
    fs.writeFileSync(CONFIG_FILE, yaml.dump(config), 'utf-8')
    return { ok: true }
  })

  ipcMain.handle('settings:apiKeys', async () => {
    const creds = readCredentials()
    return PROVIDERS.map(p => ({
      ...p,
      value: maskKey(creds[p.envKey] || process.env[p.envKey] || ''),
      set: !!(creds[p.envKey] || process.env[p.envKey]),
    }))
  })

  ipcMain.handle('settings:setApiKey', async (_, provider: string, key: string) => {
    const p = PROVIDERS.find(p => p.id === provider)
    if (!p) return { ok: false, error: 'Unknown provider' }
    writeCredential(p.envKey, key)
    return { ok: true }
  })

  ipcMain.handle('settings:removeApiKey', async (_, provider: string) => {
    const p = PROVIDERS.find(p => p.id === provider)
    if (!p) return { ok: false }
    writeCredential(p.envKey, '')
    return { ok: true }
  })

  // ─── Saved models (model picker only shows these) ─────────────────────────
  ipcMain.handle('settings:savedModels:list', async () => readSavedModels())

  ipcMain.handle('settings:savedModels:add', async (_, modelId: string) => {
    if (!modelId?.trim()) return { ok: false }
    const current = readSavedModels()
    if (!current.includes(modelId.trim())) writeSavedModels([...current, modelId.trim()])
    return { ok: true }
  })

  ipcMain.handle('settings:savedModels:remove', async (_, modelId: string) => {
    const current = readSavedModels()
    writeSavedModels(current.filter(m => m !== modelId))
    return { ok: true }
  })

  ipcMain.handle('settings:models', async (_, opts?: { refresh?: boolean }) => {
    const creds = readCredentials()
    const cached = readModelsCache()
    const fresh = cached && Date.now() - cached.fetchedAt < MODELS_TTL_MS
    let models: DiscoveredModel[]
    if (fresh && !opts?.refresh) {
      models = cached!.models
    } else {
      models = await discoverModels(creds)
      if (models.length) writeModelsCache(models)
      else if (cached) models = cached.models // ağ yoksa eski cache'e düş
    }
    // Anahtarı olan provider'ların modelleri available
    return models.map(m => {
      const p = PROVIDERS.find(pr => pr.id === m.provider)
      const hasKey = p ? !!(creds[p.envKey] || process.env[p.envKey]) : false
      return { ...m, available: hasKey }
    })
  })
}
