import type { ElectronAPI } from './lib/ipc'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
