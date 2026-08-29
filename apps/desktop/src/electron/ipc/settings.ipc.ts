import { IpcMain } from 'electron'
import path from 'path'
import os from 'os'
import fs from 'fs'
import yaml from 'js-yaml'
import { getConfig } from '@cowrangler/core/init.js'
import { getSecrets, setSecret, isEncrypted, getSecretMode } from '@cowrangler/core/credential_vault.js'

const GLOBAL_DIR = path.join(os.homedir(), '.cowrangler')
const CONFIG_FILE = path.join(GLOBAL_DIR, 'config.yaml')
const CREDENTIALS_FILE = path.join(GLOBAL_DIR, 'credentials.env')
const PROVIDER_VAULT_NAMESPACE = 'provider-api'

const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic', envKey: 'ANTHROPIC_API_KEY', prefix: 'sk-ant-' },
  { id: 'openai', label: 'OpenAI', envKey: 'OPENAI_API_KEY', prefix: 'sk-' },
  { id: 'google', label: 'Google AI', envKey: 'GOOGLE_GENERATIVE_AI_API_KEY', prefix: 'AIza' },
  { id: 'openrouter', label: 'OpenRouter', envKey: 'OPENROUTER_API_KEY', prefix: 'sk-or-' },
  { id: 'groq', label: 'Groq', envKey: 'GROQ_API_KEY', prefix: 'gsk_' },
  { id: 'github', label: 'GitHub Copilot', envKey: 'GITHUB_TOKEN', prefix: 'ghp_' },
  { id: 'mistral', label: 'Mistral', envKey: 'MISTRAL_API_KEY', prefix: '' },
  { id: 'deepseek', label: 'DeepSeek', envKey: 'DEEPSEEK_API_KEY', prefix: 'sk-' },
  { id: 'xai', label: 'xAI', envKey: 'XAI_API_KEY', prefix: 'xai-' },
  { id: 'together', label: 'Together AI', envKey: 'TOGETHER_API_KEY', prefix: '' },
  { id: 'cerebras', label: 'Cerebras', envKey: 'CEREBRAS_API_KEY', prefix: '' },
  { id: 'fireworks', label: 'Fireworks AI', envKey: 'FIREWORKS_API_KEY', prefix: '' },
]

const OPENAI_COMPAT_PROVIDERS = [
  { id: 'mistral', envKey: 'MISTRAL_API_KEY', modelsUrl: 'https://api.mistral.ai/v1/models' },
  { id: 'deepseek', envKey: 'DEEPSEEK_API_KEY', modelsUrl: 'https://api.deepseek.com/v1/models' },
  { id: 'xai', envKey: 'XAI_API_KEY', modelsUrl: 'https://api.x.ai/v1/models' },
  { id: 'together', envKey: 'TOGETHER_API_KEY', modelsUrl: 'https://api.together.xyz/v1/models' },
  { id: 'cerebras', envKey: 'CEREBRAS_API_KEY', modelsUrl: 'https://api.cerebras.ai/v1/models' },
  { id: 'fireworks', envKey: 'FIREWORKS_API_KEY', modelsUrl: 'https://api.fireworks.ai/inference/v1/models' },
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

  for (const provider of OPENAI_COMPAT_PROVIDERS) {
    const apiKey = key(provider.envKey)
    if (!apiKey) continue
    jobs.push((async () => {
      try {
        const response = await fetch(provider.modelsUrl, { headers: { Authorization: `Bearer ${apiKey}` } })
        if (!response.ok) return
        const payload: any = await response.json()
        const rows = Array.isArray(payload) ? payload : (payload.data ?? [])
        for (const model of rows) {
          if (!model?.id) continue
          out.push({
            provider: provider.id,
            id: `${provider.id}/${model.id}`,
            label: model.name ?? model.display_name ?? model.id,
            contextK: Math.round((model.context_window ?? model.context_length ?? 128000) / 1000),
          })
        }
      } catch { /* one provider must not block the rest */ }
    })())
  }

  await Promise.allSettled(jobs)
  return out
}



function readCredentials(): Record<string, string> {
  const creds: Record<string, string> = { ...getSecrets(PROVIDER_VAULT_NAMESPACE) }
  if (fs.existsSync(CREDENTIALS_FILE)) {
    const lines = fs.readFileSync(CREDENTIALS_FILE, 'utf-8').split('\n')
    for (const line of lines) {
      const [key, ...rest] = line.trim().split('=')
      if (key && rest.length && !creds[key.trim()]) creds[key.trim()] = rest.join('=').trim()
    }
  }
  return creds
}

function writeCredential(envKey: string, value: string): void {
  fs.mkdirSync(GLOBAL_DIR, { recursive: true })
  const content = fs.existsSync(CREDENTIALS_FILE)
    ? fs.readFileSync(CREDENTIALS_FILE, 'utf-8')
    : ''
  setSecret(PROVIDER_VAULT_NAMESPACE, envKey, value.trim() || null, { crossProcess: true })
  // Remove legacy plaintext copies while preserving comments and unrelated env.
  const lines = content.split('\n').filter((line) => !line.startsWith(`${envKey}=`))
  fs.writeFileSync(CREDENTIALS_FILE, lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n', 'utf-8')

  // Mevcut process'e yansıt
  if (value.trim()) {
    process.env[envKey] = value.trim()
  } else {
    delete process.env[envKey]
  }
}

/** One-way migration from the legacy plaintext provider-key file to the vault. */
function migrateLegacyProviderCredentials(): void {
  if (!fs.existsSync(CREDENTIALS_FILE)) return
  const content = fs.readFileSync(CREDENTIALS_FILE, 'utf-8')
  const vault = getSecrets(PROVIDER_VAULT_NAMESPACE)
  const providerKeys = new Set(PROVIDERS.map(provider => provider.envKey))
  for (const line of content.split('\n')) {
    const [rawKey, ...rest] = line.trim().split('=')
    const envKey = rawKey?.trim()
    const value = rest.join('=').trim()
    if (providerKeys.has(envKey) && value && !vault[envKey]) {
      setSecret(PROVIDER_VAULT_NAMESPACE, envKey, value, { crossProcess: true })
      process.env[envKey] = value
    }
  }
  const remaining = content.split('\n').filter(line => !providerKeys.has(line.trim().split('=')[0]?.trim()))
  fs.writeFileSync(CREDENTIALS_FILE, remaining.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n', 'utf-8')
}

function maskKey(key: string): string {
  if (!key || key.length < 8) return '••••••••'
  return key.slice(0, 6) + '••••••••' + key.slice(-4)
}

async function verifyProviderCredential(provider: string, apiKey: string): Promise<{ ok: boolean; error?: string; models?: string[] }> {
  try {
    if (provider === 'github') {
      const response = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/vnd.github+json' },
      })
      return response.ok ? { ok: true } : { ok: false, error: `GitHub token was rejected (HTTP ${response.status}).` }
    }

    let url = ''
    let headers: Record<string, string> = {}
    if (provider === 'google') url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    else if (provider === 'anthropic') {
      url = 'https://api.anthropic.com/v1/models?limit=100'
      headers = { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
    } else if (provider === 'openai') {
      url = 'https://api.openai.com/v1/models'
      headers = { Authorization: `Bearer ${apiKey}` }
    } else if (provider === 'openrouter') {
      url = 'https://openrouter.ai/api/v1/key'
      headers = { Authorization: `Bearer ${apiKey}` }
    } else if (provider === 'groq') {
      url = 'https://api.groq.com/openai/v1/models'
      headers = { Authorization: `Bearer ${apiKey}` }
    } else {
      const compat = OPENAI_COMPAT_PROVIDERS.find(item => item.id === provider)
      if (compat) {
        url = compat.modelsUrl
        headers = { Authorization: `Bearer ${apiKey}` }
      }
    }
    if (!url) return { ok: true }

    const response = await fetch(url, { headers })
    if (!response.ok) return { ok: false, error: `${provider} credential was rejected (HTTP ${response.status}).` }
    const payload: any = await response.json().catch(() => ({}))
    const rows = Array.isArray(payload) ? payload : (payload.data ?? payload.models ?? [])
    const models = rows.map((model: any) => String(model.id ?? model.name ?? '').replace(/^models\//, '')).filter(Boolean)
    return { ok: true, models }
  } catch (cause: any) {
    return { ok: false, error: `Could not verify ${provider}: ${cause?.message ?? String(cause)}` }
  }
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
  migrateLegacyProviderCredentials()
  ipcMain.handle('settings:get', async () => {
    try { return getConfig() } catch { return {} }
  })

  ipcMain.handle('settings:set', async (_, key: string, value: any) => {
    fs.mkdirSync(GLOBAL_DIR, { recursive: true })
    
    // Check if there is a local config override
    const { DIRS } = await import('@cowrangler/core/init.js')
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

  ipcMain.handle('settings:credentialSecurity', async () => {
    const vault = getSecrets(PROVIDER_VAULT_NAMESPACE)
    const stored = PROVIDERS.map(provider => provider.envKey).filter(envKey => !!vault[envKey])
    return {
      encrypted: stored.length
        ? stored.every(envKey => getSecretMode(PROVIDER_VAULT_NAMESPACE, envKey) === 'os')
        : isEncrypted(),
    }
  })

  ipcMain.handle('settings:setApiKey', async (_, provider: string, key: string) => {
    const p = PROVIDERS.find(p => p.id === provider)
    if (!p) return { ok: false, error: 'Unknown provider' }

    const trimmed = (key ?? '').trim()
    if (trimmed) {
      const verified = await verifyProviderCredential(provider, trimmed)
      if (!verified.ok) return verified
      writeCredential(p.envKey, trimmed)
      return verified
    }

    writeCredential(p.envKey, '')
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

  // ─── Permissions ──────────────────────────────────────────────────────────
  // The renderer never parses settings files itself: it asks for the resolved
  // policy (every scope merged, with each rule's origin attached) and writes
  // back through named mutations, so precedence lives in one place.
  ipcMain.handle('permissions:get', async () => {
    const perms = await import('@cowrangler/core/permissions.js')
    perms.invalidatePermissionSettings()
    const resolved = perms.resolvePermissionSettings()
    return {
      mode: perms.normalizePermissionMode(resolved.defaultMode),
      modes: perms.PERMISSION_MODES.map((id) => perms.MODE_INFO[id]),
      allow: resolved.allow,
      ask: resolved.ask,
      deny: resolved.deny,
      additionalDirectories: resolved.additionalDirectories,
      disableBypassPermissionsMode: resolved.disableBypassPermissionsMode,
      disableAutoMode: resolved.disableAutoMode,
      sandbox: resolved.sandbox,
      issues: resolved.issues,
      files: {
        local: perms.settingsFileFor('local'),
        project: perms.settingsFileFor('project'),
        user: perms.settingsFileFor('user'),
        managed: perms.managedSettingsPath(),
      },
    }
  })

  ipcMain.handle('permissions:setMode', async (_, mode: string, scope = 'local') => {
    const perms = await import('@cowrangler/core/permissions.js')
    const normalized = perms.normalizePermissionMode(mode)
    perms.saveDefaultMode(normalized, scope as any)
    // The agent still reads config.yaml for the active session's mode.
    let config: any = {}
    if (fs.existsSync(CONFIG_FILE)) {
      try { config = yaml.load(fs.readFileSync(CONFIG_FILE, 'utf-8')) as any || {} } catch {}
    }
    config.permission_mode = normalized
    fs.mkdirSync(GLOBAL_DIR, { recursive: true })
    fs.writeFileSync(CONFIG_FILE, yaml.dump(config), 'utf-8')
    return { ok: true, mode: normalized }
  })

  ipcMain.handle('permissions:addRule', async (_, type: string, rule: string, scope = 'local') => {
    const perms = await import('@cowrangler/core/permissions.js')
    const parsed = perms.parseRule(rule)
    if (!parsed.rule) return { ok: false, error: parsed.issue?.reason ?? 'That rule could not be parsed.' }
    perms.saveRule(rule.trim(), type as any, scope as any)
    return { ok: true }
  })

  ipcMain.handle('permissions:removeRule', async (_, type: string, rule: string, scope = 'local') => {
    const perms = await import('@cowrangler/core/permissions.js')
    // A rule may live in more than one scope; drop it from each writable one.
    for (const s of ['local', 'project', 'user'] as const) perms.removeRule(rule, type as any, s)
    void scope
    return { ok: true }
  })

  ipcMain.handle('permissions:setDirectories', async (_, dirs: string[], scope = 'local') => {
    const perms = await import('@cowrangler/core/permissions.js')
    perms.setAdditionalDirectories(dirs ?? [], scope as any)
    return { ok: true }
  })

  ipcMain.handle('permissions:setSandbox', async (_, patch: Record<string, unknown>, scope = 'local') => {
    const perms = await import('@cowrangler/core/permissions.js')
    perms.saveSandboxSettings(patch ?? {}, scope as any)
    return { ok: true }
  })

  ipcMain.handle('permissions:validateRule', async (_, rule: string) => {
    const perms = await import('@cowrangler/core/permissions.js')
    const parsed = perms.parseRule(rule)
    return parsed.rule ? { ok: true } : { ok: false, error: parsed.issue?.reason ?? 'Invalid rule.' }
  })

  // ─── Sandbox canlı sağlık (WP-5 SandboxTab) ───────────────────────────────
  // Aktif platformda hangi izolasyon backend'inin seçileceğini canlı raporlar
  // (Seatbelt / Bubblewrap / Docker / … algılandı mı).
  ipcMain.handle('settings:sandboxHealth', async () => {
    try {
      const { inspectSandboxHealth } = await import('@cowrangler/core/sandbox.js')
      return inspectSandboxHealth(getConfig().sandbox?.provider)
    } catch (e: any) {
      return {
        platform: process.platform,
        kind: 'none',
        label: 'No isolation (low-trust)',
        isolated: false,
        bundleUsable: false,
        error: e?.message ?? String(e),
      }
    }
  })

  // ─── Model yetenekleri (WP-5 ModelsTab göstergesi; tek kaynak: model_metadata) ─
  ipcMain.handle('settings:modelCapabilities', async (_, model: string) => {
    try {
      const { getModelCapabilities, prefetchModelMeta } = await import('@cowrangler/core/model_metadata.js')
      await prefetchModelMeta(model)
      return getModelCapabilities(model)
    } catch {
      return null
    }
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

    return models.map(m => {
      const p = PROVIDERS.find(pr => pr.id === m.provider)
      const hasKey = p ? !!(creds[p.envKey] || process.env[p.envKey]) : false
      return { ...m, available: hasKey }
    })
  })
}
