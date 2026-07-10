import { app, IpcMain, IpcMainInvokeEvent, shell } from 'electron'

const SAFE_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

function isTrustedRendererUrl(rawUrl: string | undefined): boolean {
  if (!rawUrl) return false

  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return false
  }

  if (parsed.protocol === 'file:') return true

  if (!app.isPackaged && (parsed.protocol === 'http:' || parsed.protocol === 'https:')) {
    const host = parsed.hostname.toLowerCase()
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  }

  return false
}

export function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const senderUrl = event.senderFrame?.url
  if (!isTrustedRendererUrl(senderUrl)) {
    throw new Error(`Blocked IPC call from untrusted renderer: ${senderUrl || 'unknown'}`)
  }
}

export function installTrustedIpcGuard(ipcMain: IpcMain): void {
  const guarded = ipcMain as IpcMain & { __cowranglerTrustedGuardInstalled?: boolean }
  if (guarded.__cowranglerTrustedGuardInstalled) return

  const originalHandle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = ((channel: string, listener: Parameters<IpcMain['handle']>[1]) => {
    return originalHandle(channel, async (event, ...args) => {
      assertTrustedSender(event)
      return listener(event, ...args)
    })
  }) as IpcMain['handle']

  guarded.__cowranglerTrustedGuardInstalled = true
}

export function isAllowedExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl)
    return SAFE_EXTERNAL_PROTOCOLS.has(parsed.protocol)
  } catch {
    return false
  }
}

export async function openAllowedExternalUrl(rawUrl: string): Promise<void> {
  if (!isAllowedExternalUrl(rawUrl)) {
    throw new Error('Blocked external URL protocol')
  }
  await shell.openExternal(rawUrl)
}
