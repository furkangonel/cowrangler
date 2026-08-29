import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import fixPath from 'fix-path'
import { initEnvironment, loadEnvironmentVariables } from '@cowrangler/core/init.js'

// Uygulama macOS'ta Finder/Dock üzerinden açıldığında terminal ortam değişkenlerini
// (`PATH`) miras alması için fixPath() çağrılmalı. Aksi takdirde MCP için `npx` çalışmaz.
fixPath()
import { registerAgentIPC } from './ipc/agent.ipc.js'
import { registerProjectsIPC } from './ipc/projects.ipc.js'
import { registerSessionsIPC } from './ipc/sessions.ipc.js'
import { registerSettingsIPC } from './ipc/settings.ipc.js'
import { registerGitIPC } from './ipc/git.ipc.js'
import { registerSkillsIPC } from './ipc/skills.ipc.js'
import { registerMCPIPC } from './ipc/mcp.ipc.js'
import { registerMemoryIPC } from './ipc/memory.ipc.js'
import { registerFSIPC } from './ipc/fs.ipc.js'
import { registerUpdateIPC, checkForUpdatesOnStartup } from './ipc/update.ipc.js'
import { registerDesignIPC } from './ipc/design.ipc.js'
import { registerExportIPC } from './ipc/export.ipc.js'
import { registerTerminalIPC, getTerminalManager } from './ipc/terminal.ipc.js'
import { registerPreviewIPC } from './ipc/preview.ipc.js'
import { registerPluginsIPC } from './ipc/plugins.ipc.js'
import { installTrustedIpcGuard, openAllowedExternalUrl } from './ipc/security.js'
import { agentManager } from './agent_manager.js'
import { maybeRunHousekeeping } from './housekeeping.js'
// KRİTİK: Tüm yerleşik araçları (system/git/web/dev/skill/file/brief/computer_use +
// mcp_status) registry'ye kaydet. Bu import olmadan desktop agent'ı yalnızca
// file_tools + send_message araçlarına sahip oluyordu.
import '@cowrangler/core/tools/builtin.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null
let ipcRegistered = false

function reportMainProcessError(kind: string, error: unknown): void {
  const message = error instanceof Error ? error.stack || error.message : String(error)
  console.error(`[main] ${kind}: ${message}`)
  if (app.isReady() && app.isPackaged) {
    dialog.showErrorBox('Cowrangler error', 'An unexpected application error occurred. Check logs for details.')
  }
}

process.on('uncaughtException', (error) => {
  reportMainProcessError('uncaughtException', error)
})

process.on('unhandledRejection', (reason) => {
  reportMainProcessError('unhandledRejection', reason)
})

function createWindow(): void {
  // Cowrangler ortamını başlat (config, credentials, dirs)
  try {
    initEnvironment()
    // KRİTİK: credentials.env + proje .env içindeki API anahtarlarını
    // process.env'e yükle. Bu olmadan CLI'de çalışan modeller desktop'ta
    // MISSING_KEY hatası verir.
    loadEnvironmentVariables()

    // ── Load custom plugins ──────────────────────────────────────────────────
    import('@cowrangler/core/plugins.js').then(({ PluginManager }) => {
      PluginManager.getInstance().initializeAll().catch(console.error)
    }).catch(console.error)
  } catch {
    // İlk açılışta credentials olmayabilir — devam et
  }

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 720,
    minHeight: 640,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    backgroundColor: '#0f0f0f',
    vibrancy: undefined,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // preload.ts yalnızca 'electron' modülünü kullanır (contextBridge/
      // ipcRenderer/webUtils) — fs/path/child_process/require yok, bu yüzden
      // Electron sandbox'ı (Node API'lerini preload'dan da kaldırır) güvenle
      // açılabilir.
      sandbox: true,
      webSecurity: true,
    },
  })

  // IPC handler'larını kaydet
  if (!ipcRegistered) {
    installTrustedIpcGuard(ipcMain)
    registerAgentIPC(ipcMain, mainWindow)
    registerProjectsIPC(ipcMain)
    registerSessionsIPC(ipcMain)
    registerSettingsIPC(ipcMain)
    registerGitIPC(ipcMain)
    registerSkillsIPC(ipcMain)
    registerMCPIPC(ipcMain)
    registerMemoryIPC(ipcMain)
    registerFSIPC(ipcMain)
    registerUpdateIPC(ipcMain, () => mainWindow)
    registerDesignIPC()
    registerExportIPC()
    registerTerminalIPC(ipcMain, () => mainWindow)
    registerPreviewIPC(ipcMain, () => mainWindow)
    registerPluginsIPC(ipcMain)

    // ── Design window ──────────────────────────────────────────────────────
    ipcMain.handle('design:openWindow', () => {
      const designWin = new BrowserWindow({
        width: 1280,
        height: 860,
        minWidth: 900,
        minHeight: 600,
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
        backgroundColor: '#0f0f0f',
        show: false,
        webPreferences: {
          preload: path.join(__dirname, '../preload/index.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
        },
      })
      const designUrl = process.env.NODE_ENV === 'development'
        ? 'http://localhost:5173/#/design'
        : `file://${path.join(__dirname, '../renderer/index.html')}#/design`
      designWin.loadURL(designUrl)
      designWin.once('ready-to-show', () => designWin.show())
      return { ok: true }
    })

    ipcRegistered = true
  }

  // Harici linkleri tarayıcıda aç
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void openAllowedExternalUrl(url).catch((err) => {
      console.warn(`[security] blocked external URL: ${err?.message ?? err}`)
    })
    return { action: 'deny' }
  })

  // Pencere hazır olunca göster (flash önleme)
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    if (process.env.NODE_ENV === 'development') {
      mainWindow?.webContents.openDevTools({ mode: 'detach' })
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // E2E (Playwright), unpackaged bir dev-server olmadan çalışır — her zaman
  // derlenmiş statik renderer'ı yükle, localhost:5173'e bağımlı olma.
  if (process.env.COWRANGLER_E2E === '1') {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  } else if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    const devPort = process.env.VITE_DEV_SERVER_URL
    if (devPort) {
      mainWindow.loadURL(devPort)
    } else {
      mainWindow.loadURL('http://localhost:5173')
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  createWindow()

  // Keep generated caches, old exports and copied attachments bounded. This
  // never traverses or mutates a user's source folder.
  setImmediate(() => {
    try { maybeRunHousekeeping() } catch (err) { console.warn('[housekeeping] skipped', err) }
  })

  // ── MCP sunucularını başlat ────────────────────────────────────────────────
  // KRİTİK: Desktop'ta MCP init'i SADECE burada gerçekleşir. Önceden yalnızca
  // CLI (main.ts) yolunda init ediliyordu; UI config.yaml'a yazsa da desktop
  // agent'ı hiçbir MCP aracını görmüyordu ("hiç MCP bağlantımız yok"). Pencere
  // açılışını bloke etmemek için await edilmeden, arka planda başlatılır.
  try {
    const { bootMcp } = await import('@cowrangler/core/mcp_client.js')
    const summary = await bootMcp()
    console.log(`[mcp] ${summary}`)
    mainWindow?.webContents.send('mcp:ready', summary)
  } catch (err: any) {
    console.error(`[mcp] init failed: ${err?.message ?? err}`)
  }

  // ── Otomatik güncelleme kontrolü (yalnızca paketlenmiş build) ───────────────
  // Yeni sürüm varsa renderer'a 'updates:status' eventi gider; kullanıcı UI'daki
  // banner üzerinden indirip kurar.
  checkForUpdatesOnStartup()
})

app.on('window-all-closed', () => {
  agentManager.destroyAll()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('before-quit', () => {
  agentManager.destroyAll()
  getTerminalManager().killAll()
})

// Güvenlik: uzak içerik yüklemeyi engelle
app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) {
      event.preventDefault()
    }
  })
})
