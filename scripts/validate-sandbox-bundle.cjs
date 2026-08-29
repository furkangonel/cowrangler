const fs = require('node:fs')
const path = require('node:path')

function validateSandboxBundle() {
  const repoRoot = path.resolve(__dirname, '..')
  const bundleRoot = path.join(repoRoot, 'packages', 'core', 'src', 'cowrangler-sandbox.bundle')
  const required = [
    'Contents/Info.plist',
    'Contents/Resources/sandbox.sb',
    'Contents/Resources/scripts/runner.sh',
    'Contents/Resources/scripts/runner.ps1',
  ]

  const missing = required.filter((relative) => {
    const absolute = path.join(bundleRoot, relative)
    try {
      const stat = fs.statSync(absolute)
      return !stat.isFile() || stat.size === 0
    } catch {
      return true
    }
  })

  if (missing.length > 0) {
    throw new Error(`Sandbox bundle incomplete; packaging stopped. Missing: ${missing.join(', ')}`)
  }

  if (process.platform !== 'win32') {
    const runner = path.join(bundleRoot, 'Contents/Resources/scripts/runner.sh')
    if ((fs.statSync(runner).mode & 0o111) === 0) {
      throw new Error('Sandbox runner.sh is not executable; packaging stopped.')
    }
  }

  console.log(`Sandbox bundle valid: ${bundleRoot}`)
}

module.exports = async function beforePack() {
  validateSandboxBundle()
}

if (require.main === module) validateSandboxBundle()
