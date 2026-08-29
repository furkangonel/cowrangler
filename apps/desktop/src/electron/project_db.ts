/**
 * ProjectDB — Desktop uygulaması için proje veritabanı.
 * Projeler, klasörler, instructions ve session ilişkileri burada saklanır.
 */

import Database from 'better-sqlite3'
import path from 'path'
import os from 'os'
import fs from 'fs'
import crypto from 'crypto'

export interface ProjectRecord {
  id: string
  name: string
  description: string | null
  workdir: string | null
  icon: string
  color: string
  created_at: number
  updated_at: number
  pinned: number
  archived: number
}

export interface ProjectFolder {
  id: string
  project_id: string
  folder_path: string
  label: string | null
  added_at: number
}

export interface ProjectSummary extends ProjectRecord {
  folder_count: number
  session_count: number
  last_session_at: number | null
  instructions: string | null
}

export interface CreateProjectInput {
  name: string
  description?: string
  workdir?: string
  icon?: string
  color?: string
}

const DB_PATH = path.join(os.homedir(), '.cowrangler', 'projects.db')

export class ProjectDB {
  private db: Database.Database

  constructor(dbPath: string = DB_PATH) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this._migrate()
  }

  private _migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        workdir TEXT,
        icon TEXT NOT NULL DEFAULT '📁',
        color TEXT NOT NULL DEFAULT '#e05c2a',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS project_folders (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        folder_path TEXT NOT NULL,
        label TEXT,
        added_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project_instructions (
        project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        content TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project_sessions (
        project_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
        PRIMARY KEY (project_id, session_id)
      );

      CREATE INDEX IF NOT EXISTS idx_project_sessions_project ON project_sessions(project_id);
    `)

    // Pre-v2 databases could contain the same source folder more than once
    // because project_folders only had a random-id primary key. Keep the oldest
    // row, then make the actual project/path pair unique.
    this.db.exec(`
      DELETE FROM project_folders
      WHERE rowid NOT IN (
        SELECT MIN(rowid) FROM project_folders GROUP BY project_id, folder_path
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_project_folders_unique
      ON project_folders(project_id, folder_path);

      -- Archive is no longer a product concept. Older archived projects become
      -- normal local projects again instead of being stranded in the database.
      UPDATE projects SET archived = 0 WHERE archived != 0;
    `)
  }

  // ── Projects ──────────────────────────────────────────────────────────────

  create(input: CreateProjectInput): ProjectRecord {
    const id = crypto.randomUUID()
    const now = Date.now()
    const record: ProjectRecord = {
      id,
      name: input.name,
      description: input.description ?? null,
      workdir: input.workdir ?? null,
      icon: input.icon ?? '📁',
      color: input.color ?? '#e05c2a',
      created_at: now,
      updated_at: now,
      pinned: 0,
      archived: 0,
    }
    this.db.prepare(`
      INSERT INTO projects (id, name, description, workdir, icon, color, created_at, updated_at, pinned, archived)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id, record.name, record.description, record.workdir,
      record.icon, record.color, record.created_at, record.updated_at,
      record.pinned, record.archived,
    )
    return record
  }

  get(id: string): ProjectRecord | null {
    return (this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRecord | undefined) ?? null
  }

  list(): ProjectSummary[] {
    const rows = this.db.prepare(`
      SELECT
        p.*,
        pi.content as instructions,
        (SELECT COUNT(*) FROM project_folders WHERE project_id = p.id) as folder_count,
        (SELECT COUNT(*) FROM project_sessions WHERE project_id = p.id) as session_count,
        (SELECT MAX(ps.created_at) FROM project_sessions ps WHERE ps.project_id = p.id) as last_session_at
      FROM projects p
      LEFT JOIN project_instructions pi ON pi.project_id = p.id
      ORDER BY p.pinned DESC, p.updated_at DESC
    `).all() as ProjectSummary[]
    return rows
  }

  update(id: string, data: Partial<Pick<ProjectRecord, 'name' | 'description' | 'workdir' | 'icon' | 'color' | 'pinned' | 'archived'>>): void {
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ')
    const values = Object.values(data)
    this.db.prepare(`UPDATE projects SET ${fields}, updated_at = ? WHERE id = ?`).run(...values, Date.now(), id)
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  }

  // ── Instructions ──────────────────────────────────────────────────────────

  getInstructions(projectId: string): string {
    const row = this.db.prepare('SELECT content FROM project_instructions WHERE project_id = ?').get(projectId) as { content: string } | undefined
    return row?.content ?? ''
  }

  setInstructions(projectId: string, content: string): void {
    this.db.prepare(`
      INSERT INTO project_instructions (project_id, content, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
    `).run(projectId, content, Date.now())
  }

  // ── Folders ───────────────────────────────────────────────────────────────

  getFolders(projectId: string): ProjectFolder[] {
    return this.db.prepare('SELECT * FROM project_folders WHERE project_id = ? ORDER BY added_at ASC').all(projectId) as ProjectFolder[]
  }

  addFolder(projectId: string, folderPath: string, label?: string): ProjectFolder {
    const existing = this.db.prepare(
      'SELECT * FROM project_folders WHERE project_id = ? AND folder_path = ?'
    ).get(projectId, folderPath) as ProjectFolder | undefined
    if (existing) return existing

    const id = crypto.randomUUID()
    const now = Date.now()
    this.db.prepare(`
      INSERT OR IGNORE INTO project_folders (id, project_id, folder_path, label, added_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, projectId, folderPath, label ?? null, now)
    return { id, project_id: projectId, folder_path: folderPath, label: label ?? null, added_at: now }
  }

  removeFolder(projectId: string, folderPath: string): void {
    this.db.prepare('DELETE FROM project_folders WHERE project_id = ? AND folder_path = ?').run(projectId, folderPath)
  }

  // ── Sessions ──────────────────────────────────────────────────────────────

  linkSession(projectId: string, sessionId: string): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO project_sessions (project_id, session_id, created_at) VALUES (?, ?, ?)
    `).run(projectId, sessionId, Date.now())
    this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(Date.now(), projectId)
  }

  getSessionIds(projectId: string): string[] {
    const rows = this.db.prepare(
      'SELECT session_id FROM project_sessions WHERE project_id = ? ORDER BY created_at DESC'
    ).all(projectId) as { session_id: string }[]
    return rows.map(r => r.session_id)
  }

  unlinkSession(projectId: string, sessionId: string): void {
    this.db.prepare('DELETE FROM project_sessions WHERE project_id = ? AND session_id = ?').run(projectId, sessionId)
  }
}

let _projectDB: ProjectDB | null = null

export function getProjectDB(): ProjectDB {
  if (!_projectDB) _projectDB = new ProjectDB()
  return _projectDB
}
