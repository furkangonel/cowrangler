/**
 * Tip-safe IPC yüzeyi — window.electronAPI'nin TypeScript sarmalayıcısı.
 * Renderer'ın tüm IPC çağrıları bu dosya üzerinden geçer.
 */

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export interface TaskProgress {
  id: string
  text: string
  status: 'pending' | 'in_progress' | 'completed'
}

export type UpdateStatus =
  | { state: 'checking' }
  | { state: 'available'; version: string; notes?: string }
  | { state: 'not-available'; version: string }
  | { state: 'progress'; percent: number; transferred: number; total: number; bytesPerSecond: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }

export interface ToolCallEvent {
  id?: string
  name: string
  args: Record<string, any>
  status: 'start' | 'done' | 'error'
  durationMs?: number
  timestamp: number
  result?: any
  error?: string
}

export interface AgentDoneResult {
  text: string
  inputTokens: number
  outputTokens: number
  toolCallCount: number
  durationMs: number
  sessionId: string | null
}

export interface ProjectRecord {
  id: string
  name: string
  description: string | null
  workdir: string | null
  icon: string
  color: string
  created_at: number
  updated_at: number
  pinned: number
  archived: number
}

export interface ProjectSummary extends ProjectRecord {
  folder_count: number
  session_count: number
  last_session_at: number | null
  instructions: string | null
}

export interface ProjectFolder {
  id: string
  project_id: string
  folder_path: string
  label: string | null
  added_at: number
}

export interface SessionRecord {
  id: string
  source: string
  model: string
  started_at: number
  ended_at: number | null
  message_count: number
  tool_call_count: number
  input_tokens: number
  output_tokens: number
  estimated_cost_usd: number
  title: string | null
  workdir: string | null
  parent_session_id: string | null
  pinned: number
}

export interface MessageRecord {
  id: string
  session_id: string
  role: string
  content: string
  tool_name: string | null
  tool_call_id: string | null
  token_count: number
  timestamp: number
}

export interface ContextSnapshot {
  // Fields from co-wrangler context_engine.ts
  sessionInputTokens: number
  sessionOutputTokens: number
  sessionTotalTokens: number
  contextTokens: number
  contextWindowSize: number        // max context tokens
  contextUsagePercent: number
  compressionCount: number
  lastRoundDurationMs: number
  sessionDurationMs: number
  cacheReadTokens: number
  cacheWriteTokens: number
  // Added by agent.ipc.ts
  model?: string
  maxContextTokens?: number       // alias for contextWindowSize
}

export interface ApiKeyInfo {
  id: string
  label: string
  envKey: string
  prefix: string
  value: string
  set: boolean
}

export interface ModelInfo {
  provider: string
  id: string
  label: string
  contextK: number
  available: boolean
}

/** Streamed during a subscription-OAuth login (device code, progress, result). */
export interface OAuthLoginEvent {
  id: string
  type: 'auth' | 'progress' | 'done' | 'error'
  url?: string
  instructions?: string
  message?: string
  error?: string
  seeded?: string[]
}

export interface SkillDef {
  id: string
  name: string
  description: string
  source: 'bundled' | 'global' | 'local'
  content: string
  active?: boolean
}

export interface MCPServerInfo {
  name: string
  type: 'stdio' | 'http' | 'sse'
  command?: string
  args?: string[]
  url?: string
  timeout?: number
  status: 'connected' | 'disconnected' | 'unknown' | 'error'
  /** Live runtime signal (added by mcp:list) */
  toolCount?: number
  error?: string
}

export interface ConnectorCatalogInfo {
  id: string
  name: string
  description: string
  category: string
  transport: 'stdio' | 'http' | 'sse'
  auth: 'none' | 'apikey' | 'token' | 'oauth'
  popular?: number
  /** Brand logo URL shown on the card; falls back to the category icon. */
  logo?: string
  requiresPathArg?: boolean
  authFields?: { envKey: string; label: string; hint?: string }[]
  /** Configured in config.yaml (the user added it) */
  connected: boolean
  /** Actually connected at runtime and tools discovered */
  live?: boolean
  toolCount?: number
  error?: string
  /** OAuth connectors: vault holds valid tokens */
  authorized?: boolean
  
  // Extra metadata
  author?: string
  repoUrl?: string
  docsUrl?: string
  supportUrl?: string
  privacyUrl?: string
  capabilities?: string[]
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  size?: number
  mtime?: number
}

export interface OutputFile {
  name: string
  path: string
  ext: string
  mtime: number
}

export type DesignTemplateType = string

export interface DesignProjectRecord extends ProjectRecord {
  designType: DesignTemplateType
}

export interface DesignSystemRecord {
  id: string
  name: string
  blurb: string
  notes: string
  createdAt: number
}

export type DesignKind = 'html' | 'jsx' | 'svg' | 'mermaid'
export type DesignDevice = 'mobile' | 'tablet' | 'desktop' | null

export interface DesignTweak {
  id: string
  label: string
  type: 'color' | 'range' | 'select' | 'toggle'
  var: string
  default?: string | number | boolean
  options?: string[]
  min?: number
  max?: number
  step?: number
  unit?: string
}

export interface DesignMeta {
  title?: string
  device?: DesignDevice
  tweaks?: DesignTweak[]
  /** User-applied tweak values, keyed by tweak id; persisted into the sidecar. */
  values?: Record<string, string | number | boolean>
}

export interface DesignFrame {
  id: string
  name: string
  filePath: string
  x: number
  y: number
  width: number
  height: number
  kind?: DesignKind
  meta?: DesignMeta | null
}

export interface DesignScreenFile {
  name: string
  filePath: string
  mtime: number
  kind?: DesignKind
  meta?: DesignMeta | null
}

export interface DesignCheckpoint {
  id: string
  label: string
  createdAt: number
  fileCount: number
  auto: boolean
}

export interface PlanStep {
  step: number
  description: string
  files?: string[]
  risk?: 'low' | 'medium' | 'high' | string
}

export interface PlanPayload {
  title: string
  summary: string
  steps: PlanStep[]
  estimated_duration?: string
  notes?: string
  markdown: string
  status: 'pending' | 'approved' | 'rejected' | 'modify'
  sessionId?: string | null
  createdAt: string
}

interface ElectronAPI {
  agent: {
    chat: (projectId: string, sessionId: string | null, message: string, model?: string) => Promise<void>
    interrupt: (projectId: string) => Promise<{ ok: boolean }>
    getContextSnapshot: (projectId: string) => Promise<ContextSnapshot | null>
    newSession: (projectId: string) => Promise<{ ok: boolean }>
    getTodo: (projectId: string, sessionId?: string) => Promise<TaskProgress[]>
    setActiveSession: (sessionId: string | null) => Promise<void>
    getPlan: (projectId: string, sessionId?: string) => Promise<PlanPayload | null>
    onToolCall: (cb: (data: ToolCallEvent) => void) => () => void
    onStepText: (cb: (text: string) => void) => () => void
    onReasoningText: (cb: (text: string) => void) => () => void
    onQaPrompt: (cb: (payload: any) => void) => () => void
    onPlan: (cb: (payload: PlanPayload) => void) => () => void
    answerQuestion: (answer: string) => Promise<{ ok: boolean }>
    onProgress: (cb: (tasks: TaskProgress[]) => void) => () => void
    onDone: (cb: (result: AgentDoneResult) => void) => () => void
    onError: (cb: (err: string) => void) => () => void
    onInterrupted: (cb: () => void) => () => void
    onApprovalRequest: (cb: (data: any) => void) => () => void
    removeAllListeners: () => void
  }
  projects: {
    list: () => Promise<ProjectSummary[]>
    create: (data: { name: string; description?: string; workdir?: string; icon?: string; color?: string }) => Promise<ProjectRecord>
    update: (id: string, data: any) => Promise<ProjectRecord>
    delete: (id: string) => Promise<{ ok: boolean }>
    get: (id: string) => Promise<ProjectRecord | null>
    addFolder: (id: string, folderPath: string) => Promise<ProjectFolder>
    removeFolder: (id: string, folderPath: string) => Promise<{ ok: boolean }>
    getFolders: (id: string) => Promise<ProjectFolder[]>
    getOutputs: (id: string) => Promise<OutputFile[]>
    getInstructions: (id: string) => Promise<string>
    setInstructions: (id: string, content: string) => Promise<{ ok: boolean }>
  }
  sessions: {
    list: (projectId: string) => Promise<SessionRecord[]>
    get: (sessionId: string) => Promise<SessionRecord | null>
    messages: (sessionId: string) => Promise<MessageRecord[]>
    search: (query: string, projectId?: string) => Promise<any[]>
    delete: (projectId: string, sessionId: string) => Promise<{ ok: boolean }>
    rename: (sessionId: string, title: string) => Promise<{ ok: boolean }>
    pin: (sessionId: string, pinned: boolean) => Promise<{ ok: boolean }>
  }
  settings: {
    get: () => Promise<Record<string, any>>
    set: (key: string, value: any) => Promise<{ ok: boolean }>
    getApiKeys: () => Promise<ApiKeyInfo[]>
    setApiKey: (provider: string, key: string) => Promise<{ ok: boolean; error?: string; models?: string[] }>
    removeApiKey: (provider: string) => Promise<{ ok: boolean }>
    getModels: (opts?: { refresh?: boolean }) => Promise<ModelInfo[]>
    savedModels: {
      list: () => Promise<string[]>
      add: (modelId: string, contextWindow?: number) => Promise<{ ok: boolean }>
      remove: (modelId: string) => Promise<{ ok: boolean }>
    }
    oauth: {
      list: () => Promise<{ id: string; name: string; connected: boolean }[]>
      login: (id: string) => Promise<{ ok: boolean; error?: string; seeded?: string[] }>
      logout: (id: string) => Promise<{ ok: boolean; error?: string }>
      onEvent: (cb: (e: OAuthLoginEvent) => void) => () => void
    }
  }
  design: {
    openWindow: () => Promise<{ ok: boolean }>
    createProject: (data: { name: string; type: string; designSystemId?: string }) => Promise<DesignProjectRecord>
    listProjects: () => Promise<DesignProjectRecord[]>
    listSystems: () => Promise<DesignSystemRecord[]>
    createSystem: (data: { name: string; blurb?: string; notes?: string }) => Promise<DesignSystemRecord>
    deleteSystem: (id: string) => Promise<{ ok: boolean }>
    attachSystem: (payload: { projectId: string; designSystemId: string | null }) => Promise<{ ok: boolean }>
    exportProject: (payload: { projectId: string; destDir: string }) => Promise<{ ok: boolean; count: number; dir?: string; error?: string }>
    getCanvas: (projectId: string) => Promise<{ frames: DesignFrame[] }>
    saveCanvas: (payload: { projectId: string; frames: DesignFrame[] }) => Promise<{ ok: boolean }>
    scanScreens: (projectId: string) => Promise<DesignScreenFile[]>
    readFile: (filePath: string) => Promise<{ content?: string; error?: string }>
    readMeta: (screenPath: string) => Promise<DesignMeta | null>
    saveMeta: (payload: { screenPath: string; meta: DesignMeta }) => Promise<{ ok: boolean; error?: string }>
    deleteProject: (projectId: string) => Promise<{ ok: boolean }>
    renameProject: (payload: { projectId: string; name: string }) => Promise<{ ok: boolean }>
    createCheckpoint: (payload: { projectId: string; label?: string; auto?: boolean }) => Promise<{ ok: boolean; id?: string; error?: string }>
    listCheckpoints: (projectId: string) => Promise<DesignCheckpoint[]>
    restoreCheckpoint: (payload: { projectId: string; checkpointId: string }) => Promise<{ ok: boolean; error?: string }>
  }
  exporter: {
    saveCopy: (payload: { srcPath: string }) => Promise<{ ok: boolean; path?: string; error?: string }>
    toPdf: (payload: { srcPath?: string; html?: string; name?: string; landscape?: boolean; document?: boolean }) => Promise<{ ok: boolean; path?: string; count?: number; error?: string }>
    toImage: (payload: { srcPath?: string; html?: string; name?: string; width?: number; height?: number }) => Promise<{ ok: boolean; path?: string; error?: string }>
    fileToPptx: (payload: { srcPath: string; name?: string; width?: number; height?: number }) => Promise<{ ok: boolean; path?: string; count?: number; error?: string }>
    deckToPdf: (payload: { files: string[]; name?: string; slideW?: number; slideH?: number; document?: boolean }) => Promise<{ ok: boolean; path?: string; count?: number; error?: string }>
    deckToPptx: (payload: { files: string[]; name?: string; slideW?: number; slideH?: number }) => Promise<{ ok: boolean; path?: string; count?: number; error?: string }>
  }
  skills: {
    list: () => Promise<SkillDef[]>
    context: (projectId: string, sessionId?: string) => Promise<string[]>
    getContent: (skillId: string) => Promise<string | null>
    toggle: (skillId: string, active: boolean) => Promise<{ ok: boolean }>
    create: (data: { name: string; description: string; content?: string }) => Promise<{ ok: boolean; id?: string; error?: string }>
    upload: () => Promise<{ ok: boolean; id?: string; error?: string }>
    importFile: (filePath: string) => Promise<{ ok: boolean; id?: string; error?: string }>
    downloadGithub: (url: string) => Promise<{ ok: boolean; id?: string; error?: string }>
    remove: (skillId: string) => Promise<{ ok: boolean; error?: string }>
    openFolder: () => Promise<{ ok: boolean }>
    fileTree: (skillId: string) => Promise<{ name: string; path: string; type: 'file' | 'directory'; children?: any[] }[]>
  }
  mcp: {
    list: () => Promise<MCPServerInfo[]>
    add: (config: any) => Promise<{ ok: boolean }>
    remove: (name: string) => Promise<{ ok: boolean }>
    testConnection: (name: string) => Promise<{ ok: boolean; message?: string; error?: string }>
  }
  connectors: {
    catalog: () => Promise<ConnectorCatalogInfo[]>
    add: (payload: { id: string; secrets?: Record<string, string>; pathArg?: string }) => Promise<{ ok: boolean; name?: string; requiresAuth?: boolean; oauth?: boolean; error?: string }>
    authorize: (id: string) => Promise<{ ok: boolean; toolCount?: number; error?: string }>
    secInfo: () => Promise<{ encrypted: boolean }>
    list: () => Promise<MCPServerInfo[]>
    remove: (name: string) => Promise<{ ok: boolean }>
    test: (name: string) => Promise<{ ok: boolean; message?: string; error?: string }>
  }
  memory: {
    readGlobal: () => Promise<string>
    writeGlobal: (content: string) => Promise<{ ok: boolean }>
    readProject: (projectId: string) => Promise<string>
    writeProject: (projectId: string, content: string) => Promise<{ ok: boolean }>
    readTodo: () => Promise<TaskProgress[]>
  }
  fs: {
    pickFolder: () => Promise<string | null>
    pickFile: () => Promise<string | null>
    addFiles: (payload: { projectId: string; paths: string[] }) => Promise<{ ok: boolean; error?: string; files: { name: string; relPath: string }[] }>
    fileTree: (dirPath: string, depth?: number) => Promise<FileNode[]>
    readFile: (filePath: string) => Promise<{ content?: string; error?: string }>
    writeFile: (filePath: string, content: string) => Promise<{ ok: boolean; error?: string }>
    openInFinder: (filePath: string) => Promise<{ ok: boolean }>
    openExternal: (url: string) => Promise<{ ok: boolean }>
  }
  updates: {
    check: () => Promise<{ ok: boolean; version?: string; reason?: string; error?: string }>
    download: () => Promise<{ ok: boolean; error?: string }>
    install: () => Promise<{ ok: boolean }>
    current: () => Promise<{ version: string }>
    onStatus: (cb: (status: UpdateStatus) => void) => () => void
  }
}

// Lazy proxy — preload yüklenmeden önce erişimi güvenli hale getirir.
// Her çağrıda window.electronAPI'yi taze okur.
export const ipc: ElectronAPI = new Proxy({} as ElectronAPI, {
  get(_target, prop: string) {
    const api = (window as any).electronAPI
    if (!api) {
      console.error(
        `[ipc] window.electronAPI is missing — preload failed to load. (accessed: ${prop})\n` +
        `Check the preload path in Electron main.ts.`
      )
      // Çağrılabilir dummy döndür — uygulama crash etmesin, sadece hata loglar
      return new Proxy(() => Promise.reject(new Error('electronAPI not available')), {
        get: () => () => Promise.reject(new Error('electronAPI not available')),
      })
    }
    return (api as any)[prop]
  }
})
