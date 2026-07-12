/**
 * CodeSessionView — Code sekmesinin ana görünümü.
 *
 * Claude Desktop Code tab mantığı:
 *   • Her session bağımsız — proje hiyerarşisine bağlı değil.
 *   • Çalışma dizini (workdir) session başında seçilir; git durumu alt barda gösterilir.
 *   • Chat + Git status bar (folder·branch·PR) + alttaki InputArea model seçici.
 *   • Session null ise "home" ekranı (dizin seçici + boş durum).
 *
 * Proje kimliği: '__code__' sabiti (global chat'teki '__global__' gibi).
 */
import React, { useEffect, useRef, useCallback, useState } from 'react'
import {
  Plus, Square, FolderOpen, GitBranch, Check,
  ChevronDown, Code2, GitPullRequest, RefreshCw, X,
} from 'lucide-react'
import { ipc } from '../../lib/ipc'
import { useAgentStore } from '../../stores/agent.store'
import { useSessionsStore } from '../../stores/sessions.store'
import { useSettingsStore } from '../../stores/settings.store'
import { useUIStore } from '../../stores/ui.store'
import { useGitStore } from '../../stores/git.store'
import { MessageBubble } from './MessageBubble'
import { InputArea } from './InputArea'
import { AskUserPrompt } from './AskUserPrompt'
import { StatsDashboard } from './StatsDashboard'

export const CODE_PROJECT_ID = '__code__'
/** Henüz DB'ye yazılmamış taze oturum (ilk mesajda gerçek id ile değişir). */
const NEW_CODE_SESSION = '__new__'

/**
 * "New task" — taze bir kod workspace'i başlat. Ana sayfayı (CodeHome) açar:
 * mevcut oturumdan çıkar, workdir + ek dizinleri sıfırlar ki kullanıcı yeni bir
 * ana workspace seçebilsin. Sol sidebardaki "New task" butonu bunu çağırır.
 */
export async function startNewCodeTask(): Promise<void> {
  await ipc.agent.newSession(CODE_PROJECT_ID).catch(() => {})
  const agent = useAgentStore.getState()
  agent.setStatus('idle')
  agent.clearToolCalls()
  agent.clearTimelines()
  agent.setProgress([])
  agent.setCurrentPlan(null)
  useSessionsStore.getState().clearUIMessages()
  // Ana workspace'i sıfırla → CodeHome'da yeni klasör seçilebilir (setCodeWorkdir
  // null ek dizinleri de backend'de temizler).
  useGitStore.getState().setWorkdir(null)
  ipc.agent.setCodeWorkdir(null).catch(() => {})
  useUIStore.getState().setActiveCodeSession(null)
}

/* ══════════════════════════════════════════════════════════════════════════ */

export function CodeSessionView() {
  const agentStore = useAgentStore()
  const {
    uiMessages, loadMessages, clearUIMessages,
    addUserMessage, addAssistantStreaming, updateStreamingMessage, finalizeMessage,
    loadSessions,
  } = useSessionsStore()
  const { getModel, config } = useSettingsStore()
  const userName = ((config?.['desktop.userName'] as string) || (config?.['name'] as string) || null)
  const {
    activeCodeSessionId,
    setActiveCodeSession,
    pendingCodePrompt,
    clearCodePrompt,
    setRightPanelOpen,
    setCodeRightTab,
  } = useUIStore()
  const gitStore = useGitStore()
  const bottomRef = useRef<HTMLDivElement>(null)
  const previousTaskCountRef = useRef(0)
  const status = agentStore.status

  // Workdir: git store'dan al (kod sekmesi boyunca tek workdir)
  const workdir = gitStore.workdir
  const repoName = workdir ? (workdir.split('/').pop() ?? null) : null

  // Agent olaylarını code project için dinle.
  useEffect(() => {
    agentStore.startListening(CODE_PROJECT_ID, {
      getActiveSessionId: () => useUIStore.getState().activeCodeSessionId,
      onUserMessage: addUserMessage,
      onAssistantStart: addAssistantStreaming,
      onUpdateStreaming: updateStreamingMessage,
      onFinalize: finalizeMessage,
      onSessionCreated: (sid) => {
        loadSessions(CODE_PROJECT_ID)
        setActiveCodeSession(sid)
      },
    })
    return () => { agentStore.stopListening() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Aktif session değişince mesajları yükle / temizle + session'ın workdir'ini geri yükle.
  useEffect(() => {
    agentStore.clearTimelines()
    agentStore.clearToolCalls()
    agentStore.setProgress([])
    agentStore.setCurrentPlan(null)
    if (activeCodeSessionId && activeCodeSessionId !== NEW_CODE_SESSION) {
      loadMessages(activeCodeSessionId)
      // Cowork ProgressPanel gibi Code task listesini de diskten geri yükle.
      // fs.watch event'i uygulama kapalıyken/session geçişinde kaçmış olabilir.
      ipc.agent.getTodo(CODE_PROJECT_ID, activeCodeSessionId)
        .then(tasks => agentStore.setProgress(tasks ?? []))
        .catch(() => agentStore.setProgress([]))
      // Planı da diskten geri yükle — canlı agent:plan event'i yalnız write_plan
      // turunda gelir; session geçişi/yeniden açılışta plan aksi halde kaybolur.
      ipc.agent.getPlan(CODE_PROJECT_ID, activeCodeSessionId)
        .then(plan => agentStore.setCurrentPlan(plan ?? null))
        .catch(() => agentStore.setCurrentPlan(null))
      ipc.sessions.get(activeCodeSessionId).then(sess => {
        if (sess && sess.workdir && sess.workdir !== '/' && sess.workdir !== '') {
          gitStore.setWorkdir(sess.workdir)
          ipc.agent.setCodeWorkdir(sess.workdir).catch(() => {})
        }
      }).catch(console.error)
      ipc.agent.setActiveSession(activeCodeSessionId).catch(() => {})
    } else {
      clearUIMessages()
      ipc.agent.setActiveSession(null).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCodeSessionId])

  // manage_task ilk görevi oluşturduğu anda sağ paneli görünür kıl. Kullanıcı
  // isterse kapatabilir; sonraki status güncellemeleri paneli zorla açmaz.
  useEffect(() => {
    const count = agentStore.progress.length
    if (count > 0 && previousTaskCountRef.current === 0) {
      setRightPanelOpen(true)
      setCodeRightTab('task')
    }
    previousTaskCountRef.current = count
  }, [agentStore.progress.length, setRightPanelOpen, setCodeRightTab])

  // Workdir değişince: backend'e bildir (agent bu dizinde çalışsın) + git yenile.
  useEffect(() => {
    ipc.agent.setCodeWorkdir(workdir ?? null).catch(() => {})
    if (workdir) gitStore.refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workdir])

  // Git takibini otomatik yenile: 5 saniyede bir poll + pencere odaklanınca anında yenile.
  useEffect(() => {
    if (!workdir) return

    const handleFocus = () => {
      gitStore.refresh().catch(() => {})
    }
    window.addEventListener('focus', handleFocus)

    const interval = setInterval(() => {
      gitStore.refresh().catch(() => {})
    }, 5000)

    return () => {
      window.removeEventListener('focus', handleFocus)
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workdir])

  // Dev server'ın önceki durumu — ref'te tutulur (render tetiklemeye gerek yok).
  const devServerRunningRef = useRef<boolean | null>(null)

  // Dev server tespiti ve otomatik preview tabına geçiş
  useEffect(() => {
    if (!workdir) return

    let isMounted = true

    const checkServer = async () => {
      const found = await ipc.preview.detect(workdir).catch(() => null)
      const isNowRunning = !!found

      if (!isMounted) return

      const prev = devServerRunningRef.current
      devServerRunningRef.current = isNowRunning
      // Geçiş: eskiden çalışmıyordu, şimdi çalışıyor -> sağ paneli aç + Run sekmesi.
      // Yan etkiler async gövdede (render dışı) yapılır; bir state-updater
      // fonksiyonu içinde başka store'u güncellemek "render sırasında setState"
      // uyarısına yol açardı (Sidebar ↔ CodeSessionView).
      if (prev !== null && !prev && isNowRunning) {
        setRightPanelOpen(true)
        setCodeRightTab('run')
      }
    }

    checkServer()

    const interval = setInterval(checkServer, 3000)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workdir])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [uiMessages.length, agentStore.streamingText])

  const handleSend = useCallback(async (message: string) => {
    if (!message.trim() || status === 'thinking') return
    const model = getModel()
    if (!model) {
      agentStore.setStatus('error')
      agentStore.setError('No model selected. Choose a model from Settings → Models & API.')
      return
    }

    if (!activeCodeSessionId) {
      await ipc.agent.newSession(CODE_PROJECT_ID)
      agentStore.setStatus('idle')
      agentStore.clearToolCalls()
      agentStore.clearTimelines()
      agentStore.setProgress([])
      agentStore.setCurrentPlan(null)
      clearUIMessages()

      sessionStorage.setItem('pendingCodePrompt', message)
      setActiveCodeSession(NEW_CODE_SESSION)
      return
    }

    addUserMessage(message)
    agentStore.setStatus('thinking')
    agentStore.clearToolCalls()
    const sid = activeCodeSessionId === NEW_CODE_SESSION ? null : activeCodeSessionId
    try {
      await ipc.agent.chat(CODE_PROJECT_ID, sid, message, model)
    } catch (err: any) {
      agentStore.setStatus('error')
      agentStore.setError(err?.message ?? String(err))
    }
  }, [status, activeCodeSessionId, getModel, agentStore, addUserMessage, clearUIMessages, setActiveCodeSession])

  const handleInterrupt = useCallback(() => {
    ipc.agent.interrupt(CODE_PROJECT_ID)
  }, [])

  // WP-B2: sağ panel (GitPanel) git aksiyonları elle git yerine agent'a talimat
  // olur. requestCodePrompt ile gelen prompt burada handleSend'e verilir.
  useEffect(() => {
    if (pendingCodePrompt) {
      void handleSend(pendingCodePrompt)
      clearCodePrompt()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCodePrompt])

  // Check for pending prompt in sessionStorage when entering a new code session
  useEffect(() => {
    if (activeCodeSessionId === NEW_CODE_SESSION) {
      const pending = sessionStorage.getItem('pendingCodePrompt')
      if (pending) {
        sessionStorage.removeItem('pendingCodePrompt')
        setTimeout(() => {
          void handleSend(pending)
        }, 100)
      }
    }
  }, [activeCodeSessionId, handleSend])

  // WP-B2: "Create PR" agent'a talimattır (elle commit/push yok). Agent
  // git_add/git_commit/git_push/git_open_pr tool'larını kullanır.
  const handleCreatePR = useCallback((kind: 'pr' | 'draft' = 'pr') => {
    const draft = kind === 'draft' ? ' Open it as a draft PR.' : ''
    void handleSend(
      `Stage all changes, commit them with a clear conventional-commit message, ` +
      `push the current branch (set upstream if needed), then open a GitHub pull request ` +
      `using the git_open_pr tool with a concise title and a body summarizing what changed.${draft}`,
    )
  }, [handleSend])

  // Ana workspace (primary) — bir kez seçilir, sonra kilitlenir. Yalnız workdir
  // yokken seçilebilir; değiştirmek için soldan "New task" → yeni workspace.
  const handlePickFolder = useCallback(async () => {
    if (workdir) return // primary kilitli
    const path = await ipc.fs.pickFolder()
    if (path) {
      gitStore.setWorkdir(path)
      ipc.agent.setCodeWorkdir(path).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gitStore, workdir])

  // Ek çalışma dizinleri — ana workspace dışında agent'ın erişebildiği klasörler.
  const [extraDirs, setExtraDirs] = useState<string[]>([])
  const refreshDirs = useCallback(async () => {
    const d = await ipc.agent.getCodeDirs().catch(() => null)
    if (d) setExtraDirs(d.extraDirs || [])
  }, [])
  useEffect(() => { void refreshDirs() }, [workdir, refreshDirs])

  const handleAddFolder = useCallback(async () => {
    if (!workdir) return // önce ana workspace seçilmeli
    const path = await ipc.fs.pickFolder()
    if (path && path !== workdir) {
      await ipc.agent.addCodeDir(path).catch(() => {})
      void refreshDirs()
    }
  }, [workdir, refreshDirs])

  const handleRemoveDir = useCallback(async (dir: string) => {
    await ipc.agent.removeCodeDir(dir).catch(() => {})
    void refreshDirs()
  }, [refreshDirs])

  const hasMessages = uiMessages.length > 0

  // CodeHome yalnız ilk iniş ekranı: aktif oturum yok VE taze oturum başlatılmadı.
  // '__new__' (taze) veya gerçek id → aşağıdaki sohbet + input görünümü açılır.
  if (!activeCodeSessionId) {
    return (
      <div className="code-chat flex flex-col h-full overflow-hidden bg-bg-primary">
        <div className="flex-1 overflow-y-auto px-8 pt-16 pb-8">
          <StatsDashboard userName={userName} />
        </div>

        {/* Workspace chip bar — primary (kilitli) · branch · ek dizinler */}
        <CodeWorkspaceBar
          workdir={workdir}
          repoName={repoName}
          branches={gitStore.branches}
          gitStatus={gitStore.status}
          onPickFolder={handlePickFolder}
          onCheckout={(b) => void gitStore.checkout(b)}
          extraDirs={extraDirs}
          onAddFolder={handleAddFolder}
          onRemoveDir={handleRemoveDir}
        />

        {/* Input */}
        <InputArea
          onSend={handleSend}
          onInterrupt={handleInterrupt}
          disabled={status === 'thinking' || !workdir}
          busy={status === 'thinking'}
          placeholder={!workdir ? 'Please select a folder (project) first to start the process...' : undefined}
          projectId={CODE_PROJECT_ID}
          variant="code"
        />
      </div>
    )
  }

  return (
    <div className="code-chat flex flex-col h-full overflow-hidden bg-bg-primary">
      {/* Header — minimal: başlık + repo. Geri/New yok (gezinme sol sidebardan). */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle flex-shrink-0 bg-bg-primary">
        <div className="flex items-center gap-2 min-w-0">
          <Code2 size={14} className="text-accent flex-shrink-0" />
          <span className="text-sm font-medium text-text-secondary truncate max-w-[360px]">
            {activeCodeSessionId === NEW_CODE_SESSION
              ? 'New Session'
              : (uiMessages[0]?.content?.slice(0, 60) || 'Code session')}
          </span>
          {repoName && (
            <span className="text-xs text-text-muted bg-bg-tertiary px-1.5 py-0.5 rounded-md font-mono border border-border-subtle ml-1 flex-shrink-0">
              {repoName}
            </span>
          )}
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
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
          {!hasMessages && (
            <div className="flex flex-col items-center justify-center pt-20 gap-4 text-center animate-fade-in">
              <div className="w-14 h-14 rounded-full bg-accent-subtle flex items-center justify-center ring-1 ring-accent/20">
                <Code2 size={24} className="text-accent" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-semibold text-text-primary brand-serif">New Code Session</h3>
                <p className="text-sm text-text-secondary max-w-xs leading-relaxed">
                  {workdir
                    ? `Working in ${repoName}. Describe a task and the agent will write, edit, and run code.`
                    : 'Pick a folder to start. The agent can read and edit files in your project.'}
                </p>
              </div>
              {!workdir && (
                <button
                  onClick={handlePickFolder}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium border border-border text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors"
                >
                  <FolderOpen size={13} /> Pick a folder
                </button>
              )}
            </div>
          )}

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

      {agentStore.qaPrompt && agentStore.qaPrompt.meta?.sessionId === activeCodeSessionId && (
        <AskUserPrompt
          payload={agentStore.qaPrompt}
          onSubmit={(ans) => agentStore.answerQaPrompt(ans)}
        />
      )}

      {/* Git status bar */}
      {gitStore.status && (
        <CodeGitBar
          workdir={workdir}
          repoName={repoName}
          gitStatus={gitStore.status}
          gitBranches={gitStore.branches}
          onRefresh={() => gitStore.refresh()}
          onCreatePR={handleCreatePR}
          loading={gitStore.loading}
          extraDirs={extraDirs}
          onAddFolder={handleAddFolder}
          onRemoveDir={handleRemoveDir}
        />
      )}

      {/* Input — model picker at the bottom, same pool as Code Home */}
      <InputArea
        onSend={handleSend}
        onInterrupt={handleInterrupt}
        disabled={status === 'thinking' && !(agentStore.qaPrompt && agentStore.qaPrompt.meta?.sessionId === activeCodeSessionId)}
        projectId={CODE_PROJECT_ID}
        variant="code"
      />
    </div>
  )
}

/* ── Code Workspace chip bar — primary (kilitli) · branch · ek dizinler ────── */
function CodeWorkspaceBar({
  workdir, repoName, branches, gitStatus, onPickFolder, onCheckout,
  extraDirs, onAddFolder, onRemoveDir,
}: {
  workdir: string | null
  repoName: string | null
  branches: import('../../lib/ipc').GitBranchInfo | null
  gitStatus: import('../../lib/ipc').GitStatus | null
  onPickFolder: () => void
  onCheckout: (branch: string) => void
  extraDirs: string[]
  onAddFolder: () => void
  onRemoveDir: (dir: string) => void
}) {
  const [menu, setMenu] = useState<null | 'branch'>(null)
  const currentBranch = gitStatus?.branch || branches?.current || null
  const close = () => setMenu(null)

  return (
    <div className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] text-text-muted flex-shrink-0 relative flex-wrap">
      {/* Primary workspace — yoksa seçtir, varsa kilitli göster */}
      {!workdir ? (
        <Chip icon={<FolderOpen size={12} />} label="Open folder" onClick={onPickFolder} />
      ) : (
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-text-secondary cursor-default"
          title={workdir}
        >
          <FolderOpen size={12} className="text-text-muted" />
          <span className="font-medium truncate max-w-[140px]">{repoName}</span>
        </div>
      )}

      {/* Branch (kilitli değil — dallar arası geçiş serbest) */}
      {currentBranch && (
        <div className="relative">
          <Chip
            icon={<GitBranch size={12} />}
            label={currentBranch}
            onClick={() => setMenu((m) => (m === 'branch' ? null : 'branch'))}
            active={menu === 'branch'}
          />
          {menu === 'branch' && branches && (
            <>
              <div className="fixed inset-0 z-40" onClick={close} />
              <div className="absolute bottom-full left-0 mb-1.5 z-50 w-56 max-h-72 overflow-y-auto bg-bg-secondary border border-border rounded-xl shadow-pop p-1 animate-slide-up">
                {branches.local.map((b) => (
                  <button
                    key={b}
                    onClick={() => { close(); if (b !== currentBranch) onCheckout(b) }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-bg-hover transition-colors"
                  >
                    <span className="truncate text-xs text-text-primary font-mono">{b}</span>
                    {b === currentBranch && <Check size={12} className="ml-auto text-accent flex-shrink-0" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Ek çalışma dizinleri + ekle */}
      {workdir && (
        <ExtraDirsChips extraDirs={extraDirs} onAddFolder={onAddFolder} onRemoveDir={onRemoveDir} />
      )}
    </div>
  )
}

/* ── Ek dizin chip'leri (ana workspace dışında agent'ın eriştiği klasörler) ── */
function ExtraDirsChips({
  extraDirs, onAddFolder, onRemoveDir,
}: {
  extraDirs: string[]
  onAddFolder: () => void
  onRemoveDir: (dir: string) => void
}) {
  return (
    <>
      {extraDirs.map((d) => (
        <div
          key={d}
          className="flex items-center gap-1 pl-2 pr-1 py-1 rounded-md bg-bg-tertiary border border-border-subtle text-text-secondary"
          title={d}
        >
          <FolderOpen size={11} className="text-text-muted flex-shrink-0" />
          <span className="font-medium truncate max-w-[120px]">{d.split('/').pop()}</span>
          <button
            onClick={() => onRemoveDir(d)}
            className="ml-0.5 p-0.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors flex-shrink-0"
            title="Remove folder"
          >
            <X size={10} />
          </button>
        </div>
      ))}
      <button
        onClick={onAddFolder}
        title="Add another folder the agent can work in"
        className="flex items-center gap-1 px-1.5 py-1 rounded-md text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-colors"
      >
        <Plus size={12} />
        <span className="font-medium">Add folder</span>
      </button>
    </>
  )
}

function Chip({ icon, label, onClick, active }: { icon: React.ReactNode; label: string; onClick?: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors ${
        onClick ? 'hover:bg-bg-hover hover:text-text-secondary cursor-pointer' : 'cursor-default'
      } ${active ? 'bg-bg-hover text-text-secondary' : ''}`}
    >
      <span className="text-text-muted">{icon}</span>
      <span className="font-medium truncate max-w-[140px]">{label}</span>
    </button>
  )
}

/* ── Git status bar — sessions içindeki alt git çubuğu ───────────────────── */
function CodeGitBar({
  workdir, repoName, gitStatus, gitBranches, onRefresh, onCreatePR, loading,
  extraDirs, onAddFolder, onRemoveDir,
}: {
  workdir: string | null
  repoName: string | null
  gitStatus: any
  gitBranches: any
  onRefresh: () => void
  onCreatePR: (kind?: 'pr' | 'draft') => void
  loading: boolean
  extraDirs: string[]
  onAddFolder: () => void
  onRemoveDir: (dir: string) => void
}) {
  const stagedCount   = (gitStatus?.files ?? []).filter((f: any) => f.staged).length
  const unstagedCount = (gitStatus?.files ?? []).filter((f: any) => f.unstaged).length
  const [prMenuOpen, setPrMenuOpen] = useState(false)

  // Manuel yol: GitHub compare sayfasını tarayıcıda aç (agent yerine kullanıcı).
  async function openPRManually() {
    if (!workdir) return
    const url = await ipc.git.prUrl(workdir)
    if (url) await ipc.fs.openExternal(url)
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-t border-border-subtle bg-bg-primary text-[11px] text-text-muted flex-shrink-0 z-10 flex-wrap">
      {/* Folder / repo — primary kilitli (sadece gösterim) */}
      <div
        className="flex items-center gap-1.5 py-0.5 cursor-default"
        title={workdir ?? 'No folder'}
      >
        <FolderOpen size={13} className="text-text-muted" />
        <span className="font-mono truncate max-w-[150px] font-medium">{repoName ?? 'No folder'}</span>
      </div>

      {gitStatus?.branch && (
        <>
          <span className="text-border-subtle mx-0.5">│</span>
          <div className="flex items-center gap-1.5 py-0.5">
            <GitBranch size={13} className="text-text-muted flex-shrink-0" />
            <span className="font-mono font-medium text-text-secondary">{gitStatus.branch}</span>
            {gitStatus.ahead > 0 && <span className="text-accent font-medium ml-1">↑{gitStatus.ahead}</span>}
            {gitStatus.behind > 0 && <span className="text-amber-500 font-medium ml-1">↓{gitStatus.behind}</span>}
          </div>
        </>
      )}

      {!gitStatus?.clean && (gitStatus?.files?.length > 0) && (
        <>
          <span className="text-border-subtle mx-0.5">│</span>
          <div className="flex items-center gap-1.5 py-0.5 font-medium">
            <span className="text-text-secondary" title={`${stagedCount} staged, ${unstagedCount} unstaged`}>
              {gitStatus.files.length} {gitStatus.files.length === 1 ? 'file' : 'files'}
            </span>
            {((gitStatus.additions || 0) > 0 || (gitStatus.deletions || 0) > 0) && (
              <span className="text-text-muted/40 font-normal">|</span>
            )}
            {(gitStatus.additions || 0) > 0 && (
              <span className="text-emerald-500" title={`${gitStatus.additions} insertions`}>+{gitStatus.additions}</span>
            )}
            {(gitStatus.deletions || 0) > 0 && (
              <span className="text-rose-500" title={`${gitStatus.deletions} deletions`}>-{gitStatus.deletions}</span>
            )}
          </div>
        </>
      )}

      {/* Ek çalışma dizinleri + ekle */}
      {workdir && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <ExtraDirsChips extraDirs={extraDirs} onAddFolder={onAddFolder} onRemoveDir={onRemoveDir} />
        </div>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        <button
          onClick={onRefresh}
          title="Refresh git status"
          className="p-1 rounded hover:bg-bg-hover hover:text-text-primary transition-colors"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>

        {gitStatus?.branch && (
          <div className="relative ml-1">
            <button
              onClick={() => setPrMenuOpen(o => !o)}
              title="Create a Pull Request (agent stages, commits, pushes & opens it)"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-bg-tertiary border border-border-subtle text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors font-medium"
            >
              <GitPullRequest size={12} />
              <span>Create PR</span>
              <ChevronDown size={11} className={`opacity-60 ml-0.5 transition-transform ${prMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {prMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setPrMenuOpen(false)} />
                <div className="absolute bottom-full right-0 mb-1.5 z-50 w-52 bg-bg-secondary border border-border rounded-xl shadow-pop p-1 animate-slide-up">
                  <PrMenuItem
                    label="Create PR"
                    hint="Agent commits, pushes & opens"
                    onClick={() => { setPrMenuOpen(false); onCreatePR('pr') }}
                  />
                  <PrMenuItem
                    label="Create draft PR"
                    hint="Same, opened as draft"
                    onClick={() => { setPrMenuOpen(false); onCreatePR('draft') }}
                  />
                  <PrMenuItem
                    label="Manually create…"
                    hint="Open compare page in browser"
                    onClick={() => { setPrMenuOpen(false); void openPRManually() }}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function PrMenuItem({ label, hint, onClick }: { label: string; hint: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex flex-col items-start gap-0.5 px-2.5 py-1.5 rounded-lg text-left hover:bg-bg-hover transition-colors"
    >
      <span className="text-xs font-medium text-text-primary">{label}</span>
      <span className="text-[10px] text-text-muted">{hint}</span>
    </button>
  )
}
