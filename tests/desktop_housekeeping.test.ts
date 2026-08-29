import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runHousekeeping, storageStats } from '../apps/desktop/src/electron/housekeeping'

const roots: string[] = []
const DAY_MS = 24 * 60 * 60 * 1000

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

function root(): string {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), 'cowrangler-housekeeping-test-'))
  roots.push(value)
  return value
}

function writeOld(filePath: string, size: number, ageDays: number): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, Buffer.alloc(size))
  const time = new Date(Date.now() - ageDays * DAY_MS)
  fs.utimesSync(filePath, time, time)
}

describe('desktop housekeeping', () => {
  it('reports generated storage by category', () => {
    const globalRoot = root()
    const tempRoot = root()
    writeOld(path.join(globalRoot, 'cache', 'models.json'), 10, 1)
    writeOld(path.join(globalRoot, 'projects', 'demo', 'uploads', 'image.png'), 20, 1)
    writeOld(path.join(tempRoot, 'cowr_exp_old.html'), 30, 1)

    expect(storageStats(globalRoot, tempRoot)).toMatchObject({
      cacheBytes: 10,
      projectDataBytes: 20,
      tempBytes: 30,
      totalBytes: 60,
    })
  })

  it('removes expired managed data without touching source-like files', () => {
    const globalRoot = root()
    const tempRoot = root()
    const expiredCache = path.join(globalRoot, 'cache', 'stale.json')
    const recentCache = path.join(globalRoot, 'cache', 'fresh.json')
    const expiredUpload = path.join(globalRoot, 'projects', 'demo', 'uploads', 'old.png')
    const sourceLike = path.join(globalRoot, 'projects', 'demo', 'memory', 'project.md')
    writeOld(expiredCache, 11, 31)
    writeOld(recentCache, 13, 2)
    writeOld(expiredUpload, 17, 31)
    writeOld(sourceLike, 19, 365)

    const result = runHousekeeping(globalRoot, Date.now(), tempRoot)

    expect(result.removedFiles).toBe(2)
    expect(result.reclaimedBytes).toBe(28)
    expect(fs.existsSync(expiredCache)).toBe(false)
    expect(fs.existsSync(expiredUpload)).toBe(false)
    expect(fs.existsSync(recentCache)).toBe(true)
    expect(fs.existsSync(sourceLike)).toBe(true)
  })
})
