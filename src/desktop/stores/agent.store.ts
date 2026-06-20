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

// Module-level cleanup ref (persists outside React)
let _cleanupFn: (() => void) | null = null

interface AgentState {
  status: 'idle' | 'thinking' | 'error'
  streamingText: string
  streamingMessageId: string | null
  toolCalls: ActiveToolCall[]
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

  startListening: (projectId, callbacks) => {
    // Stop any existing listeners first
    if (_cleanupFn) { _cleanupFn(); _cleanupFn = null }

    set({ isListening: true })
    const cleanups: Array<() => void> = []

    const unsubToolCall = ipc.agent.onToolCall((data: ToolCallEvent) => {
      if (data.status === 'start') {
        get().addToolCall(data)
      } else {
        const id = data.id ?? `${data.name}-${data.timestamp}`
        get().updateToolCall(id, data.status as 'done' | 'error', data.durationMs)
      }
    })
    cleanups.push(unsubToolCall)

    let assistantMsgId: string | null = null
    let accText = ''

    const unsubStepText = ipc.agent.onStepText((text: string) => {
      if (!assistantMsgId) {
        assistantMsgId = callbacks.onAssistantStart()
        set({ streamingMessageId: assistantMsgId, status: 'thinking' })
      }
      accText += text
      callbacks.onUpdateStreaming(assistantMsgId, accText)
      set({ streamingText: accText })
    })
    cleanups.push(unsubStepText)

    const unsubProgress = ipc.agent.onProgress((tasks: TaskProgress[]) => {
      set({ progress: tasks })
    })
    cleanups.push(unsubProgress)

    const unsubDone = ipc.agent.onDone((result: AgentDoneResult) => {
      const finalText = result.text || accText
      if (assistantMsgId && finalText) {
        callbacks.onFinalize(assistantMsgId, finalText)
      }
      if (result.sessionId) {
        callbacks.onSessionCreated(result.sessionId, projectId)
      }
      // Hâlâ 'running' durumunda kalan tool call'ları kapat — IPC'den done olayı gelmese bile
      set(s => ({
        toolCalls: s.toolCalls.map(tc =>
          tc.status === 'running'
            ? { ...tc, status: 'done' as const, durationMs: Date.now() - tc.startedAt }
            : tc
        ),
        status: 'idle',
        streamingText: '',
        streamingMessageId: null,
      }))
      assistantMsgId = null
      accText = ''
    })
    cleanups.push(unsubDone)

    const unsubError = ipc.agent.onError((err: string) => {
      if (assistantMsgId) {
        callbacks.onFinalize(assistantMsgId, `❌ Error: ${err}`)
      }
      set({ status: 'error', lastError: err, streamingText: '', streamingMessageId: null })
      assistantMsgId = null
      accText = ''
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
