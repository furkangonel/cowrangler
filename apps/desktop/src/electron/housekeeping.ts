import fs from 'fs'
import os from 'os'
import path from 'path'

const DAY_MS = 24 * 60 * 60 * 1000
const MB = 1024 * 1024

export interface StorageStats {
  totalBytes: number
  cacheBytes: number
  archiveBytes: number
  projectDataBytes: number
  logBytes: number
  tempBytes: number
  lastCleanedAt: number | null
}

export interface CleanupResult extends StorageStats {
  reclaimedBytes: number
  removedFiles: number
}

interface FileEntry { path: string; size: number; mtimeMs: number }

function walkFiles(root: string): FileEntry[] {
  if (!fs.existsSync(root)) return []
  const files: FileEntry[] = []
  const pending = [root]
  while (pending.length) {
    const current = pending.pop()!
    let entries: fs.Dirent[] = []
    try { entries = fs.readdirSync(current, { withFileTypes: true }) } catch { continue }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) pending.push(full)
      else if (entry.isFile()) {
        try {
          const stat = fs.statSync(full)
          files.push({ path: full, size: stat.size, mtimeMs: stat.mtimeMs })
        } catch { /* file disappeared while scanning */ }
      }
    }
  }
  return files
}

function bytesIn(root: string): number {
  return walkFiles(root).reduce((sum, file) => sum + file.size, 0)
}

function removeEmptyParents(filePath: string, stopAt: string): void {
  let current = path.dirname(filePath)
  const stop = path.resolve(stopAt)
  while (current.startsWith(stop + path.sep) && current !== stop) {
    try {
      if (fs.readdirSync(current).length) break
      fs.rmdirSync(current)
      current = path.dirname(current)
    } catch { break }
  }
}

function pruneDirectory(
  root: string,
  opts: { maxAgeMs: number; maxBytes: number; now: number },
): { reclaimedBytes: number; removedFiles: number } {
  const files = walkFiles(root).sort((a, b) => a.mtimeMs - b.mtimeMs)
  let total = files.reduce((sum, file) => sum + file.size, 0)
  let reclaimedBytes = 0
  let removedFiles = 0

  for (const file of files) {
    const expired = opts.now - file.mtimeMs > opts.maxAgeMs
    const overBudget = total > opts.maxBytes
    if (!expired && !overBudget) continue
    try {
      fs.rmSync(file.path, { force: true })
      total -= file.size
      reclaimedBytes += file.size
      removedFiles++
      removeEmptyParents(file.path, root)
    } catch { /* best effort */ }
  }
  return { reclaimedBytes, removedFiles }
}

function cowranglerTempFiles(tempRoot = os.tmpdir()): FileEntry[] {
  let entries: fs.Dirent[] = []
  try { entries = fs.readdirSync(tempRoot, { withFileTypes: true }) } catch { return [] }
  return entries
    .filter((entry) => /^(cowr_exp_|cowrangler-export-|cowrangler-asset-)/.test(entry.name))
    .flatMap((entry) => {
      const full = path.join(tempRoot, entry.name)
      if (entry.isDirectory()) return walkFiles(full)
      try {
        const stat = fs.statSync(full)
        return [{ path: full, size: stat.size, mtimeMs: stat.mtimeMs }]
      } catch { return [] }
    })
}

function tempBytes(tempRoot?: string): number {
  return cowranglerTempFiles(tempRoot).reduce((sum, file) => sum + file.size, 0)
}

export function storageStats(globalRoot = path.join(os.homedir(), '.cowrangler'), tempRoot?: string): StorageStats {
  const marker = path.join(globalRoot, 'cache', '.last-cleaned')
  let lastCleanedAt: number | null = null
  try { lastCleanedAt = Number(fs.readFileSync(marker, 'utf8')) || null } catch { /* not cleaned yet */ }
  const cacheBytes = bytesIn(path.join(globalRoot, 'cache'))
  const archiveBytes = bytesIn(path.join(globalRoot, 'archive'))
  const projectDataBytes = bytesIn(path.join(globalRoot, 'projects'))
  const logBytes = bytesIn(path.join(globalRoot, 'logs'))
  const temp = tempBytes(tempRoot)
  return {
    totalBytes: cacheBytes + archiveBytes + projectDataBytes + logBytes + temp,
    cacheBytes,
    archiveBytes,
    projectDataBytes,
    logBytes,
    tempBytes: temp,
    lastCleanedAt,
  }
}

/**
 * Bounds only machine-generated Cowrangler data. Source folders, project
 * memory, skills, credentials and pinned/live sessions are never touched.
 */
export function runHousekeeping(
  globalRoot = path.join(os.homedir(), '.cowrangler'),
  now = Date.now(),
  tempRoot?: string,
): CleanupResult {
  const policies = [
    { root: path.join(globalRoot, 'cache'), maxAgeMs: 30 * DAY_MS, maxBytes: 64 * MB },
    { root: path.join(globalRoot, 'archive'), maxAgeMs: 180 * DAY_MS, maxBytes: 256 * MB },
    { root: path.join(globalRoot, 'logs'), maxAgeMs: 30 * DAY_MS, maxBytes: 128 * MB },
  ]
  let reclaimedBytes = 0
  let removedFiles = 0
  for (const policy of policies) {
    const result = pruneDirectory(policy.root, { ...policy, now })
    reclaimedBytes += result.reclaimedBytes
    removedFiles += result.removedFiles
  }

  // Attachments are useful while a conversation is recent, but should not
  // become a second permanent copy of the user's files.
  const projectsRoot = path.join(globalRoot, 'projects')
  if (fs.existsSync(projectsRoot)) {
    let stores: fs.Dirent[] = []
    try { stores = fs.readdirSync(projectsRoot, { withFileTypes: true }) } catch { /* ignore */ }
    for (const store of stores.filter((entry) => entry.isDirectory())) {
      const uploads = path.join(projectsRoot, store.name, 'uploads')
      const result = pruneDirectory(uploads, { now, maxAgeMs: 30 * DAY_MS, maxBytes: 256 * MB })
      reclaimedBytes += result.reclaimedBytes
      removedFiles += result.removedFiles
    }
  }

  for (const file of cowranglerTempFiles(tempRoot)) {
    if (now - file.mtimeMs <= DAY_MS) continue
    try {
      fs.rmSync(file.path, { force: true })
      reclaimedBytes += file.size
      removedFiles++
    } catch { /* best effort */ }
  }

  try {
    const marker = path.join(globalRoot, 'cache', '.last-cleaned')
    fs.mkdirSync(path.dirname(marker), { recursive: true })
    fs.writeFileSync(marker, String(now), 'utf8')
  } catch { /* best effort */ }

  return { ...storageStats(globalRoot, tempRoot), reclaimedBytes, removedFiles }
}

export function maybeRunHousekeeping(globalRoot = path.join(os.homedir(), '.cowrangler')): CleanupResult | null {
  const stats = storageStats(globalRoot)
  if (stats.lastCleanedAt && Date.now() - stats.lastCleanedAt < DAY_MS) return null
  return runHousekeeping(globalRoot)
}
