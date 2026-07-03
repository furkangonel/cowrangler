import { create } from 'zustand'
import { ipc, DesignFrame, DesignProjectRecord, DesignTemplateType, DesignSystemRecord, DesignMeta, DesignTweak, DesignKind, DesignDevice } from '../lib/ipc'

export type { DesignTemplateType, DesignFrame, DesignProjectRecord, DesignSystemRecord, DesignMeta, DesignTweak, DesignKind, DesignDevice }

type TweakVal = string | number | boolean

export interface DesignActivity {
  id: string
  name: string
  detail?: string
  status: 'start' | 'done' | 'error'
  durationMs?: number
}

export interface DesignChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  /** Live, stacked tool activity for this assistant turn. */
  activity?: DesignActivity[]
  /** Model'in bu tur için "thinking" (reasoning) çıktısı — accordion'da gösterilir. */
  reasoning?: string
}

/** A saved snapshot of the project's screens, taken before an agent edit. */
export interface DesignCheckpoint {
  id: string
  label: string
  createdAt: number
  fileCount: number
  /** true = created automatically before an agent turn; false = user "Save version". */
  auto: boolean
}

/** An element the user clicked in inspect mode, used to build a targeted prompt. */
export interface InspectorPick {
  filePath: string
  selector: string
  tag: string
  text: string
  w: number
  h: number
}

/** One accessibility finding from the in-iframe scan. */
export interface A11yIssue {
  type: 'contrast' | 'touch'
  severity: 'error' | 'warn'
  selector: string
  detail: string
}

/** Friendly one-line summary of a tool call for the activity feed. */
export function summarizeTool(name: string, args: Record<string, any> = {}): string {
  const base = (p?: string) => (p ? String(p).split('/').pop() : undefined)
  switch (name) {
    case 'write_file':
    case 'create_file':
    case 'edit_file':
    case 'str_replace':
    case 'apply_patch':
      return base(args.path || args.file_path || args.filePath || args.file) || ''
    case 'read_file':
      return base(args.path || args.file_path || args.filePath) || ''
    case 'web_search':
    case 'search':
      return args.query || args.q || ''
    case 'run_command':
    case 'bash':
    case 'terminal':
      return (args.command || args.cmd || '').slice(0, 48)
    case 'ask_user':
      return 'waiting for you'
    default: {
      const v = args.path || args.file_path || args.query || args.name || args.title
      return v ? String(v).split('/').pop()! : ''
    }
  }
}

/**
 * DB satırlarını ekran mesajlarına çevirir. `reasoning` rolündeki satırlar
 * (agent bunları ilgili assistant metninden ÖNCE yazar) bir sonraki assistant
 * mesajına iliştirilir; böylece geçmiş açıldığında "Thought Process" accordion'u
 * geri gelir.
 */
function restoreDesignMessages(msgs: any[]): DesignChatMessage[] {
  const out: DesignChatMessage[] = []
  let pendingReasoning = ''
  for (const m of msgs) {
    if (m.role === 'reasoning') {
      pendingReasoning += (pendingReasoning ? '\n' : '') + (m.content ?? '')
      continue
    }
    if (m.role === 'user' || m.role === 'assistant') {
      out.push({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        ...(m.role === 'assistant' && pendingReasoning ? { reasoning: pendingReasoning } : {}),
      })
      if (m.role === 'assistant') pendingReasoning = ''
    }
  }
  return out
}

interface DesignState {
  // Projects
  projects: DesignProjectRecord[]
  activeProject: DesignProjectRecord | null
  loadingProjects: boolean

  // Design systems
  systems: DesignSystemRecord[]
  loadSystems: () => Promise<void>
  createSystem: (data: { name: string; blurb?: string; notes?: string }) => Promise<DesignSystemRecord>
  deleteSystem: (id: string) => Promise<void>

  // Canvas
  frames: DesignFrame[]
  canvasScale: number
  canvasOffsetX: number
  canvasOffsetY: number
  /** Bumped whenever screen files may have changed on disk, so previews reload. */
  refreshTick: number

  // Tweaks — live, per-screen overrides applied to the rendered iframe.
  tweaksOn: boolean
  /** Live tweak values keyed by filePath → tweak id → value. */
  tweakValues: Record<string, Record<string, TweakVal>>
  setTweaksOn: (on: boolean) => void
  setTweakValue: (filePath: string, id: string, value: TweakVal) => void
  resetTweaks: (filePath: string) => void
  persistTweaks: (filePath: string) => Promise<void>

  // Chat
  messages: DesignChatMessage[]
  chatLoading: boolean
  sessions: any[]
  sessionId: string | null
  streamingText: string
  /** Inline ask_user prompt payload while the agent is paused for a decision. */
  qaPrompt: any | null
  /** First message to auto-send when the editor opens (set from the home composer). */
  pendingMessage: { text: string; model?: string } | null

  // Actions — projects
  loadProjects: () => Promise<void>
  createProject: (name: string, type: DesignTemplateType, designSystemId?: string) => Promise<DesignProjectRecord>
  setActiveProject: (project: DesignProjectRecord | null) => void
  deleteProject: (id: string) => Promise<void>
  renameProject: (id: string, name: string) => Promise<void>

  // Actions — canvas
  loadCanvas: (projectId: string) => Promise<void>
  updateFramePosition: (id: string, x: number, y: number) => void
  updateFrameSize: (id: string, width: number, height: number) => void
  saveCanvas: (projectId: string) => Promise<void>
  scanAndMergeScreens: (projectId: string) => Promise<void>
  setCanvasView: (scale: number, offsetX: number, offsetY: number) => void
  setRefreshTick: () => void

  // Version history (checkpoints)
  checkpoints: DesignCheckpoint[]
  loadCheckpoints: (projectId: string) => Promise<void>
  saveCheckpoint: (projectId: string, label?: string, auto?: boolean) => Promise<void>
  restoreCheckpoint: (projectId: string, checkpointId: string) => Promise<void>

  // Element inspector (click-to-edit)
  inspectMode: boolean
  inspectorPick: InspectorPick | null
  setInspectMode: (on: boolean) => void
  setInspectorPick: (pick: InspectorPick | null) => void

  // Accessibility scan results, keyed by filePath.
  a11yResults: Record<string, A11yIssue[]>
  a11yRunning: boolean
  /** Bumped to ask the iframe for `filePath` to run a scan (nonce forces re-fire). */
  a11yRequest: { filePath: string; nonce: number } | null
  requestA11y: (filePath: string) => void
  setA11yResult: (filePath: string, issues: A11yIssue[]) => void
  setA11yRunning: (on: boolean) => void
  clearA11y: (filePath?: string) => void

  // Actions — chat
  sendMessage: (message: string, model?: string) => Promise<void>
  interruptChat: () => Promise<void>
  answerQa: (answer: string) => Promise<void>
  /** Restore the project's most recent session (messages + sessionId) from disk. */
  loadHistory: (projectId: string) => Promise<void>
  switchSession: (sessionId: string) => Promise<void>
  clearChat: () => void
  setPending: (p: { text: string; model?: string } | null) => void
}

let removeListeners: (() => void) | null = null

function cleanup() {
  if (removeListeners) {
    removeListeners()
    removeListeners = null
  }
}

export const useDesignStore = create<DesignState>((set, get) => ({
  projects: [],
  activeProject: null,
  loadingProjects: false,
  systems: [],
  frames: [],
  canvasScale: 1,
  canvasOffsetX: 0,
  canvasOffsetY: 0,
  refreshTick: 0,
  tweaksOn: false,
  tweakValues: {},
  messages: [],
  sessions: [],
  chatLoading: false,
  sessionId: null,
  streamingText: '',
  qaPrompt: null,
  pendingMessage: null,
  checkpoints: [],
  inspectMode: false,
  inspectorPick: null,
  a11yResults: {},
  a11yRunning: false,
  a11yRequest: null,

  setPending: (p) => set({ pendingMessage: p }),

  // ── Projects ────────────────────────────────────────────────────────────────

  loadProjects: async () => {
    set({ loadingProjects: true })
    try {
      const projects = await ipc.design.listProjects()
      set({ projects, loadingProjects: false })
    } catch (e) {
      console.error('[design] loadProjects failed', e)
      set({ loadingProjects: false })
    }
  },

  createProject: async (name, type, designSystemId) => {
    const project = await ipc.design.createProject({ name, type, designSystemId })
    set(s => ({ projects: [project, ...s.projects] }))
    return project
  },

  loadSystems: async () => {
    try { set({ systems: await ipc.design.listSystems() }) } catch {}
  },
  createSystem: async (data) => {
    const sys = await ipc.design.createSystem(data)
    set(s => ({ systems: [sys, ...s.systems] }))
    return sys
  },
  deleteSystem: async (id) => {
    await ipc.design.deleteSystem(id)
    set(s => ({ systems: s.systems.filter(x => x.id !== id) }))
  },

  setActiveProject: (project) => {
    cleanup()
    set({
      activeProject: project,
      frames: [],
      messages: [],
      sessions: [],
      chatLoading: false,
      sessionId: null,
      streamingText: '',
      qaPrompt: null,
      canvasScale: 1,
      canvasOffsetX: 0,
      canvasOffsetY: 0,
      tweaksOn: false,
      tweakValues: {},
      checkpoints: [],
      inspectMode: false,
      inspectorPick: null,
      a11yResults: {},
      a11yRunning: false,
      a11yRequest: null,
    })
  },

  deleteProject: async (id) => {
    await ipc.design.deleteProject(id)
    set(s => ({
      projects: s.projects.filter(p => p.id !== id),
      activeProject: s.activeProject?.id === id ? null : s.activeProject,
    }))
  },

  renameProject: async (id, name) => {
    await ipc.design.renameProject({ projectId: id, name })
    set(s => ({
      projects: s.projects.map(p => p.id === id ? { ...p, name } : p),
      activeProject: s.activeProject?.id === id ? { ...s.activeProject!, name } : s.activeProject,
    }))
  },

  // ── Canvas ──────────────────────────────────────────────────────────────────

  loadCanvas: async (projectId) => {
    const canvas = await ipc.design.getCanvas(projectId)
    set({ frames: canvas.frames ?? [] })
    // Also scan for any new screens already present
    await get().scanAndMergeScreens(projectId)
    set(s => ({ refreshTick: s.refreshTick + 1 }))
  },

  updateFramePosition: (id, x, y) => {
    set(s => ({
      frames: s.frames.map(f => f.id === id ? { ...f, x, y } : f)
    }))
  },

  updateFrameSize: (id, width, height) => {
    set(s => ({
      frames: s.frames.map(f => f.id === id ? { ...f, width, height } : f)
    }))
  },

  saveCanvas: async (projectId) => {
    const { frames } = get()
    await ipc.design.saveCanvas({ projectId, frames })
  },

  scanAndMergeScreens: async (projectId) => {
    const screens = await ipc.design.scanScreens(projectId)
    const byPath = new Map(screens.map(s => [s.filePath, s]))
    const { frames } = get()
    const existingPaths = new Set(frames.map(f => f.filePath))

    // Natural default frame footprint per device target.
    const footprint = (s: { kind?: string; meta?: any }) => {
      const dev = s.meta?.device
      if (dev === 'mobile') return { width: 300, height: 620 }
      if (dev === 'tablet') return { width: 460, height: 620 }
      return { width: 460, height: 320 }
    }

    const newScreens = screens.filter(s => !existingPaths.has(s.filePath))
    const newFrames: DesignFrame[] = newScreens.map((s, i) => {
      const fp = footprint(s)
      const col = (frames.length + i) % 3
      return {
        id: `frame_${Date.now()}_${i}`,
        name: s.name,
        filePath: s.filePath,
        x: 40 + col * 520,
        y: 40 + Math.floor((frames.length + i) / 3) * 700,
        width: fp.width,
        height: fp.height,
        kind: s.kind,
        meta: s.meta ?? null,
      }
    })

    // Refresh kind/meta on already-placed frames (the agent may have rewritten
    // a screen or its manifest), and drop frames whose file disappeared.
    set(s => {
      const merged = [...s.frames, ...newFrames]
        .filter(f => byPath.has(f.filePath))
        .map(f => {
          const sc = byPath.get(f.filePath)!
          const dev = sc.meta?.device
          let nextW = f.width
          let nextH = f.height
          // Auto-resize if it's set to mobile but has the default fallback values
          if (dev === 'mobile' && (f.width === 460 || f.height === 320 || !f.meta?.device)) {
            nextW = 300
            nextH = 620
          } else if (dev === 'tablet' && (f.width === 460 && f.height === 320)) {
            nextW = 460
            nextH = 620
          }
          return {
            ...f,
            kind: sc.kind ?? f.kind,
            meta: sc.meta ?? f.meta ?? null,
            width: nextW,
            height: nextH
          }
        })
      // Seed tweak defaults for any screen we haven't tracked yet.
      const tv = { ...s.tweakValues }
      for (const sc of screens) {
        const tweaks = sc.meta?.tweaks ?? []
        if (!tweaks.length) continue
        const cur = tv[sc.filePath] ?? {}
        const seeded: Record<string, TweakVal> = { ...cur }
        for (const t of tweaks) {
          if (seeded[t.id] === undefined) {
            seeded[t.id] = (sc.meta?.values?.[t.id] ?? t.default) as TweakVal
          }
        }
        tv[sc.filePath] = seeded
      }
      return { frames: merged, tweakValues: tv }
    })
    await get().saveCanvas(projectId)
  },

  setCanvasView: (scale, offsetX, offsetY) => {
    set({ canvasScale: scale, canvasOffsetX: offsetX, canvasOffsetY: offsetY })
  },

  setRefreshTick: () => set(s => ({ refreshTick: s.refreshTick + 1 })),

  // ── Version history (checkpoints) ────────────────────────────────────────────
  loadCheckpoints: async (projectId) => {
    try { set({ checkpoints: await ipc.design.listCheckpoints(projectId) }) }
    catch (e) { console.error('[design] loadCheckpoints failed', e) }
  },

  saveCheckpoint: async (projectId, label, auto = false) => {
    try {
      const res = await ipc.design.createCheckpoint({ projectId, label, auto })
      if (res?.ok) set({ checkpoints: await ipc.design.listCheckpoints(projectId) })
    } catch (e) { console.error('[design] saveCheckpoint failed', e) }
  },

  restoreCheckpoint: async (projectId, checkpointId) => {
    try {
      await ipc.design.restoreCheckpoint({ projectId, checkpointId })
      // Re-sync canvas + force previews to reload from the restored files.
      await get().loadCanvas(projectId)
      set(s => ({ refreshTick: s.refreshTick + 1 }))
    } catch (e) { console.error('[design] restoreCheckpoint failed', e) }
  },

  // ── Element inspector ─────────────────────────────────────────────────────────
  setInspectMode: (on) => set({ inspectMode: on, inspectorPick: on ? get().inspectorPick : null }),
  setInspectorPick: (pick) => set({ inspectorPick: pick }),

  // ── Accessibility ──────────────────────────────────────────────────────────────
  requestA11y: (filePath) => set(s => ({ a11yRunning: true, a11yRequest: { filePath, nonce: (s.a11yRequest?.nonce ?? 0) + 1 } })),
  setA11yResult: (filePath, issues) => set(s => ({ a11yResults: { ...s.a11yResults, [filePath]: issues }, a11yRunning: false })),
  setA11yRunning: (on) => set({ a11yRunning: on }),
  clearA11y: (filePath) => set(s => {
    if (!filePath) return { a11yResults: {} }
    const next = { ...s.a11yResults }; delete next[filePath]; return { a11yResults: next }
  }),

  // ── Tweaks ──────────────────────────────────────────────────────────────────
  setTweaksOn: (on) => set({ tweaksOn: on }),

  setTweakValue: (filePath, id, value) => set(s => ({
    tweakValues: { ...s.tweakValues, [filePath]: { ...(s.tweakValues[filePath] ?? {}), [id]: value } },
  })),

  resetTweaks: (filePath) => set(s => {
    const frame = s.frames.find(f => f.filePath === filePath)
    const defaults: Record<string, TweakVal> = {}
    for (const t of frame?.meta?.tweaks ?? []) defaults[t.id] = t.default as TweakVal
    return { tweakValues: { ...s.tweakValues, [filePath]: defaults } }
  }),

  persistTweaks: async (filePath) => {
    const { frames, tweakValues } = get()
    const frame = frames.find(f => f.filePath === filePath)
    if (!frame?.meta) return
    const meta = { ...frame.meta, values: tweakValues[filePath] ?? {} }
    await ipc.design.saveMeta({ screenPath: filePath, meta })
  },

  // ── Chat ────────────────────────────────────────────────────────────────────

  sendMessage: async (message, model) => {
    const { activeProject, sessionId } = get()
    if (!activeProject || get().chatLoading) return

    const msgId = `msg_${Date.now()}`
    set(s => ({
      messages: [...s.messages, { id: msgId, role: 'user', content: message }],
      chatLoading: true,
      streamingText: '',
    }))

    // Auto-snapshot before the agent edits, so any turn can be rolled back. Skipped
    // silently when there are no screens yet (nothing to protect).
    if (get().frames.length > 0) {
      const label = message.trim().slice(0, 60) || 'Before edit'
      get().saveCheckpoint(activeProject.id, label, true).catch(() => {})
    }

    // Poll for new HTML files while agent works
    let pollInterval: ReturnType<typeof setInterval> | null = null
    let streamBuffer = ''
    let reasoningBuffer = ''
    let assistantMsgId = `amsg_${Date.now()}`

    // Pre-add streaming assistant message
    set(s => ({
      messages: [...s.messages, { id: assistantMsgId, role: 'assistant', content: '', streaming: true }]
    }))

    cleanup()

    const removeDone = ipc.agent.onDone((result) => {
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null }
      const finalText = streamBuffer || result.text || 'Done.'
      set(s => ({
        messages: s.messages.map(m =>
          m.id === assistantMsgId ? { ...m, content: finalText, streaming: false } : m
        ),
        chatLoading: false,
        streamingText: '',
        qaPrompt: null,
        sessionId: result.sessionId ?? s.sessionId,
      }))
      // Final scan + save + force preview reload (existing files may have changed)
      get().scanAndMergeScreens(activeProject.id).then(() => {
        get().saveCanvas(activeProject.id)
        set(s => ({ refreshTick: s.refreshTick + 1 }))
      })
    })

    const removeError = ipc.agent.onError((err) => {
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null }
      set(s => ({
        messages: s.messages.map(m =>
          m.id === assistantMsgId ? { ...m, content: `Error: ${err}`, streaming: false } : m
        ),
        chatLoading: false,
        streamingText: '',
        qaPrompt: null,
      }))
    })

    const removeInterrupted = ipc.agent.onInterrupted(() => {
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null }
      set(s => ({
        messages: s.messages.map(m =>
          m.id === assistantMsgId ? { ...m, content: streamBuffer || '(interrupted)', streaming: false } : m
        ),
        chatLoading: false,
        streamingText: '',
        qaPrompt: null,
        refreshTick: s.refreshTick + 1,
      }))
      get().scanAndMergeScreens(activeProject.id)
    })

    const removeQa = ipc.agent.onQaPrompt((payload: any) => {
      if (payload?.meta?.sessionId) {
        if (payload.meta.sessionId !== sessionId) {
          return;
        }
      }
      set({ qaPrompt: payload })
    })

    const removeStepText = ipc.agent.onStepText((text) => {
      streamBuffer = text
      set(s => ({
        messages: s.messages.map(m =>
          m.id === assistantMsgId ? { ...m, content: text } : m
        ),
        streamingText: text,
      }))
    })

    // Reasoning delta olarak gelir → biriktirip mesaja yaz (accordion canlı akar).
    const removeReasoning = ipc.agent.onReasoningText((delta) => {
      reasoningBuffer += delta
      set(s => ({
        messages: s.messages.map(m =>
          m.id === assistantMsgId ? { ...m, reasoning: reasoningBuffer } : m
        ),
      }))
    })

    // Stack each tool call as a live activity row (append, never overwrite).
    const removeTool = ipc.agent.onToolCall((ev) => {
      const key = ev.id ?? `${ev.name}_${ev.timestamp}`
      set(s => ({
        messages: s.messages.map(m => {
          if (m.id !== assistantMsgId) return m
          const list = m.activity ? [...m.activity] : []
          const i = list.findIndex(a => a.id === key)
          const next: DesignActivity = {
            id: key,
            name: ev.name,
            detail: summarizeTool(ev.name, ev.args),
            status: ev.status,
            durationMs: ev.durationMs,
          }
          if (i >= 0) list[i] = { ...list[i], ...next }
          else list.push(next)
          return { ...m, activity: list }
        }),
      }))
      // New screens may have just been written — refresh promptly.
      if (ev.status === 'done') {
        get().scanAndMergeScreens(activeProject.id).then(() => {
          set(s => ({ refreshTick: s.refreshTick + 1 }))
        })
      }
    })

    removeListeners = () => {
      removeDone()
      removeError()
      removeInterrupted()
      removeStepText()
      removeReasoning()
      removeTool()
      removeQa()
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null }
    }

    // Poll every 2s for new HTML files
    pollInterval = setInterval(() => {
      get().scanAndMergeScreens(activeProject.id).then(() => {
        set(s => ({ refreshTick: s.refreshTick + 1 }))
      })
    }, 2000)

    try {
      await ipc.agent.chat(activeProject.id, sessionId, message, model)
    } catch (e: any) {
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null }
      set(s => ({
        messages: s.messages.map(m =>
          m.id === assistantMsgId ? { ...m, content: `Error: ${e.message}`, streaming: false } : m
        ),
        chatLoading: false,
        streamingText: '',
      }))
      cleanup()
    }
  },

  interruptChat: async () => {
    const { activeProject } = get()
    if (!activeProject) return
    // Clear any open prompt immediately so the UI feels responsive; the agent
    // loop unblocks via cancelPendingAskUser on the main side.
    set({ qaPrompt: null })
    await ipc.agent.interrupt(activeProject.id)
  },

  answerQa: async (answer) => {
    set({ qaPrompt: null })
    await ipc.agent.answerQuestion(answer)
  },

  // Restore the most recent session for a project so reopening it shows the
  // prior conversation (mirrors the main app). The in-memory agent — kept per
  // project in the main process — already retains context across switches; this
  // just rehydrates the on-screen transcript.
  loadHistory: async (projectId) => {
    // Never clobber an in-flight chat or a queued auto-send from the home screen.
    if (get().chatLoading || get().pendingMessage) return
    try {
      const sessions = await ipc.sessions.list(projectId)
      // Still on the same project, nothing started meanwhile?
      if (get().activeProject?.id !== projectId || get().chatLoading || get().pendingMessage) return
      set({ sessions })
      const latest = sessions[0]  // sessions:list is sorted by started_at desc
      if (!latest) { set({ messages: [], sessionId: null }); return }
      const msgs = await ipc.sessions.messages(latest.id)
      if (get().activeProject?.id !== projectId || get().chatLoading || get().pendingMessage) return
      const restored = restoreDesignMessages(msgs)
      set({ messages: restored, sessionId: latest.id })
    } catch (e) {
      console.error('[design] loadHistory failed', e)
    }
  },

  switchSession: async (sessionId) => {
    if (get().chatLoading) return
    try {
      const msgs = await ipc.sessions.messages(sessionId)
      const restored = restoreDesignMessages(msgs)
      set({ messages: restored, sessionId })
    } catch (e) {
      console.error('[design] switchSession failed', e)
    }
  },

  clearChat: () => {
    const pid = get().activeProject?.id
    cleanup()
    set({ messages: [], chatLoading: false, sessionId: null, streamingText: '', qaPrompt: null })
    // Start a genuinely fresh session: drop the in-memory agent so the next
    // message begins a new session with no carried-over context.
    if (pid) ipc.agent.newSession(pid).catch(() => {})
  },
}))
