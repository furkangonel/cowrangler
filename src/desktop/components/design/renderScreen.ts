/**
 * Screen → iframe srcDoc builder for Design Mode.
 *
 * Each design file in `screens/` can be one of four kinds — HTML, a React/JSX
 * component, a raw SVG, or a Mermaid diagram. This module turns the raw file
 * content into a self-contained HTML document the canvas can drop into a
 * sandboxed iframe, with two shared capabilities injected into every kind:
 *
 *   1. a resize reporter that posts the rendered content's natural size back to
 *      the parent (so the canvas can size frames to content), and
 *   2. a live-tweak channel — CSS custom properties are applied on first paint
 *      AND can be updated at runtime via postMessage, which is what powers the
 *      Tweaks panel sliders/swatches without a full reload.
 *
 * Libraries load from cdnjs (React, ReactDOM, Babel, Mermaid); Tailwind from its
 * play CDN — matching the artifact runtime the agent targets.
 */

export type RenderKind = 'html' | 'jsx' | 'svg' | 'mermaid'

export interface BuildOpts {
  kind: RenderKind
  raw: string
  filePath: string
  /** Initial CSS variable values to apply on first paint (var name → value). */
  vars?: Record<string, string>
  /** Inject the resize reporter (default true). */
  resize?: boolean
  /** Transparent page background instead of white (used for SVG/mermaid stages). */
  transparent?: boolean
  /** Optional shared stylesheet content to inline (e.g. a sibling shared.css). */
  css?: string
}

// unpkg major-range URLs resolve to the latest patch and are reliable (the
// pinned cdnjs Babel build was 404ing, which is why .jsx rendered blank).
const CDN = {
  react: 'https://unpkg.com/react@18/umd/react.production.min.js',
  reactDom: 'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  babel: 'https://unpkg.com/@babel/standalone@7/babel.min.js',
  tailwind: 'https://cdn.tailwindcss.com',
  mermaid: 'https://unpkg.com/mermaid@11/dist/mermaid.min.js',
}

function escapeForScript(s: string): string {
  // Safe to embed inside a <script> string literal.
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/<\/script>/gi, '<\\/script>')
}

/** Escape for embedding inside a JS template literal: also neutralize ${…} so
 *  template literals in the user's own code aren't interpolated by our wrapper. */
function escapeTemplate(s: string): string {
  return escapeForScript(s).replace(/\$\{/g, '\\${')
}

function varsToCss(vars?: Record<string, string>): string {
  if (!vars) return ''
  const body = Object.entries(vars)
    .map(([k, v]) => `${k.startsWith('--') ? k : `--${k}`}: ${v};`)
    .join('')
  return body ? `:root{${body}}` : ''
}

/** Injected at the end of <body> for every kind. */
function runtimeScript(filePath: string, resize: boolean): string {
  const fp = JSON.stringify(filePath)
  return `<script>(function(){
    function applyVars(vars){ try{ var r=document.documentElement; for(var k in vars){ var name=k.indexOf('--')===0?k:'--'+k; r.style.setProperty(name, String(vars[k])); } }catch(e){} }
    window.addEventListener('message', function(e){
      var d=e.data||{};
      if(d.type==='apply_tweaks'){ applyVars(d.vars||{}); requestAnimationFrame(report); }
    });
    var lastW=0,lastH=0;
    function report(){
      if(!${resize}) return;
      var b=document.body, h=document.documentElement;
      var w=Math.max(b?b.scrollWidth:0, h.scrollWidth);
      var ht=Math.max(b?b.scrollHeight:0, h.scrollHeight);
      if(w!==lastW||ht!==lastH){ lastW=w; lastH=ht; try{ window.parent.postMessage({type:'screen_resize',filePath:${fp},width:w,height:ht},'*'); }catch(e){} }
    }
    if(${resize}){
      try{ new ResizeObserver(report).observe(document.documentElement); }catch(e){}
      window.addEventListener('load', report); setTimeout(report,120); setTimeout(report,600); setTimeout(report,1500);
    }
  })();</script>`
}

/** Normalize module constructs Babel-standalone can't run, and surface the default export. */
function transformJsx(raw: string): string {
  let code = raw
    // Drop import lines (React/Tailwind are provided as globals).
    .replace(/^\s*import[^\n;]*;?\s*$/gm, '')
    // Drop any manual `const {useState,...} = React` — hooks are injected as
    // params below, so a redeclaration would throw.
    .replace(/(^|\n)\s*(const|let|var)\s*\{[^}]*\}\s*=\s*React\s*;?/g, '\n')
  let defaultName: string | null = null
  code = code.replace(/export\s+default\s+(function|class)\s+([A-Za-z0-9_$]+)/, (_m, kw, name) => {
    defaultName = name
    return `${kw} ${name}`
  })
  code = code.replace(/export\s+default\s+([A-Za-z0-9_$]+)\s*;?/, (_m, name) => {
    defaultName = name
    return `;__default = ${name};`
  })
  code = code.replace(/export\s+default\s+/, '__default = ')
  code = code.replace(/export\s+(const|let|var|function|class)\s+/g, '$1 ')
  if (defaultName) code += `\n;__default = ${defaultName};`
  return code
}

function jsxDoc(raw: string, varsCss: string, runtime: string, css = ''): string {
  const body = escapeTemplate(transformJsx(raw))
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="${CDN.tailwind}"></script>
<script src="${CDN.react}"></script>
<script src="${CDN.reactDom}"></script>
<script src="${CDN.babel}"></script>
${css ? `<style>${css}</style>` : ''}
<style>html,body{margin:0}#root{min-height:100vh}${varsCss}
#__err{display:none;font:13px/1.6 ui-monospace,SFMono-Regular,monospace;color:#b03a2e;white-space:pre-wrap;padding:18px}</style>
</head><body><div id="root"></div><pre id="__err"></pre>
<script>
(function(){
  var SRC = \`${body}\`;
  function fail(msg){ var e=document.getElementById('__err'); if(e){ e.style.display='block'; e.textContent='⚠ '+msg; } }
  window.addEventListener('error', function(ev){ fail(ev.message || (ev.error && ev.error.message) || 'Script error'); });
  var tries=0;
  (function boot(){
    if(!(window.Babel && window.React && window.ReactDOM)){ if(tries++>200) return fail('Libraries failed to load (offline?).'); return setTimeout(boot,25); }
    try{
      var out = Babel.transform(SRC, { presets: ['react'], filename: 'screen.jsx' }).code;
      var React = window.React, ReactDOM = window.ReactDOM;
      // Inject hooks as params so bare-hook code (imports stripped) just works.
      var factory = new Function(
        'React','ReactDOM','useState','useEffect','useRef','useMemo','useCallback','useReducer','useContext','createContext','useLayoutEffect','Fragment',
        'var __default;\\n' + out + '\\n;return __default;'
      );
      var C = factory(React, ReactDOM, React.useState, React.useEffect, React.useRef, React.useMemo, React.useCallback, React.useReducer, React.useContext, React.createContext, React.useLayoutEffect, React.Fragment);
      if(!C){ return fail('No default export found — add: export default function App(){…}'); }
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(C));
    }catch(err){ fail((err && err.message) ? err.message : String(err)); }
  })();
})();
</script>
${runtime}</body></html>`
}

function svgDoc(raw: string, varsCss: string, runtime: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;height:100%;display:grid;place-items:center;background:transparent}
svg{max-width:100%;max-height:100%;height:auto;display:block}${varsCss}</style></head>
<body>${raw}${runtime}</body></html>`
}

function mermaidDoc(raw: string, varsCss: string, runtime: string): string {
  const def = escapeForScript(raw.trim())
  return `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;min-height:100%;display:grid;place-items:center;background:transparent}
.mermaid{padding:24px}${varsCss}</style>
<script src="${CDN.mermaid}"></script></head>
<body><div class="mermaid">${def}</div>
<script>
  try { mermaid.initialize({ startOnLoad: true, theme: 'neutral' }); }
  catch(e){ document.body.innerHTML = '<pre style="color:#b03a2e;padding:16px">'+(e.message||e)+'</pre>'; }
</script>
${runtime}</body></html>`
}

function htmlDoc(raw: string, varsCss: string, runtime: string, css = ''): string {
  const head = (css ? `<style>${css}</style>` : '') + (varsCss ? `<style id="od-tweak-vars">${varsCss}</style>` : '')
  const inject = head + runtime
  if (/<\/body>/i.test(raw)) return raw.replace(/<\/body>/i, `${inject}</body>`)
  if (/<\/html>/i.test(raw)) return raw.replace(/<\/html>/i, `${inject}</html>`)
  return raw + inject
}

/** Build the full iframe srcDoc for a screen. */
export function buildSrcDoc(opts: BuildOpts): string {
  const { kind, raw, filePath, vars, resize = true, css = '' } = opts
  const varsCss = varsToCss(vars)
  const runtime = runtimeScript(filePath, resize)
  switch (kind) {
    case 'jsx': return jsxDoc(raw, varsCss, runtime, css)
    case 'svg': return svgDoc(raw, varsCss, runtime)
    case 'mermaid': return mermaidDoc(raw, varsCss, runtime)
    default: return htmlDoc(raw, varsCss, runtime, css)
  }
}

/** Resolve a frame's live CSS variables from its tweak manifest + current values. */
export function resolveTweakVars(
  tweaks: { id: string; var: string; type: string }[] | undefined,
  values: Record<string, string | number | boolean> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {}
  if (!tweaks) return out
  for (const t of tweaks) {
    const v = values?.[t.id]
    if (v === undefined || v === null) continue
    out[t.var] = t.type === 'toggle' ? (v ? '1' : '0') : String(v)
  }
  return out
}

export function kindFromName(name: string): RenderKind {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'jsx') return 'jsx'
  if (ext === 'svg') return 'svg'
  if (ext === 'mermaid' || ext === 'mmd') return 'mermaid'
  return 'html'
}
