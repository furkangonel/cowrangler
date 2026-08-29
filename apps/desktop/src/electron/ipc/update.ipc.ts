import { IpcMain, BrowserWindow, app } from 'electron'
import pkg from 'electron-updater'

// electron-updater is CommonJS; destructure the default export under ESM.
const { autoUpdater } = pkg

/**
 * update.ipc — in-app auto-update wiring (electron-updater + GitHub Releases).
 *
 * Flow:
 *   renderer → updates:check  → autoUpdater.checkForUpdates()
 *   main events → 'updates:status' (available / progress / downloaded / error)
 *   renderer → updates:download → autoUpdater.downloadUpdate()
 *   renderer → updates:install  → autoUpdater.quitAndInstall() (relaunch + apply)
 *
 * The publish target (GitHub furkangonel/cowrangler) comes from package.json >
 * build.publish; electron-updater reads the bundled app-update.yml automatically.
 *
 * NOTE: macOS auto-update requires the app to be code-signed + notarized.
 * Windows (nsis) and Linux (AppImage) update unsigned.
 */

type UpdateStatus =
  | { state: 'checking' }
  | { state: 'available'; version: string; notes?: string }
  | { state: 'not-available'; version: string }
  | { state: 'progress'; percent: number; transferred: number; total: number; bytesPerSecond: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }

let wired = false

function send(win: BrowserWindow | null, status: UpdateStatus): void {
  if (win && !win.isDestroyed()) win.webContents.send('updates:status', status)
}

export function registerUpdateIPC(ipcMain: IpcMain, getWindow: () => BrowserWindow | null): void {
  // Updates are a packaged-build feature. Development runs against the
  // disposable Electron runtime in node_modules, which must never participate
  // in the packaged application's update/install lifecycle.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = app.isPackaged

  if (!wired) {
    autoUpdater.on('checking-for-update', () => send(getWindow(), { state: 'checking' }))
    autoUpdater.on('update-available', (info: any) =>
      send(getWindow(), { state: 'available', version: info?.version, notes: typeof info?.releaseNotes === 'string' ? info.releaseNotes : undefined }))
    autoUpdater.on('update-not-available', (info: any) =>
      send(getWindow(), { state: 'not-available', version: info?.version ?? app.getVersion() }))
    autoUpdater.on('download-progress', (p: any) =>
      send(getWindow(), {
        state: 'progress',
        percent: Math.round(p?.percent ?? 0),
        transferred: p?.transferred ?? 0,
        total: p?.total ?? 0,
        bytesPerSecond: p?.bytesPerSecond ?? 0,
      }))
    autoUpdater.on('update-downloaded', (info: any) =>
      send(getWindow(), { state: 'downloaded', version: info?.version }))
    autoUpdater.on('error', (err: any) =>
      send(getWindow(), { state: 'error', message: err?.message ?? String(err) }))
    wired = true
  }

  // Manual / startup check. Silent in dev (no published feed).
  ipcMain.handle('updates:check', async () => {
    if (!app.isPackaged) return { ok: false, reason: 'dev', version: app.getVersion() }
    try {
      const r = await autoUpdater.checkForUpdates()
      return { ok: true, version: r?.updateInfo?.version ?? app.getVersion() }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) }
    }
  })

  ipcMain.handle('updates:download', async () => {
    if (!app.isPackaged) return { ok: false, reason: 'dev', version: app.getVersion() }
    try {
      await autoUpdater.downloadUpdate()
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) }
    }
  })

  // Relaunch and apply. isSilent=false, isForceRunAfter=true.
  ipcMain.handle('updates:install', async () => {
    if (!app.isPackaged) return { ok: false, reason: 'dev', version: app.getVersion() }
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
    return { ok: true }
  })

  ipcMain.handle('updates:current', async () => ({ version: app.getVersion() }))
}

/** Fire a check shortly after launch (packaged builds only). */
export function checkForUpdatesOnStartup(): void {
  if (!app.isPackaged) return
  // Small delay so the window/feed is ready; failures are surfaced via events.
  setTimeout(() => { autoUpdater.checkForUpdates().catch(() => {}) }, 4000)
}
