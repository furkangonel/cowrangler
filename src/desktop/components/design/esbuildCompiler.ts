/**
 * In-renderer JSX/TSX compiler backed by esbuild-wasm.
 *
 * Design screens of kind `jsx` were previously compiled inside the sandboxed
 * iframe by Babel-standalone loaded from a CDN. That path is slow, has no
 * TypeScript support, and blanks the screen when the CDN is unreachable. This
 * module compiles the same source ahead of time in the parent renderer with
 * esbuild-wasm (~10× faster, TS + JSX), and the compiled JS is injected straight
 * into the iframe. Babel remains as the in-iframe fallback for when esbuild-wasm
 * cannot initialize (offline first run with no cached .wasm, unsupported env).
 *
 * We deliberately use `esbuild.transform` (not `build`): it does no module
 * resolution, so `import`/`export` lines are stripped by `stripModuleSyntax`
 * beforehand and React/hook bindings are injected as function params by the
 * iframe wrapper — exactly matching the Babel path.
 */
import { stripModuleSyntax } from './renderScreen'

type EsbuildModule = typeof import('esbuild-wasm')

let esbuildMod: EsbuildModule | null = null
let initPromise: Promise<EsbuildModule | null> | null = null

/** Lazily import + initialize esbuild-wasm exactly once. Returns null if it can't
 *  be set up (so callers fall back to the in-iframe Babel path). */
async function getEsbuild(): Promise<EsbuildModule | null> {
  if (esbuildMod) return esbuildMod
  if (initPromise) return initPromise
  initPromise = (async () => {
    try {
      const esbuild = (await import('esbuild-wasm')) as EsbuildModule
      // Vite resolves the ?url import to a served asset path for the wasm binary.
      const wasmURL = (await import('esbuild-wasm/esbuild.wasm?url')).default as string
      await esbuild.initialize({ wasmURL, worker: true })
      esbuildMod = esbuild
      return esbuild
    } catch (e) {
      console.warn('[design] esbuild-wasm init failed — falling back to in-iframe Babel', e)
      return null
    }
  })()
  return initPromise
}

export interface CompileResult {
  /** Compiled plain JS (React.createElement calls), or undefined on failure. */
  code?: string
  /** First error message when compilation failed. */
  error?: string
  /** True when esbuild was unavailable and the caller should use the Babel path. */
  fallback?: boolean
}

/**
 * Compile a JSX/TSX screen to plain JS. On any esbuild failure returns
 * `{ fallback: true }` so the iframe can compile the raw source with Babel.
 */
export async function compileJsx(raw: string): Promise<CompileResult> {
  const esbuild = await getEsbuild()
  if (!esbuild) return { fallback: true }
  try {
    const src = stripModuleSyntax(raw)
    const out = await esbuild.transform(src, {
      loader: 'tsx',
      jsx: 'transform',
      target: 'es2018',
      // No `format` — emit bare statements so the `__default = App` assignment
      // stays in the wrapper's scope (an IIFE wrap would hide it).
    })
    return { code: out.code }
  } catch (e: any) {
    // A real syntax error in the user's code — surface it; no point retrying Babel.
    const msg = e?.errors?.[0]?.text || e?.message || String(e)
    return { error: msg }
  }
}
