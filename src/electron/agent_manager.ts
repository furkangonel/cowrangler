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
import { setProjectContext, getActiveSessionId } from '../core/project_context.js'
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
  private todoPollers = new Map<string, ReturnType<typeof setInterval>>()

  /**
   * Proje için Agent instance'ı döndürür veya oluşturur.
   * Her çağrıda workdir kaydedilir — sonraki chat için bağlam ayarlanır.
   */
  getOrCreate(
    projectId: string,
    config: { model: string; systemPrompt: string; allowedTools?: string[]; maxIterations?: number },
    workdir?: string,
  ): Agent {
    if (!this.agents.has(projectId)) {
      const llm = new LLM(config.model)
      const agent = new Agent(llm, config.systemPrompt, config.maxIterations ?? 25, config.allowedTools, 'desktop')
      this.agents.set(projectId, agent)
    } else {
      const existing = this.agents.get(projectId)!
      if (config.allowedTools !== undefined) {
        // Keep tool scope in sync for a cached agent (e.g. chat vs session mode).
        existing.setAllowedTools(config.allowedTools)
      }
      if (config.maxIterations !== undefined) existing.maxIterations = config.maxIterations
    }
    if (workdir) this.workdirs.set(projectId, workdir)
    return this.agents.get(projectId)!
  }

  /** Agent'ı yeniden oluştur (model/instructions değişti) */
  recreate(
    projectId: string,
    config: { model: string; systemPrompt: string; allowedTools?: string[]; maxIterations?: number },
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
   * Reads and parses tasks for a specific session.
   * Does NOT depend on an active Agent instance — works after app restart.
   *
   * @param workdir  Project root directory (e.g. /Users/x/my-project)
   * @param sessionId  Session ID whose tasks to read
   */
  static readTodo(workdir: string, sessionId: string): TaskProgress[] {
    try {
      if (!workdir || !sessionId) return [];

      const dir = path.join(workdir, '.cowrangler', 'tasks', sessionId);

      if (!fs.existsSync(dir)) return [];

      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('.'));
      const tasks: any[] = [];

      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(dir, file), 'utf-8');
          tasks.push(JSON.parse(content));
        } catch { /* ignore malformed files */ }
      }

      tasks.sort((a, b) => {
        const numA = parseInt(a.id, 10);
        const numB = parseInt(b.id, 10);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return String(a.id).localeCompare(String(b.id));
      });

      return tasks.map(t => ({
        id: String(t.id),
        text: t.subject + (t.description ? ` — ${t.description}` : ''),
        status: t.status === 'completed' ? 'completed' : (t.status === 'in_progress' ? 'in_progress' : 'pending')
      }));
    } catch {
      return [];
    }
  }

  /**
   * Watches a specific session's tasks directory for changes.
   * Does NOT depend on an active Agent instance — works after app restart.
   *
   * @param projectId  Used as key for the watcher map
   * @param workdir    Project root directory
   * @param sessionId  Session ID whose tasks directory to watch
   * @param onChange   Callback when tasks change
   */
  watchTodo(projectId: string, workdir: string, sessionId: string, onChange: (tasks: TaskProgress[]) => void): void {
    // Varsa önceki watcher ve poller'ı temizle
    this.stopWatchTodo(projectId);

    if (!workdir || !sessionId) return;

    const dir = path.join(workdir, '.cowrangler', 'tasks', sessionId);

    let debounce: ReturnType<typeof setTimeout> | null = null;
    try {
      fs.mkdirSync(dir, { recursive: true });
      const watcher = fs.watch(dir, () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => onChange(AgentManager.readTodo(workdir, sessionId)), 100);
      });
      this.todoWatchers.set(projectId, watcher);

      // İlk okuma
      onChange(AgentManager.readTodo(workdir, sessionId));
    } catch { /* watch başlatılamazsa sessizce geç */ }

    // Ayrıca getActiveSessionId poller'ı: agent.chat() sırasında yeni
    // session açıldığında watcher'ı otomatik yenile.
    let lastPolledSid = sessionId;
    const poller = setInterval(() => {
      const sid = getActiveSessionId();
      if (sid && sid !== lastPolledSid) {
        lastPolledSid = sid;
        // Yeni session açıldı — watcher'ı yeni dizine taşı
        const newDir = path.join(workdir, '.cowrangler', 'tasks', sid);
        const w = this.todoWatchers.get(projectId);
        if (w) { try { w.close() } catch { } }
        try {
          fs.mkdirSync(newDir, { recursive: true });
          const newWatcher = fs.watch(newDir, () => {
            if (debounce) clearTimeout(debounce);
            debounce = setTimeout(() => onChange(AgentManager.readTodo(workdir, sid)), 100);
          });
          this.todoWatchers.set(projectId, newWatcher);
          onChange(AgentManager.readTodo(workdir, sid));
        } catch { /* sessizce devam */ }
      }
    }, 800);
    this.todoPollers.set(projectId, poller);
  }

  stopWatchTodo(projectId: string): void {
    const w = this.todoWatchers.get(projectId)
    if (w) { try { w.close() } catch { } this.todoWatchers.delete(projectId) }
    const p = this.todoPollers.get(projectId)
    if (p) { clearInterval(p); this.todoPollers.delete(projectId) }
  }
}

export const agentManager = new AgentManager()
