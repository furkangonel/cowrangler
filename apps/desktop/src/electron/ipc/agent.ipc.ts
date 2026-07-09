import { IpcMain, BrowserWindow } from 'electron'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { agentManager, AgentManager } from '../agent_manager.js'
import { getProjectDB } from '../project_db.js'
import { getSessionDB } from '@cowrangler/core/session_db.js'
import { getConfig } from '@cowrangler/core/init.js'
import { getSystemPrompt } from '@cowrangler/core/prompts/index.js'
import { Agent } from '@cowrangler/core/agent.js'
import { setAskUserListener, resolveAskUser } from '@cowrangler/core/tools/ask_user.js'
import { getCodeWorkdir, setCodeWorkdir } from './code_workdir.js'

/** Code sekmesi için sabit projectId. Renderer'daki CODE_PROJECT_ID ile aynı. */
const CODE_PROJECT_ID = '__code__'

/** Plan events core'dan yalnız sessionId ile gelir; UI filtresi için proje eşlemesi. */
const sessionProjectMap = new Map<string, string>()

/** Verilen projeId + proje kaydı için agent çalışma dizinini çözer. */
function resolveWorkdir(projectId: string, project: { workdir?: string } | undefined): string | undefined {
  if (project?.workdir) return project.workdir
  if (projectId === CODE_PROJECT_ID) return getCodeWorkdir() ?? getGlobalWorkdir()
  return undefined
}

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

function isPlanApprovedResult(result: unknown): boolean {
  return typeof result === 'string' && result.startsWith('PLAN_APPROVED_CONTINUE:')
}

function buildSystemPrompt(basePrompt: string, instructions: string): string {
  let prompt = basePrompt
  if (instructions?.trim()) {
    prompt += `\n\n---\n\n## PROJECT INSTRUCTIONS\n\n${instructions}`
  }
  return prompt
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
    const isDesign = !!project?.description?.startsWith('__cowrangler_design__:')
    const contextType = projectId === CODE_PROJECT_ID
      ? 'desktop_code'
      : isDesign ? 'desktop_design' : 'desktop_session'
    const basePrompt = getSystemPrompt(contextType)
    const systemPrompt = buildSystemPrompt(basePrompt, instructions)

    // Design: needs to WRITE screen files + assets, but must START BUILDING
    // immediately. Excludes manage_task (no task-list stalling), spawn_subagent,
    // execute_bash, git_*, computer_use, cron, repo_map, skills, etc.
    // Session/Code modes keep full capabilities (allowedTools undefined).
    const DESIGN_TOOLS = [
      'write_file', 'read_file', 'edit_file', 'apply_patch', 'append_to_file',
      'create_folder', 'move_item', 'delete_file',
      'list_files', 'glob_files', 'search_in_files', 'file_info',
      'web_search', 'fetch_webpage', 'http_request',
      'generate_image', 'analyze_image',
      'ask_user',
    ]
    const allowedTools =
      contextType === 'desktop_design' ? DESIGN_TOOLS
      : undefined

    // Çalışma dizini: proje varsa onun workdir'i; global sohbette adanmış global
    // klasör; Code sekmesinde oturuma kayıtlı workdir (varsa) veya kullanıcının seçtiği klasör.
    let workdir = resolveWorkdir(projectId, project)
    if (projectId === CODE_PROJECT_ID && sessionId) {
      const sess = getSessionDB().getSession(sessionId)
      if (sess) {
        if (sess.workdir && sess.workdir !== '/' && sess.workdir !== '') {
          workdir = sess.workdir
        } else if (workdir && workdir !== '/' && workdir !== '') {
          try {
            getSessionDB().updateSession(sessionId, { workdir })
          } catch (e) {
            console.error('[agent:chat] Failed to self-heal session workdir:', e)
          }
        }
      }
    }

    let agent: Agent
    try {
      // Agent zaten varsa ve model değiştiyse, modeli YERİNDE değiştir.
      // (recreate yerine setModel: sohbet geçmişi + oturum korunur, sadece
      // bir sonraki mesaj yeni modeli kullanır.)
      const existingAgent = agentManager.get(projectId)
      if (existingAgent && existingAgent.llm.model !== model) {
        existingAgent.llm.setModel(model)
      }
      // Design projeleri çok dosyalıdır (her ekran = screen + meta.json sidecar);
      // varsayılan 25 step, 8-10 ekranlık işte ORTADA keser ve "model işi yapmadan
      // gitti" görünümü yaratır. Design'a daha yüksek step bütçesi ver.
      const maxIterations = contextType === 'desktop_design' ? 60 : undefined
      // getOrCreate: mevcut agent'ı döndürür (varsa) + workdir map'ini günceller.
      agent = agentManager.getOrCreate(projectId, { model, systemPrompt, allowedTools, maxIterations }, workdir)
      // Design turunda thinking'i tercih et: reasoning destekli modelde muhakeme
      // görünür yanıt metnine sızmak yerine "Thought Process" accordion'una gider.
      // (Kullanıcı COWRANGLER_THINKING=0 ile açıkça kapattıysa yine kapalı kalır.)
      agent.preferThinking = contextType === 'desktop_design'
      // Desktop tek-kanal düz metin sözleşmesi: send_message YOK. Model asıl
      // yanıtını görünür metin olarak yazar; ikili kanal (anlatı + send_message)
      // karmaşası ve "cevap gizli kaldı / hiç mesaj çıkmadı" sorunları biter.
      agent.sendMessageEnabled = false
    } catch (err: any) {
      console.error('[agent:chat] Initialization Error:', err)
      sender.send('agent:error', friendlyError(err.message || String(err)))
      return
    }

    // Proje bağlamını ayarla — manage_todo, memory, COWRNGLR.md doğru dizini kullanır.
    // process.chdir() yerine project_context singleton'ı kullanılır; bu sayede
    // birden fazla proje aynı süreçte güvenli şekilde yönetilebilir.
    agentManager.applyProjectContext(projectId)

    // Load existing session history into the agent if it is different
    if (sessionId && agent.currentSessionId !== sessionId) {
      try {
        agent.loadSession(sessionId);
      } catch (err) {
        console.error('[agent:chat] Failed to load session:', err);
      }
    }

    // Aktif UI-conversation session'ını burada da (yeniden) ayarla — tek yetkili
    // yer bu, çünkü her `agent:chat` çağrısı zaten kendi `sessionId`'sini taşıyor.
    // Önceden yalnızca renderer'ın ayrı 'agent:setActiveSession' çağrısına
    // güveniliyordu; Design chat (design.store.ts) bu çağrıyı hiç yapmıyordu →
    // skill/task/plan gibi session-scoped kaynaklar o akışlarda ya stale bir
    // session'a ya da bir önceki proje session'ına yazılıyordu.
    {
      const { setActiveSessionId } = await import('@cowrangler/core/project_context.js')
      setActiveSessionId(sessionId || null)
    }

    // Session'ı projeye bağla + başlığı ilk promptun ilk 20 karakterinden ata
    const currentSessionId = agent.currentSessionId
    if (currentSessionId) {
      sessionProjectMap.set(currentSessionId, projectId)
      const { setActiveSessionId } = await import('@cowrangler/core/project_context.js')
      setActiveSessionId(currentSessionId)
      projectDB.linkSession(projectId, currentSessionId)
      try {
        const sessionDB = getSessionDB()
        const existing = sessionDB.getSession(currentSessionId)
        if (existing && !existing.title) {
          sessionDB.updateSession(currentSessionId, { title: deriveSessionTitle(message) })
        }
      } catch { /* başlık ataması kritik değil */ }
    }

    // TODO izlemeyi başlat — workdir'i doğrudan geçir ki agent instance'a bağımlı olmasın
    if (workdir) {
      agentManager.watchTodo(projectId, workdir, currentSessionId || sessionId || '__new__', (tasks) => {
        sender.send('agent:progress', {
          projectId,
          sessionId: agent.currentSessionId ?? currentSessionId ?? sessionId ?? null,
          tasks,
        })
      })
    }

    // Per-tool events — each tool reports its own start/done/error independently,
    // with a stable id (SDK toolCallId), so loaders/checkmarks update one by one.
    // Design guard: turda hiç dosya yazıldı mı? (bkz. no-output nudge aşağıda)
    const WRITE_TOOLS = new Set(['write_file', 'edit_file', 'apply_patch', 'append_to_file'])
    let writeCount = 0
    // ask_user / write_plan bu turda kullanıcıya bir diyalog açtı mı? Açtıysa
    // "boş yanıt" fallback'i tetiklenmez — soru/onay diyaloğu zaten görünür çıktıdır.
    let askedUser = false
    let planApprovedThisTurn = false
    let actionsAfterPlanApproval = 0

    const onToolEvent = (e: {
      id: string
      name: string
      args?: any
      phase: 'start' | 'done' | 'error'
      durationMs?: number
      result?: any
      error?: string
    }) => {
      if (e.phase === 'done' && WRITE_TOOLS.has(e.name)) writeCount++
      if (
        e.phase === 'done' &&
        planApprovedThisTurn &&
        e.name !== 'ask_user' &&
        e.name !== 'write_plan' &&
        e.name !== 'send_message'
      ) {
        actionsAfterPlanApproval++
      }
      if (e.phase === 'done' && e.name === 'write_plan' && isPlanApprovedResult(e.result)) {
        planApprovedThisTurn = true
      }
      if (e.name === 'ask_user' || e.name === 'write_plan') askedUser = true
      sender.send('agent:toolCall', {
        projectId,
        sessionId: agent.currentSessionId ?? currentSessionId ?? sessionId ?? null,
        id: e.id,
        name: e.name,
        args: e.args ?? {},
        status: e.phase,
        durationMs: e.durationMs,
        result: e.result,
        error: e.error,
        timestamp: Date.now(),
      })
    }

    const onStepText = (text: string) => {
      sender.send('agent:stepText', text)
    }

    const onReasoningText = (text: string) => {
      sender.send('agent:reasoningText', text)
    }

    try {
      const isFirstTurn = agent.contextLength === 0
      let result = await agent.chat(message, undefined, onStepText, undefined, onToolEvent, onReasoningText)

      // ── Design no-output guard ────────────────────────────────────────────
      // Zayıf modeller ilk istekte bazen plan anlatıp HİÇ dosya yazmadan turu
      // bitiriyor. İlk turda sıfır araç çağrısı + sıfır yazma varsa BİR kez
      // otomatik dürt: hemen üretime başlasın. (Soru sorması gerekiyorsa
      // ask_user çağırırdı — o durumda toolCallCount > 0 olur, nudge atlanır.)
      if (
        contextType === 'desktop_design' &&
        isFirstTurn &&
        writeCount === 0 &&
        result.toolCallCount === 0
      ) {
        result = await agent.chat(
          '[SYSTEM] You ended the turn without producing any design file. The user expects real screens, not a description. Start NOW: write the first screens/ file (plus its .meta.json sidecar), then keep writing until the request is fully built. Do not reply with plans or promises.',
          undefined, onStepText, undefined, onToolEvent, onReasoningText,
        )
      }

      // ── Plan approval continuation guard ─────────────────────────────────
      // write_plan zaten UI içinde onay aldıysa kullanıcıya tekrar "go ahead"
      // yazdırma. Model onaydan sonra gerçek bir tool çalıştırmadan turu
      // kapatırsa aynı konuşma içinde tek otomatik devam turu başlat.
      if (planApprovedThisTurn && actionsAfterPlanApproval === 0) {
        result = await agent.chat(
          '[SYSTEM] The user approved the implementation plan in the UI. Continue implementing it now in this same session. Do not ask for "go ahead", "proceed", or any additional approval unless a separate destructive/irreversible permission prompt is required. Do not write another plan.',
          undefined, onStepText, undefined, onToolEvent, onReasoningText,
        )
      }

      // ── Empty-reply guard (tüm desktop bağlamları) ─────────────────────────
      // Tek-kanal düz metin modunda tur, kullanıcıya HİÇ görünür metin
      // üretmeden bitebilir (model sadece araç çağırıp durdu). Bu, "agent bir
      // anda hiçbir şey yazmıyor" şikâyetinin ta kendisi. Kullanıcıya bir soru/
      // onay diyaloğu açılmadıysa (askedUser) veya plan onayı sonrası otomatik
      // devam çalıştıysa ve nihai metin boşsa, BİR kez özet iste. Yalnızca bir kez.
      if ((!askedUser || planApprovedThisTurn) && (!result.text || !result.text.trim())) {
        result = await agent.chat(
          '[SYSTEM] You ended the turn without any visible reply to the user. Write a brief plain-text message now: if you completed work, summarize what changed and the outcome; if you were blocked, say what you need. Do not call tools — just reply in text.',
          undefined, onStepText, undefined, onToolEvent, onReasoningText,
        )
      }


      sender.send('agent:done', {
        projectId,
        text: result.text,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        toolCallCount: result.toolCallCount,
        durationMs: result.durationMs,
        sessionId: agent.currentSessionId ?? currentSessionId,
      })
    } catch (err: any) {
      // AbortError means user pressed Stop — not an error, just interrupted
      if (err?.name === 'AbortError' || err?.message?.includes('aborted') || err?.message?.includes('This operation was aborted')) {
        sender.send('agent:interrupted')
      } else {
        console.error('[agent:chat] Fatal Error:', err)
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

  // ── agent:setCodeWorkdir ───────────────────────────────────────────────────
  // Code sekmesinde seçilen klasörü kaydet; agent bu dizinde çalışsın. Değişince
  // mevcut Code agent'ını düşür ki bir sonraki mesaj yeni workdir'e bağlansın.
  ipcMain.handle('agent:setCodeWorkdir', async (_, dir: string | null) => {
    const next = dir || undefined
    if (next === getCodeWorkdir()) return { ok: true }
    setCodeWorkdir(next)
    agentManager.destroy(CODE_PROJECT_ID)
    return { ok: true }
  })

  // ── agent:getTodo ──────────────────────────────────────────────────────────
  ipcMain.handle('agent:getTodo', async (_, projectId: string, sessionId?: string) => {
    if (!sessionId) return []
    // Workdir'i project DB'den çöz — agent instance olmadan da çalışır
    const project = getProjectDB().get(projectId)
    let workdir = resolveWorkdir(projectId, project)
    if (projectId === CODE_PROJECT_ID && sessionId) {
      const sess = getSessionDB().getSession(sessionId)
      if (sess && sess.workdir && sess.workdir !== '/' && sess.workdir !== '') {
        workdir = sess.workdir
      }
    }
    if (!workdir) return []
    return AgentManager.readTodo(workdir, sessionId)
  })

  ipcMain.handle('agent:setActiveSession', async (_, sessionId: string | null) => {
    const { setActiveSessionId } = await import('@cowrangler/core/project_context.js')
    setActiveSessionId(sessionId)
  })

  // ── agent:answerQuestion ───────────────────────────────────────────────────
  ipcMain.handle('agent:answerQuestion', async (_, answer: string) => {
    resolveAskUser(answer)
    return { ok: true }
  })

  // ── QA Tool Listener Setup ─────────────────────────────────────────────────
  // Broadcast to every window: Design Mode runs in its own BrowserWindow, so a
  // prompt sent only to the main window would never reach an active design chat.
  setAskUserListener((payload: any) => {
    for (const w of BrowserWindow.getAllWindows()) {
      try { w.webContents.send('agent:qaPrompt', payload) } catch { /* window gone */ }
    }
  })

  // ── Plan Listener Setup ────────────────────────────────────────────────────
  // write_plan planı üretince sağ paneldeki Plan bölümüne canlı yayınla.
  import('@cowrangler/core/tools/plan_events.js').then(({ setPlanListener }) => {
    setPlanListener((payload: any) => {
      const projectId = payload?.sessionId ? sessionProjectMap.get(payload.sessionId) : undefined
      const scopedPayload = projectId ? { ...payload, projectId } : payload
      for (const w of BrowserWindow.getAllWindows()) {
        try { w.webContents.send('agent:plan', scopedPayload) } catch { /* window gone */ }
      }
    })
  }).catch(() => { /* plan köprüsü opsiyonel */ })

  // ── agent:getPlan ──────────────────────────────────────────────────────────
  // Oturum açılışında diskteki plan.md'yi geri yükle (canlı event kaçırılmışsa).
  ipcMain.handle('agent:getPlan', async (_, projectId: string, sessionId?: string) => {
    try {
      if (!sessionId) return null
      const project = getProjectDB().get(projectId)
      let workdir = resolveWorkdir(projectId, project)
      if (projectId === CODE_PROJECT_ID && sessionId) {
        const sess = getSessionDB().getSession(sessionId)
        if (sess && sess.workdir && sess.workdir !== '/' && sess.workdir !== '') {
          workdir = sess.workdir
        }
      }
      if (!workdir) return null
      const planFile = path.join(workdir, '.cowrangler', 'plans', `${sessionId}.md`)
      if (!fs.existsSync(planFile)) return null
      return { markdown: fs.readFileSync(planFile, 'utf-8'), sessionId }
    } catch {
      return null
    }
  })
}
