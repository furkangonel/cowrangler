/**
 * Managed workspace — her Cowork projesi için otomatik bir çalışma klasörü.
 *
 * Kullanıcı Settings'ten bir "ana dizin" (workspace root) seçer; varsayılan
 * ~/Documents'tır. Uygulama bunun altında "Cowrangler" adlı bir konteyner
 * klasörü açar ve her proje için içine <proje adı> klasörü oluşturur:
 *
 *     <root>/Cowrangler/<proje adı>/
 *
 * Bu klasör projenin workdir'i olur → COWRNGLR.md, agent'ın ürettiği dosyalar
 * ve session çıktıları hep burada tutulur; Working Folders'ta da görünür.
 */

import path from 'path'
import os from 'os'
import fs from 'fs'
import yaml from 'js-yaml'
import { getProjectDB } from '../project_db.js'

const CONFIG_FILE = path.join(os.homedir(), '.cowrangler', 'config.yaml')
const CONTAINER = 'Cowrangler'

/** Settings'teki workspace_root; ayarlanmamışsa ~/Documents. */
export function getWorkspaceRoot(): string {
  try {
    const cfg = (yaml.load(fs.readFileSync(CONFIG_FILE, 'utf-8')) as any) || {}
    const r = cfg.workspace_root
    if (typeof r === 'string' && r.trim()) return r.trim()
  } catch { /* config yoksa varsayılana düş */ }
  return path.join(os.homedir(), 'Documents')
}

/** Konteyner: <root>/Cowrangler */
export function getContainerDir(): string {
  return path.join(getWorkspaceRoot(), CONTAINER)
}

function sanitize(name: string): string {
  return (
    (name || '')
      .trim()
      .replace(/[/\\:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || 'Untitled'
  )
}

/** <root>/Cowrangler/<proje adı>/ oluşturur (çakışmada -2, -3 …) ve yolunu döner. */
export function createManagedProjectDir(projectName: string): string {
  const container = getContainerDir()
  fs.mkdirSync(container, { recursive: true })
  const base = sanitize(projectName)
  let dir = path.join(container, base)
  let i = 2
  while (fs.existsSync(dir)) dir = path.join(container, `${base}-${i++}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Projeye workdir garanti eder: workdir yoksa (veya diskte yoksa) managed
 * klasör oluşturur, DB'ye yazar ve Working Folders'a kaydeder. workdir döner.
 */
export function ensureProjectWorkdir(projectId: string): string | undefined {
  const db = getProjectDB()
  const p = db.get(projectId)
  if (!p) return undefined
  if (p.workdir && fs.existsSync(p.workdir)) return p.workdir

  const dir = createManagedProjectDir(p.name)
  db.update(projectId, { workdir: dir })
  try { db.addFolder(projectId, dir, 'Project workspace') } catch { /* yinelenmeyi yoksay */ }
  return dir
}
