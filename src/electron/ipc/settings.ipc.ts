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

const AVAILABLE_MODELS = [
  { provider: 'anthropic', id: 'anthropic/claude-opus-4-6', label: 'Claude Opus 4.6', contextK: 200 },
  { provider: 'anthropic', id: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6', contextK: 200 },
  { provider: 'anthropic', id: 'anthropic/claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', contextK: 200 },
  { provider: 'openai', id: 'openai/gpt-4o', label: 'GPT-4o', contextK: 128 },
  { provider: 'openai', id: 'openai/gpt-4o-mini', label: 'GPT-4o mini', contextK: 128 },
  { provider: 'openai', id: 'openai/o3', label: 'o3', contextK: 200 },
  { provider: 'google', id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', contextK: 1000 },
  { provider: 'google', id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', contextK: 1000 },
  { provider: 'openrouter', id: 'openrouter/google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (OpenRouter)', contextK: 1000 },
  { provider: 'openrouter', id: 'openrouter/anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (OpenRouter)', contextK: 200 },
  { provider: 'openrouter', id: 'openrouter/openai/gpt-4o', label: 'GPT-4o (OpenRouter)', contextK: 128 },
  { provider: 'groq', id: 'groq/llama-3.3-70b-versatile', label: 'Llama 3.3 70B', contextK: 128 },
  { provider: 'groq', id: 'groq/moonshotai/kimi-k2-instruct', label: 'Kimi K2', contextK: 128 },
]

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

  ipcMain.handle('settings:models', async () => {
    const creds = readCredentials()
    return AVAILABLE_MODELS.map(m => {
      const p = PROVIDERS.find(pr => pr.id === m.provider)
      const hasKey = p ? !!(creds[p.envKey] || process.env[p.envKey]) : false
      return { ...m, available: hasKey }
    })
  })
}
