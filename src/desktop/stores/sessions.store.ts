import { create } from 'zustand'
import { ipc, SessionRecord, MessageRecord } from '../lib/ipc'

interface UIMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  isStreaming?: boolean
}

interface SessionsState {
  sessionsByProject: Record<string, SessionRecord[]>
  activeSessionId: string | null
  messages: MessageRecord[]
  uiMessages: UIMessage[]   // Optimistic + streaming UI messages
  loadingSessions: boolean
  loadingMessages: boolean

  loadSessions: (projectId: string) => Promise<void>
  loadMessages: (sessionId: string) => Promise<void>
  setActiveSession: (id: string | null) => void
  deleteSession: (projectId: string, sessionId: string) => Promise<void>
  renameSession: (sessionId: string, title: string) => Promise<void>

  // Optimistic / streaming UI
  addUserMessage: (content: string) => string  // returns temp id
  addAssistantStreaming: () => string            // returns temp id
  updateStreamingMessage: (id: string, content: string) => void
  finalizeMessage: (id: string, content: string) => void
  clearUIMessages: () => void
  appendFromDB: (msgs: MessageRecord[]) => void
}

export const useSessionsStore = create<SessionsState>((set, get) => ({
  sessionsByProject: {},
  activeSessionId: null,
  messages: [],
  uiMessages: [],
  loadingSessions: false,
  loadingMessages: false,

  loadSessions: async (projectId) => {
    set({ loadingSessions: true })
    try {
      const sessions = await ipc.sessions.list(projectId)
      set(s => ({
        sessionsByProject: { ...s.sessionsByProject, [projectId]: sessions },
        loadingSessions: false,
      }))
    } catch {
      set({ loadingSessions: false })
    }
  },

  loadMessages: async (sessionId) => {
    set({ loadingMessages: true, uiMessages: [] })
    try {
      const msgs = await ipc.sessions.messages(sessionId)
      set({ messages: msgs, loadingMessages: false })
      get().appendFromDB(msgs)
    } catch {
      set({ loadingMessages: false })
    }
  },

  setActiveSession: (id) => {
    set({ activeSessionId: id })
    // Clear UI messages when switching to a new session
    if (id === '__new__' || !id) {
      set({ uiMessages: [], messages: [] })
    }
  },

  deleteSession: async (projectId, sessionId) => {
    await ipc.sessions.delete(projectId, sessionId)
    set(s => {
      const updated = (s.sessionsByProject[projectId] ?? []).filter(s => s.id !== sessionId)
      return {
        sessionsByProject: { ...s.sessionsByProject, [projectId]: updated },
        activeSessionId: s.activeSessionId === sessionId ? null : s.activeSessionId,
        uiMessages: s.activeSessionId === sessionId ? [] : s.uiMessages,
      }
    })
  },

  renameSession: async (sessionId, title) => {
    await ipc.sessions.rename(sessionId, title)
    // Yerel listedeki başlığı da güncelle ki sidebar anında yansısın.
    set(s => {
      const next: Record<string, SessionRecord[]> = {}
      for (const [pid, list] of Object.entries(s.sessionsByProject)) {
        next[pid] = list.map(sess => sess.id === sessionId ? { ...sess, title } : sess)
      }
      return { sessionsByProject: next }
    })
  },

  addUserMessage: (content) => {
    const id = `ui-user-${Date.now()}`
    const msg: UIMessage = { id, role: 'user', content, timestamp: Date.now() }
    set(s => ({ uiMessages: [...s.uiMessages, msg] }))
    return id
  },

  addAssistantStreaming: () => {
    const id = `ui-assistant-${Date.now()}`
    const msg: UIMessage = { id, role: 'assistant', content: '', timestamp: Date.now(), isStreaming: true }
    set(s => ({ uiMessages: [...s.uiMessages, msg] }))
    return id
  },

  updateStreamingMessage: (id, content) => {
    set(s => ({
      uiMessages: s.uiMessages.map(m => m.id === id ? { ...m, content } : m),
    }))
  },

  finalizeMessage: (id, content) => {
    set(s => ({
      uiMessages: s.uiMessages.map(m =>
        m.id === id ? { ...m, content, isStreaming: false } : m
      ),
    }))
  },

  clearUIMessages: () => set({ uiMessages: [], messages: [] }),

  appendFromDB: (msgs) => {
    // Skip 'tool' role messages — they're shown as ToolTrace items
    const uiMessages: UIMessage[] = msgs
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: m.timestamp,
      }))
    set({ uiMessages })
  },
}))
