import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8')
const json = (relative: string) => JSON.parse(read(relative))

describe('desktop package contract', () => {
  const rootPackage = json('package.json')
  const desktopPackage = json('apps/desktop/package.json')

  it('declares every external desktop runtime package at the electron-builder project root', () => {
    const externalRuntimePackages = Object.keys(desktopPackage.dependencies)
      .filter((name) => !name.startsWith('@cowrangler/'))
      .filter((name) => name !== 'electron')
    const missing = externalRuntimePackages.filter((name) => !rootPackage.dependencies[name])

    expect(missing).toEqual([])
  })

  it('runs packaged-app validation before creating installers', () => {
    expect(rootPackage.build.afterPack).toBe('scripts/validate-packaged-app.cjs')
    expect(read('scripts/validate-packaged-app.cjs')).toContain('/node_modules/@remotion/bundler/package.json')
  })
})

describe('desktop update release contract', () => {
  const workflow = read('.github/workflows/release-desktop.yml')

  it('never publishes from parallel platform build jobs', () => {
    expect(workflow).not.toContain('electron-builder --publish always')
    expect(workflow).toContain('electron-builder --publish never')
  })

  it('publishes once after all platform artifacts and updater manifests exist', () => {
    expect(workflow).toContain('needs: build')
    expect(workflow).toContain("if: github.ref_type == 'tag'")
    expect(workflow).toContain('test -f release/latest-mac.yml')
    expect(workflow).toContain('test -f release/latest.yml')
    expect(workflow).toContain('test -f release/latest-linux.yml')
    expect(workflow).toContain('gh release create')
    expect(workflow).toContain('gh release edit "$RELEASE_TAG" --draft=false --latest')
  })
})

describe('desktop updater UI contract', () => {
  const main = read('apps/desktop/src/electron/main.ts')
  const updater = read('apps/desktop/src/electron/ipc/update.ipc.ts')
  const preload = read('apps/desktop/src/electron/preload.ts')

  it('starts update checks before potentially slow MCP initialization', () => {
    expect(main.indexOf('startUpdateChecks()')).toBeGreaterThan(-1)
    expect(main.indexOf('startUpdateChecks()')).toBeLessThan(main.indexOf('await bootMcp()'))
  })

  it('retains a status snapshot so a renderer cannot miss startup events', () => {
    expect(updater).toContain("ipcMain.handle('updates:getStatus'")
    expect(preload).toContain("ipcRenderer.invoke('updates:getStatus')")
  })

  it('keeps install user-controlled and schedules periodic checks', () => {
    expect(updater).toContain('autoUpdater.autoDownload = false')
    expect(updater).toContain('autoUpdater.autoInstallOnAppQuit = false')
    expect(updater).toContain('setInterval(')
  })
})
