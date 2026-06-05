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

export interface ToolCallEvent {
  name: string
  args: Record<string, any>
  status: 'start' | 'done' | 'error'
  durationMs?: number
  timestamp: number
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

export interface SkillDef {
  id: string
  name: string
  description: string
  source: 'bundled' | 'global' | 'local'
  content: string
}

export interface MCPServerInfo {
  name: string
  type: 'stdio' | 'http' | 'sse'
  command?: string
  args?: string[]
  url?: string
  timeout?: number
  status: 'connected' | 'disconnected' | 'unknown' | 'error'
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

interface ElectronAPI {
  agent: {
    chat: (projectId: string, sessionId: string | null, message: string) => Promise<void>
    interrupt: (projectId: string) => Promise<{ ok: boolean }>
    getContextSnapshot: (projectId: string) => Promise<ContextSnapshot | null>
    newSession: (projectId: string) => Promise<{ ok: boolean }>
    onToolCall: (cb: (data: ToolCallEvent) => void) => () => void
    onStepText: (cb: (text: string) => void) => () => void
    onProgress: (cb: (tasks: TaskProgress[]) => void) => () => void
    onDone: (cb: (result: AgentDoneResult) => void) => () => void
    onError: (cb: (err: string) => void) => () => void
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
  }
  settings: {
    get: () => Promise<Record<string, any>>
    set: (key: string, value: any) => Promise<{ ok: boolean }>
    getApiKeys: () => Promise<ApiKeyInfo[]>
    setApiKey: (provider: string, key: string) => Promise<{ ok: boolean }>
    removeApiKey: (provider: string) => Promise<{ ok: boolean }>
    getModels: () => Promise<ModelInfo[]>
  }
  skills: {
    list: () => Promise<SkillDef[]>
    getContent: (skillId: string) => Promise<string | null>
    toggle: (skillId: string, active: boolean) => Promise<{ ok: boolean }>
  }
  mcp: {
    list: () => Promise<MCPServerInfo[]>
    add: (config: any) => Promise<{ ok: boolean }>
    remove: (name: string) => Promise<{ ok: boolean }>
    testConnection: (name: string) => Promise<{ ok: boolean; message?: string; error?: string }>
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
    fileTree: (dirPath: string, depth?: number) => Promise<FileNode[]>
    readFile: (filePath: string) => Promise<{ content?: string; error?: string }>
    openInFinder: (filePath: string) => Promise<{ ok: boolean }>
    openExternal: (url: string) => Promise<{ ok: boolean }>
  }
}

// Lazy proxy — preload yüklenmeden önce erişimi güvenli hale getirir.
// Her çağrıda window.electronAPI'yi taze okur.
export const ipc: ElectronAPI = new Proxy({} as ElectronAPI, {
  get(_target, prop: string) {
    const api = (window as any).electronAPI
    if (!api) {
      console.error(
        `[ipc] window.electronAPI yok — preload yüklenemedi. (erişilen: ${prop})\n` +
        `Electron main.ts'deki preload yolunu kontrol edin.`
      )
      // Çağrılabilir dummy döndür — uygulama crash etmesin, sadece hata loglar
      return new Proxy(() => Promise.reject(new Error('electronAPI not available')), {
        get: () => () => Promise.reject(new Error('electronAPI not available')),
      })
    }
    return (api as any)[prop]
  }
})
