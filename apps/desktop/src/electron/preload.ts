import { contextBridge, ipcRenderer, IpcRendererEvent, webUtils } from 'electron'

// Type-safe IPC yüzeyi — window.electronAPI olarak erişilir
contextBridge.exposeInMainWorld('electronAPI', {
  // ── Agent ──────────────────────────────────────────────────────────────────
  agent: {
    chat: (projectId: string, sessionId: string | null, message: string, model?: string) =>
      ipcRenderer.invoke('agent:chat', projectId, sessionId, message, model),
    interrupt: (projectId: string) =>
      ipcRenderer.invoke('agent:interrupt', projectId),
    isRunning: (projectId: string) =>
      ipcRenderer.invoke('agent:isRunning', projectId),
    getContextSnapshot: (projectId: string) =>
      ipcRenderer.invoke('agent:contextSnapshot', projectId),
    newSession: (projectId: string) =>
      ipcRenderer.invoke('agent:newSession', projectId),
    setCodeWorkdir: (dir: string | null) =>
      ipcRenderer.invoke('agent:setCodeWorkdir', dir),
    getCodeDirs: () =>
      ipcRenderer.invoke('agent:getCodeDirs'),
    addCodeDir: (dir: string) =>
      ipcRenderer.invoke('agent:addCodeDir', dir),
    removeCodeDir: (dir: string) =>
      ipcRenderer.invoke('agent:removeCodeDir', dir),
    getTodo: (projectId: string, sessionId?: string) =>
      ipcRenderer.invoke('agent:getTodo', projectId, sessionId),
    setActiveSession: (sessionId: string | null) =>
      ipcRenderer.invoke('agent:setActiveSession', sessionId),
    answerQuestion: (answer: string) =>
      ipcRenderer.invoke('agent:answerQuestion', answer),
    getPlan: (projectId: string, sessionId?: string) =>
      ipcRenderer.invoke('agent:getPlan', projectId, sessionId),

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
    onReasoningText: (cb: (text: string) => void) => {
      const listener = (_: IpcRendererEvent, text: string) => cb(text)
      ipcRenderer.on('agent:reasoningText', listener)
      return () => ipcRenderer.removeListener('agent:reasoningText', listener)
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
    onPlan: (cb: (payload: any) => void) => {
      const listener = (_: IpcRendererEvent, payload: any) => cb(payload)
      ipcRenderer.on('agent:plan', listener)
      return () => ipcRenderer.removeListener('agent:plan', listener)
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
    removeAllListeners: () => {
      ;['agent:toolCall', 'agent:stepText', 'agent:qaPrompt', 'agent:progress', 'agent:plan', 'agent:done', 'agent:error', 'agent:interrupted', 'agent:reasoningText']
        .forEach(ch => ipcRenderer.removeAllListeners(ch))
    },
  },


  // ── Projects ───────────────────────────────────────────────────────────────
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    create: (data: any) => ipcRenderer.invoke('projects:create', data),
    update: (id: string, data: any) => ipcRenderer.invoke('projects:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('projects:delete', id),
    reveal: (id: string) => ipcRenderer.invoke('projects:reveal', id),
    get: (id: string) => ipcRenderer.invoke('projects:get', id),
    ensureWorkdir: (id: string) => ipcRenderer.invoke('projects:ensureWorkdir', id),
    addFolder: (id: string, folderPath: string) => ipcRenderer.invoke('projects:addFolder', id, folderPath),
    removeFolder: (id: string, folderPath: string) => ipcRenderer.invoke('projects:removeFolder', id, folderPath),
    setPrimaryFolder: (id: string, folderPath: string) => ipcRenderer.invoke('projects:setPrimaryFolder', id, folderPath),
    resolveFile: (id: string, reference: string) => ipcRenderer.invoke('projects:resolveFile', id, reference),
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
    pin: (sessionId: string, pinned: boolean) => ipcRenderer.invoke('sessions:pin', sessionId, pinned),
    dashboardStats: (sinceMs?: number, projectId?: string) => ipcRenderer.invoke('sessions:dashboardStats', sinceMs, projectId),
  },
  preview: {
    detect: (workdir?: string) => ipcRenderer.invoke('preview:detect', workdir),
    check: (port: number) => ipcRenderer.invoke('preview:check', port),
    onSetUrl: (cb: (url: string) => void) => {
      const listener = (_e: any, url: string) => cb(url)
      ipcRenderer.on('preview:set-url', listener)
      return () => ipcRenderer.removeListener('preview:set-url', listener)
    },
    stop: (port: number) => ipcRenderer.invoke('preview:stop', port),
  },
  // ── Terminal (pty) ───────────────────────────────────────────────────────
  terminal: {
    create: (opts: { id: string; cwd?: string | null; cols?: number; rows?: number }) =>
      ipcRenderer.invoke('term:create', opts),
    input: (id: string, data: string) => ipcRenderer.invoke('term:input', id, data),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke('term:resize', id, cols, rows),
    kill: (id: string) => ipcRenderer.invoke('term:kill', id),
    onData: (cb: (payload: { id: string; data: string }) => void) => {
      const listener = (_: IpcRendererEvent, payload: any) => cb(payload)
      ipcRenderer.on('term:data', listener)
      return () => ipcRenderer.removeListener('term:data', listener)
    },
    onExit: (cb: (payload: { id: string; code: number }) => void) => {
      const listener = (_: IpcRendererEvent, payload: any) => cb(payload)
      ipcRenderer.on('term:exit', listener)
      return () => ipcRenderer.removeListener('term:exit', listener)
    },
  },

  // ── Settings ───────────────────────────────────────────────────────────────
  permissions: {
    get: () => ipcRenderer.invoke('permissions:get'),
    setMode: (mode: string, scope?: string) => ipcRenderer.invoke('permissions:setMode', mode, scope),
    addRule: (type: string, rule: string, scope?: string) => ipcRenderer.invoke('permissions:addRule', type, rule, scope),
    removeRule: (type: string, rule: string, scope?: string) => ipcRenderer.invoke('permissions:removeRule', type, rule, scope),
    setDirectories: (dirs: string[], scope?: string) => ipcRenderer.invoke('permissions:setDirectories', dirs, scope),
    setSandbox: (patch: Record<string, unknown>, scope?: string) => ipcRenderer.invoke('permissions:setSandbox', patch, scope),
    validateRule: (rule: string) => ipcRenderer.invoke('permissions:validateRule', rule),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (key: string, value: any) => ipcRenderer.invoke('settings:set', key, value),
    getApiKeys: () => ipcRenderer.invoke('settings:apiKeys'),
    credentialSecurity: () => ipcRenderer.invoke('settings:credentialSecurity'),
    setApiKey: (provider: string, key: string) => ipcRenderer.invoke('settings:setApiKey', provider, key),
    removeApiKey: (provider: string) => ipcRenderer.invoke('settings:removeApiKey', provider),
    getModels: (opts?: { refresh?: boolean }) => ipcRenderer.invoke('settings:models', opts),
    sandboxHealth: () => ipcRenderer.invoke('settings:sandboxHealth'),
    modelCapabilities: (model: string) => ipcRenderer.invoke('settings:modelCapabilities', model),
    savedModels: {
      list: () => ipcRenderer.invoke('settings:savedModels:list'),
      add: (modelId: string, contextWindow?: number) => ipcRenderer.invoke('settings:savedModels:add', modelId, contextWindow),
      remove: (modelId: string) => ipcRenderer.invoke('settings:savedModels:remove', modelId),
    },
  },
  plugins: {
    list: () => ipcRenderer.invoke('plugins:list'),
    install: (source: string, options?: { global?: boolean }) => ipcRenderer.invoke('plugins:install', source, options),
    uninstall: (id: string) => ipcRenderer.invoke('plugins:uninstall', id),
    runAction: (pluginId: string, actionId: string) => ipcRenderer.invoke('plugins:runAction', pluginId, actionId),
    models: () => ipcRenderer.invoke('plugins:models'),
    modelGates: () => ipcRenderer.invoke('plugins:modelGates'),
    onActionLog: (cb: (data: { pluginId: string; actionId: string; message: string }) => void) => {
      const handler = (_: any, data: any) => cb(data)
      ipcRenderer.on('plugins:actionLog', handler)
      return () => ipcRenderer.removeListener('plugins:actionLog', handler)
    },
  },

  // ── Git (WP-4 Desktop git yönetimi) ──────────────────────────────────────
  git: {
    isRepo: (workdir?: string) => ipcRenderer.invoke('git:isRepo', workdir),
    status: (workdir?: string) => ipcRenderer.invoke('git:status', workdir),
    diff: (opts?: { staged?: boolean; file?: string }, workdir?: string) =>
      ipcRenderer.invoke('git:diff', opts ?? {}, workdir),
    diffStat: (opts?: { staged?: boolean }, workdir?: string) =>
      ipcRenderer.invoke('git:diffStat', opts ?? {}, workdir),
    stage: (files: string[], workdir?: string) => ipcRenderer.invoke('git:stage', files, workdir),
    unstage: (files: string[], workdir?: string) => ipcRenderer.invoke('git:unstage', files, workdir),
    commit: (message: string, opts?: { all?: boolean }, workdir?: string) =>
      ipcRenderer.invoke('git:commit', message, opts ?? {}, workdir),
    branchList: (workdir?: string) => ipcRenderer.invoke('git:branchList', workdir),
    branchCreate: (name: string, workdir?: string) => ipcRenderer.invoke('git:branchCreate', name, workdir),
    checkout: (name: string, workdir?: string) => ipcRenderer.invoke('git:checkout', name, workdir),
    push: (opts?: { force?: boolean; setUpstream?: boolean }, workdir?: string) =>
      ipcRenderer.invoke('git:push', opts ?? {}, workdir),
    log: (opts?: { limit?: number }, workdir?: string) => ipcRenderer.invoke('git:log', opts ?? {}, workdir),
    prUrl: (workdir?: string) => ipcRenderer.invoke('git:prUrl', workdir),
    suggestCommitMessage: (model: string, workdir?: string) =>
      ipcRenderer.invoke('git:suggestCommitMessage', model, workdir),
  },

  // ── Design ────────────────────────────────────────────────────────────────
  design: {
    openWindow: () => ipcRenderer.invoke('design:openWindow'),
    createProject: (data: { name: string; type: string; designSystemId?: string }) =>
      ipcRenderer.invoke('design:createProject', data),
    listProjects: () => ipcRenderer.invoke('design:listProjects'),
    listSystems: () => ipcRenderer.invoke('design:listSystems'),
    createSystem: (data: { name: string; blurb?: string; notes?: string }) =>
      ipcRenderer.invoke('design:createSystem', data),
    deleteSystem: (id: string) => ipcRenderer.invoke('design:deleteSystem', id),
    attachSystem: (payload: { projectId: string; designSystemId: string | null }) =>
      ipcRenderer.invoke('design:attachSystem', payload),
    exportProject: (payload: { projectId: string; destDir: string }) =>
      ipcRenderer.invoke('design:exportProject', payload),
    getCanvas: (projectId: string) => ipcRenderer.invoke('design:getCanvas', projectId),
    saveCanvas: (payload: { projectId: string; frames: any[] }) =>
      ipcRenderer.invoke('design:saveCanvas', payload),
    scanScreens: (projectId: string) => ipcRenderer.invoke('design:scanScreens', projectId),
    readFile: (filePath: string) => ipcRenderer.invoke('design:readFile', filePath),
    /** Canvas önizlemesi: yerel görseller data: URL olarak gömülü içerik. */
    readRendered: (filePath: string) => ipcRenderer.invoke('design:readRendered', filePath),
    readMeta: (screenPath: string) => ipcRenderer.invoke('design:readMeta', screenPath),
    saveMeta: (payload: { screenPath: string; meta: any }) => ipcRenderer.invoke('design:saveMeta', payload),
    deleteProject: (projectId: string) => ipcRenderer.invoke('design:deleteProject', projectId),
    renameProject: (payload: { projectId: string; name: string }) =>
      ipcRenderer.invoke('design:renameProject', payload),
    createCheckpoint: (payload: { projectId: string; label?: string; auto?: boolean }) =>
      ipcRenderer.invoke('design:createCheckpoint', payload),
    listCheckpoints: (projectId: string) => ipcRenderer.invoke('design:listCheckpoints', projectId),
    restoreCheckpoint: (payload: { projectId: string; checkpointId: string }) =>
      ipcRenderer.invoke('design:restoreCheckpoint', payload),
  },

  // ── Export / download ───────────────────────────────────────────────────────
  exporter: {
    saveCopy: (payload: { srcPath: string }) => ipcRenderer.invoke('export:saveCopy', payload),
    toPdf: (payload: { srcPath?: string; html?: string; name?: string; landscape?: boolean }) => ipcRenderer.invoke('export:toPdf', payload),
    // accepts width/height so a multi-slide HTML keeps its real aspect ratio
    toImage: (payload: { srcPath?: string; html?: string; name?: string; width?: number; height?: number; format?: 'png' | 'jpeg'; scale?: number; quality?: number }) => ipcRenderer.invoke('export:toImage', payload),
    copyImage: (payload: { srcPath?: string; html?: string; width?: number; height?: number }) => ipcRenderer.invoke('export:copyImage', payload),
    toPdfAdvanced: (payload: { files: string[]; name?: string; pageSize?: 'fit' | 'a4' | 'letter'; landscape?: boolean; marginIn?: number; scale?: number; fitW?: number; fitH?: number; document?: boolean }) => ipcRenderer.invoke('export:toPdfAdvanced', payload),
    fileToPptx: (payload: { srcPath: string; name?: string; width?: number; height?: number }) => ipcRenderer.invoke('export:fileToPptx', payload),
    deckToPdf: (payload: { files: string[]; name?: string; slideW?: number; slideH?: number }) => ipcRenderer.invoke('export:deckToPdf', payload),
    deckToPptx: (payload: { files: string[]; name?: string; slideW?: number; slideH?: number }) => ipcRenderer.invoke('export:deckToPptx', payload),
    toVideo: (payload: { srcPath: string; name?: string; width?: number; height?: number; fps?: number; durationInFrames?: number; tweakVars?: Record<string, string> }) => ipcRenderer.invoke('export:toVideo', payload),
    onVideoProgress: (callback: (progress: { srcPath: string; phase: 'bundling' | 'browser' | 'rendering'; progress: number }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: { srcPath: string; phase: 'bundling' | 'browser' | 'rendering'; progress: number }) => callback(progress)
      ipcRenderer.on('export:videoProgress', listener)
      return () => ipcRenderer.removeListener('export:videoProgress', listener)
    },
  },

  // ── Skills ─────────────────────────────────────────────────────────────────
  skills: {
    list: () => ipcRenderer.invoke('skills:list'),
    context: (projectId: string, sessionId?: string) => ipcRenderer.invoke('skills:context', projectId, sessionId),
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
    /** Sürüklenen File için gerçek disk yolunu döndürür (Electron webUtils). Yoksa ''. */
    pathForFile: (file: File): string => {
      try { return webUtils.getPathForFile(file) } catch { return '' }
    },
    addFiles: (payload: { projectId: string; paths: string[] }) => ipcRenderer.invoke('fs:addFiles', payload),
    /** Disk yolu olmayan (ör. tarayıcı/canvas'tan sürüklenen) görselleri byte olarak yaz. */
    addFileBytes: (payload: { projectId: string; files: { name: string; dataBase64: string }[] }) =>
      ipcRenderer.invoke('fs:addFileBytes', payload),
    discardUpload: (payload: { projectId: string; filePath: string }) => ipcRenderer.invoke('fs:discardUpload', payload),
    storageStats: () => ipcRenderer.invoke('fs:storageStats'),
    cleanStorage: () => ipcRenderer.invoke('fs:cleanStorage'),
    fileTree: (dirPath: string, depth?: number) => ipcRenderer.invoke('fs:fileTree', dirPath, depth),
    readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
    previewFile: (filePath: string) => ipcRenderer.invoke('fs:previewFile', filePath),
    /** Görsel dosyayı data: URL olarak okur (CSP `file:` şemasına izin vermiyor). */
    readFileDataUrl: (filePath: string) => ipcRenderer.invoke('fs:readFileDataUrl', filePath),
    writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:writeFile', filePath, content),
    openInFinder: (filePath: string) => ipcRenderer.invoke('fs:openInFinder', filePath),
    openExternal: (url: string) => ipcRenderer.invoke('fs:openExternal', url),
  },
})
