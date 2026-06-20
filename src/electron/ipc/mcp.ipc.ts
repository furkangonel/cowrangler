import { IpcMain, shell } from 'electron'
import path from 'path'
import os from 'os'
import fs from 'fs'
import yaml from 'js-yaml'
import { getCatalogSorted, getCatalogEntry, buildMcpServerConfig } from '../../core/connectors_catalog.js'
import { getBundledPlugins, getDefaultEnabledPluginIds } from '../../core/plugins_catalog.js'

const GLOBAL_DIR = path.join(os.homedir(), '.cowrangler')
const CONFIG_FILE = path.join(GLOBAL_DIR, 'config.yaml')

function readConfig(): any {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return {}
    return (yaml.load(fs.readFileSync(CONFIG_FILE, 'utf-8')) as any) || {}
  } catch { return {} }
}

function writeConfig(config: any): void {
  fs.mkdirSync(GLOBAL_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, yaml.dump(config), 'utf-8')
}

export function registerMCPIPC(ipcMain: IpcMain): void {
  ipcMain.handle('mcp:list', async () => {
    const config = readConfig()
    const servers = config.mcp_servers || {}
    return Object.entries(servers).map(([name, cfg]: [string, any]) => ({
      name,
      type: cfg.url ? (cfg.transport === 'sse' ? 'sse' : 'http') : 'stdio',
      command: cfg.command,
      args: cfg.args,
      url: cfg.url,
      timeout: cfg.timeout || 120,
      status: 'unknown', // Gerçek durum bağlanınca bilinir
    }))
  })

  ipcMain.handle('mcp:add', async (_, serverConfig: any) => {
    const config = readConfig()
    if (!config.mcp_servers) config.mcp_servers = {}

    const { name, type, command, args, url, headers, env, timeout } = serverConfig

    if (type === 'stdio') {
      config.mcp_servers[name] = {
        command,
        args: args || [],
        ...(env ? { env } : {}),
        timeout: timeout || 120,
      }
    } else {
      config.mcp_servers[name] = {
        url,
        ...(headers ? { headers } : {}),
        ...(type === 'sse' ? { transport: 'sse' } : {}),
        timeout: timeout || 120,
      }
    }

    writeConfig(config)
    return { ok: true }
  })

  ipcMain.handle('mcp:remove', async (_, name: string) => {
    const config = readConfig()
    if (config.mcp_servers) {
      delete config.mcp_servers[name]
      writeConfig(config)
    }
    return { ok: true }
  })

  ipcMain.handle('mcp:test', async (_, name: string) => {
    // Gerçek bağlantı testi — şimdilik config varlığı kontrol edilir
    const config = readConfig()
    const server = config.mcp_servers?.[name]
    if (!server) return { ok: false, error: 'Server not found' }
    return { ok: true, message: 'Configuration looks valid' }
  })

  // ── CONNECTORS (kürasyonlu katalog) ────────────────────────────────────────

  /** Browse: kürate edilmiş, gerçekten çalışan connector katalogu + bağlı durumu */
  ipcMain.handle('connectors:catalog', async () => {
    const config = readConfig()
    const connected = new Set(Object.keys(config.mcp_servers || {}))
    return getCatalogSorted().map(e => ({ ...e, connected: connected.has(e.id) }))
  })

  /**
   * Katalogdan ekle. auth gerektiren girişler için `secrets` (envKey→değer) ve
   * filesystem gibi yol gerektirenler için `pathArg` beklenir.
   * oauth girişlerinde: callback başlatılmadan önce tarayıcı açılır.
   */
  ipcMain.handle('connectors:add', async (_, payload: {
    id: string
    secrets?: Record<string, string>
    pathArg?: string
  }) => {
    const entry = getCatalogEntry(payload.id)
    if (!entry) return { ok: false, error: 'Unknown connector' }

    // OAuth: kullanıcıyı sağlayıcı izin sayfasına yönlendir (MCP SDK kendi akışını da yürütür)
    if (entry.auth === 'oauth' && entry.url) {
      try { await shell.openExternal(entry.url) } catch {}
    }

    const serverConfig = buildMcpServerConfig(entry, payload.secrets ?? {}, payload.pathArg)
    const config = readConfig()
    if (!config.mcp_servers) config.mcp_servers = {}
    config.mcp_servers[entry.id] = serverConfig
    writeConfig(config)
    return { ok: true, name: entry.id, requiresAuth: entry.auth !== 'none' }
  })

  // ── PLUGINS (cowrangler imzalı bundled katalog) ────────────────────────────

  ipcMain.handle('plugins:list', async () => {
    const config = readConfig()
    const enabled: string[] = Array.isArray(config.enabled_plugins)
      ? config.enabled_plugins
      : getDefaultEnabledPluginIds()
    return getBundledPlugins().map(p => ({ ...p, enabled: enabled.includes(p.id) }))
  })

  ipcMain.handle('plugins:setEnabled', async (_, id: string, on: boolean) => {
    const config = readConfig()
    const current: string[] = Array.isArray(config.enabled_plugins)
      ? config.enabled_plugins
      : getDefaultEnabledPluginIds()
    const next = on ? [...new Set([...current, id])] : current.filter(p => p !== id)
    config.enabled_plugins = next
    writeConfig(config)
    return { ok: true, enabled: next }
  })
}
