import { marked, Renderer } from 'marked'
import hljs from 'highlight.js'

// Configure marked
marked.setOptions({ gfm: true, breaks: true })

const renderer = new Renderer()

// Code block with syntax highlighting
renderer.code = function (token: any): string {
  // marked v12 passes the whole token object
  const text = typeof token === 'string' ? token : (token.text ?? token)
  const lang = typeof token === 'object' ? (token.lang ?? '') : ''

  const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
  let highlighted: string
  try {
    highlighted = hljs.highlight(String(text), { language }).value
  } catch {
    highlighted = String(text)
  }
  return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`
}

renderer.codespan = function (token: any): string {
  const text = typeof token === 'string' ? token : (token.text ?? String(token))
  return `<code>${text}</code>`
}

renderer.link = function (token: any): string {
  const href = typeof token === 'object' ? (token.href ?? '#') : String(token)
  const text = typeof token === 'object' ? (token.text ?? href) : href
  const title = typeof token === 'object' ? (token.title ?? '') : ''
  const titleAttr = title ? ` title="${title}"` : ''
  return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`
}

marked.use({ renderer })

export function renderMarkdown(content: string): string {
  if (!content) return ''
  try {
    const result = marked(content)
    return typeof result === 'string' ? result : String(result)
  } catch {
    return content.replace(/\n/g, '<br>')
  }
}
