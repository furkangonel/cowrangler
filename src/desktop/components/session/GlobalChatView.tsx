/**
 * GlobalChatView — Projesiz genel sohbet görünümü.
 * "__global__" projectId ile çalışır; proje bağlamı yoktur.
 * Aktif global sohbet ui.store.activeGlobalSessionId ile yönetilir;
 * böylece sidebar'daki sohbet listesinden seçim yapılabilir.
 */
import React, { useEffect, useRef, useCallback } from 'react'
import { MessagesSquare, Plus, Square } from 'lucide-react'
import { ipc } from '../../lib/ipc'
import { useAgentStore } from '../../stores/agent.store'
import { useSessionsStore } from '../../stores/sessions.store'
import { useSettingsStore } from '../../stores/settings.store'
import { useUIStore } from '../../stores/ui.store'
import { MessageBubble } from './MessageBubble'
import { InputArea } from './InputArea'
import { AskUserPrompt } from './AskUserPrompt'

export const GLOBAL_PROJECT_ID = '__global__'

export function GlobalChatView() {
  const agentStore = useAgentStore()
  const {
    uiMessages, loadMessages, clearUIMessages,
    addUserMessage, addAssistantStreaming, updateStreamingMessage, finalizeMessage,
    loadSessions,
  } = useSessionsStore()
  const { getModel } = useSettingsStore()
  const { activeGlobalSessionId, setActiveGlobalSession } = useUIStore()
  const bottomRef = useRef<HTMLDivElement>(null)
  const status = agentStore.status

  // Agent olaylarını global proje için dinle.
  useEffect(() => {
    agentStore.startListening(GLOBAL_PROJECT_ID, {
      onUserMessage: addUserMessage,
      onAssistantStart: addAssistantStreaming,
      onUpdateStreaming: updateStreamingMessage,
      onFinalize: finalizeMessage,
      onSessionCreated: (sid) => {
        loadSessions(GLOBAL_PROJECT_ID)
        setActiveGlobalSession(sid)
      },
    })
    return () => { agentStore.stopListening() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Aktif global sohbet değişince mesajları yükle / temizle.
  useEffect(() => {
    agentStore.clearTimelines()
    if (activeGlobalSessionId) loadMessages(activeGlobalSessionId)
    else clearUIMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGlobalSessionId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [uiMessages.length, agentStore.streamingText])

  const handleSend = useCallback(async (message: string) => {
    if (!message.trim() || status === 'thinking') return
    const model = getModel()
    if (!model) {
      agentStore.setStatus('error')
      agentStore.setError('No model selected yet. Choose a model from Settings → Models & API.')
      return
    }
    addUserMessage(message)
    agentStore.setStatus('thinking')
    agentStore.clearToolCalls()
    try {
      await ipc.agent.chat(GLOBAL_PROJECT_ID, activeGlobalSessionId, message, model)
    } catch (err: any) {
      agentStore.setStatus('error')
      agentStore.setError(err?.message ?? String(err))
    }
  }, [status, activeGlobalSessionId, getModel, agentStore, addUserMessage])

  const handleInterrupt = useCallback(() => {
    ipc.agent.interrupt(GLOBAL_PROJECT_ID)
  }, [])

  const handleNewChat = useCallback(async () => {
    await ipc.agent.newSession(GLOBAL_PROJECT_ID)
    agentStore.setStatus('idle')
    agentStore.clearToolCalls()
    agentStore.clearTimelines()
    clearUIMessages()
    setActiveGlobalSession(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hasMessages = uiMessages.length > 0

  return (
    <div className="flex flex-col h-full overflow-hidden bg-bg-primary">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle flex-shrink-0 bg-bg-primary">
        <div className="flex items-center gap-2">
          <MessagesSquare size={15} className="text-accent" />
          <span className="text-sm font-medium text-text-secondary">General Chat</span>
        </div>
        <div className="flex items-center gap-1.5">
          {status === 'thinking' && (
            <button
              onClick={handleInterrupt}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-error border border-error/30 rounded-lg hover:bg-error/10 transition-colors"
            >
              <Square size={11} className="fill-current" /> Stop
            </button>
          )}
          <button
            onClick={handleNewChat}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-text-secondary border border-border rounded-lg hover:text-text-primary hover:border-accent/40 transition-colors"
          >
            <Plus size={12} /> New
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
          {!hasMessages && <EmptyGlobalChat />}
          {uiMessages.map((msg, i) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isLast={i === uiMessages.length - 1}
              timeline={msg.role === 'assistant' ? agentStore.timelines[msg.id] : undefined}
            />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {agentStore.qaPrompt && agentStore.qaPrompt.meta?.sessionId === activeGlobalSessionId && (
        <AskUserPrompt
          payload={agentStore.qaPrompt}
          onSubmit={(ans) => agentStore.answerQaPrompt(ans)}
        />
      )}

      {/* Input */}
      <InputArea
        onSend={handleSend}
        onInterrupt={handleInterrupt}
        disabled={status === 'thinking' && !(agentStore.qaPrompt && agentStore.qaPrompt.meta?.sessionId === activeGlobalSessionId)}
        projectId={GLOBAL_PROJECT_ID}
      />
    </div>
  )
}

function EmptyGlobalChat() {
  return (
    <div className="flex flex-col items-center justify-center pt-20 gap-5 text-center animate-fade-in">
      <div className="w-14 h-14 rounded-full bg-accent-subtle flex items-center justify-center ring-1 ring-accent/20">
        <MessagesSquare size={26} className="text-accent" />
      </div>
      <div className="space-y-1.5">
        <h3 className="text-lg font-semibold text-text-primary brand-serif">General Chat</h3>
        <p className="text-sm text-text-secondary max-w-xs leading-relaxed">
          Chat with the agent without a project context. Research, writing code, file work — all here.
        </p>
      </div>
    </div>
  )
}
