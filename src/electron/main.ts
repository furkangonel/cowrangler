import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import fixPath from 'fix-path'
import { initEnvironment, loadEnvironmentVariables } from '../core/init.js'

// Uygulama macOS'ta Finder/Dock üzerinden açıldığında terminal ortam değişkenlerini 
// (`PATH`) miras alması için fixPath() çağrılmalı. Aksi takdirde MCP için `npx` çalışmaz.
fixPath()
import { registerAgentIPC } from './ipc/agent.ipc.js'
import { registerProjectsIPC } from './ipc/projects.ipc.js'
import { registerSessionsIPC } from './ipc/sessions.ipc.js'
import { registerSettingsIPC } from './ipc/settings.ipc.js'
import { registerSkillsIPC } from './ipc/skills.ipc.js'
import { registerMCPIPC } from './ipc/mcp.ipc.js'
import { registerMemoryIPC } from './ipc/memory.ipc.js'
import { registerFSIPC } from './ipc/fs.ipc.js'
import { registerUpdateIPC, checkForUpdatesOnStartup } from './ipc/update.ipc.js'
import { registerDesignIPC } from './ipc/design.ipc.js'
import { registerExportIPC } from './ipc/export.ipc.js'
import { agentManager } from './agent_manager.js'
// KRİTİK: Tüm yerleşik araçları (system/git/web/dev/skill/file/brief/computer_use +
// mcp_status) registry'ye kaydet. Bu import olmadan desktop agent'ı yalnızca
// file_tools + send_message araçlarına sahip oluyordu.
import '../tools/builtin.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null
let ipcRegistered = false

function createWindow(): void {
  // Cowrangler ortamını başlat (config, credentials, dirs)
  try {
    initEnvironment()
    // KRİTİK: credentials.env + proje .env içindeki API anahtarlarını
    // process.env'e yükle. Bu olmadan CLI'de çalışan modeller desktop'ta
    // MISSING_KEY hatası verir.
    loadEnvironmentVariables()
    // Abonelik OAuth token'larını env'e enjekte et (Claude Pro, ChatGPT,
    // Copilot, Gemini, Antigravity) — CLI'de `cowrangler login` ile bağlanınca
    // desktop de aynı kasadan API key olmadan çalışır.
    void import('../core/oauth_subscriptions.js')
      .then((m) => m.applyOAuthEnv())
      .catch(() => { /* sessizce geç */ })
  } catch {
    // İlk açılışta credentials olmayabilir — devam et
  }

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    backgroundColor: '#0f0f0f',
    vibrancy: undefined,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  })

  // IPC handler'larını kaydet
  if (!ipcRegistered) {
    registerAgentIPC(ipcMain, mainWindow)
    registerProjectsIPC(ipcMain)
    registerSessionsIPC(ipcMain)
    registerSettingsIPC(ipcMain)
    registerSkillsIPC(ipcMain)
    registerMCPIPC(ipcMain)
    registerMemoryIPC(ipcMain)
    registerFSIPC(ipcMain)
    registerUpdateIPC(ipcMain, () => mainWindow)
    registerDesignIPC()
    registerExportIPC()

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
          preload: path.join(__dirname, '../preload/index.mjs'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false,
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
    shell.openExternal(url)
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

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
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

  // ── MCP sunucularını başlat ────────────────────────────────────────────────
  // KRİTİK: Desktop'ta MCP init'i SADECE burada gerçekleşir. Önceden yalnızca
  // CLI (main.ts) yolunda init ediliyordu; UI config.yaml'a yazsa da desktop
  // agent'ı hiçbir MCP aracını görmüyordu ("hiç MCP bağlantımız yok"). Pencere
  // açılışını bloke etmemek için await edilmeden, arka planda başlatılır.
  try {
    const { bootMcp } = await import('../core/mcp_client.js')
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
})

// Güvenlik: uzak içerik yüklemeyi engelle
app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) {
      event.preventDefault()
    }
  })
})
