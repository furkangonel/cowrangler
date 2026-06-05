import React, { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowLeft, Square, Plus, RotateCcw } from 'lucide-react'
import { MessageBubble } from './MessageBubble'
import { InputArea } from './InputArea'
import { useSessionsStore } from '../../stores/sessions.store'
import { useAgentStore } from '../../stores/agent.store'
import { useProjectsStore } from '../../stores/projects.store'
import { useUIStore } from '../../stores/ui.store'
import { ipc } from '../../lib/ipc'

interface Props {
  projectId: string
  sessionId: string
}

export function SessionView({ projectId, sessionId }: Props) {
  const {
    uiMessages, loadMessages, setActiveSession, addUserMessage,
    addAssistantStreaming, updateStreamingMessage, finalizeMessage,
    loadSessions, clearUIMessages,
  } = useSessionsStore()

  const agentStore = useAgentStore()
  const { getActiveProject } = useProjectsStore()
  const { setRightPanelTab } = useUIStore()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [isNew] = useState(sessionId === '__new__')
  const project = getActiveProject()

  // Scroll to bottom
  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [uiMessages.length])

  // Setup listeners
  useEffect(() => {
    // Aktif session'da IPC dinleyicileri başlat
    agentStore.startListening(projectId, {
      onUserMessage: addUserMessage,
      onAssistantStart: addAssistantStreaming,
      onUpdateStreaming: updateStreamingMessage,
      onFinalize: finalizeMessage,
      onSessionCreated: (sid, pid) => {
        // Session oluşturuldu — listeyi yenile ve active session'ı güncelle
        loadSessions(pid)
        // activeSessionId'yi gerçek ID ile güncelle
        if (sessionId === '__new__' || !sessionId) {
          setActiveSession(sid)
        }
      },
    })

    return () => {
      agentStore.stopListening()
    }
  }, [projectId])

  // Existing session — mesajları yükle
  useEffect(() => {
    if (!isNew && sessionId && sessionId !== '__new__') {
      loadMessages(sessionId)
    } else {
      clearUIMessages()
    }
    setRightPanelTab('progress')
  }, [sessionId])

  // Pending message (ProjectHome'dan gelen)
  useEffect(() => {
    const pending = sessionStorage.getItem(`pendingMessage_${projectId}`)
    if (pending) {
      sessionStorage.removeItem(`pendingMessage_${projectId}`)
      setTimeout(() => handleSend(pending), 100)
    }
  }, [])

  const handleSend = useCallback(async (message: string) => {
    if (!message.trim() || agentStore.status === 'thinking') return

    // Optimistic user message
    addUserMessage(message)
    agentStore.setStatus('thinking')
    agentStore.clearToolCalls()

    const currentSessionId = sessionId === '__new__' ? null : sessionId

    try {
      await ipc.agent.chat(projectId, currentSessionId, message)
    } catch (err: any) {
      agentStore.setStatus('error')
      agentStore.setError(err.message)
    }
  }, [projectId, sessionId, agentStore.status])

  const handleInterrupt = useCallback(async () => {
    await ipc.agent.interrupt(projectId)
  }, [projectId])

  const handleNewSession = useCallback(async () => {
    await ipc.agent.newSession(projectId)
    agentStore.setStatus('idle')
    agentStore.clearToolCalls()
    agentStore.setProgress([])
    clearUIMessages()
    setActiveSession('__new__')
  }, [projectId])

  return (
    <div className="flex flex-col h-full overflow-hidden bg-bg-primary">
      {/* Session header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border flex-shrink-0 bg-bg-secondary">
        <button
          onClick={() => setActiveSession(null)}
          className="p-1.5 text-text-muted hover:text-text-secondary transition-colors rounded"
          title="Geri"
        >
          <ArrowLeft size={14} />
        </button>
        <span className="flex-1 text-xs text-text-secondary font-medium truncate">
          {isNew ? 'Yeni Konuşma' : 'Session'}
        </span>
        <div className="flex items-center gap-1">
          {agentStore.status === 'thinking' && (
            <button
              onClick={handleInterrupt}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-error border border-error/30 rounded-md hover:bg-error/10 transition-colors"
              title="Durdur"
            >
              <Square size={11} />
              Durdur
            </button>
          )}
          <button
            onClick={handleNewSession}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-text-muted border border-border rounded-md hover:text-text-secondary hover:border-accent/40 transition-colors"
            title="Yeni session"
          >
            <Plus size={11} />
            Yeni
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {uiMessages.length === 0 && !isNew && (
          <div className="flex items-center justify-center h-full">
            <span className="text-xs text-text-muted">Mesaj yükleniyor...</span>
          </div>
        )}

        {uiMessages.length === 0 && isNew && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <span className="text-4xl">{project?.icon ?? '🤠'}</span>
            <p className="text-sm text-text-secondary font-medium">{project?.name}</p>
            <p className="text-xs text-text-muted max-w-xs">
              Mesajınızı yazın ve agent görevi üstlensin.
            </p>
          </div>
        )}

        {uiMessages.map((msg, i) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            toolCalls={
              msg.role === 'assistant' && i === uiMessages.length - 1
                ? agentStore.toolCalls
                : []
            }
          />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <InputArea
        onSend={handleSend}
        onInterrupt={handleInterrupt}
        disabled={agentStore.status === 'thinking'}
        projectId={projectId}
      />
    </div>
  )
}
