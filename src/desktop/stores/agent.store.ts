import { create } from 'zustand'
import { ipc, TaskProgress, ToolCallEvent, ContextSnapshot, AgentDoneResult, PlanPayload } from '../lib/ipc'

export interface ActiveToolCall {
  id: string
  name: string
  args: Record<string, any>
  status: 'running' | 'done' | 'error'
  durationMs?: number
  startedAt: number
  result?: any
  error?: string
}

/**
 * Bir asistan turunun KRONOLOJİK akışı. Olaylar geldikçe sırayla dizilir:
 * ardışık tool çağrıları tek bir 'tools' grubunda toplanır; aralarına metin
 * geldiğinde grup kapanır ve yeni bir 'text' segmenti açılır. Böylece sohbet
 * "metin → araçlar → metin → araçlar" şeklinde, o an ne olduysa o sırayla akar.
 */
export type TimelineSegment =
  | { kind: 'text'; id: string; text: string }
  | { kind: 'tools'; id: string; calls: ActiveToolCall[] }
  | { kind: 'reasoning'; id: string; text: string }

// Module-level cleanup ref (persists outside React)
let _cleanupFn: (() => void) | null = null

interface AgentState {
  status: 'idle' | 'thinking' | 'error'
  streamingText: string
  streamingMessageId: string | null
  toolCalls: ActiveToolCall[]
  /** messageId → o asistan turunun kronolojik segment listesi */
  timelines: Record<string, TimelineSegment[]>
  progress: TaskProgress[]
  contextSnapshot: ContextSnapshot | null
  lastError: string | null
  isListening: boolean
  qaPrompt: any | null
  /** write_plan ile üretilen aktif plan — sağ paneldeki Plan bölümü okur. */
  currentPlan: PlanPayload | null

  setStatus: (s: AgentState['status']) => void
  setCurrentPlan: (plan: PlanPayload | null) => void
  appendStreamText: (text: string) => void
  clearStream: () => void
  addToolCall: (event: ToolCallEvent) => void
  updateToolCall: (id: string, status: 'done' | 'error', durationMs?: number) => void
  clearToolCalls: () => void
  setProgress: (tasks: TaskProgress[]) => void
  setContextSnapshot: (snap: ContextSnapshot | null) => void
  setError: (err: string | null) => void
  setStreamingMessageId: (id: string | null) => void
  setQaPrompt: (prompt: any | null) => void
  answerQaPrompt: (answer: string) => Promise<void>

  // Timeline
  timelinePushText: (msgId: string, text: string) => void
  timelinePushReasoning: (msgId: string, text: string) => void
  timelinePushTool: (msgId: string, event: ToolCallEvent) => void
  timelineUpdateTool: (msgId: string, callId: string, status: 'done' | 'error', durationMs?: number, result?: any, error?: string) => void
  timelineCloseRunning: (msgId: string) => void
  clearTimelines: () => void

  startListening: (projectId: string, callbacks: {
    onUserMessage: (content: string) => string
    onAssistantStart: () => string
    onUpdateStreaming: (id: string, content: string) => void
    onFinalize: (id: string, content: string) => void
    onSessionCreated: (sessionId: string, projectId: string) => void
  }) => void
  stopListening: () => void

  rebuildTimelinesFromHistory: (msgs: any[]) => void
}

export const useAgentStore = create<AgentState>((set, get) => ({
  status: 'idle',
  streamingText: '',
  streamingMessageId: null,
  toolCalls: [],
  timelines: {},
  progress: [],
  contextSnapshot: null,
  lastError: null,
  isListening: false,
  qaPrompt: null,
  currentPlan: null,

  setStatus: (status) => set({ status }),
  setCurrentPlan: (plan) => set({ currentPlan: plan }),
  appendStreamText: (text) => set(s => ({ streamingText: s.streamingText + text })),
  clearStream: () => set({ streamingText: '', streamingMessageId: null }),
  setStreamingMessageId: (id) => set({ streamingMessageId: id }),

  addToolCall: (event) => {
    const tc: ActiveToolCall = {
      id: event.id ?? `${event.name}-${event.timestamp}`,
      name: event.name,
      args: event.args || {},
      status: 'running',
      startedAt: event.timestamp || Date.now(),
    }
    set(s => ({ toolCalls: [...s.toolCalls, tc], status: 'thinking' }))
  },

  updateToolCall: (id, status, durationMs) => {
    set(s => ({
      toolCalls: s.toolCalls.map(tc =>
        tc.id === id && tc.status === 'running'
          ? { ...tc, status, durationMs: durationMs ?? (Date.now() - tc.startedAt) }
          : tc
      ),
    }))
  },

  clearToolCalls: () => set({ toolCalls: [] }),
  setProgress: (tasks) => set({ progress: tasks }),
  setContextSnapshot: (snap) => set({ contextSnapshot: snap }),
  setError: (err) => set({ lastError: err }),
  setQaPrompt: (prompt) => set({ qaPrompt: prompt }),
  answerQaPrompt: async (answer) => {
    set({ qaPrompt: null })
    await ipc.agent.answerQuestion(answer)
  },

  // ── Timeline actions ────────────────────────────────────────────────────────
  timelinePushText: (msgId, text) => {
    if (!text) return
    set(s => {
      const segs = s.timelines[msgId] ? [...s.timelines[msgId]] : []
      const last = segs[segs.length - 1]
      if (last && last.kind === 'text') {
        segs[segs.length - 1] = { ...last, text: last.text + text }
      } else {
        segs.push({ kind: 'text', id: `t-${msgId}-${segs.length}`, text })
      }
      return { timelines: { ...s.timelines, [msgId]: segs } }
    })
  },

  timelinePushReasoning: (msgId, text) => {
    if (!text) return
    set(s => {
      const segs = s.timelines[msgId] ? [...s.timelines[msgId]] : []
      const last = segs[segs.length - 1]
      if (last && last.kind === 'reasoning') {
        segs[segs.length - 1] = { ...last, text: last.text + text }
      } else {
        segs.push({ kind: 'reasoning', id: `r-${msgId}-${segs.length}`, text })
      }
      return { timelines: { ...s.timelines, [msgId]: segs } }
    })
  },

  timelinePushTool: (msgId, event) => {
    const call: ActiveToolCall = {
      id: event.id ?? `${event.name}-${event.timestamp}`,
      name: event.name,
      args: event.args || {},
      status: 'running',
      startedAt: event.timestamp || Date.now(),
    }
    set(s => {
      const segs = s.timelines[msgId] ? [...s.timelines[msgId]] : []
      const last = segs[segs.length - 1]
      if (last && last.kind === 'tools') {
        segs[segs.length - 1] = { ...last, calls: [...last.calls, call] }
      } else {
        segs.push({ kind: 'tools', id: `g-${msgId}-${segs.length}`, calls: [call] })
      }
      return { timelines: { ...s.timelines, [msgId]: segs }, status: 'thinking' as const }
    })
  },

  timelineUpdateTool: (msgId, callId, status, durationMs, result, error) => {
    set(s => {
      const segs = s.timelines[msgId]
      if (!segs) return {}
      const next = segs.map(seg =>
        seg.kind === 'tools'
          ? {
              ...seg,
              calls: seg.calls.map(c =>
                c.id === callId && c.status === 'running'
                  ? { ...c, status, durationMs: durationMs ?? (Date.now() - c.startedAt), result, error }
                  : c
              ),
            }
          : seg
      )
      return { timelines: { ...s.timelines, [msgId]: next } }
    })
  },

  timelineCloseRunning: (msgId) => {
    set(s => {
      const segs = s.timelines[msgId]
      if (!segs) return {}
      const next = segs.map(seg =>
        seg.kind === 'tools'
          ? {
              ...seg,
              calls: seg.calls.map(c =>
                c.status === 'running'
                  ? { ...c, status: 'done' as const, durationMs: c.durationMs ?? (Date.now() - c.startedAt) }
                  : c
              ),
            }
          : seg
      )
      return { timelines: { ...s.timelines, [msgId]: next } }
    })
  },

  clearTimelines: () => set({ timelines: {} }),

  rebuildTimelinesFromHistory: (msgs: any[]) => {
    set(s => {
      const newTimelines: Record<string, TimelineSegment[]> = {}
      let currentAsstMsgId: string | null = null
      
      // Map message IDs to their turn's assistant ID
      const msgIdToAsstId = new Map<string, string>()
      let tempAsstId: string | null = null
      let tempToolCalls: string[] = []
      let tempReasoningCalls: string[] = []
      
      const flushTempTurn = () => {
        const finalAsstId = tempAsstId || (tempToolCalls.length > 0 ? `asst-turn-${tempToolCalls[0]}` : null) || (tempReasoningCalls.length > 0 ? `asst-turn-${tempReasoningCalls[0]}` : null)
        if (finalAsstId) {
          if (tempAsstId) msgIdToAsstId.set(tempAsstId, finalAsstId)
          for (const tcId of tempToolCalls) {
            msgIdToAsstId.set(tcId, finalAsstId)
          }
          for (const rId of tempReasoningCalls) {
            msgIdToAsstId.set(rId, finalAsstId)
          }
        }
        tempAsstId = null
        tempToolCalls = []
        tempReasoningCalls = []
      }
      
      for (const m of msgs) {
        if (m.role === 'user') {
          flushTempTurn()
        } else if (m.role === 'assistant') {
          tempAsstId = m.id
        } else if (m.role === 'tool_call') {
          tempToolCalls.push(m.id)
        } else if (m.role === 'reasoning') {
          tempReasoningCalls.push(m.id)
        }
      }
      flushTempTurn()
      
      // Build timelines using the mapped turn assistant IDs
      for (const m of msgs) {
        if (m.role === 'user') {
          currentAsstMsgId = null
        } else if (m.role === 'assistant') {
          currentAsstMsgId = msgIdToAsstId.get(m.id) || m.id
          if (m.content) {
            const segs = newTimelines[currentAsstMsgId] || []
            segs.push({ kind: 'text', id: `t-${currentAsstMsgId}-${segs.length}`, text: m.content })
            newTimelines[currentAsstMsgId] = segs
          }
        } else if (m.role === 'reasoning') {
          currentAsstMsgId = msgIdToAsstId.get(m.id) || `asst-turn-${m.id}`
          if (m.content) {
            const segs = newTimelines[currentAsstMsgId] || []
            segs.push({ kind: 'reasoning', id: `r-${currentAsstMsgId}-${segs.length}`, text: m.content })
            newTimelines[currentAsstMsgId] = segs
          }
        } else if (m.role === 'tool_call') {
          currentAsstMsgId = msgIdToAsstId.get(m.id) || `asst-turn-${m.id}`
          const segs = newTimelines[currentAsstMsgId] || []
          let args = {}
          try { args = JSON.parse(m.content) } catch {}
          const call: ActiveToolCall = {
            id: m.tool_call_id || m.id,
            name: m.tool_name || 'unknown',
            args,
            status: 'done',
            startedAt: m.timestamp,
          }
          
          const last = segs[segs.length - 1]
          if (last && last.kind === 'tools') {
            last.calls.push(call)
          } else {
            segs.push({ kind: 'tools', id: `g-${currentAsstMsgId}-${segs.length}`, calls: [call] })
          }
          newTimelines[currentAsstMsgId] = segs
        } else if (m.role === 'tool_result') {
          const correspondingCall = msgs.find(x => x.role === 'tool_call' && (x.tool_call_id === m.tool_call_id || x.id === m.tool_call_id))
          const turnAsstId = correspondingCall ? msgIdToAsstId.get(correspondingCall.id) : null
          if (turnAsstId) {
            const segs = newTimelines[turnAsstId] || []
            for (const seg of segs) {
              if (seg.kind === 'tools') {
                for (const c of seg.calls) {
                  if (c.id === m.tool_call_id) {
                    c.status = 'done'
                    c.durationMs = m.timestamp - c.startedAt
                    c.result = m.content
                  }
                }
              }
            }
          }
        }
      }
      
      // Kapatılmamış tool'ları done yap
      for (const msgId in newTimelines) {
        newTimelines[msgId] = newTimelines[msgId].map(seg => {
          if (seg.kind === 'tools') {
            seg.calls = seg.calls.map(c => c.status === 'running' ? { ...c, status: 'done', durationMs: 0 } : c)
          }
          return seg
        })
      }

      return { timelines: newTimelines }
    })
  },

  startListening: (projectId, callbacks) => {
    // Stop any existing listeners first
    if (_cleanupFn) { _cleanupFn(); _cleanupFn = null }

    set({ isListening: true })
    const cleanups: Array<() => void> = []

    let assistantMsgId: string | null = null
    let accText = ''
    // send_message ile gönderilen son metin — onDone'daki finalText ile birebir
    // aynıysa tekrar yazmamak için (çift balon olmasın).
    let lastSentText = ''

    // Asistan mesajını (gerekirse) oluşturur — hem tool hem metin olayı bunu kullanır,
    // böylece metinden ÖNCE gelen tool çağrıları da doğru mesaja iliştirilir.
    const ensure = (): string => {
      if (!assistantMsgId) {
        assistantMsgId = callbacks.onAssistantStart()
        set({ streamingMessageId: assistantMsgId, status: 'thinking' })
      }
      return assistantMsgId
    }

    const unsubToolCall = ipc.agent.onToolCall((data: ToolCallEvent) => {
      const id = ensure()
      // send_message: agent'ın kullanıcıya yönelik asıl mesajı. Küçük, kırpılmış
      // bir 💬 tool satırı olarak gömmek yerine normal bir asistan balonu (markdown)
      // olarak göster — kullanıcı mesajı tam görebilsin.
      if (data.name === 'send_message') {
        if (data.status === 'start') {
          const m = typeof data.args?.message === 'string' ? data.args.message : ''
          if (m) {
            lastSentText = m
            // Önceki metinden net ayrılması için paragraf boşluğu ile ekle.
            get().timelinePushText(id, `\n\n${m}`)
            callbacks.onUpdateStreaming(id, accText ? `${accText}\n\n${m}` : m)
          }
        }
        // done/error fazında yapacak bir şey yok — tool satırı oluşturmadık.
        return
      }
      if (data.status === 'start') {
        get().timelinePushTool(id, data)
      } else {
        const callId = data.id ?? `${data.name}-${data.timestamp}`
        get().timelineUpdateTool(id, callId, data.status as 'done' | 'error', data.durationMs, data.result, data.error)
      }
    })
    cleanups.push(unsubToolCall)

    const unsubStepText = ipc.agent.onStepText((text: string) => {
      const id = ensure()
      accText += text
      get().timelinePushText(id, text)
      callbacks.onUpdateStreaming(id, accText)
      set({ streamingText: accText })
    })
    cleanups.push(unsubStepText)

    const unsubReasoningText = ipc.agent.onReasoningText((text: string) => {
      const id = ensure()
      get().timelinePushReasoning(id, text)
    })
    cleanups.push(unsubReasoningText)

    const unsubProgress = ipc.agent.onProgress((tasks: TaskProgress[]) => {
      set({ progress: tasks })
    })
    cleanups.push(unsubProgress)

    const unsubPlan = ipc.agent.onPlan((plan: PlanPayload) => {
      set({ currentPlan: plan })
    })
    cleanups.push(unsubPlan)

    const unsubQa = ipc.agent.onQaPrompt(async (payload: any) => {
      // Filtering: if payload.meta has sessionId, ensure it matches current desktop context
      if (payload?.meta?.sessionId) {
        try {
          // We import the stores directly inside to avoid circular dependencies if any
          const { useSessionsStore } = await import('./sessions.store')
          const { useUIStore } = await import('./ui.store')
          const currentProjectSessionId = useSessionsStore.getState().activeSessionId
          const currentGlobalSessionId = useUIStore.getState().activeGlobalSessionId

          if (payload.meta.sessionId !== currentProjectSessionId && payload.meta.sessionId !== currentGlobalSessionId) {
            return; // Ignore prompt meant for another session (e.g. Design App)
          }
        } catch (err) {
          console.error("Failed to load stores for qaPrompt filtering:", err)
        }
      }
      get().setQaPrompt(payload)
    })
    cleanups.push(unsubQa)

    const unsubDone = ipc.agent.onDone((result: AgentDoneResult) => {
      const finalText = result.text || accText
      // send_message zaten bu metni balon olarak gösterdiyse tekrar ekleme.
      const alreadyShown = !!finalText && finalText.trim() === lastSentText.trim()
      if (assistantMsgId) {
        // Hiç metin akmadıysa ama nihai metin varsa (ör. yalnız send_message),
        // timeline'a sondan bir metin segmenti ekle.
        if (finalText && !accText && !alreadyShown) get().timelinePushText(assistantMsgId, finalText)
        get().timelineCloseRunning(assistantMsgId)
        // Kalıcı mesaj içeriği: akan metin + (varsa) send_message metni.
        const persisted = alreadyShown
          ? (accText || finalText)
          : [accText, lastSentText && !accText.includes(lastSentText) ? lastSentText : '']
              .filter(Boolean).join('\n\n') || finalText
        if (persisted) callbacks.onFinalize(assistantMsgId, persisted)
      }
      if (result.sessionId) {
        callbacks.onSessionCreated(result.sessionId, projectId)
      }
      set({ status: 'idle', streamingText: '', streamingMessageId: null })
      assistantMsgId = null
      accText = ''
      lastSentText = ''
    })
    cleanups.push(unsubDone)

    const unsubInterrupted = ipc.agent.onInterrupted(() => {
      // User pressed stop — agent was aborted cleanly, no error to show
      const id = assistantMsgId
      if (id) {
        get().timelineCloseRunning(id)
        // Only finalize if there's some accumulated text (akan metin veya send_message)
        const persisted = [accText, lastSentText].filter(Boolean).join('\n\n')
        if (persisted) callbacks.onFinalize(id, persisted)
      }
      set({ status: 'idle', streamingText: '', streamingMessageId: null })
      assistantMsgId = null
      accText = ''
      lastSentText = ''
    })
    cleanups.push(unsubInterrupted)

    const unsubError = ipc.agent.onError((err: string) => {
      const id = assistantMsgId
      if (id) {
        get().timelineCloseRunning(id)
        get().timelinePushText(id, `${accText ? '\n\n' : ''}❌ Error: ${err}`)
        callbacks.onFinalize(id, `${accText ? accText + '\n\n' : ''}❌ Error: ${err}`)
      }
      set({ status: 'error', lastError: err, streamingText: '', streamingMessageId: null })
      assistantMsgId = null
      accText = ''
      lastSentText = ''
    })
    cleanups.push(unsubError)

    _cleanupFn = () => {
      cleanups.forEach(fn => fn())
    }
  },

  stopListening: () => {
    if (_cleanupFn) { _cleanupFn(); _cleanupFn = null }
    set({ isListening: false })
  },
}))
