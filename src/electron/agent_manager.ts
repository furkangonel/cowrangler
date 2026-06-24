/**
 * AgentManager — Desktop için proje başına izole Agent yönetimi.
 *
 * Her projenin kendi Agent instance'ı vardır.
 * agent:chat çağrısından önce setProjectContext() ile proje
 * bağlamı ayarlanır — bu sayede manage_todo, memory, COWRNGLR.md
 * hepsi doğru proje dizinini kullanır.
 */

import path from 'path'
import fs from 'fs'
import { Agent } from '../core/agent.js'
import { LLM } from '../core/llm.js'
import { setProjectContext, getProjectTodoFile } from '../core/project_context.js'
import { setWorkspace } from '../tools/file_tools.js'

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
   * Her çağrıda workdir kaydedilir — sonraki chat için bağlam ayarlanır.
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
    }
    if (workdir) this.workdirs.set(projectId, workdir)
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

  /**
   * Chat öncesi proje bağlamını ayarla.
   * Araçların (manage_todo, file_tools vb.) doğru dizini kullanmasını sağlar.
   */
  applyProjectContext(projectId: string): void {
    const workdir = this.workdirs.get(projectId)
    if (workdir) {
      setProjectContext(workdir)
      setWorkspace(workdir)
    }
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

  /**
   * TODO dosyasını oku ve parse et.
   * workdir verilirse o dizindeki tasks.json'u okur; verilmezse project_context'teki güncel yolu kullanır.
   */
  static readTodo(workdir?: string): TaskProgress[] {
    const todoFile = workdir
      ? path.join(workdir, '.cowrangler', 'tasks.json')
      : path.join(getProjectTodoFile(), '..', 'tasks.json')
      
    if (!fs.existsSync(todoFile)) return []
    try {
      const content = fs.readFileSync(todoFile, 'utf-8')
      const parsed = JSON.parse(content)
      if (!parsed.tasks || !Array.isArray(parsed.tasks)) return []
      
      return parsed.tasks.map((t: any) => ({
        id: String(t.index || t.id),
        text: t.title + (t.notes ? ` — ${t.notes}` : ''),
        status: t.status === 'done' ? 'completed' : (t.status === 'in_progress' ? 'in_progress' : 'pending')
      }))
    } catch {
      return []
    }
  }

  /**
   * tasks.json dosyasını izle — değişince callback çağır.
   * Proje workdir'ine dayalı per-project dosyayı izler.
   */
  watchTodo(projectId: string, onChange: (tasks: TaskProgress[]) => void): void {
    if (this.todoWatchers.has(projectId)) return

    const workdir = this.workdirs.get(projectId)
    const todoFile = workdir
      ? path.join(workdir, '.cowrangler', 'tasks.json')
      : path.join(getProjectTodoFile(), '..', 'tasks.json')

    // Dizin + dosyayı hazırla
    fs.mkdirSync(path.dirname(todoFile), { recursive: true })
    if (!fs.existsSync(todoFile)) {
      fs.writeFileSync(todoFile, JSON.stringify({ version: 1, tasks: [], nextIndex: 1 }, null, 2), 'utf-8')
    }

    let debounce: ReturnType<typeof setTimeout> | null = null
    try {
      const watcher = fs.watch(todoFile, () => {
        if (debounce) clearTimeout(debounce)
        debounce = setTimeout(() => {
          onChange(AgentManager.readTodo(workdir))
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
