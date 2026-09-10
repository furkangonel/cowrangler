const fs = require('node:fs')
const path = require('node:path')
const asar = require('@electron/asar')

// electron-builder afterPack hook. Fail the build before a DMG/installer can be
// published when a dependency intentionally externalized from the Electron main
// bundle was not copied into app.asar.
module.exports = async function validatePackagedApp(context) {
  const productFilename = context.packager.appInfo.productFilename
  const resourcesDir = process.platform === 'darwin'
    ? path.join(context.appOutDir, `${productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources')
  const archivePath = path.join(resourcesDir, 'app.asar')

  if (!fs.existsSync(archivePath)) {
    throw new Error(`[package validation] app.asar not found: ${archivePath}`)
  }

  const entries = new Set(asar.listPackage(archivePath))
  const requiredEntries = [
    '/apps/desktop/out/main/index.js',
    '/package.json',
    '/node_modules/@remotion/bundler/package.json',
    '/node_modules/@remotion/renderer/package.json',
    '/node_modules/remotion/package.json',
  ]
  const missing = requiredEntries.filter((entry) => !entries.has(entry))

  if (missing.length > 0) {
    throw new Error(
      `[package validation] Required runtime files are missing from app.asar:\n${missing.map((entry) => `  - ${entry}`).join('\n')}`,
    )
  }

  console.log(`[package validation] app.asar contains all ${requiredEntries.length} required runtime files`)
}
