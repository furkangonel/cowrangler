import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("electronAPI", {
  // ── Agent ──────────────────────────────────────────────────────────────────
  agent: {
    chat: (projectId, sessionId, message) => ipcRenderer.invoke("agent:chat", projectId, sessionId, message),
    interrupt: (projectId) => ipcRenderer.invoke("agent:interrupt", projectId),
    getContextSnapshot: (projectId) => ipcRenderer.invoke("agent:contextSnapshot", projectId),
    newSession: (projectId) => ipcRenderer.invoke("agent:newSession", projectId),
    // Streaming events (main → renderer)
    onToolCall: (cb) => {
      const listener = (_, data) => cb(data);
      ipcRenderer.on("agent:toolCall", listener);
      return () => ipcRenderer.removeListener("agent:toolCall", listener);
    },
    onStepText: (cb) => {
      const listener = (_, text) => cb(text);
      ipcRenderer.on("agent:stepText", listener);
      return () => ipcRenderer.removeListener("agent:stepText", listener);
    },
    onProgress: (cb) => {
      const listener = (_, tasks) => cb(tasks);
      ipcRenderer.on("agent:progress", listener);
      return () => ipcRenderer.removeListener("agent:progress", listener);
    },
    onDone: (cb) => {
      const listener = (_, result) => cb(result);
      ipcRenderer.on("agent:done", listener);
      return () => ipcRenderer.removeListener("agent:done", listener);
    },
    onError: (cb) => {
      const listener = (_, err) => cb(err);
      ipcRenderer.on("agent:error", listener);
      return () => ipcRenderer.removeListener("agent:error", listener);
    },
    onApprovalRequest: (cb) => {
      const listener = (_, data) => cb(data);
      ipcRenderer.on("agent:approvalRequest", listener);
      return () => ipcRenderer.removeListener("agent:approvalRequest", listener);
    },
    removeAllListeners: () => {
      ["agent:toolCall", "agent:stepText", "agent:progress", "agent:done", "agent:error", "agent:approvalRequest"].forEach((ch) => ipcRenderer.removeAllListeners(ch));
    }
  },
  // ── Projects ───────────────────────────────────────────────────────────────
  projects: {
    list: () => ipcRenderer.invoke("projects:list"),
    create: (data) => ipcRenderer.invoke("projects:create", data),
    update: (id, data) => ipcRenderer.invoke("projects:update", id, data),
    delete: (id) => ipcRenderer.invoke("projects:delete", id),
    get: (id) => ipcRenderer.invoke("projects:get", id),
    addFolder: (id, folderPath) => ipcRenderer.invoke("projects:addFolder", id, folderPath),
    removeFolder: (id, folderPath) => ipcRenderer.invoke("projects:removeFolder", id, folderPath),
    getFolders: (id) => ipcRenderer.invoke("projects:getFolders", id),
    getOutputs: (id) => ipcRenderer.invoke("projects:outputs", id),
    getInstructions: (id) => ipcRenderer.invoke("projects:getInstructions", id),
    setInstructions: (id, content) => ipcRenderer.invoke("projects:setInstructions", id, content)
  },
  // ── Sessions ───────────────────────────────────────────────────────────────
  sessions: {
    list: (projectId) => ipcRenderer.invoke("sessions:list", projectId),
    get: (sessionId) => ipcRenderer.invoke("sessions:get", sessionId),
    messages: (sessionId) => ipcRenderer.invoke("sessions:messages", sessionId),
    search: (query, projectId) => ipcRenderer.invoke("sessions:search", query, projectId),
    delete: (projectId, sessionId) => ipcRenderer.invoke("sessions:delete", projectId, sessionId),
    rename: (sessionId, title) => ipcRenderer.invoke("sessions:rename", sessionId, title)
  },
  // ── Settings ───────────────────────────────────────────────────────────────
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (key, value) => ipcRenderer.invoke("settings:set", key, value),
    getApiKeys: () => ipcRenderer.invoke("settings:apiKeys"),
    setApiKey: (provider, key) => ipcRenderer.invoke("settings:setApiKey", provider, key),
    removeApiKey: (provider) => ipcRenderer.invoke("settings:removeApiKey", provider),
    getModels: () => ipcRenderer.invoke("settings:models")
  },
  // ── Skills ─────────────────────────────────────────────────────────────────
  skills: {
    list: () => ipcRenderer.invoke("skills:list"),
    getContent: (skillId) => ipcRenderer.invoke("skills:content", skillId),
    toggle: (skillId, active) => ipcRenderer.invoke("skills:toggle", skillId, active)
  },
  // ── MCP ────────────────────────────────────────────────────────────────────
  mcp: {
    list: () => ipcRenderer.invoke("mcp:list"),
    add: (config) => ipcRenderer.invoke("mcp:add", config),
    remove: (name) => ipcRenderer.invoke("mcp:remove", name),
    testConnection: (name) => ipcRenderer.invoke("mcp:test", name)
  },
  // ── Memory ─────────────────────────────────────────────────────────────────
  memory: {
    readGlobal: () => ipcRenderer.invoke("memory:readGlobal"),
    writeGlobal: (content) => ipcRenderer.invoke("memory:writeGlobal", content),
    readProject: (projectId) => ipcRenderer.invoke("memory:readProject", projectId),
    writeProject: (projectId, content) => ipcRenderer.invoke("memory:writeProject", projectId, content),
    readTodo: () => ipcRenderer.invoke("memory:readTodo")
  },
  // ── File System ────────────────────────────────────────────────────────────
  fs: {
    pickFolder: () => ipcRenderer.invoke("fs:pickFolder"),
    pickFile: () => ipcRenderer.invoke("fs:pickFile"),
    fileTree: (dirPath, depth) => ipcRenderer.invoke("fs:fileTree", dirPath, depth),
    readFile: (filePath) => ipcRenderer.invoke("fs:readFile", filePath),
    openInFinder: (filePath) => ipcRenderer.invoke("fs:openInFinder", filePath),
    openExternal: (url) => ipcRenderer.invoke("fs:openExternal", url)
  }
});
