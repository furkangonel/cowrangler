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

// ── OAuth-connected providers → discoverable / curated models ─────────────────
// Subscription OAuth (Claude Pro, ChatGPT, Copilot, Gemini) doesn't set an API
// key, so the discovery above skips them. Here we discover with the OAuth access
// token where the provider's /models endpoint accepts it, and fall back to a
// small curated set so models always appear once a provider is connected.

/** Model id prefix llm.ts routes each OAuth provider through. */
const OAUTH_MODEL_PREFIX: Record<string, string> = {
  anthropic: 'anthropic/',
  openai: 'openai/',
  copilot: 'copilot/',
  gemini: 'google/',
  antigravity: 'antigravity/',
}

/** Curated fallback models (routing-correct) when live discovery isn't available.
 *  Antigravity/Gemini-CLI go through Cloud Code Assist — ids match caveman-code. */
const OAUTH_CURATED_MODELS: Record<string, string[]> = {
  anthropic: [
    'anthropic/claude-sonnet-5',
    'anthropic/claude-opus-4-8',
    'anthropic/claude-fable-5',
    'anthropic/claude-opus-4-7',
    'anthropic/claude-sonnet-4-6',
    'anthropic/claude-haiku-4-5',
  ],
  openai: [
    'openai/gpt-5.5',
    'openai/gpt-5.4',
    'openai/o3',
  ],
  copilot: [
    'copilot/gpt-5.5',
    'copilot/claude-sonnet-5',
    'copilot/claude-opus-4-8',
    'copilot/gemini-3.5-flash',
  ],
  gemini: [
    // Public generativelanguage API (Method A) — bu ID'ler AI Studio API'de
    // birebir geçerli olmalı. Pro'nun public adı "-preview" ekli; düz
    // "gemini-3.1-pro" sadece Antigravity kanalında geçerli, public'te 404 verir.
    'google/gemini-3.5-flash',
    'google/gemini-3.1-pro-preview',
    'google/gemini-3.1-flash-lite',
    'google/gemini-flash-latest',
  ],
  antigravity: [
    'antigravity/gemini-3.5-flash',
    'antigravity/gemini-3.1-pro',
    'antigravity/claude-sonnet-4-6',
    'antigravity/claude-opus-4-6',
    'antigravity/gpt-oss-120b',
  ],
}

/** Try to list a connected OAuth provider's models using its access token. */
async function discoverOAuthModels(id: string, token: string, accountId?: string): Promise<DiscoveredModel[]> {
  const out: DiscoveredModel[] = []
  try {
    if (id === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/models?limit=100', {
        headers: { authorization: `Bearer ${token}`, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'oauth-2025-04-20' },
      })
      if (r.ok) { const j: any = await r.json(); for (const m of j.data ?? []) out.push({ provider: 'anthropic', id: `anthropic/${m.id}`, label: m.display_name ?? m.id, contextK: 200 }) }
    } else if (id === 'openai') {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
      if (accountId) headers['chatgpt-account-id'] = accountId
      const r = await fetch('https://api.openai.com/v1/models', { headers })
      if (r.ok) { const j: any = await r.json(); for (const m of j.data ?? []) if (/^(gpt|o[0-9]|chatgpt)/i.test(m.id)) out.push({ provider: 'openai', id: `openai/${m.id}`, label: m.id, contextK: 128 }) }
    } else if (id === 'copilot') {
      const r = await fetch('https://api.individual.githubcopilot.com/models', {
        headers: { Authorization: `Bearer ${token}`, 'Copilot-Integration-Id': 'vscode-chat', 'Editor-Version': 'Cowrangler/2.0', Accept: 'application/json' },
      })
      if (r.ok) { const j: any = await r.json(); for (const m of (j.data ?? j.models ?? [])) { const mid = m.id ?? m.model; if (mid) out.push({ provider: 'copilot', id: `copilot/${mid}`, label: m.name ?? mid, contextK: Math.round((m?.capabilities?.limits?.max_context_window_tokens ?? 128000) / 1000) }) } }
    }
    // gemini/antigravity: OAuth token is Cloud-scoped, generativelanguage /models
    // needs an API key — rely on the curated list below.
  } catch { /* fall through to curated */ }
  return out
}

/**
 * Seed the model picker (savedModels) with a connected provider's models so they
 * appear immediately. Prefers a small set of live-discovered ids; falls back to
 * the curated list. Returns the ids that were newly added.
 */
async function seedOAuthModels(id: string): Promise<string[]> {
  const prefix = OAUTH_MODEL_PREFIX[id]
  if (!prefix) return []
  let candidates: string[] = []
  try {
    const { getValidAccessToken } = await import('../../core/oauth_subscriptions.js')
    const creds = await getValidAccessToken(id as any)
    if (creds?.access) {
      const discovered = await discoverOAuthModels(id, creds.access, creds.accountId as string | undefined)
      // Pick a compact, relevant subset so we don't flood the picker.
      const flagship = discovered.filter(m => /(opus|sonnet|haiku|gpt-4o|gpt-4\.1|gpt-5|o4|o3|gemini-2|flash|pro)/i.test(m.id))
      candidates = (flagship.length ? flagship : discovered).slice(0, 6).map(m => m.id)
    }
  } catch { /* discovery unavailable */ }
  if (candidates.length === 0) candidates = OAUTH_CURATED_MODELS[id] ?? []
  if (candidates.length === 0) return []

  const current = readSavedModels()
  const added = candidates.filter(m => !current.includes(m))
  if (added.length) writeSavedModels([...current, ...added])
  return added
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
    
    // Check if there is a local config override
    const { DIRS } = await import('../../core/init.js')
    let updatedLocal = false
    if (fs.existsSync(DIRS.local.config)) {
      try {
        const localConfig: any = yaml.load(fs.readFileSync(DIRS.local.config, 'utf-8')) || {}
        // If the key exists in local config, update it there too so it takes effect
        if (localConfig[key] !== undefined) {
          localConfig[key] = value
          fs.writeFileSync(DIRS.local.config, yaml.dump(localConfig), 'utf-8')
          updatedLocal = true
        }
      } catch {}
    }

    // Always update global config
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

    // Google (Method A): kaydetmeden önce key'i doğrula. Geçersiz/yetkisiz key
    // sessizce kaydedilince, hata ancak generate anında kriptik 404 "Requested
    // entity was not found" olarak dönüyordu. ListModels ile önden yakala ve
    // key'in gerçekten servis ettiği modelleri geri döndür.
    const trimmed = (key ?? '').trim()
    if (provider === 'google' && trimmed) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${trimmed}`)
        if (!r.ok) {
          const body = await r.text().catch(() => '')
          return {
            ok: false,
            error:
              r.status === 400 || r.status === 403
                ? 'Geçersiz veya yetkisiz Google API anahtarı (AI Studio → API keys).'
                : `Google key doğrulanamadı (HTTP ${r.status}). ${body.slice(0, 160)}`,
          }
        }
        const j: any = await r.json().catch(() => ({}))
        const models = (j.models ?? [])
          .filter((m: any) => (m.supportedGenerationMethods ?? []).some((s: string) => /generateContent/i.test(s)))
          .map((m: any) => String(m.name ?? '').replace(/^models\//, ''))
          .filter(Boolean)
        writeCredential(p.envKey, trimmed)
        return { ok: true, models }
      } catch (e: any) {
        return { ok: false, error: `Google key doğrulanamadı: ${e?.message ?? String(e)}` }
      }
    }

    writeCredential(p.envKey, key)
    return { ok: true }
  })

  ipcMain.handle('settings:removeApiKey', async (_, provider: string) => {
    const p = PROVIDERS.find(p => p.id === provider)
    if (!p) return { ok: false }
    writeCredential(p.envKey, '')
    return { ok: true }
  })

  // ─── Subscription OAuth (Claude Pro, ChatGPT, Copilot, Gemini, Antigravity) ─
  ipcMain.handle('settings:oauthList', async () => {
    try {
      const { listOAuthProviders } = await import('../../core/oauth_subscriptions.js')
      return listOAuthProviders()
    } catch { return [] }
  })

  ipcMain.handle('settings:oauthLogin', async (evt, id: string) => {
    const emit = (payload: any) => { try { evt.sender.send('settings:oauthEvent', { id, ...payload }) } catch {} }
    try {
      const { loginOAuth, applyOAuthEnv } = await import('../../core/oauth_subscriptions.js')
      const { shell } = await import('electron')
      await loginOAuth(id as any, {
        // Surface the authorization target AND any device code / instructions to
        // the renderer (GitHub Copilot's device flow shows a user_code here), then
        // open the browser. If the browser can't open, the UI shows the link/code.
        onAuth: ({ url, instructions }) => {
          emit({ type: 'auth', url, instructions })
          void shell.openExternal(url).catch(() => {})
        },
        onProgress: (message: string) => emit({ type: 'progress', message }),
      })
      await applyOAuthEnv().catch(() => {})
      // Populate the model pickers for the freshly connected provider so its
      // models are immediately selectable (fixes "connected but no models").
      let seeded: string[] = []
      try { seeded = await seedOAuthModels(id) } catch {}
      emit({ type: 'done', seeded })
      return { ok: true, seeded }
    } catch (e: any) {
      const error = e?.message ?? String(e)
      emit({ type: 'error', error })
      return { ok: false, error }
    }
  })

  ipcMain.handle('settings:oauthLogout', async (_, id: string) => {
    try {
      const { logoutOAuth } = await import('../../core/oauth_subscriptions.js')
      logoutOAuth(id as any)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) }
    }
  })

  // ─── Saved models (model picker only shows these) ─────────────────────────
  ipcMain.handle('settings:savedModels:list', async () => readSavedModels())

  ipcMain.handle('settings:savedModels:add', async (_, modelId: string, contextWindow?: number) => {
    if (!modelId?.trim()) return { ok: false }
    const current = readSavedModels()
    if (!current.includes(modelId.trim())) writeSavedModels([...current, modelId.trim()])
    // Persist optional context window into saved_models_meta
    if (contextWindow && contextWindow > 0) {
      let config: any = {}
      if (fs.existsSync(CONFIG_FILE)) {
        try { config = yaml.load(fs.readFileSync(CONFIG_FILE, 'utf-8')) as any || {} } catch {}
      }
      if (!config['saved_models_meta'] || typeof config['saved_models_meta'] !== 'object') {
        config['saved_models_meta'] = {}
      }
      config['saved_models_meta'][modelId.trim()] = { contextWindow }
      fs.writeFileSync(CONFIG_FILE, yaml.dump(config), 'utf-8')
    }
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

    // Which subscription-OAuth providers are connected? Their models are also
    // available (no API key) — and we merge in any we can discover / curate.
    const oauthConnected = new Set<string>()
    try {
      const { listOAuthProviders } = await import('../../core/oauth_subscriptions.js')
      for (const p of listOAuthProviders()) if (p.connected) oauthConnected.add(p.id)
    } catch {}

    // Merge curated OAuth models for connected providers not already discovered.
    const known = new Set(models.map(m => m.id))
    for (const oid of oauthConnected) {
      for (const mid of OAUTH_CURATED_MODELS[oid] ?? []) {
        if (!known.has(mid)) { known.add(mid); models = [...models, { provider: mid.split('/')[0], id: mid, label: mid.split('/').pop() ?? mid, contextK: 128 }] }
      }
    }

    // A model is available if its API key is set OR its provider is OAuth-connected.
    // OAuth ids (gemini/antigravity) route through the "google" provider prefix.
    const oauthProviderActive = (provider: string): boolean => {
      if (provider === 'google') return oauthConnected.has('gemini')
      if (provider === 'antigravity') return oauthConnected.has('antigravity')
      if (provider === 'copilot') return oauthConnected.has('copilot')
      return oauthConnected.has(provider) // anthropic / openai
    }
    return models.map(m => {
      const p = PROVIDERS.find(pr => pr.id === m.provider)
      const hasKey = p ? !!(creds[p.envKey] || process.env[p.envKey]) : false
      return { ...m, available: hasKey || oauthProviderActive(m.provider) }
    })
  })
}
