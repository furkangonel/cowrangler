import { IpcMain, shell } from 'electron'
import path from 'path'
import os from 'os'
import fs from 'fs'
import yaml from 'js-yaml'
import { getCatalogSorted, getCatalogEntry, buildMcpServerConfig } from '../../core/connectors_catalog.js'
import { getBundledPlugins, getDefaultEnabledPluginIds } from '../../core/plugins_catalog.js'
import { getMCPManager, reloadMcp } from '../../core/mcp_client.js'
import { setSecrets, deleteSecrets, isEncrypted } from '../../core/credential_vault.js'
import { authorizeConnector, hasOAuthTokens } from '../../core/oauth_provider.js'

/** UI'a iletilecek canlı bağlantı durumu haritası: name → {connected, toolCount, error}. */
function liveStatusMap(): Record<string, { connected: boolean; toolCount: number; error?: string }> {
  const map: Record<string, { connected: boolean; toolCount: number; error?: string }> = {}
  try {
    for (const s of getMCPManager().getStatuses()) {
      map[s.name] = { connected: s.connected, toolCount: s.toolCount, error: s.error }
    }
  } catch { /* yönetici henüz başlatılmadıysa boş harita */ }
  return map
}

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
    const live = liveStatusMap()
    return Object.entries(servers).map(([name, cfg]: [string, any]) => {
      const st = live[name]
      return {
        name,
        type: cfg.url ? (cfg.transport === 'sse' ? 'sse' : 'http') : 'stdio',
        command: cfg.command,
        args: cfg.args,
        url: cfg.url,
        timeout: cfg.timeout || 120,
        // Gerçek runtime durumu: bağlandıysa 'connected', config'te var ama
        // bağlanamadıysa 'error', yönetici henüz init etmediyse 'unknown'.
        status: st ? (st.connected ? 'connected' : 'error') : 'unknown',
        toolCount: st?.toolCount ?? 0,
        error: st?.error,
      }
    })
  })

  // Yöneticinin canlı özeti (status bar / settings için).
  ipcMain.handle('mcp:status', async () => {
    const mgr = getMCPManager()
    return { summary: mgr.summary(), servers: mgr.getStatuses() }
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
    // Canlı uygula — yeniden başlatma gerekmez.
    const summary = await reloadMcp().catch((e: any) => `reload failed: ${e?.message ?? e}`)
    return { ok: true, summary }
  })

  ipcMain.handle('mcp:remove', async (_, name: string) => {
    const config = readConfig()
    if (config.mcp_servers) {
      delete config.mcp_servers[name]
      writeConfig(config)
    }
    // Kasadaki gizli değerleri ve OAuth token'larını da temizle.
    try { deleteSecrets(name); deleteSecrets(`oauth:${name}`) } catch { /* best effort */ }
    const summary = await reloadMcp().catch((e: any) => `reload failed: ${e?.message ?? e}`)
    return { ok: true, summary }
  })

  ipcMain.handle('mcp:test', async (_, name: string) => {
    const config = readConfig()
    const server = config.mcp_servers?.[name]
    if (!server) return { ok: false, error: 'Server not found' }
    // Gerçek bağlantı durumu varsa onu bildir; yoksa config geçerliliğini.
    const st = liveStatusMap()[name]
    if (st) {
      return st.connected
        ? { ok: true, message: `Connected — ${st.toolCount} tools available` }
        : { ok: false, error: st.error || 'Not connected' }
    }
    return { ok: true, message: 'Configuration looks valid (not yet connected)' }
  })

  // ── CONNECTORS (kürasyonlu katalog) ────────────────────────────────────────

  /** Browse: kürate edilmiş, gerçekten çalışan connector katalogu + bağlı durumu */
  ipcMain.handle('connectors:catalog', async () => {
    const config = readConfig()
    const configured = new Set(Object.keys(config.mcp_servers || {}))
    const live = liveStatusMap()
    return getCatalogSorted().map(e => {
      const st = live[e.id]
      return {
        ...e,
        // config'te kayıtlı mı (eklenmiş mi)
        connected: configured.has(e.id),
        // gerçekten bağlı ve araçları keşfedildi mi
        live: !!st?.connected,
        toolCount: st?.toolCount ?? 0,
        error: st?.error,
        // OAuth connector'ları için: kasada geçerli token var mı
        authorized: e.auth === 'oauth' ? hasOAuthTokens(e.id) : undefined,
      }
    })
  })

  /** Kasanın OS-destekli şifreleme kullanıp kullanmadığı (UI ipucu). */
  ipcMain.handle('connectors:secInfo', async () => ({ encrypted: isEncrypted() }))

  /**
   * OAuth connector'ı için GERÇEK yetkilendirme akışını koşar: sistem tarayıcısı
   * açılır, loopback callback ile kod yakalanır, token'lar kasaya yazılır.
   * Önce config'e (oauth markörlü) yazılır ki yükleme provider'ı token'ları bulsun.
   */
  ipcMain.handle('connectors:authorize', async (_, id: string) => {
    const entry = getCatalogEntry(id)
    if (!entry || entry.auth !== 'oauth' || !entry.url) {
      return { ok: false, error: 'Not an OAuth connector' }
    }
    // Config'e markörlü olarak yaz (token'lar kasada).
    const serverConfig = buildMcpServerConfig(entry)
    const config = readConfig()
    if (!config.mcp_servers) config.mcp_servers = {}
    config.mcp_servers[entry.id] = serverConfig
    writeConfig(config)

    const kind = entry.transport === 'sse' ? 'sse' : 'http'
    const result = await authorizeConnector(
      entry.id,
      entry.url,
      kind,
      (url) => { shell.openExternal(url).catch(() => {}) },
    )
    if (result.ok) {
      const summary = await reloadMcp().catch((e: any) => `reload failed: ${e?.message ?? e}`)
      return { ok: true, toolCount: result.toolCount, summary }
    }
    return { ok: false, error: result.error }
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

    // OAuth: gerçek yetkilendirme akışına yönlendir (config + token kasaya).
    if (entry.auth === 'oauth') {
      return { ok: false, requiresAuth: true, oauth: true, error: 'Use connectors:authorize for OAuth' }
    }

    // Gizli değerleri ŞİFRELİ kasaya yaz (config.yaml'a düz metin yazılmaz).
    if (payload.secrets && Object.keys(payload.secrets).length) {
      setSecrets(entry.id, payload.secrets)
    }

    const serverConfig = buildMcpServerConfig(entry, payload.pathArg)
    const config = readConfig()
    if (!config.mcp_servers) config.mcp_servers = {}
    config.mcp_servers[entry.id] = serverConfig
    writeConfig(config)
    // Canlı uygula — yeniden başlatma gerekmez.
    const summary = await reloadMcp().catch((e: any) => `reload failed: ${e?.message ?? e}`)
    return { ok: true, name: entry.id, requiresAuth: entry.auth !== 'none', summary }
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
