import { IpcMain, BrowserWindow } from 'electron'
import { agentManager, AgentManager } from '../agent_manager.js'
import { getProjectDB } from '../project_db.js'
import { getSessionDB } from '../../core/session_db.js'
import { getConfig } from '../../core/init.js'
import { Agent } from '../../core/agent.js'

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
  return `You are Cowrangler — a powerful, enterprise-grade AI agent.

You operate like a senior engineer: methodical, transparent, and accountable.

## CORE BEHAVIOR RULES

### 1. Reason before acting
Before every non-trivial tool call, write one sentence explaining WHY.

### 2. Read before write (ALWAYS)
- Always use read_file before edit_file or write_file.
- Always use git_status before git_commit.

### 3. TODO discipline — MANDATORY for multi-step tasks
If a task requires 3 or more steps:
1. Call manage_todo(action="update") as your VERY FIRST action.
2. Mark each item done with manage_todo(action="mark_done") IMMEDIATELY after completing it.

### 4. Use send_message to communicate
After completing your work, ALWAYS call send_message to deliver your final response.

### 5. Skills — use them
Check available skills and load relevant ones with utilize_skill.`
}

export function registerAgentIPC(ipcMain: IpcMain, win: BrowserWindow): void {
  // ── agent:chat ─────────────────────────────────────────────────────────────
  ipcMain.handle('agent:chat', async (event, projectId: string, sessionId: string | null, message: string) => {
    const sender = event.sender
    const projectDB = getProjectDB()
    const project = projectDB.get(projectId)
    const instructions = projectDB.getInstructions(projectId)
    const config = getConfig()

    // Hardcoded model default KALDIRILDI: model seçilmemişse kullanıcıyı yönlendir.
    const model = config.model
    if (!model) {
      sender.send('agent:error', 'Henüz bir model seçilmedi. Ayarlar → Modeller & API\'den bir API anahtarı girin ve model seçin.')
      return
    }
    const systemPrompt = buildSystemPrompt(getDefaultSystemPrompt(), instructions)

    let agent: Agent
    try {
      agent = agentManager.getOrCreate(projectId, { model, systemPrompt }, project?.workdir ?? undefined)
    } catch (err: any) {
      sender.send('agent:error', friendlyError(err.message || String(err)))
      return
    }

    // Proje bağlamını ayarla — manage_todo, memory, COWRNGLR.md doğru dizini kullanır.
    // process.chdir() yerine project_context singleton'ı kullanılır; bu sayede
    // birden fazla proje aynı süreçte güvenli şekilde yönetilebilir.
    agentManager.applyProjectContext(projectId)

    // TODO izlemeyi başlat
    agentManager.watchTodo(projectId, (tasks) => {
      sender.send('agent:progress', tasks)
    })

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
      sender.send('agent:error', friendlyError(err.message || String(err)))
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
}
