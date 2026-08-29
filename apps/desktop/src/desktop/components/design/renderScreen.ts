/**
 * Screen → iframe srcDoc builder for Design Mode.
 *
 * Each design file in `screens/` can be one of four kinds — HTML, a React/JSX
 * component, a raw SVG, or a Mermaid diagram. This module turns the raw file
 * content into a self-contained HTML document the canvas can drop into a
 * sandboxed iframe, with shared capabilities injected into every kind:
 *
 *   1. a resize reporter that posts the rendered content's natural size back to
 *      the parent (so the canvas can size frames to content),
 *   2. a live-tweak channel — CSS custom properties are applied on first paint
 *      AND can be updated at runtime via postMessage (powers the Tweaks panel),
 *   3. an element inspector (click-to-edit) — when armed via postMessage, hovers
 *      outline elements and a click posts the element's selector/text to the
 *      parent so the user can issue a targeted prompt, and
 *   4. an accessibility scanner — on demand, checks WCAG AA text contrast and
 *      minimum touch-target sizes and posts a report back to the parent.
 *
 * Libraries load with multi-CDN failover (unpkg → jsdelivr → cdnjs) so a single
 * mirror 404ing or being unreachable no longer blanks the render. React/JSX is
 * compiled ahead of time by the parent (esbuild-wasm) when possible; the in-page
 * Babel path is only used as a fallback.
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
  /**
   * Pre-compiled JS for a `jsx` screen (esbuild-wasm output from the parent).
   * When present the iframe runs it directly and skips loading Babel entirely.
   */
  compiledJs?: string
}

// Ordered fallback mirrors per library. The first reachable one wins; if a
// mirror 404s or the network drops, the loader advances to the next. (The pinned
// cdnjs Babel build once 404'd and blanked every .jsx — this removes that class
// of failure.)
const CDN: Record<string, string[]> = {
  react: [
    'https://unpkg.com/react@18/umd/react.production.min.js',
    'https://cdn.jsdelivr.net/npm/react@18/umd/react.production.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js',
  ],
  reactDom: [
    'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
    'https://cdn.jsdelivr.net/npm/react-dom@18/umd/react-dom.production.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js',
  ],
  babel: [
    'https://unpkg.com/@babel/standalone@7/babel.min.js',
    'https://cdn.jsdelivr.net/npm/@babel/standalone@7/babel.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.25.6/babel.min.js',
  ],
  tailwind: [
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4',
  ],
  mermaid: [
    'https://unpkg.com/mermaid@11/dist/mermaid.min.js',
    'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/mermaid/11.4.1/mermaid.min.js',
  ],
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

/** A tiny sequential multi-URL script loader injected into every page that needs
 *  a CDN library. Tries each mirror in turn; calls back with ok/fail. */
function loaderScript(): string {
  return `<script>window.__loadScript=function(urls,test,cb){
    if(test&&test()){return cb(true);}
    var i=0;
    (function next(){
      if(i>=urls.length){return cb(false);}
      var s=document.createElement('script');
      s.src=urls[i++];
      s.onload=function(){ (test&&!test())?next():cb(true); };
      s.onerror=next;
      document.head.appendChild(s);
    })();
  };</script>`
}

/** Injected at the end of <body> for every kind: tweaks, resize, inspector, a11y. */
function runtimeScript(filePath: string, resize: boolean): string {
  const fp = JSON.stringify(filePath)
  return `<script>(function(){
    var fp=${fp};
    function post(msg){ try{ msg.filePath=fp; window.parent.postMessage(msg,'*'); }catch(e){} }

    /* ── Live tweaks ─────────────────────────────────────────────── */
    function applyVars(vars){ try{ var r=document.documentElement; for(var k in vars){ var name=k.indexOf('--')===0?k:'--'+k; r.style.setProperty(name, String(vars[k])); } }catch(e){} }

    /* ── Resize reporter ─────────────────────────────────────────── */
    var lastW=0,lastH=0;
    function report(){
      if(!${resize}) return;
      var b=document.body, h=document.documentElement;
      var w=Math.max(b?b.scrollWidth:0, h.scrollWidth);
      var ht=Math.max(b?b.scrollHeight:0, h.scrollHeight);
      if(w!==lastW||ht!==lastH){ lastW=w; lastH=ht; post({type:'screen_resize',width:w,height:ht}); }
    }

    /* ── Element inspector (click-to-edit) ───────────────────────── */
    var inspecting=false, ov=null, lastEl=null;
    function overlay(){ if(ov) return ov; ov=document.createElement('div'); ov.setAttribute('data-od-overlay','1');
      ov.style.cssText='position:fixed;z-index:2147483646;pointer-events:none;border:2px solid #c24a22;background:rgba(194,74,34,0.12);border-radius:3px;transition:all .04s ease;display:none'; document.body.appendChild(ov); return ov; }
    function selectorFor(el){
      if(!el||el===document.body) return 'body';
      if(el.id) return '#'+el.id;
      var parts=[], node=el, depth=0;
      while(node&&node.nodeType===1&&node!==document.body&&depth<4){
        var tag=node.tagName.toLowerCase();
        var cls=(node.getAttribute&&node.getAttribute('class')||'').trim().split(/\\s+/).filter(Boolean).slice(0,2);
        var seg=tag+(cls.length?'.'+cls.join('.'):'');
        var p=node.parentNode, idx=0, same=0;
        if(p){ for(var i=0;i<p.children.length;i++){ if(p.children[i].tagName===node.tagName){ same++; if(p.children[i]===node) idx=same; } } if(same>1) seg+=':nth-of-type('+idx+')'; }
        parts.unshift(seg); if(node.id){ parts[0]='#'+node.id; break; } node=p; depth++;
      }
      return parts.join(' > ');
    }
    function moveOverlay(el){ var o=overlay(); var r=el.getBoundingClientRect(); o.style.display='block'; o.style.left=r.left+'px'; o.style.top=r.top+'px'; o.style.width=r.width+'px'; o.style.height=r.height+'px'; }
    function onMove(e){ if(!inspecting) return; var el=e.target; if(!el||el===ov) return; lastEl=el; moveOverlay(el); }
    function onClick(e){ if(!inspecting) return; e.preventDefault(); e.stopPropagation(); var el=lastEl||e.target; if(!el) return;
      var r=el.getBoundingClientRect();
      post({type:'element_pick', selector:selectorFor(el), tag:el.tagName.toLowerCase(),
        text:(el.textContent||'').trim().slice(0,80), w:Math.round(r.width), h:Math.round(r.height)}); }
    function setInspect(on){ inspecting=on; if(!on&&ov) ov.style.display='none'; document.body.style.cursor=on?'crosshair':''; }

    /* ── Accessibility scan (WCAG AA contrast + touch targets) ───── */
    function parseColor(c){ if(!c) return null; var m=c.match(/rgba?\\(([^)]+)\\)/); if(!m) return null; var p=m[1].split(',').map(function(x){return parseFloat(x);}); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}; }
    function lum(c){ var a=[c.r,c.g,c.b].map(function(v){ v/=255; return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4); }); return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2]; }
    function ratio(f,b){ var L1=lum(f),L2=lum(b); var hi=Math.max(L1,L2),lo=Math.min(L1,L2); return (hi+0.05)/(lo+0.05); }
    function effectiveBg(el){ var node=el; while(node&&node.nodeType===1){ var bg=parseColor(getComputedStyle(node).backgroundColor); if(bg&&bg.a>0.1) return bg; node=node.parentNode; } return {r:255,g:255,b:255,a:1}; }
    function runA11y(){
      var issues=[]; var all=document.body?document.body.querySelectorAll('*'):[];
      for(var i=0;i<all.length&&issues.length<40;i++){ var el=all[i];
        if(el.getAttribute&&el.getAttribute('data-od-overlay')) continue;
        var cs=getComputedStyle(el);
        // Contrast: elements with a direct text node.
        var hasText=false; for(var n=0;n<el.childNodes.length;n++){ if(el.childNodes[n].nodeType===3 && el.childNodes[n].textContent.trim()){ hasText=true; break; } }
        if(hasText && cs.visibility!=='hidden' && cs.display!=='none'){
          var fg=parseColor(cs.color); var bg=effectiveBg(el);
          if(fg&&fg.a>0.1){ var cr=ratio(fg,bg); var size=parseFloat(cs.fontSize)||16; var bold=(parseInt(cs.fontWeight,10)||400)>=700;
            var large=size>=24||(size>=18.66&&bold); var min=large?3:4.5;
            if(cr<min){ issues.push({type:'contrast', severity:cr<min-1.5?'error':'warn', selector:selectorFor(el),
              detail:'Contrast '+cr.toFixed(2)+':1 (needs '+min+':1) — "'+(el.textContent||'').trim().slice(0,30)+'"'}); } }
        }
        // Touch target: interactive elements below 24×24.
        var tag=el.tagName.toLowerCase(); var role=el.getAttribute&&el.getAttribute('role');
        var interactive=tag==='a'||tag==='button'||tag==='input'||tag==='select'||tag==='textarea'||role==='button';
        if(interactive){ var r=el.getBoundingClientRect(); if(r.width>0&&r.height>0&&(r.width<24||r.height<24)){
          issues.push({type:'touch', severity:'warn', selector:selectorFor(el),
            detail:'Touch target '+Math.round(r.width)+'×'+Math.round(r.height)+'px (min 24×24, 44 ideal)'}); } }
      }
      post({type:'a11y_report', issues:issues, count:issues.length});
    }

    /* ── Message bus ─────────────────────────────────────────────── */
    window.addEventListener('message', function(e){
      var d=e.data||{};
      if(d.type==='apply_tweaks'){ applyVars(d.vars||{}); requestAnimationFrame(report); }
      else if(d.type==='set_inspect'){ setInspect(!!d.on); }
      else if(d.type==='run_a11y'){ try{ runA11y(); }catch(err){ post({type:'a11y_report', issues:[], count:0, error:String(err&&err.message||err)}); } }
      else if(d.type==='highlight_selector'){ try{ highlightSelector(d.selector); }catch(e){} }
    });
    /* Flash the inspector overlay on an element by selector (chip → canvas link). */
    var hlTimer=null;
    function highlightSelector(sel){
      if(!sel) return; var el=null; try{ el=document.querySelector(sel); }catch(e){}
      if(!el) return;
      el.scrollIntoView({block:'center', inline:'center', behavior:'smooth'});
      moveOverlay(el); overlay().style.display='block';
      if(hlTimer) clearTimeout(hlTimer);
      hlTimer=setTimeout(function(){ if(ov && !inspecting) ov.style.display='none'; }, 1800);
    }
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    window.addEventListener('scroll', function(){ if(inspecting&&lastEl) moveOverlay(lastEl); }, true);

    if(${resize}){
      try{ new ResizeObserver(report).observe(document.documentElement); }catch(e){}
      window.addEventListener('load', report); setTimeout(report,120); setTimeout(report,600); setTimeout(report,1500);
    }
  })();</script>`
}

/** Normalize module constructs the compilers can't run, and surface the default export. */
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

/** Strip imports/exports but keep JSX/TS intact — used before esbuild transform. */
export function stripModuleSyntax(raw: string): string {
  return transformJsx(raw)
}

const HOOK_PARAMS = "React','ReactDOM','useState','useEffect','useRef','useMemo','useCallback','useReducer','useContext','createContext','useLayoutEffect','Fragment"
const HOOK_ARGS = 'React, ReactDOM, React.useState, React.useEffect, React.useRef, React.useMemo, React.useCallback, React.useReducer, React.useContext, React.createContext, React.useLayoutEffect, React.Fragment'

function jsxDoc(raw: string, varsCss: string, runtime: string, loader: string, css: string, compiledJs?: string): string {
  const usePrecompiled = typeof compiledJs === 'string'
  const body = escapeTemplate(usePrecompiled ? compiledJs! : transformJsx(raw))
  // With a precompiled body we don't need Babel at all; otherwise load it (failover).
  const babelBoot = usePrecompiled
    ? `var out = SRC;`
    : `if(!window.Babel){ if(tries++>240) return fail('Compiler failed to load (offline?).'); return setTimeout(boot,25); }
       var out = Babel.transform(SRC, { presets: ['react'], filename: 'screen.jsx' }).code;`
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${loader}
${css ? `<style>${css}</style>` : ''}
<style>html,body{margin:0}#root{min-height:100vh}${varsCss}
#__err{display:none;font:13px/1.6 ui-monospace,SFMono-Regular,monospace;color:#b03a2e;white-space:pre-wrap;padding:18px}</style>
</head><body><div id="root"></div><pre id="__err"></pre>
<script>
(function(){
  var SRC = \`${body}\`;
  var PRECOMPILED = ${usePrecompiled ? 'true' : 'false'};
  function fail(msg){ var e=document.getElementById('__err'); if(e){ e.style.display='block'; e.textContent='⚠ '+msg; } }
  window.addEventListener('error', function(ev){ fail(ev.message || (ev.error && ev.error.message) || 'Script error'); });
  var tries=0;
  function ready(){
    window.__loadScript(${JSON.stringify(CDN.tailwind)}, function(){ return !!window.tailwind || document.querySelector('style[data-tailwind]'); }, function(){});
    window.__loadScript(${JSON.stringify(CDN.react)}, function(){ return !!window.React; }, function(rok){
      if(!rok) return fail('React failed to load (offline?).');
      window.__loadScript(${JSON.stringify(CDN.reactDom)}, function(){ return !!window.ReactDOM; }, function(dok){
        if(!dok) return fail('ReactDOM failed to load (offline?).');
        ${usePrecompiled ? 'boot();' : `window.__loadScript(${JSON.stringify(CDN.babel)}, function(){ return !!window.Babel; }, function(){ boot(); });`}
      });
    });
  }
  function boot(){
    try{
      ${babelBoot}
      var React = window.React, ReactDOM = window.ReactDOM;
      var factory = new Function(
        '${HOOK_PARAMS}',
        'var __default;\\n' + out + '\\n;return __default;'
      );
      var C = factory(${HOOK_ARGS});
      if(!C){ return fail('No default export found — add: export default function App(){…}'); }
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(C));
    }catch(err){ fail((err && err.message) ? err.message : String(err)); }
  }
  ready();
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

function mermaidDoc(raw: string, varsCss: string, runtime: string, loader: string): string {
  const def = escapeForScript(raw.trim())
  return `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;min-height:100%;display:grid;place-items:center;background:transparent}
.mermaid{padding:24px}${varsCss}</style>
${loader}</head>
<body><div class="mermaid">${def}</div>
<script>
  window.__loadScript(${JSON.stringify(CDN.mermaid)}, function(){ return !!window.mermaid; }, function(ok){
    if(!ok){ document.body.innerHTML='<pre style="color:#b03a2e;padding:16px">Diagram library failed to load (offline?).</pre>'; return; }
    try { mermaid.initialize({ startOnLoad: true, theme: 'neutral' }); }
    catch(e){ document.body.innerHTML = '<pre style="color:#b03a2e;padding:16px">'+(e.message||e)+'</pre>'; }
  });
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
  const { kind, raw, filePath, vars, resize = true, css = '', compiledJs } = opts
  const varsCss = varsToCss(vars)
  const runtime = runtimeScript(filePath, resize)
  const loader = loaderScript()
  switch (kind) {
    case 'jsx': return jsxDoc(raw, varsCss, runtime, loader, css, compiledJs)
    case 'svg': return svgDoc(raw, varsCss, runtime)
    case 'mermaid': return mermaidDoc(raw, varsCss, runtime, loader)
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
