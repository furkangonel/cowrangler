import { describe, expect, it } from 'vitest'
import { buildSrcDoc } from '../apps/desktop/src/desktop/components/design/renderScreen'

const remoteThree = '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>'

describe('Design Three.js preview runtime', () => {
  it('uses the bundled runtime without waiting on a parser-blocking CDN script', () => {
    const raw = `<!doctype html><html><head>${remoteThree}</head><body><script>window.booted = !!window.THREE</script></body></html>`
    const doc = buildSrcDoc({
      kind: 'html',
      raw,
      filePath: '/screens/index.html',
      resize: false,
      engine: 'three',
    })

    expect(doc).not.toContain('cdnjs.cloudflare.com/ajax/libs/three.js')
    expect(doc).toContain('window.parent.__COWR_THREE__')
    expect(doc.indexOf('window.parent.__COWR_THREE__')).toBeLessThan(doc.indexOf('window.booted'))
  })

  it('does not rewrite ordinary HTML screens', () => {
    const raw = `<!doctype html><html><head>${remoteThree}</head><body></body></html>`
    const doc = buildSrcDoc({ kind: 'html', raw, filePath: '/screens/index.html', resize: false, engine: 'html' })

    expect(doc).toContain('cdnjs.cloudflare.com/ajax/libs/three.js')
    expect(doc).not.toContain('window.parent.__COWR_THREE__')
  })
})
