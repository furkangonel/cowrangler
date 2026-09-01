import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../apps/desktop/src/desktop/lib/markdown.js'

describe('desktop markdown file links', () => {
  it('turns generated relative and bare file names into preview actions', () => {
    const html = renderMarkdown('Created `screens/index.html` and `report.pdf`.')
    expect(html).toContain('data-cowr-file="screens%2Findex.html"')
    expect(html).toContain('data-cowr-file="report.pdf"')
  })

  it('keeps URLs as external links', () => {
    const html = renderMarkdown('[Docs](https://example.com/report.pdf)')
    expect(html).toContain('target="_blank"')
    expect(html).not.toContain('data-cowr-file')
  })
})
