import React, { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowLeft, Square, Plus } from 'lucide-react'
import { MessageBubble } from './MessageBubble'
import { InputArea } from './InputArea'
import { useSessionsStore } from '../../stores/sessions.store'
import { useAgentStore } from '../../stores/agent.store'
import { useProjectsStore } from '../../stores/projects.store'
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
  const scrollRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [isNew] = useState(sessionId === '__new__')
  const project = getActiveProject()

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [uiMessages.length, agentStore.streamingText])

  useEffect(() => {
    agentStore.startListening(projectId, {
      onUserMessage: addUserMessage,
      onAssistantStart: addAssistantStreaming,
      onUpdateStreaming: updateStreamingMessage,
      onFinalize: finalizeMessage,
      onSessionCreated: (sid, pid) => {
        loadSessions(pid)
        if (sessionId === '__new__' || !sessionId) setActiveSession(sid)
      },
    })
    return () => { agentStore.stopListening() }
  }, [projectId])

  useEffect(() => {
    if (!isNew && sessionId && sessionId !== '__new__') loadMessages(sessionId)
    else clearUIMessages()
  }, [sessionId])

  useEffect(() => {
    const pending = sessionStorage.getItem(`pendingMessage_${projectId}`)
    if (pending) {
      sessionStorage.removeItem(`pendingMessage_${projectId}`)
      setTimeout(() => handleSend(pending), 100)
    }
  }, [])

  const handleSend = useCallback(async (message: string) => {
    if (!message.trim() || agentStore.status === 'thinking') return
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
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border-subtle flex-shrink-0 bg-bg-primary">
        <button
          onClick={() => setActiveSession(null)}
          className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors rounded-lg"
          title="Back to project"
        >
          <ArrowLeft size={15} />
        </button>
        <span className="flex-1 text-sm text-text-secondary font-medium truncate">
          {isNew ? 'Yeni sohbet' : (uiMessages[0]?.content?.slice(0, 60) || 'Sohbet')}
        </span>
        <div className="flex items-center gap-1.5">
          {agentStore.status === 'thinking' && (
            <button
              onClick={handleInterrupt}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-error border border-error/30 rounded-lg hover:bg-error/10 transition-colors"
            >
              <Square size={11} className="fill-current" /> Durdur
            </button>
          )}
          <button
            onClick={handleNewSession}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-text-secondary border border-border rounded-lg hover:text-text-primary hover:border-accent/40 transition-colors"
          >
            <Plus size={12} /> Yeni
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
          {uiMessages.length === 0 && !isNew && (
            <div className="space-y-4 pt-6">
              {[0, 1].map(i => <div key={i} className="h-16 rounded-xl shimmer" />)}
            </div>
          )}

          {uiMessages.length === 0 && isNew && (
            <div className="flex flex-col items-center justify-center pt-20 gap-3 text-center">
              <p className="text-xl text-text-primary font-medium brand-serif">{project?.name}</p>
              <p className="text-sm text-text-muted max-w-sm leading-relaxed">
                Type a task — let the agent work on your files. Track progress live in the right panel.
              </p>
            </div>
          )}

          {uiMessages.map((msg, i) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isLast={i === uiMessages.length - 1}
              toolCalls={
                msg.role === 'assistant' && i === uiMessages.length - 1
                  ? agentStore.toolCalls
                  : []
              }
            />
          ))}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <InputArea
        onSend={handleSend}
        onInterrupt={handleInterrupt}
        disabled={agentStore.status === 'thinking'}
        projectId={projectId}
      />
    </div>
  )
}
