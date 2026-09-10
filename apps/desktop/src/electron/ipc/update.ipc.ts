import { IpcMain, BrowserWindow, app } from 'electron'
import pkg from 'electron-updater'
import type { UpdateActionResult, UpdateOperation, UpdateStatus } from '../../shared/update.js'

// electron-updater is CommonJS; destructure the default export under ESM.
const { autoUpdater } = pkg

const STARTUP_DELAY_MS = 4_000
const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1_000

let wired = false
let scheduled = false
let currentStatus: UpdateStatus = { state: 'idle' }
let activeOperation: UpdateOperation | null = null
let backgroundCheck = false
let checkInFlight: Promise<UpdateActionResult> | null = null
let downloadInFlight: Promise<UpdateActionResult> | null = null
let startupTimer: ReturnType<typeof setTimeout> | null = null
let recheckTimer: ReturnType<typeof setInterval> | null = null
let windowProvider: () => BrowserWindow | null = () => null

function send(status: UpdateStatus): void {
  currentStatus = status
  const win = windowProvider()
  if (win && !win.isDestroyed()) win.webContents.send('updates:status', status)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function normalizeReleaseNotes(notes: unknown): string | undefined {
  if (typeof notes === 'string') return notes
  if (!Array.isArray(notes)) return undefined
  const normalized = notes
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return ''
      const version = 'version' in entry && typeof entry.version === 'string' ? entry.version : ''
      const note = 'note' in entry && typeof entry.note === 'string' ? entry.note : ''
      return [version && `v${version}`, note].filter(Boolean).join('\n')
    })
    .filter(Boolean)
    .join('\n\n')
  return normalized || undefined
}

function reportFailure(error: unknown, operation: UpdateOperation, silent = false): UpdateActionResult {
  const message = errorMessage(error)
  console.warn(`[updater] ${operation} failed: ${message}`)
  send(silent ? { state: 'idle' } : { state: 'error', operation, message })
  return { ok: false, error: message }
}

async function checkForUpdates(background: boolean): Promise<UpdateActionResult> {
  if (!app.isPackaged) return { ok: false, reason: 'dev', version: app.getVersion() }
  if (currentStatus.state === 'progress' || currentStatus.state === 'downloaded') {
    return { ok: false, reason: 'busy', version: currentStatus.version }
  }
  if (checkInFlight) {
    // A manual check that joins the startup check should surface failures.
    if (!background) backgroundCheck = false
    return checkInFlight
  }

  backgroundCheck = background
  activeOperation = 'check'
  checkInFlight = (async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      return { ok: true, version: result?.updateInfo?.version ?? app.getVersion() }
    } catch (error) {
      return reportFailure(error, 'check', backgroundCheck)
    } finally {
      activeOperation = null
      backgroundCheck = false
      checkInFlight = null
    }
  })()
  return checkInFlight
}

async function downloadUpdate(): Promise<UpdateActionResult> {
  if (!app.isPackaged) return { ok: false, reason: 'dev', version: app.getVersion() }
  if (downloadInFlight) return downloadInFlight
  if (currentStatus.state !== 'available') return { ok: false, reason: 'not-available' }

  const version = currentStatus.version
  activeOperation = 'download'
  downloadInFlight = (async () => {
    try {
      await autoUpdater.downloadUpdate()
      return { ok: true, version }
    } catch (error) {
      return reportFailure(error, 'download')
    } finally {
      activeOperation = null
      downloadInFlight = null
    }
  })()
  return downloadInFlight
}

function installUpdate(): UpdateActionResult {
  if (!app.isPackaged) return { ok: false, reason: 'dev', version: app.getVersion() }
  if (currentStatus.state !== 'downloaded') return { ok: false, reason: 'not-downloaded' }

  activeOperation = 'install'
  setImmediate(() => {
    try {
      // isSilent=false, isForceRunAfter=true
      autoUpdater.quitAndInstall(false, true)
    } catch (error) {
      activeOperation = null
      reportFailure(error, 'install')
    }
  })
  return { ok: true, version: currentStatus.version }
}

export function registerUpdateIPC(ipcMain: IpcMain, getWindow: () => BrowserWindow | null): void {
  windowProvider = getWindow

  // The user chooses when to download and when to install. A dismissed update
  // must not install implicitly on an ordinary app quit.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false

  if (!wired) {
    autoUpdater.on('checking-for-update', () => send({ state: 'checking' }))
    autoUpdater.on('update-available', (info: any) => send({
      state: 'available',
      version: info?.version ?? app.getVersion(),
      notes: normalizeReleaseNotes(info?.releaseNotes),
    }))
    autoUpdater.on('update-not-available', (info: any) => send({
      state: 'not-available',
      version: info?.version ?? app.getVersion(),
      checkedAt: Date.now(),
    }))
    autoUpdater.on('download-progress', (progress: any) => send({
      state: 'progress',
      version: currentStatus.state === 'available' || currentStatus.state === 'progress'
        ? currentStatus.version
        : undefined,
      percent: Math.max(0, Math.min(100, Math.round(progress?.percent ?? 0))),
      transferred: progress?.transferred ?? 0,
      total: progress?.total ?? 0,
      bytesPerSecond: progress?.bytesPerSecond ?? 0,
    }))
    autoUpdater.on('update-downloaded', (info: any) => send({
      state: 'downloaded',
      version: info?.version ?? app.getVersion(),
    }))
    autoUpdater.on('error', (error: unknown) => {
      const operation = activeOperation ?? 'check'
      reportFailure(error, operation, operation === 'check' && backgroundCheck)
    })
    wired = true
  }

  ipcMain.handle('updates:check', () => checkForUpdates(false))
  ipcMain.handle('updates:download', () => downloadUpdate())
  ipcMain.handle('updates:install', () => installUpdate())
  ipcMain.handle('updates:getStatus', () => currentStatus)
  ipcMain.handle('updates:current', () => ({ version: app.getVersion() }))
}

/** Start an independent startup check and keep long-running apps fresh. */
export function startUpdateChecks(): void {
  if (!app.isPackaged || scheduled) return
  scheduled = true
  startupTimer = setTimeout(() => { void checkForUpdates(true) }, STARTUP_DELAY_MS)
  recheckTimer = setInterval(() => { void checkForUpdates(true) }, RECHECK_INTERVAL_MS)
  startupTimer.unref?.()
  recheckTimer.unref?.()
}

export function stopUpdateChecks(): void {
  if (startupTimer) clearTimeout(startupTimer)
  if (recheckTimer) clearInterval(recheckTimer)
  startupTimer = null
  recheckTimer = null
  scheduled = false
}
