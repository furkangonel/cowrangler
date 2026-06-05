import { IpcMain } from 'electron'
import { getSessionDB } from '../../core/session_db.js'
import { getProjectDB } from '../project_db.js'

export function registerSessionsIPC(ipcMain: IpcMain): void {
  const projectDB = getProjectDB()

  ipcMain.handle('sessions:list', async (_, projectId: string) => {
    const sessionDB = getSessionDB()
    const sessionIds = projectDB.getSessionIds(projectId)
    if (!sessionIds.length) return []

    const sessions = sessionIds
      .map(id => sessionDB.getSession(id))
      .filter(Boolean)
      .sort((a, b) => (b!.started_at - a!.started_at))

    return sessions
  })

  ipcMain.handle('sessions:get', async (_, sessionId: string) => {
    const sessionDB = getSessionDB()
    return sessionDB.getSession(sessionId)
  })

  ipcMain.handle('sessions:messages', async (_, sessionId: string) => {
    const sessionDB = getSessionDB()
    return sessionDB.getMessages(sessionId)
  })

  ipcMain.handle('sessions:search', async (_, query: string, projectId?: string) => {
    const sessionDB = getSessionDB()
    const opts: any = { limit: 30 }
    const results = sessionDB.searchSessions(query, opts)

    if (!projectId) return results

    // Proje'ye ait session'larla filtrele
    const sessionIds = new Set(projectDB.getSessionIds(projectId))
    return results.filter(r => sessionIds.has(r.session_id))
  })

  ipcMain.handle('sessions:delete', async (_, projectId: string, sessionId: string) => {
    projectDB.unlinkSession(projectId, sessionId)
    return { ok: true }
  })

  ipcMain.handle('sessions:rename', async (_, sessionId: string, title: string) => {
    const sessionDB = getSessionDB()
    sessionDB.updateSession(sessionId, { title })
    return { ok: true }
  })
}
