import React, { useEffect, useRef, useState } from 'react'
import {
  X, Eye, EyeOff, FolderOpen, ExternalLink, CheckCircle2, AlertTriangle,
  Loader2, ShieldCheck, ArrowRight, RotateCw,
} from 'lucide-react'
import { ipc, ConnectorCatalogInfo } from '../../lib/ipc'
import { CategoryIcon, AuthBadge } from './shared'

type Stage = 'form' | 'connecting' | 'testing' | 'success' | 'error'

/**
 * AuthModal — the credential / authorization surface for a connector.
 *
 * Enterprise flow:  collect → add → verify (test) → confirm, with errors
 * surfaced inline and fully recoverable. Handles API key / token, OAuth
 * (system browser), and directory-scoped (filesystem/git) connectors.
 *
 * `mode='reauth'` re-collects credentials for an already-configured connector
 * (config is overwritten on add).
 */
export function AuthModal({ entry, mode = 'add', onClose, onDone }: {
  entry: ConnectorCatalogInfo
  mode?: 'add' | 'reauth'
  onClose: () => void
  onDone: () => void
}) {
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [reveal, setReveal] = useState<Record<string, boolean>>({})
  const [pathArg, setPathArg] = useState('')
  const [stage, setStage] = useState<Stage>('form')
  const [resultMsg, setResultMsg] = useState('')
  const [touched, setTouched] = useState(false)
  const firstFieldRef = useRef<HTMLInputElement>(null)

  const fields = entry.authFields ?? []
  const needsPath = !!entry.requiresPathArg
  const isOAuth = entry.auth === 'oauth'

  // Focus first input, close on Escape.
  useEffect(() => {
    firstFieldRef.current?.focus()
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const missing = [
    ...fields.filter(f => !(secrets[f.envKey] ?? '').trim()).map(f => f.envKey),
    ...(needsPath && !pathArg.trim() ? ['__path'] : []),
  ]
  const canSubmit = isOAuth || missing.length === 0

  async function pickFolder() {
    const p = await ipc.fs.pickFolder()
    if (p) setPathArg(p)
  }

  async function submit() {
    setTouched(true)
    if (!canSubmit) return
    setResultMsg('')

    // OAuth: real authorization flow (opens browser, waits for loopback callback).
    if (isOAuth) {
      setStage('connecting')
      try {
        const res = await ipc.connectors.authorize(entry.id)
        if (res.ok) {
          setStage('success')
          setResultMsg(`Authorized — ${res.toolCount ?? 0} tools available.`)
        } else {
          setStage('error')
          setResultMsg(res.error || 'Authorization didn’t complete. Try again.')
        }
      } catch (e: any) {
        setStage('error')
        setResultMsg(e?.message ?? 'Authorization failed.')
      }
      return
    }

    // API key / token / directory: store (encrypted) then verify.
    setStage('connecting')
    try {
      const added = await ipc.connectors.add({
        id: entry.id,
        secrets,
        pathArg: pathArg.trim() || undefined,
      })
      if (added && added.ok === false) {
        setStage('error')
        setResultMsg(added.error || 'Could not add connector.')
        return
      }
      setStage('testing')
      await new Promise(r => setTimeout(r, 600))
      const res = await ipc.connectors.test(entry.id)
      if (res.ok) {
        setStage('success')
        setResultMsg(res.message || 'Connected successfully.')
      } else {
        setStage('error')
        setResultMsg(res.error || 'Connected to config, but the server did not respond. Check your credentials and re-test.')
      }
    } catch (e: any) {
      setStage('error')
      setResultMsg(e?.message ?? 'Unexpected error.')
    }
  }

  const busy = stage === 'connecting' || stage === 'testing'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
      onMouseDown={onClose}
    >
      <div
        className="bg-bg-secondary border border-border rounded-2xl shadow-panel w-[460px] max-w-[94vw] overflow-hidden animate-slide-up"
        onMouseDown={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Connect ${entry.name}`}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-border-subtle">
          <div className="w-9 h-9 rounded-xl bg-bg-tertiary border border-border flex items-center justify-center flex-shrink-0 text-accent">
            <CategoryIcon category={entry.category} transport={entry.transport} size={17} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-text-primary truncate">
                {mode === 'reauth' ? 'Reconnect' : 'Connect'} {entry.name}
              </h4>
              <AuthBadge auth={entry.auth} />
            </div>
            <p className="text-2xs text-text-muted leading-snug mt-0.5 line-clamp-2">{entry.description}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 -mt-0.5 text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors flex-shrink-0">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3.5">
          {/* Success / error banner */}
          {stage === 'success' && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-success/10 border border-success/30">
              <CheckCircle2 size={15} className="text-success flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-success">{entry.name} is connected</p>
                <p className="text-2xs text-text-secondary mt-0.5 break-words">{resultMsg}</p>
              </div>
            </div>
          )}
          {stage === 'error' && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-error/10 border border-error/30">
              <AlertTriangle size={15} className="text-error flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-error">Couldn’t verify the connection</p>
                <p className="text-2xs text-text-secondary mt-0.5 break-words">{resultMsg}</p>
              </div>
            </div>
          )}

          {stage !== 'success' && (
            <>
              {/* OAuth explainer */}
              {isOAuth && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-bg-tertiary border border-border">
                  <ShieldCheck size={15} className="text-accent flex-shrink-0 mt-0.5" />
                  <p className="text-2xs text-text-secondary leading-relaxed">
                    Continue opens <span className="text-text-primary font-medium">{entry.name}</span>’s authorization
                    page in your browser. Approve access there — the connection finishes automatically. Your credentials
                    never pass through Cowrangler.
                  </p>
                </div>
              )}

              {/* Directory picker */}
              {needsPath && (
                <Field label="Directory" required error={touched && !pathArg.trim() ? 'Choose a folder to scope access' : ''}>
                  <div className="flex gap-2">
                    <input
                      value={pathArg}
                      onChange={e => setPathArg(e.target.value)}
                      placeholder="/Users/you/project"
                      disabled={busy}
                      className="flex-1 px-2.5 py-1.5 bg-bg-primary border border-border rounded-lg text-xs text-text-primary font-mono focus:border-accent outline-none disabled:opacity-60"
                    />
                    <button
                      onClick={pickFolder}
                      disabled={busy}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-bg-tertiary border border-border rounded-lg text-xs text-text-secondary hover:border-accent/50 hover:text-text-primary transition-colors disabled:opacity-60"
                    >
                      <FolderOpen size={13} /> Browse
                    </button>
                  </div>
                </Field>
              )}

              {/* Secret fields */}
              {fields.map((f, i) => {
                const val = secrets[f.envKey] ?? ''
                const err = touched && !val.trim() ? `${f.label} is required` : ''
                return (
                  <Field key={f.envKey} label={f.label} required error={err}>
                    <div className="relative">
                      <input
                        ref={i === 0 ? firstFieldRef : undefined}
                        type={reveal[f.envKey] ? 'text' : 'password'}
                        value={val}
                        onChange={e => setSecrets(s => ({ ...s, [f.envKey]: e.target.value }))}
                        placeholder={f.hint}
                        disabled={busy}
                        autoComplete="off"
                        spellCheck={false}
                        className="w-full px-2.5 py-1.5 pr-8 bg-bg-primary border border-border rounded-lg text-xs text-text-primary font-mono focus:border-accent outline-none disabled:opacity-60"
                      />
                      <button
                        type="button"
                        onClick={() => setReveal(r => ({ ...r, [f.envKey]: !r[f.envKey] }))}
                        aria-label={reveal[f.envKey] ? 'Hide value' : 'Show value'}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-secondary rounded"
                      >
                        {reveal[f.envKey] ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                    {f.hint && !err && <p className="text-2xs text-text-muted mt-1">{f.hint}</p>}
                  </Field>
                )
              })}

              {!isOAuth && fields.length === 0 && !needsPath && (
                <p className="text-2xs text-text-muted">This connector needs no credentials — it’ll connect immediately.</p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-t border-border-subtle bg-bg-primary/40">
          <p className="text-2xs text-text-muted flex items-center gap-1.5">
            {stage === 'connecting' && (<><Loader2 size={11} className="animate-spin" /> {isOAuth ? 'Waiting for authorization…' : 'Saving credentials…'}</>)}
            {stage === 'testing' && (<><Loader2 size={11} className="animate-spin" /> Verifying connection…</>)}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs text-text-muted hover:text-text-secondary rounded-lg transition-colors">
              {stage === 'success' ? 'Close' : 'Cancel'}
            </button>
            {stage === 'success' ? (
              <button onClick={onDone} className="flex items-center gap-1.5 px-3.5 py-1.5 bg-accent text-accent-fg text-xs font-medium rounded-lg hover:bg-accent-hover transition-colors">
                Done <ArrowRight size={13} />
              </button>
            ) : stage === 'error' ? (
              <button onClick={submit} className="flex items-center gap-1.5 px-3.5 py-1.5 bg-accent text-accent-fg text-xs font-medium rounded-lg hover:bg-accent-hover transition-colors">
                <RotateCw size={13} /> Try again
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={busy || (!canSubmit && touched)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-accent text-accent-fg text-xs font-medium rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {isOAuth
                  ? (<>Continue <ExternalLink size={13} /></>)
                  : (<>{mode === 'reauth' ? 'Reconnect' : 'Add & connect'} <ArrowRight size={13} /></>)}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Labelled field with inline error ──────────────────────────────────────────
function Field({ label, required, error, children }: {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="text-2xs font-medium text-text-secondary block mb-1">
        {label} {required && <span className="text-accent">*</span>}
      </label>
      {children}
      {error && <p className="text-2xs text-error mt-1" role="alert">{error}</p>}
    </div>
  )
}
