/**
 * project_context — Aktif proje bağlamı için singleton.
 *
 * Desktop: Her agent:chat çağrısından önce setProjectContext() çağrılır.
 * CLI:     process.cwd() varsayılanı kullanılır — davranış değişmez.
 *
 * Araçlar (manage_todo, file_tools vb.) bu modülden path'leri alır
 * böylece hem CLI hem desktop doğru dizinlerde çalışır.
 */

import path from 'path'

// Başlangıç değeri: CLI için process.cwd() doğru davranışı verir
let _workdir: string = process.cwd()

// Şu anki aktif session ID'si. Agent veya dispatcher tarafından ayarlanır.
let _activeSessionId: string | null = null

/**
 * Aktif proje çalışma dizinini ayarla.
 * Desktop: agent chat başlamadan önce çağrılır.
 * CLI:     çağrılmaz — process.cwd() kullanılır.
 */
export function setProjectContext(workdir: string): void {
  _workdir = workdir
}

/** Aktif proje çalışma dizini */
export function getProjectWorkdir(): string {
  return _workdir
}

/**
 * Aktif session ID'yi ayarla.
 * Bu ID, task manager gibi session bazlı dosyalara erişmesi gereken modüller tarafından kullanılır.
 */
export function setActiveSessionId(sessionId: string | null): void {
  _activeSessionId = sessionId
}

export function getActiveSessionId(): string | null {
  return _activeSessionId
}

/** Aktif proje TODO dosyası ({workdir}/.cowrangler/AGENT_TODO.md) */
export function getProjectTodoFile(): string {
  return path.join(_workdir, '.cowrangler', 'AGENT_TODO.md')
}

/** Aktif proje bellek dizini ({workdir}/.cowrangler/memory) */
export function getProjectMemoryDir(): string {
  return path.join(_workdir, '.cowrangler', 'memory')
}

/** Aktif proje tasks dizini ({workdir}/.cowrangler/tasks/<sessionId>) */
export function getProjectTasksDir(sessionId?: string): string {
  const sid = sessionId ?? _activeSessionId ?? "default"
  return path.join(_workdir, '.cowrangler', 'tasks', sid)
}

/** Aktif proje plans dosyası ({workdir}/.cowrangler/plans/<sessionId>.md) */
export function getProjectPlanFile(sessionId?: string): string {
  const sid = sessionId ?? _activeSessionId ?? "default"
  return path.join(_workdir, '.cowrangler', 'plans', `${sid}.md`)
}

/** Aktif proje COWRNGLR.md dosyası ({workdir}/COWRNGLR.md) */
export function getProjectCowrnglrMd(): string {
  return path.join(_workdir, 'COWRNGLR.md')
}

/** Aktif proje yerel skill dizini ({workdir}/.cowrangler/skills) */
export function getProjectLocalSkillsDir(): string {
  return path.join(_workdir, '.cowrangler', 'skills')
}

/**
 * Aktif projenin CONTEXT dizini ({workdir}/.cowrangler/context).
 * CONTEXT = agent kararıyla yazılan MEMORY + çağrılınca kopyalanan SKILL'ler.
 */
export function getProjectContextDir(): string {
  return path.join(_workdir, '.cowrangler', 'context')
}

/** CONTEXT'e kopyalanmış SKILL'lerin dizini ({workdir}/.cowrangler/context/skills) */
export function getProjectContextSkillsDir(): string {
  return path.join(getProjectContextDir(), 'skills')
}
