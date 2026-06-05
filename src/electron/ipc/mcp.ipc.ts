import { IpcMain } from 'electron'
import path from 'path'
import os from 'os'
import fs from 'fs'
import yaml from 'js-yaml'

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
}
