import { chmod, readdir } from 'node:fs/promises'
import path from 'node:path'

if (process.platform !== 'win32') {
  const moduleRoot = path.resolve('node_modules/node-pty')
  const candidates = [path.join(moduleRoot, 'build/Release/spawn-helper')]

  try {
    const prebuilds = await readdir(path.join(moduleRoot, 'prebuilds'), { withFileTypes: true })
    for (const entry of prebuilds) {
      if (entry.isDirectory()) {
        candidates.push(path.join(moduleRoot, 'prebuilds', entry.name, 'spawn-helper'))
      }
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }

  for (const candidate of candidates) {
    try {
      await chmod(candidate, 0o755)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
}
