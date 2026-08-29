/**
 * project_context — Aktif proje bağlamı + kanonik veri yerleşiminin TEK kaynağı.
 *
 * Desktop: Her agent:chat çağrısından önce setProjectContext() çağrılır.
 * CLI:     process.cwd() varsayılanı kullanılır — davranış değişmez.
 *
 * ── Veri yerleşimi ilkesi ────────────────────────────────────────────────────
 * Bir projede çalışırken üretilen veriler İKİ sınıfa ayrılır:
 *
 *   1) PROJE-YAZIMI (insan yazar, git'e girmeye değer, küçük)
 *        {workdir}/.cowrangler/config.yaml   proje ayar override'ları
 *        {workdir}/.cowrangler/memory/        proje belleği (project.md)
 *        {workdir}/.cowrangler/skills/        proje skill tanımları
 *        {workdir}/.cowrangler/agents/        proje agent tanımları
 *        {workdir}/COWRNGLR.md                proje talimatları
 *      → Bunlar projede kalır. Yalnızca kullanıcı/ajan bilinçli oluşturunca yazılır.
 *
 *   2) ÜRETİLEN / OTURUM VERİSİ (makine-lokal, geçici, büyüyebilir)
 *        history, recall.jsonl, tasks/, plans/, context/, uploads/, audit.log
 *      → Bunlar ASLA projeye yazılmaz. Global "proje deposu" altına gider:
 *        ~/.cowrangler/projects/<label>-<hash>/…
 *      Böylece her çalışılan proje dizini temiz kalır; hiçbir proje kökü
 *      oturum çöpü, kopyalanmış skill veya indirilmiş plugin ile şişmez.
 *
 * Plugin'ler de makine-geneli bir kaynaktır ve YALNIZCA ~/.cowrangler/plugins/
 * altında tutulur (bkz. plugins.ts). Proje dizinine plugin klonlanmaz.
 */

import path from 'path'
import os from 'os'
import fs from 'fs'
import crypto from 'crypto'

// Başlangıç değeri: CLI için process.cwd() doğru davranışı verir
let _workdir: string = process.cwd()

// Şu anki aktif session ID'si. Agent veya dispatcher tarafından ayarlanır.
let _activeSessionId: string | null = null

/** Global kök (~/.cowrangler veya COWRANGLER_HOME). */
const GLOBAL_HOME = process.env.COWRANGLER_HOME ?? path.join(os.homedir(), '.cowrangler')

/**
 * Aktif proje çalışma dizinini ayarla.
 * Desktop: agent chat başlamadan önce çağrılır.
 * CLI:     çağrılmaz — process.cwd() kullanılır.
 *
 * İlk kez görülen her workdir için eski yerleşimden yeni yerleşime tek seferlik,
 * güvenli, idempotent bir taşıma (migration) tetikler.
 */
export function setProjectContext(workdir: string): void {
  _workdir = workdir
  migrateProjectLayout(workdir)
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

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL PROJE DEPOSU (üretilen / oturum verisi)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verilen mutlak workdir için global proje deposu yolu (saf fonksiyon).
 * Etiket + kararlı hash: aynı yol → aynı depo; farklı yollar çakışmaz.
 */
export function projectStoreDirFor(workdir: string): string {
  const abs = path.resolve(workdir)
  const hash = crypto.createHash('sha256').update(abs).digest('hex').slice(0, 16)
  const label = (path.basename(abs) || 'root').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 48)
  return path.join(GLOBAL_HOME, 'projects', `${label}-${hash}`)
}

/** Aktif workdir'in global proje deposu. Üretilen/oturum verisi buraya gider. */
export function getProjectStoreDir(): string {
  return projectStoreDirFor(_workdir)
}

/** Aktif proje TODO dosyası (global depo altında) */
export function getProjectTodoFile(): string {
  return path.join(getProjectStoreDir(), 'AGENT_TODO.md')
}

/** Aktif proje tasks dizini (global depo/<sessionId>) */
export function getProjectTasksDir(sessionId?: string): string {
  const sid = sessionId ?? _activeSessionId ?? 'default'
  return path.join(getProjectStoreDir(), 'tasks', sid)
}

/**
 * Aktif proje plan dosyası (makine-lokal proje deposunda).
 */
export function getProjectPlanFile(sessionId?: string): string {
  const sid = sessionId ?? _activeSessionId ?? 'default'
  return path.join(getProjectStoreDir(), 'plans', `${sid}.md`)
}

/** REPL/sohbet geçmişi (global depo/history) */
export function getProjectHistoryFile(): string {
  return path.join(getProjectStoreDir(), 'history')
}

/** Semantik recall günlüğü (global depo/memory/recall.jsonl) */
export function getProjectRecallFile(): string {
  return path.join(getProjectStoreDir(), 'memory', 'recall.jsonl')
}

/** Sandbox denetim günlüğü (global depo/audit.log) */
export function getProjectAuditLog(): string {
  return path.join(getProjectStoreDir(), 'audit.log')
}

/**
 * Aktif projenin CONTEXT dizini (global depo/context).
 * CONTEXT = agent kararıyla yazılan MEMORY + çağrılınca kopyalanan SKILL'ler.
 * Üretilen veri olduğu için proje dizinine değil global depoya gider.
 */
export function getProjectContextDir(): string {
  return path.join(getProjectStoreDir(), 'context')
}

/**
 * CONTEXT'e kopyalanmış SKILL'lerin dizini (global depo/context/skills/<sessionId>).
 * SESSION-SCOPED — bir skill `utilize_skill` ile çağrıldığında yalnızca ÇAĞRILDIĞI
 * session'ın klasörüne kopyalanır; başka session'lara sızmaz ve proje dizinini kirletmez.
 */
export function getProjectContextSkillsDir(sessionId?: string): string {
  const sid = sessionId ?? _activeSessionId ?? 'default'
  return path.join(getProjectContextDir(), 'skills', sid)
}

/**
 * CONTEXT'e kopyalanmış AGENT tanımlarının dizini
 * (global depo/context/agents/<sessionId>). Session-scoped.
 */
export function getProjectContextAgentsDir(sessionId?: string): string {
  const sid = sessionId ?? _activeSessionId ?? 'default'
  return path.join(getProjectContextDir(), 'agents', sid)
}

/** Session-scoped bellek dosyası (global depo/context/memory/<sessionId>.md). */
export function getProjectSessionMemoryFile(sessionId?: string): string {
  const sid = sessionId ?? _activeSessionId ?? 'default'
  return path.join(getProjectContextDir(), 'memory', `${sid}.md`)
}

// ─────────────────────────────────────────────────────────────────────────────
// PROJE-YAZIMI VERİ (projede kalır — insan yazar, git'e değer)
// ─────────────────────────────────────────────────────────────────────────────

/** Aktif proje bellek dizini ({workdir}/.cowrangler/memory) */
export function getProjectMemoryDir(): string {
  return path.join(_workdir, '.cowrangler', 'memory')
}

/** Aktif proje yerel skill dizini ({workdir}/.cowrangler/skills) */
export function getProjectLocalSkillsDir(): string {
  return path.join(_workdir, '.cowrangler', 'skills')
}

/** Aktif proje yerel agent dizini ({workdir}/.cowrangler/agents) */
export function getProjectLocalAgentsDir(): string {
  return path.join(_workdir, '.cowrangler', 'agents')
}

/** Aktif proje COWRNGLR.md dosyası ({workdir}/COWRNGLR.md) */
export function getProjectCowrnglrMd(): string {
  return path.join(_workdir, 'COWRNGLR.md')
}

// ─────────────────────────────────────────────────────────────────────────────
// TEK SEFERLİK, GÜVENLİ MIGRATION (eski yerleşim → yeni yerleşim)
// ─────────────────────────────────────────────────────────────────────────────

const _migrated = new Set<string>()

/** rename dener; cross-device (EXDEV) durumunda kopyala+sil ile taşır. */
function safeMove(src: string, dest: string): void {
  if (!fs.existsSync(src) || fs.existsSync(dest)) return
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  try {
    fs.renameSync(src, dest)
  } catch {
    fs.cpSync(src, dest, { recursive: true })
    fs.rmSync(src, { recursive: true, force: true })
  }
}

/**
 * Eski, proje-kirletici yerleşimi tek seferde yeni yerleşime taşır. İdempotent:
 * bellek-içi guard + depodaki `.migrated` işaretçisiyle korunur. Best-effort —
 * her adım kendi try/catch'inde; bir hata diğer adımları veya uygulamayı durdurmaz.
 *
 * Yapılanlar:
 *   - {workdir}/.cowrangler/plugins/*        → ~/.cowrangler/plugins/  (global)
 *   - {workdir}/.cowrangler/{history,tasks,plans,context} → global depoya
 *   - {workdir}/.cowrangler/memory/recall.jsonl           → global depoya
 *   - {workdir}/.cowrangler/audit.log                     → global depoya
 *   - eski {workdir}/.cowrangler/memory.md   → memory/project.md (yoksa) ya da silinir
 *   - eski boş {workdir}/.cowrangler/tasks.json ve .DS_Store artıkları silinir
 */
export function migrateProjectLayout(workdir: string): void {
  const abs = path.resolve(workdir)
  if (_migrated.has(abs)) return
  _migrated.add(abs)

  const legacyBase = path.join(abs, '.cowrangler')
  const store = projectStoreDirFor(abs)
  const marker = path.join(store, '.migrated-v2')

  try {
    if (fs.existsSync(marker)) return
  } catch { /* devam */ }

  const step = (fn: () => void) => { try { fn() } catch { /* best-effort */ } }

  if (fs.existsSync(legacyBase)) {
    // 1) Plugin'leri global'e taşı
    step(() => {
      const legacyPlugins = path.join(legacyBase, 'plugins')
      if (!fs.existsSync(legacyPlugins)) return
      const globalPlugins = path.join(GLOBAL_HOME, 'plugins')
      for (const entry of fs.readdirSync(legacyPlugins)) {
        if (entry === '.DS_Store') continue
        safeMove(path.join(legacyPlugins, entry), path.join(globalPlugins, entry))
      }
      fs.rmSync(legacyPlugins, { recursive: true, force: true })
    })

    // 2) Üretilen/oturum verisini global depoya taşı.
    step(() => safeMove(path.join(legacyBase, 'history'), path.join(store, 'history')))
    step(() => safeMove(path.join(legacyBase, 'tasks'), path.join(store, 'tasks')))
    step(() => safeMove(path.join(legacyBase, 'plans'), path.join(store, 'plans')))
    step(() => safeMove(path.join(legacyBase, 'context'), path.join(store, 'context')))
    step(() => safeMove(path.join(legacyBase, 'audit.log'), path.join(store, 'audit.log')))
    step(() => safeMove(
      path.join(legacyBase, 'memory', 'recall.jsonl'),
      path.join(store, 'memory', 'recall.jsonl'),
    ))

    // 3) Eski şema kalıntılarını temizle
    step(() => {
      const legacyMem = path.join(legacyBase, 'memory.md')
      if (!fs.existsSync(legacyMem)) return
      const projectMem = path.join(legacyBase, 'memory', 'project.md')
      const body = fs.readFileSync(legacyMem, 'utf-8')
      // Anlamlı içerik varsa yeni konuma taşı; yoksa (şablon/boş) sil.
      const meaningful = body.replace(/^#.*$/gm, '').trim().length > 0
      if (meaningful && !fs.existsSync(projectMem)) {
        fs.mkdirSync(path.dirname(projectMem), { recursive: true })
        fs.writeFileSync(projectMem, body, 'utf-8')
      }
      fs.rmSync(legacyMem, { force: true })
    })
    step(() => {
      const legacyTasksJson = path.join(legacyBase, 'tasks.json')
      if (fs.existsSync(legacyTasksJson) && fs.statSync(legacyTasksJson).size === 0) {
        fs.rmSync(legacyTasksJson, { force: true })
      }
    })
    step(() => {
      const ds = path.join(legacyBase, '.DS_Store')
      if (fs.existsSync(ds)) fs.rmSync(ds, { force: true })
    })

    // 4) legacyBase tamamen boşaldıysa (proje-yazımı hiçbir şey kalmadıysa) kaldır
    step(() => {
      const remaining = fs.readdirSync(legacyBase).filter((e) => e !== '.DS_Store')
      if (remaining.length === 0) fs.rmSync(legacyBase, { recursive: true, force: true })
    })
  }

  step(() => {
    fs.mkdirSync(store, { recursive: true })
    fs.writeFileSync(marker, new Date().toISOString(), 'utf-8')
  })
}
