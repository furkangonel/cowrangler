import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ProjectDB } from '../apps/desktop/src/electron/project_db.js'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function database() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cowrangler-project-primary-'))
  tempDirs.push(dir)
  return new ProjectDB(path.join(dir, 'projects.db'))
}

describe('project primary folder contract', () => {
  it('keeps exactly one primary and synchronizes project workdir', () => {
    const db = database()
    const project = db.create({ name: 'Multi folder' })

    db.addFolder(project.id, '/workspace/main')
    db.addFolder(project.id, '/workspace/secondary')
    db.setPrimaryFolder(project.id, '/workspace/secondary')

    const folders = db.getFolders(project.id)
    expect(folders.filter(folder => folder.is_primary === 1)).toHaveLength(1)
    expect(folders[0].folder_path).toBe('/workspace/secondary')
    expect(db.get(project.id)?.workdir).toBe('/workspace/secondary')
    db.close()
  })

  it('promotes the next folder when the primary is removed', () => {
    const db = database()
    const project = db.create({ name: 'Fallback' })

    db.addFolder(project.id, '/workspace/first')
    db.addFolder(project.id, '/workspace/second')
    db.removeFolder(project.id, '/workspace/first')

    const folders = db.getFolders(project.id)
    expect(folders).toHaveLength(1)
    expect(folders[0]).toMatchObject({ folder_path: '/workspace/second', is_primary: 1 })
    expect(db.get(project.id)?.workdir).toBe('/workspace/second')
    db.close()
  })
})
