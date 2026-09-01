import { marked, Renderer } from 'marked'
import hljs from 'highlight.js'

// Configure marked
marked.setOptions({ gfm: true, breaks: true })

const renderer = new Renderer()

const FILE_EXT_RE = /\.(?:html?|jsx?|tsx?|css|scss|json|ya?ml|md|txt|csv|pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|webp|svg|mp4|mov|webm|mp3|wav|m4a|py|rb|rs|go|java|kt|swift|sh|sql)(?:[?#].*)?$/i

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}

function isLocalFileReference(value: string): boolean {
  const clean = value.trim()
  if (/^(?:https?:|mailto:|tel:|#)/i.test(clean)) return false
  return FILE_EXT_RE.test(clean)
}

function fileButton(reference: string, label: string): string {
  return `<button type="button" class="cowr-file-link" data-cowr-file="${encodeURIComponent(reference)}" title="Open ${escapeHtml(reference)}">${label}</button>`
}

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
  const safe = escapeHtml(String(text))
  return isLocalFileReference(String(text)) ? fileButton(String(text), `<code>${safe}</code>`) : `<code>${safe}</code>`
}

renderer.link = function (token: any): string {
  const href = typeof token === 'object' ? (token.href ?? '#') : String(token)
  const text = typeof token === 'object' ? (token.text ?? href) : href
  const title = typeof token === 'object' ? (token.title ?? '') : ''
  if (isLocalFileReference(href) || /^file:\/\//i.test(href)) return fileButton(href, escapeHtml(String(text)))
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
  return `<a href="${escapeHtml(href)}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`
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
