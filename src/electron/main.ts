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
import { agentManager } from './agent_manager.js'

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

app.whenReady().then(createWindow)

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
