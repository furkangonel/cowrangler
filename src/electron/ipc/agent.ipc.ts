import { IpcMain, BrowserWindow } from 'electron'
import path from 'path'
import os from 'os'
import { agentManager, AgentManager } from '../agent_manager.js'
import { getProjectDB } from '../project_db.js'
import { getSessionDB } from '../../core/session_db.js'
import { getConfig } from '../../core/init.js'
import { LLM } from '../../core/llm.js'
import { Agent } from '../../core/agent.js'

const GLOBAL_DIR = path.join(os.homedir(), '.cowrangler')

function buildSystemPrompt(basePrompt: string, instructions: string): string {
  let prompt = basePrompt
  if (instructions?.trim()) {
    prompt += `\n\n---\n\n## PROJECT INSTRUCTIONS\n\n${instructions}`
  }
  return prompt
}

function getDefaultSystemPrompt(): string {
  return `You are Co-Wrangler — a powerful, enterprise-grade AI agent.

You operate like a senior engineer: methodical, transparent, and accountable.

## CORE BEHAVIOR RULES

### 1. Reason before acting
Before every non-trivial tool call, write one sentence explaining WHY.

### 2. Read before write (ALWAYS)
- Always use read_file before edit_file or write_file.
- Always use git_status before git_commit.

### 3. TODO discipline — MANDATORY for multi-step tasks
If a task requires 3 or more steps:
1. Call manage_todo(action="update") as your VERY FIRST action.
2. Mark each item done with manage_todo(action="mark_done") IMMEDIATELY after completing it.

### 4. Use send_message to communicate
After completing your work, ALWAYS call send_message to deliver your final response.

### 5. Skills — use them
Check available skills and load relevant ones with utilize_skill.`
}

export function registerAgentIPC(ipcMain: IpcMain, win: BrowserWindow): void {
  // ── agent:chat ─────────────────────────────────────────────────────────────
  ipcMain.handle('agent:chat', async (event, projectId: string, sessionId: string | null, message: string) => {
    const sender = event.sender
    const projectDB = getProjectDB()
    const project = projectDB.get(projectId)
    const instructions = projectDB.getInstructions(projectId)
    const config = getConfig()

    const model = config.model || 'openrouter/google/gemini-2.5-flash'
    const systemPrompt = buildSystemPrompt(getDefaultSystemPrompt(), instructions)

    let agent: Agent
    try {
      agent = agentManager.getOrCreate(projectId, { model, systemPrompt }, project?.workdir ?? undefined)
    } catch (err: any) {
      sender.send('agent:error', err.message)
      return
    }

    // Proje workdir'e geç (araçlar için)
    if (project?.workdir) {
      try { process.chdir(project.workdir) } catch { /* devam */ }
    }

    // TODO izlemeyi başlat
    agentManager.watchTodo(projectId, (tasks) => {
      sender.send('agent:progress', tasks)
    })

    // Tool call tracking — zamanlama için
    let currentToolStart = 0
    let currentToolName = ''

    const onToolCall = (name: string, args: any) => {
      currentToolName = name
      currentToolStart = Date.now()
      sender.send('agent:toolCall', {
        name,
        args,
        status: 'start',
        timestamp: Date.now(),
      })
    }

    const onStepText = (text: string) => {
      sender.send('agent:stepText', text)
    }

    try {
      const result = await agent.chat(message, onToolCall, onStepText)

      // Session'ı projeye bağla
      const currentSessionId = agent.currentSessionId
      if (currentSessionId) {
        projectDB.linkSession(projectId, currentSessionId)
      }

      sender.send('agent:done', {
        text: result.text,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        toolCallCount: result.toolCallCount,
        durationMs: result.durationMs,
        sessionId: currentSessionId,
      })
    } catch (err: any) {
      sender.send('agent:error', err.message || String(err))
    }
  })

  // ── agent:interrupt ────────────────────────────────────────────────────────
  ipcMain.handle('agent:interrupt', async (_, projectId: string) => {
    agentManager.interrupt(projectId)
    return { ok: true }
  })

  // ── agent:contextSnapshot ──────────────────────────────────────────────────
  ipcMain.handle('agent:contextSnapshot', async (_, projectId: string) => {
    const agent = agentManager.get(projectId)
    if (!agent) return null
    const snap = agent.getContextSnapshot()
    return {
      ...snap,
      model: agent.llm.model,
      maxContextTokens: snap.contextWindowSize,
    }
  })

  // ── agent:newSession ───────────────────────────────────────────────────────
  ipcMain.handle('agent:newSession', async (_, projectId: string) => {
    agentManager.destroy(projectId)
    return { ok: true }
  })
}
