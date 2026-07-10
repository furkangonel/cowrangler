import { IpcMain, BrowserWindow } from 'electron'
import { PluginManager } from '@cowrangler/core/plugins.js'
import { openAllowedExternalUrl } from './security.js'

export function registerPluginsIPC(ipcMain: IpcMain) {
  ipcMain.handle('plugins:list', async () => {
    try {
      const mgr = PluginManager.getInstance()
      const plugins = mgr.getAvailablePlugins()
      // Enrich each plugin with what it contributed during setup() so the UI
      // can render badges ("4 models · 1 provider") and action buttons.
      return plugins.map((p) => ({
        ...p,
        contribution: mgr.getPluginContribution(p.id) || {
          models: [], skills: 0, tools: 0, providers: [], actions: [],
        },
        actions: mgr.getPluginActionMetas(p.id),
      }))
    } catch (e: any) {
      return []
    }
  })

  ipcMain.handle('plugins:install', async (_, source: string, options?: { global?: boolean }) => {
    try {
      const res = await PluginManager.getInstance().installPlugin(source, options)
      if (res.ok) {
        // Re-initialize to register newly installed tools/subagents/skills/actions
        await PluginManager.getInstance().initializeAll().catch(console.error)
      }
      return res
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) }
    }
  })

  ipcMain.handle('plugins:uninstall', async (_, id: string) => {
    try {
      const res = PluginManager.getInstance().uninstallPlugin(id)
      if (res.ok) {
        // Re-initialize so removed plugin's contributions/actions disappear.
        await PluginManager.getInstance().initializeAll().catch(console.error)
      }
      return res
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) }
    }
  })

  // Run a plugin-declared action (e.g. "Sign in"). The host injects openUrl
  // (opens the system browser) and log (streamed back to the renderer).
  ipcMain.handle('plugins:runAction', async (event, pluginId: string, actionId: string) => {
    try {
      const send = (message: string) => {
        try {
          BrowserWindow.fromWebContents(event.sender)?.webContents.send('plugins:actionLog', {
            pluginId, actionId, message,
          })
        } catch { /* best effort */ }
      }
      const res = await PluginManager.getInstance().runAction(pluginId, actionId, {
        openUrl: (url: string) => { void openAllowedExternalUrl(url) },
        log: send,
      })
      return res
    } catch (e: any) {
      return { ok: false, message: e?.message || String(e) }
    }
  })

  // Model ids contributed by installed plugins (for the picker).
  ipcMain.handle('plugins:models', async () => {
    try {
      return PluginManager.getInstance().getPluginModels()
    } catch (e: any) {
      return []
    }
  })

  // Per-model gate map: which plugin models are locked pending an action.
  ipcMain.handle('plugins:modelGates', async () => {
    try {
      return await PluginManager.getInstance().getModelGates()
    } catch (e: any) {
      return {}
    }
  })
}
