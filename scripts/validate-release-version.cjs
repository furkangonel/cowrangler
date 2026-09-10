const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const tag = process.env.GITHUB_REF_NAME || process.argv[2]
if (!tag || !/^v\d+\.\d+\.\d+(?:[-+].+)?$/.test(tag)) {
  throw new Error(`Expected a semantic version tag such as v2.2.1, received: ${tag || '(none)'}`)
}

const manifests = [
  'package.json',
  'apps/cli/package.json',
  'apps/desktop/package.json',
  'packages/core/package.json',
  'packages/adapters/cli/package.json',
  'packages/adapters/code/package.json',
  'packages/adapters/design/package.json',
]
const expected = tag.slice(1)
const mismatches = manifests.flatMap((relative) => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'))
  return manifest.version === expected ? [] : [`${relative}: ${manifest.version}`]
})

if (mismatches.length > 0) {
  throw new Error(`Release tag ${tag} does not match package versions:\n${mismatches.join('\n')}`)
}

console.log(`Release versions match ${tag}`)
