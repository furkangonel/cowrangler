/**
 * Tip-safe IPC yüzeyi — window.electronAPI'nin TypeScript sarmalayıcısı.
 * Renderer'ın tüm IPC çağrıları bu dosya üzerinden geçer.
 */

export interface PluginDef {
  id: string
  name: string
  dir: string
  skills: SkillDef[]
}

export interface PluginActionMeta {
  id: string
  title: string
  description?: string
  icon?: string
}

export interface PluginContribution {
  models: string[]
  skills: number
  tools: number
  providers: string[]
  actions: PluginActionMeta[]
}

export interface InstalledPluginRich {
  id: string
  name: string
  version: string
  description: string
  source: 'global' | 'local'
  dir: string
  contribution: PluginContribution
  actions: PluginActionMeta[]
}

export interface PluginModelGate {
  locked: boolean
  reason?: string
  pluginId: string
  actionId?: string
}

export interface MarketplacePlugin {
  id: string
  name: string
  description: string
  author: string
  repositoryUrl: string
}

export interface TaskProgress {
  id: string
  text: string
  status: 'pending' | 'in_progress' | 'completed'
}

export interface AgentProgressEvent {
  projectId?: string
  sessionId?: string | null
  tasks: TaskProgress[]
}

export type UpdateStatus =
  | { state: 'checking' }
  | { state: 'available'; version: string; notes?: string }
  | { state: 'not-available'; version: string }
  | { state: 'progress'; percent: number; transferred: number; total: number; bytesPerSecond: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }

export interface ToolCallEvent {
  projectId?: string
  sessionId?: string | null
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
  projectId?: string
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
  is_primary: number
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
  last_active_at?: number
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

export interface DashboardStats {
  totals: {
    sessions: number
    messages: number
    input_tokens: number
    output_tokens: number
    tokens: number
    cost_usd: number
  }
  active_days: number
  current_streak: number
  longest_streak: number
  peak_hour: number | null
  favorite_model: string | null
  by_model: Array<{
    model: string
    sessions: number
    input_tokens: number
    output_tokens: number
    tokens: number
    pct: number
  }>
  by_day: Array<{ date: string; sessions: number; messages: number; tokens: number }>
}

export interface InstalledPluginView {
  name: string
  dir: string
  source: 'global' | 'local'
  description: string
  author: string | null
  version: string | null
  repo: string | null
  provides: string[]
  disabled: boolean
  valid: boolean
  active: boolean
  skillCount: number
  error?: string
  loadError?: string
}

export interface PluginRegistryEntry {
  name: string
  repo: string
  description: string
  author: string
  category: 'provider' | 'tools' | 'skills' | 'workflow'
  tags: string[]
  installed: boolean
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



// ── Git (WP-4) ────────────────────────────────────────────────────────────────
export interface GitRun {
  ok: boolean
  stdout: string
  stderr: string
}

export interface GitFileEntry {
  path: string
  index: string
  worktree: string
  staged: boolean
  unstaged: boolean
  untracked: boolean
}

export interface GitDiffStat {
  path: string
  additions: number
  deletions: number
  binary: boolean
}

export interface GitStatus {
  repo: boolean
  branch: string
  ahead: number
  behind: number
  upstream: string | null
  files: GitFileEntry[]
  clean: boolean
  additions?: number
  deletions?: number
}

export interface GitBranchInfo {
  current: string
  local: string[]
  remote: string[]
}

export interface GitLogEntry {
  hash: string
  author: string
  relative: string
  subject: string
}

/** WP-5 SandboxTab — canlı backend sağlık raporu. */
export interface SandboxHealth {
  platform: string
  kind: string
  label: string
  isolated: boolean
  bundleUsable: boolean
  bundlePath?: string
  error?: string
}

/** WP-5 ModelsTab yetenek göstergesi (tek kaynak: core/model_metadata). */
export interface ModelCapabilities {
  provider: string
  displayName: string
  contextWindow: number
  supportsVision: boolean
  supportsPromptCache: boolean
  nativeToolCalling: boolean
  supportsThinking: boolean
  reasoningEffort: boolean
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
  /** User-authored raw MCP entry rather than a curated catalog connector. */
  custom?: boolean
  command?: string
  args?: string[]
  url?: string
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  size?: number
  mtime?: number
}

export interface StorageStats {
  totalBytes: number
  cacheBytes: number
  archiveBytes: number
  projectDataBytes: number
  logBytes: number
  tempBytes: number
  lastCleanedAt: number | null
}

export interface CleanupResult extends StorageStats {
  reclaimedBytes: number
  removedFiles: number
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
  /** Canonical viewport shared by preview and every export path. */
  width?: number
  height?: number
  fps?: number
  durationInFrames?: number
  engine?: 'html' | 'react' | 'three' | 'remotion' | 'svg' | 'mermaid'
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
  projectId?: string
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

/** The six permission modes, mirroring Anthropic's model. */
export type PermissionModeId =
  | 'default'
  | 'acceptEdits'
  | 'plan'
  | 'auto'
  | 'dontAsk'
  | 'bypassPermissions'

export type RuleKind = 'allow' | 'ask' | 'deny'

/** Settings files a rule can be written to, lowest authority last. */
export type RuleScope = 'local' | 'project' | 'user'

export interface PermissionModeInfo {
  id: PermissionModeId
  label: string
  summary: string
  detail: string
}

/** A rule as resolved, carrying the scope that declared it. */
export interface SourcedPermissionRule {
  raw: string
  scope: 'managed' | 'session' | 'local' | 'project' | 'user' | 'legacy'
  settingsDir: string
}

export interface PermissionSandboxView {
  enabled: boolean
  autoAllowBash: boolean
  allowUnsandboxedCommands: boolean
  excludedCommands: string[]
  filesystem: { allowWrite: string[]; denyWrite: string[]; allowRead: string[]; denyRead: string[]; disabled: boolean }
  network: { allowedDomains: string[]; deniedDomains: string[]; strictAllowlist: boolean; allowManagedDomainsOnly: boolean }
}

export interface PermissionPolicyView {
  mode: PermissionModeId
  modes: PermissionModeInfo[]
  allow: SourcedPermissionRule[]
  ask: SourcedPermissionRule[]
  deny: SourcedPermissionRule[]
  additionalDirectories: string[]
  disableBypassPermissionsMode: boolean
  disableAutoMode: boolean
  sandbox: PermissionSandboxView
  issues: { raw: string; scope: string; reason: string }[]
  files: { local: string; project: string; user: string; managed: string }
}

export interface ElectronAPI {
  agent: {
    chat: (projectId: string, sessionId: string | null, message: string, model?: string) => Promise<void>
    interrupt: (projectId: string) => Promise<{ ok: boolean }>
    isRunning: (projectId: string) => Promise<{ running: boolean; sessionId: string | null }>
    getContextSnapshot: (projectId: string) => Promise<ContextSnapshot | null>
    newSession: (projectId: string) => Promise<{ ok: boolean }>
    setCodeWorkdir: (dir: string | null) => Promise<{ ok: boolean }>
    getCodeDirs: () => Promise<{ workdir: string | null; extraDirs: string[] }>
    addCodeDir: (dir: string) => Promise<{ ok: boolean; extraDirs: string[] }>
    removeCodeDir: (dir: string) => Promise<{ ok: boolean; extraDirs: string[] }>
    getTodo: (projectId: string, sessionId?: string) => Promise<TaskProgress[]>
    setActiveSession: (sessionId: string | null) => Promise<void>
    getPlan: (projectId: string, sessionId?: string) => Promise<PlanPayload | null>
    onToolCall: (cb: (data: ToolCallEvent) => void) => () => void
    onStepText: (cb: (text: string) => void) => () => void
    onReasoningText: (cb: (text: string) => void) => () => void
    onQaPrompt: (cb: (payload: any) => void) => () => void
    onPlan: (cb: (payload: PlanPayload) => void) => () => void
    answerQuestion: (answer: string) => Promise<{ ok: boolean }>
    onProgress: (cb: (payload: AgentProgressEvent | TaskProgress[]) => void) => () => void
    onDone: (cb: (result: AgentDoneResult) => void) => () => void
    onError: (cb: (err: string) => void) => () => void
    onInterrupted: (cb: () => void) => () => void
    syncActivePorts: (ports: number[]) => void
  }
  projects: {
    list: () => Promise<ProjectSummary[]>
    create: (data: { name: string; description?: string; workdir?: string; icon?: string; color?: string }) => Promise<ProjectRecord>
    update: (id: string, data: any) => Promise<ProjectRecord>
    delete: (id: string) => Promise<{ ok: boolean }>
    reveal: (id: string) => Promise<{ ok: boolean; error?: string }>
    get: (id: string) => Promise<ProjectRecord | null>
    ensureWorkdir: (id: string) => Promise<ProjectRecord | null>
    addFolder: (id: string, folderPath: string) => Promise<ProjectFolder>
    removeFolder: (id: string, folderPath: string) => Promise<{ ok: boolean }>
    setPrimaryFolder: (id: string, folderPath: string) => Promise<{ ok: boolean; folder?: ProjectFolder; project?: ProjectRecord; error?: string }>
    resolveFile: (id: string, reference: string) => Promise<{ ok: boolean; path?: string; error?: string }>
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
    dashboardStats: (sinceMs?: number, projectId?: string) => Promise<DashboardStats>
  }
  preview: {
    detect: (workdir?: string) => Promise<{ url: string; port: number } | null>
    check: (port: number) => Promise<{ open: boolean }>
    onSetUrl: (cb: (url: string) => void) => () => void
    stop: (port: number) => Promise<{ ok: boolean; message: string }>
  }
  terminal: {
    create: (opts: { id: string; cwd?: string | null; cols?: number; rows?: number }) => Promise<{ ok: boolean }>
    input: (id: string, data: string) => Promise<{ ok: boolean }>
    resize: (id: string, cols: number, rows: number) => Promise<{ ok: boolean }>
    kill: (id: string) => Promise<{ ok: boolean }>
    onData: (cb: (payload: { id: string; data: string }) => void) => () => void
    onExit: (cb: (payload: { id: string; code: number }) => void) => () => void
  }
  permissions: {
    get: () => Promise<PermissionPolicyView>
    setMode: (mode: string, scope?: RuleScope) => Promise<{ ok: boolean; mode: PermissionModeId }>
    addRule: (type: RuleKind, rule: string, scope?: RuleScope) => Promise<{ ok: boolean; error?: string }>
    removeRule: (type: RuleKind, rule: string, scope?: RuleScope) => Promise<{ ok: boolean }>
    setDirectories: (dirs: string[], scope?: RuleScope) => Promise<{ ok: boolean }>
    setSandbox: (patch: Record<string, unknown>, scope?: RuleScope) => Promise<{ ok: boolean }>
    validateRule: (rule: string) => Promise<{ ok: boolean; error?: string }>
  }
  settings: {
    get: () => Promise<Record<string, any>>
    set: (key: string, value: any) => Promise<{ ok: boolean }>
    getApiKeys: () => Promise<ApiKeyInfo[]>
    credentialSecurity: () => Promise<{ encrypted: boolean }>
    setApiKey: (provider: string, key: string) => Promise<{ ok: boolean; error?: string; models?: string[] }>
    removeApiKey: (provider: string) => Promise<{ ok: boolean }>
    getModels: (opts?: { refresh?: boolean }) => Promise<ModelInfo[]>
    sandboxHealth: () => Promise<SandboxHealth>
    modelCapabilities: (model: string) => Promise<ModelCapabilities | null>
    savedModels: {
      list: () => Promise<string[]>
      add: (modelId: string, contextWindow?: number) => Promise<{ ok: boolean }>
      remove: (modelId: string) => Promise<{ ok: boolean }>
    }
  }
  plugins: {
    list: () => Promise<InstalledPluginRich[]>
    install: (source: string, options?: { global?: boolean }) => Promise<{ ok: boolean; error?: string; id?: string }>
    uninstall: (id: string) => Promise<{ ok: boolean; error?: string }>
    runAction: (pluginId: string, actionId: string) => Promise<{ ok: boolean; message?: string }>
    models: () => Promise<string[]>
    modelGates: () => Promise<Record<string, PluginModelGate>>
    onActionLog: (cb: (data: { pluginId: string; actionId: string; message: string }) => void) => () => void
    /** Optional: plugins with skills, surfaced in the composer plus-menu. */
    listWithSkills?: () => Promise<any[]>
  }
  git: {
    isRepo: (workdir?: string) => Promise<boolean>
    status: (workdir?: string) => Promise<GitStatus>
    diff: (opts?: { staged?: boolean; file?: string }, workdir?: string) => Promise<string>
    diffStat: (opts?: { staged?: boolean }, workdir?: string) => Promise<GitDiffStat[]>
    stage: (files: string[], workdir?: string) => Promise<GitRun>
    unstage: (files: string[], workdir?: string) => Promise<GitRun>
    commit: (message: string, opts?: { all?: boolean }, workdir?: string) => Promise<GitRun>
    branchList: (workdir?: string) => Promise<GitBranchInfo>
    branchCreate: (name: string, workdir?: string) => Promise<GitRun>
    checkout: (name: string, workdir?: string) => Promise<GitRun>
    push: (opts?: { force?: boolean; setUpstream?: boolean }, workdir?: string) => Promise<GitRun>
    log: (opts?: { limit?: number }, workdir?: string) => Promise<GitLogEntry[]>
    prUrl: (workdir?: string) => Promise<string | null>
    suggestCommitMessage: (model: string, workdir?: string) => Promise<{ ok: boolean; message?: string; error?: string }>
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
    /**
     * readFile + yerel görsel/stil referansları data: URL olarak gömülü
     * (canvas önizlemesi için). Eski preload'larda bulunmayabilir → opsiyonel.
     */
    readRendered?: (filePath: string) => Promise<{ content?: string; error?: string }>
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
    toImage: (payload: { srcPath?: string; html?: string; name?: string; width?: number; height?: number; format?: 'png' | 'jpeg'; scale?: number; quality?: number }) => Promise<{ ok: boolean; path?: string; error?: string }>
    copyImage: (payload: { srcPath?: string; html?: string; width?: number; height?: number }) => Promise<{ ok: boolean; error?: string }>
    toPdfAdvanced: (payload: { files: string[]; name?: string; pageSize?: 'fit' | 'a4' | 'letter'; landscape?: boolean; marginIn?: number; scale?: number; fitW?: number; fitH?: number; document?: boolean }) => Promise<{ ok: boolean; path?: string; count?: number; error?: string }>
    fileToPptx: (payload: { srcPath: string; name?: string; width?: number; height?: number }) => Promise<{ ok: boolean; path?: string; count?: number; error?: string }>
    deckToPdf: (payload: { files: string[]; name?: string; slideW?: number; slideH?: number; document?: boolean }) => Promise<{ ok: boolean; path?: string; count?: number; error?: string }>
    deckToPptx: (payload: { files: string[]; name?: string; slideW?: number; slideH?: number }) => Promise<{ ok: boolean; path?: string; count?: number; error?: string }>
    toVideo: (payload: { srcPath: string; name?: string; width?: number; height?: number; fps?: number; durationInFrames?: number; tweakVars?: Record<string, string> }) => Promise<{ ok: boolean; path?: string; error?: string }>
    onVideoProgress: (callback: (progress: { srcPath: string; phase: 'bundling' | 'browser' | 'rendering'; progress: number }) => void) => () => void
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
    add: (config: any) => Promise<{ ok: boolean; summary?: string; error?: string }>
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
    pathForFile: (file: File) => string
    addFiles: (payload: { projectId: string; paths: string[] }) => Promise<{ ok: boolean; error?: string; files: { name: string; relPath: string }[] }>
    addFileBytes: (payload: { projectId: string; files: { name: string; dataBase64: string }[] }) => Promise<{ ok: boolean; error?: string; files: { name: string; relPath: string }[] }>
    discardUpload: (payload: { projectId: string; filePath: string }) => Promise<{ ok: boolean; error?: string }>
    storageStats: () => Promise<StorageStats>
    cleanStorage: () => Promise<CleanupResult>
    fileTree: (dirPath: string, depth?: number) => Promise<FileNode[]>
    readFile: (filePath: string) => Promise<{ content?: string; error?: string }>
    previewFile: (filePath: string) => Promise<{ kind: 'image' | 'pdf' | 'video' | 'audio' | 'html' | 'markdown' | 'text' | 'document' | 'spreadsheet' | 'presentation' | 'unsupported'; content?: string; dataUrl?: string; mime?: string; error?: string; warnings?: string[]; size?: number }>
    /** Görseli data: URL olarak okur — <img src> için (CSP `file:` şemasını engelliyor). */
    readFileDataUrl: (filePath: string) => Promise<{ dataUrl?: string; error?: string }>
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
