import { IpcMain, BrowserWindow } from 'electron'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { agentManager, AgentManager } from '../agent_manager.js'
import { getProjectDB } from '../project_db.js'
import { getSessionDB } from '../../core/session_db.js'
import { getConfig, DEFAULT_SYSTEM_PROMPT } from '../../core/init.js'
import { Agent } from '../../core/agent.js'
import { setAskUserListener, resolveAskUser } from '../../tools/ask_user.js'

/** Projesiz (genel) sohbet için sabit projectId. Renderer'daki GLOBAL_PROJECT_ID ile aynı. */
const GLOBAL_PROJECT_ID = '__global__'

/**
 * Global sohbet için adanmış çalışma dizini.
 * Böylece file_tools / manage_todo en son açık projenin workdir'ini sızdırmaz;
 * genel sohbet kendi izole klasöründe çalışır.
 */
function getGlobalWorkdir(): string {
  const dir = path.join(os.homedir(), '.cowrangler', 'global-workspace')
  try { fs.mkdirSync(dir, { recursive: true }) } catch { /* yoksay */ }
  return dir
}

/** İlk promptun ilk 20 karakterinden session başlığı türetir (spec madde 3). */
function deriveSessionTitle(message: string): string {
  const t = (message || '').trim().replace(/\s+/g, ' ').slice(0, 20)
  return t || 'Yeni oturum'
}

/** MISSING_KEY:X / UNSUPPORTED_MODEL:X gibi ham hataları kullanıcı dostu mesaja çevirir. */
function friendlyError(raw: string): string {
  if (!raw) return 'Bilinmeyen hata'
  const missing = raw.match(/MISSING_KEY:(\w+)/)
  if (missing) {
    return `${missing[1]} eksik. Ayarlar → Modeller & API'den ilgili API anahtarını ekleyin.`
  }
  const unsupported = raw.match(/UNSUPPORTED_MODEL:(.+)/)
  if (unsupported) {
    return `Desteklenmeyen model: ${unsupported[1]}. Ayarlar → Modeller & API'den geçerli bir model seçin.`
  }
  return raw
}

function buildSystemPrompt(basePrompt: string, instructions: string): string {
  let prompt = basePrompt
  if (instructions?.trim()) {
    prompt += `\n\n---\n\n## PROJECT INSTRUCTIONS\n\n${instructions}`
  }
  return prompt
}

function getDefaultSystemPrompt(): string {
  return DEFAULT_SYSTEM_PROMPT
}

export function registerAgentIPC(ipcMain: IpcMain, win: BrowserWindow): void {
  // ── agent:chat ─────────────────────────────────────────────────────────────
  ipcMain.handle('agent:chat', async (event, projectId: string, sessionId: string | null, message: string, sessionModel?: string) => {
    const sender = event.sender
    const projectDB = getProjectDB()
    const project = projectDB.get(projectId)
    const instructions = projectDB.getInstructions(projectId)
    const config = getConfig()

    // Hardcoded model default KALDIRILDI: model seçilmemişse kullanıcıyı yönlendir.
    // sessionModel varsa (per-session override), o önceliklidir.
    const model = sessionModel || config.model
    if (!model) {
      sender.send('agent:error', 'Henüz bir model seçilmedi. Ayarlar → Modeller & API\'den bir API anahtarı girin ve model seçin.')
      return
    }
    const systemPrompt = buildSystemPrompt(getDefaultSystemPrompt(), instructions)

    // Çalışma dizini: proje varsa onun workdir'i; projesiz genel sohbette adanmış global klasör.
    const workdir = project?.workdir ?? (projectId === GLOBAL_PROJECT_ID ? getGlobalWorkdir() : undefined)

    let agent: Agent
    try {
      // Agent zaten varsa ve model değiştiyse, modeli YERİNDE değiştir.
      // (recreate yerine setModel: sohbet geçmişi + oturum korunur, sadece
      // bir sonraki mesaj yeni modeli kullanır.)
      const existingAgent = agentManager.get(projectId)
      if (existingAgent && existingAgent.llm.model !== model) {
        existingAgent.llm.setModel(model)
      }
      // getOrCreate: mevcut agent'ı döndürür (varsa) + workdir map'ini günceller.
      agent = agentManager.getOrCreate(projectId, { model, systemPrompt }, workdir)
    } catch (err: any) {
      sender.send('agent:error', friendlyError(err.message || String(err)))
      return
    }

    // Proje bağlamını ayarla — manage_todo, memory, COWRNGLR.md doğru dizini kullanır.
    // process.chdir() yerine project_context singleton'ı kullanılır; bu sayede
    // birden fazla proje aynı süreçte güvenli şekilde yönetilebilir.
    agentManager.applyProjectContext(projectId)

    // TODO izlemeyi başlat — workdir'i doğrudan geçir ki agent instance'a bağımlı olmasın
    if (workdir) {
      agentManager.watchTodo(projectId, workdir, sessionId || '__new__', (tasks) => {
        sender.send('agent:progress', tasks)
      })
    }

    // Per-tool events — each tool reports its own start/done/error independently,
    // with a stable id (SDK toolCallId), so loaders/checkmarks update one by one.
    const onToolEvent = (e: {
      id: string
      name: string
      args?: any
      phase: 'start' | 'done' | 'error'
      durationMs?: number
    }) => {
      sender.send('agent:toolCall', {
        id: e.id,
        name: e.name,
        args: e.args ?? {},
        status: e.phase,
        durationMs: e.durationMs,
        timestamp: Date.now(),
      })
    }

    const onStepText = (text: string) => {
      sender.send('agent:stepText', text)
    }

    try {
      const result = await agent.chat(message, undefined, onStepText, undefined, onToolEvent)

      // Session'ı projeye bağla + başlığı ilk promptun ilk 20 karakterinden ata
      const currentSessionId = agent.currentSessionId
      if (currentSessionId) {
        projectDB.linkSession(projectId, currentSessionId)
        try {
          const sessionDB = getSessionDB()
          const existing = sessionDB.getSession(currentSessionId)
          if (existing && !existing.title) {
            sessionDB.updateSession(currentSessionId, { title: deriveSessionTitle(message) })
          }
        } catch { /* başlık ataması kritik değil */ }
      }

      sender.send('agent:done', {
        text: result.text,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        toolCallCount: result.toolCallCount,
        durationMs: result.durationMs,
        sessionId: currentSessionId,
      })
    } catch (err: any) {
      // AbortError means user pressed Stop — not an error, just interrupted
      if (err?.name === 'AbortError' || err?.message?.includes('aborted') || err?.message?.includes('This operation was aborted')) {
        sender.send('agent:interrupted')
      } else {
        sender.send('agent:error', friendlyError(err.message || String(err)))
      }
    }
  })

  // ── agent:interrupt ────────────────────────────────────────────────────────
  ipcMain.handle('agent:interrupt', async (_, projectId: string) => {
    agentManager.interrupt(projectId)
    return { ok: true }
  })

  // ── agent:contextSnapshot ──────────────────────────────────────────────────
  ipcMain.handle('agent:contextSnapshot', async (_, projectId: string) => {
    const agent = agentManager.get(projectId)
    if (!agent) return null
    const snap = agent.getContextSnapshot()
    return {
      ...snap,
      model: agent.llm.model,
      maxContextTokens: snap.contextWindowSize,
    }
  })

  // ── agent:newSession ───────────────────────────────────────────────────────
  ipcMain.handle('agent:newSession', async (_, projectId: string) => {
    agentManager.destroy(projectId)
    return { ok: true }
  })

  // ── agent:getTodo ──────────────────────────────────────────────────────────
  ipcMain.handle('agent:getTodo', async (_, projectId: string, sessionId?: string) => {
    if (!sessionId) return []
    // Workdir'i project DB'den çöz — agent instance olmadan da çalışır
    const project = getProjectDB().get(projectId)
    const workdir = project?.workdir ?? (projectId === GLOBAL_PROJECT_ID ? getGlobalWorkdir() : undefined)
    if (!workdir) return []
    return AgentManager.readTodo(workdir, sessionId)
  })

  ipcMain.handle('agent:setActiveSession', async (_, sessionId: string | null) => {
    const { setActiveSessionId } = await import('../../core/project_context.js')
    setActiveSessionId(sessionId)
  })

  // ── agent:answerQuestion ───────────────────────────────────────────────────
  ipcMain.handle('agent:answerQuestion', async (_, answer: string) => {
    resolveAskUser(answer)
    return { ok: true }
  })

  // ── QA Tool Listener Setup ─────────────────────────────────────────────────
  setAskUserListener((payload: any) => {
    win.webContents.send('agent:qaPrompt', payload)
  })
}
