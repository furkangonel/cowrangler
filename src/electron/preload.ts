import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

// Type-safe IPC yüzeyi — window.electronAPI olarak erişilir
contextBridge.exposeInMainWorld('electronAPI', {
  // ── Agent ──────────────────────────────────────────────────────────────────
  agent: {
    chat: (projectId: string, sessionId: string | null, message: string, model?: string) =>
      ipcRenderer.invoke('agent:chat', projectId, sessionId, message, model),
    interrupt: (projectId: string) =>
      ipcRenderer.invoke('agent:interrupt', projectId),
    getContextSnapshot: (projectId: string) =>
      ipcRenderer.invoke('agent:contextSnapshot', projectId),
    newSession: (projectId: string) =>
      ipcRenderer.invoke('agent:newSession', projectId),
    getTodo: (projectId: string, sessionId?: string) =>
      ipcRenderer.invoke('agent:getTodo', projectId, sessionId),
    setActiveSession: (sessionId: string | null) =>
      ipcRenderer.invoke('agent:setActiveSession', sessionId),
    answerQuestion: (answer: string) =>
      ipcRenderer.invoke('agent:answerQuestion', answer),

    // Streaming events (main → renderer)
    onToolCall: (cb: (data: any) => void) => {
      const listener = (_: IpcRendererEvent, data: any) => cb(data)
      ipcRenderer.on('agent:toolCall', listener)
      return () => ipcRenderer.removeListener('agent:toolCall', listener)
    },
    onStepText: (cb: (text: string) => void) => {
      const listener = (_: IpcRendererEvent, text: string) => cb(text)
      ipcRenderer.on('agent:stepText', listener)
      return () => ipcRenderer.removeListener('agent:stepText', listener)
    },
    onQaPrompt: (cb: (payload: any) => void) => {
      const listener = (_: any, payload: any) => cb(payload)
      ipcRenderer.on('agent:qaPrompt', listener)
      return () => ipcRenderer.removeListener('agent:qaPrompt', listener)
    },
    onProgress: (cb: (tasks: any[]) => void) => {
      const listener = (_: IpcRendererEvent, tasks: any[]) => cb(tasks)
      ipcRenderer.on('agent:progress', listener)
      return () => ipcRenderer.removeListener('agent:progress', listener)
    },
    onDone: (cb: (result: any) => void) => {
      const listener = (_: IpcRendererEvent, result: any) => cb(result)
      ipcRenderer.on('agent:done', listener)
      return () => ipcRenderer.removeListener('agent:done', listener)
    },
    onError: (cb: (err: string) => void) => {
      const listener = (_: IpcRendererEvent, err: string) => cb(err)
      ipcRenderer.on('agent:error', listener)
      return () => ipcRenderer.removeListener('agent:error', listener)
    },
    onInterrupted: (cb: () => void) => {
      const listener = () => cb()
      ipcRenderer.on('agent:interrupted', listener)
      return () => ipcRenderer.removeListener('agent:interrupted', listener)
    },
    onApprovalRequest: (cb: (data: any) => void) => {
      const listener = (_: IpcRendererEvent, data: any) => cb(data)
      ipcRenderer.on('agent:approvalRequest', listener)
      return () => ipcRenderer.removeListener('agent:approvalRequest', listener)
    },
    removeAllListeners: () => {
      ;['agent:toolCall', 'agent:stepText', 'agent:qaPrompt', 'agent:progress', 'agent:done', 'agent:error', 'agent:interrupted', 'agent:approvalRequest']
        .forEach(ch => ipcRenderer.removeAllListeners(ch))
    },
  },

  // ── Projects ───────────────────────────────────────────────────────────────
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    create: (data: any) => ipcRenderer.invoke('projects:create', data),
    update: (id: string, data: any) => ipcRenderer.invoke('projects:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('projects:delete', id),
    get: (id: string) => ipcRenderer.invoke('projects:get', id),
    addFolder: (id: string, folderPath: string) => ipcRenderer.invoke('projects:addFolder', id, folderPath),
    removeFolder: (id: string, folderPath: string) => ipcRenderer.invoke('projects:removeFolder', id, folderPath),
    getFolders: (id: string) => ipcRenderer.invoke('projects:getFolders', id),
    getOutputs: (id: string) => ipcRenderer.invoke('projects:outputs', id),
    getInstructions: (id: string) => ipcRenderer.invoke('projects:getInstructions', id),
    setInstructions: (id: string, content: string) => ipcRenderer.invoke('projects:setInstructions', id, content),
  },

  // ── Sessions ───────────────────────────────────────────────────────────────
  sessions: {
    list: (projectId: string) => ipcRenderer.invoke('sessions:list', projectId),
    get: (sessionId: string) => ipcRenderer.invoke('sessions:get', sessionId),
    messages: (sessionId: string) => ipcRenderer.invoke('sessions:messages', sessionId),
    search: (query: string, projectId?: string) => ipcRenderer.invoke('sessions:search', query, projectId),
    delete: (projectId: string, sessionId: string) => ipcRenderer.invoke('sessions:delete', projectId, sessionId),
    rename: (sessionId: string, title: string) => ipcRenderer.invoke('sessions:rename', sessionId, title),
  },

  // ── Settings ───────────────────────────────────────────────────────────────
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (key: string, value: any) => ipcRenderer.invoke('settings:set', key, value),
    getApiKeys: () => ipcRenderer.invoke('settings:apiKeys'),
    setApiKey: (provider: string, key: string) => ipcRenderer.invoke('settings:setApiKey', provider, key),
    removeApiKey: (provider: string) => ipcRenderer.invoke('settings:removeApiKey', provider),
    getModels: () => ipcRenderer.invoke('settings:models'),
  },

  // ── Skills ─────────────────────────────────────────────────────────────────
  skills: {
    list: () => ipcRenderer.invoke('skills:list'),
    getContent: (skillId: string) => ipcRenderer.invoke('skills:content', skillId),
    toggle: (skillId: string, active: boolean) => ipcRenderer.invoke('skills:toggle', skillId, active),
    create: (data: { name: string; description: string; content?: string }) =>
      ipcRenderer.invoke('skills:create', data),
    upload: () => ipcRenderer.invoke('skills:upload'),
    importFile: (filePath: string) => ipcRenderer.invoke('skills:importFile', filePath),
    downloadGithub: (url: string) => ipcRenderer.invoke('skills:downloadGithub', url),
    remove: (skillId: string) => ipcRenderer.invoke('skills:delete', skillId),
    openFolder: () => ipcRenderer.invoke('skills:openFolder'),
    fileTree: (skillId: string) => ipcRenderer.invoke('skills:fileTree', skillId),
  },

  // ── MCP / Connectors ───────────────────────────────────────────────────────
  mcp: {
    list: () => ipcRenderer.invoke('mcp:list'),
    add: (config: any) => ipcRenderer.invoke('mcp:add', config),
    remove: (name: string) => ipcRenderer.invoke('mcp:remove', name),
    testConnection: (name: string) => ipcRenderer.invoke('mcp:test', name),
  },

  // Connectors = kullanıcıya sunulan MCP yüzeyi (kürasyonlu katalog + auth)
  connectors: {
    catalog: () => ipcRenderer.invoke('connectors:catalog'),
    add: (payload: { id: string; secrets?: Record<string, string>; pathArg?: string }) =>
      ipcRenderer.invoke('connectors:add', payload),
    authorize: (id: string) => ipcRenderer.invoke('connectors:authorize', id),
    secInfo: () => ipcRenderer.invoke('connectors:secInfo'),
    list: () => ipcRenderer.invoke('mcp:list'),
    remove: (name: string) => ipcRenderer.invoke('mcp:remove', name),
    test: (name: string) => ipcRenderer.invoke('mcp:test', name),
  },

  // ── Memory ─────────────────────────────────────────────────────────────────
  memory: {
    readGlobal: () => ipcRenderer.invoke('memory:readGlobal'),
    writeGlobal: (content: string) => ipcRenderer.invoke('memory:writeGlobal', content),
    readProject: (projectId: string) => ipcRenderer.invoke('memory:readProject', projectId),
    writeProject: (projectId: string, content: string) => ipcRenderer.invoke('memory:writeProject', projectId, content),
    readTodo: () => ipcRenderer.invoke('memory:readTodo'),
  },

  // ── Auto-update ──────────────────────────────────────────────────────────────
  updates: {
    check: () => ipcRenderer.invoke('updates:check'),
    download: () => ipcRenderer.invoke('updates:download'),
    install: () => ipcRenderer.invoke('updates:install'),
    current: () => ipcRenderer.invoke('updates:current'),
    onStatus: (cb: (status: any) => void) => {
      const listener = (_: IpcRendererEvent, status: any) => cb(status)
      ipcRenderer.on('updates:status', listener)
      return () => ipcRenderer.removeListener('updates:status', listener)
    },
  },

  // ── File System ────────────────────────────────────────────────────────────
  fs: {
    pickFolder: () => ipcRenderer.invoke('fs:pickFolder'),
    pickFile: () => ipcRenderer.invoke('fs:pickFile'),
    fileTree: (dirPath: string, depth?: number) => ipcRenderer.invoke('fs:fileTree', dirPath, depth),
    readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
    openInFinder: (filePath: string) => ipcRenderer.invoke('fs:openInFinder', filePath),
    openExternal: (url: string) => ipcRenderer.invoke('fs:openExternal', url),
  },
})
