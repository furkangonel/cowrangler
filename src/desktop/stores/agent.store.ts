import { create } from 'zustand'
import { ipc, TaskProgress, ToolCallEvent, ContextSnapshot, AgentDoneResult } from '../lib/ipc'

export interface ActiveToolCall {
  id: string
  name: string
  args: Record<string, any>
  status: 'running' | 'done' | 'error'
  durationMs?: number
  startedAt: number
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

  setStatus: (s: AgentState['status']) => void
  appendStreamText: (text: string) => void
  clearStream: () => void
  addToolCall: (event: ToolCallEvent) => void
  updateToolCall: (id: string, status: 'done' | 'error', durationMs?: number) => void
  clearToolCalls: () => void
  setProgress: (tasks: TaskProgress[]) => void
  setContextSnapshot: (snap: ContextSnapshot | null) => void
  setError: (err: string | null) => void
  setStreamingMessageId: (id: string | null) => void

  // Timeline
  timelinePushText: (msgId: string, text: string) => void
  timelinePushTool: (msgId: string, event: ToolCallEvent) => void
  timelineUpdateTool: (msgId: string, callId: string, status: 'done' | 'error', durationMs?: number) => void
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

  setStatus: (status) => set({ status }),
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

  timelineUpdateTool: (msgId, callId, status, durationMs) => {
    set(s => {
      const segs = s.timelines[msgId]
      if (!segs) return {}
      const next = segs.map(seg =>
        seg.kind === 'tools'
          ? {
              ...seg,
              calls: seg.calls.map(c =>
                c.id === callId && c.status === 'running'
                  ? { ...c, status, durationMs: durationMs ?? (Date.now() - c.startedAt) }
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
        get().timelineUpdateTool(id, callId, data.status as 'done' | 'error', data.durationMs)
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

    const unsubProgress = ipc.agent.onProgress((tasks: TaskProgress[]) => {
      set({ progress: tasks })
    })
    cleanups.push(unsubProgress)

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
