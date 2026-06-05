/**
 * AgentManager — Desktop için proje başına izole Agent yönetimi.
 *
 * Her projenin kendi Agent instance'ı vardır.
 * Agent oluşturulurken proje instructions + global config kullanılır.
 */

import path from 'path'
import os from 'os'
import fs from 'fs'
import { Agent } from '../core/agent.js'
import { LLM } from '../core/llm.js'
import { getProjectDB, ProjectRecord } from './project_db.js'

const GLOBAL_DIR = path.join(os.homedir(), '.cowrangler')
const TODO_FILE = path.join(GLOBAL_DIR, 'AGENT_TODO.md')

export interface TaskProgress {
  id: string
  text: string
  status: 'pending' | 'in_progress' | 'completed'
}

export class AgentManager {
  private agents = new Map<string, Agent>()
  private workdirs = new Map<string, string>()
  private todoWatchers = new Map<string, fs.FSWatcher>()

  /**
   * Proje için Agent instance'ı döndürür veya oluşturur.
   * model parametresi geçilirse override eder.
   */
  getOrCreate(
    projectId: string,
    config: { model: string; systemPrompt: string },
    workdir?: string,
  ): Agent {
    if (!this.agents.has(projectId)) {
      const llm = new LLM(config.model)
      const agent = new Agent(llm, config.systemPrompt, 25, undefined, 'desktop')
      this.agents.set(projectId, agent)
      if (workdir) this.workdirs.set(projectId, workdir)
    }
    return this.agents.get(projectId)!
  }

  /** Agent'ı yeniden oluştur (model/instructions değişti) */
  recreate(
    projectId: string,
    config: { model: string; systemPrompt: string },
    workdir?: string,
  ): Agent {
    this.destroy(projectId)
    return this.getOrCreate(projectId, config, workdir)
  }

  get(projectId: string): Agent | null {
    return this.agents.get(projectId) ?? null
  }

  interrupt(projectId: string): void {
    this.agents.get(projectId)?.requestInterrupt()
  }

  destroy(projectId: string): void {
    this.agents.delete(projectId)
    this.workdirs.delete(projectId)
    const w = this.todoWatchers.get(projectId)
    if (w) { w.close(); this.todoWatchers.delete(projectId) }
  }

  destroyAll(): void {
    for (const id of this.agents.keys()) this.destroy(id)
  }

  getWorkdir(projectId: string): string | null {
    return this.workdirs.get(projectId) ?? null
  }

  /** TODO dosyasını parse ederek TaskProgress[] döndürür. */
  static parseTodo(content: string): TaskProgress[] {
    const lines = content.split('\n')
    const tasks: TaskProgress[] = []
    let idx = 0
    for (const line of lines) {
      const checkedMatch = line.match(/^\s*-\s*\[x\]\s*(.+)/i)
      const uncheckedMatch = line.match(/^\s*-\s*\[ \]\s*(.+)/)
      const inProgressMatch = line.match(/^\s*-\s*\[~\]\s*(.+)/)
      if (checkedMatch) {
        tasks.push({ id: String(idx++), text: checkedMatch[1].trim(), status: 'completed' })
      } else if (inProgressMatch) {
        tasks.push({ id: String(idx++), text: inProgressMatch[1].trim(), status: 'in_progress' })
      } else if (uncheckedMatch) {
        tasks.push({ id: String(idx++), text: uncheckedMatch[1].trim(), status: 'pending' })
      }
    }
    return tasks
  }

  /** Global TODO dosyasını oku ve parse et. */
  static readTodo(): TaskProgress[] {
    if (!fs.existsSync(TODO_FILE)) return []
    try {
      const content = fs.readFileSync(TODO_FILE, 'utf-8')
      return AgentManager.parseTodo(content)
    } catch {
      return []
    }
  }

  /** TODO dosyasını izle — değişince callback çağır. */
  watchTodo(projectId: string, onChange: (tasks: TaskProgress[]) => void): void {
    if (this.todoWatchers.has(projectId)) return
    // Dosya yoksa önce oluştur
    if (!fs.existsSync(TODO_FILE)) fs.writeFileSync(TODO_FILE, '', 'utf-8')

    let debounce: ReturnType<typeof setTimeout> | null = null
    try {
      const watcher = fs.watch(TODO_FILE, () => {
        if (debounce) clearTimeout(debounce)
        debounce = setTimeout(() => {
          onChange(AgentManager.readTodo())
        }, 100)
      })
      this.todoWatchers.set(projectId, watcher)
    } catch {
      // Watch başlatılamazsa sessizce geç
    }
  }

  stopWatchTodo(projectId: string): void {
    const w = this.todoWatchers.get(projectId)
    if (w) { w.close(); this.todoWatchers.delete(projectId) }
  }
}

export const agentManager = new AgentManager()
