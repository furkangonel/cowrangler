import React, { useState, useEffect } from 'react'
import { Plug, Folder, GitBranch, FileArchive, Trash2, ArrowRight, Loader2, Check, AlertCircle, Copy, Box, BookOpen, Wrench, KeyRound, LogIn, Lock } from 'lucide-react'
import { ipc } from '../../lib/ipc'
import type { InstalledPluginRich, PluginActionMeta } from '../../lib/ipc'

type PluginDef = InstalledPluginRich

export function PluginsView() {
  const [plugins, setPlugins] = useState<PluginDef[]>([])
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  
  // Install states
  const [installTab, setInstallTab] = useState<'git' | 'local' | 'zip'>('git')
  const [gitUrl, setGitUrl] = useState('')
  const [localPath, setLocalPath] = useState('')
  const [zipPath, setZipPath] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [runningAction, setRunningAction] = useState<string | null>(null)
  const [actionLog, setActionLog] = useState<string | null>(null)

  async function loadPlugins() {
    setLoading(true)
    try {
      const list = await ipc.plugins.list()
      setPlugins(list)
    } catch (e: any) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPlugins()
  }, [])

  // Stream live progress lines from a running plugin action (e.g. OAuth steps).
  useEffect(() => {
    const off = ipc.plugins.onActionLog?.((data) => setActionLog(data.message))
    return () => { off?.() }
  }, [])

  async function handleRunAction(pluginId: string, action: PluginActionMeta) {
    const key = `${pluginId}:${action.id}`
    setRunningAction(key)
    setMsg(null)
    setActionLog(null)
    try {
      const res = await ipc.plugins.runAction(pluginId, action.id)
      if (res.ok) {
        setMsg({ type: 'success', text: res.message || `${action.title} completed.` })
        void loadPlugins()
      } else {
        setMsg({ type: 'error', text: res.message || `${action.title} failed.` })
      }
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.message || String(e) })
    } finally {
      setRunningAction(null)
      setActionLog(null)
    }
  }

  async function handleInstall() {
    let source = ''
    if (installTab === 'git') {
      source = gitUrl.trim()
    } else if (installTab === 'local') {
      source = localPath.trim()
    } else {
      source = zipPath.trim()
    }

    if (!source) return

    setInstalling(true)
    setMsg(null)
    try {
      const res = await ipc.plugins.install(source, { global: true })
      if (res.ok) {
        setMsg({ type: 'success', text: `Plugin "${res.id}" successfully installed!` })
        setGitUrl('')
        setLocalPath('')
        setZipPath('')
        void loadPlugins()
      } else {
        setMsg({ type: 'error', text: res.error || 'Installation failed.' })
      }
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.message || String(e) })
    } finally {
      setInstalling(false)
    }
  }

  async function handleUninstall(id: string, name: string) {
    if (!confirm(`Are you sure you want to uninstall plugin "${name || id}"?`)) return
    
    setMsg(null)
    try {
      const res = await ipc.plugins.uninstall(id)
      if (res.ok) {
        setMsg({ type: 'success', text: `Plugin "${id}" uninstalled.` })
        void loadPlugins()
      } else {
        setMsg({ type: 'error', text: res.error || 'Failed to uninstall plugin.' })
      }
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.message || String(e) })
    }
  }

  async function handleBrowseFolder() {
    try {
      const folder = await ipc.fs.pickFolder()
      if (folder) setLocalPath(folder)
    } catch (e) {
      console.error(e)
    }
  }

  async function handleBrowseZip() {
    try {
      const file = await ipc.fs.pickFile()
      if (file) setZipPath(file)
    } catch (e) {
      console.error(e)
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave() {
    setIsDragging(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && file.name.endsWith('.zip')) {
      // Use standard web API object URL path or if we can get path.
      // Electron files contain the absolute path at the 'path' property
      const absolutePath = (file as any).path
      if (absolutePath) {
        setZipPath(absolutePath)
        setInstallTab('zip')
      }
    }
  }

  function copyPath(dir: string, id: string) {
    try {
      navigator.clipboard.writeText(dir)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {}
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-3">
        <Plug size={14} className="text-text-muted" />
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Plugins</h3>
        <span className="text-xs text-text-muted/60">{plugins.length}</span>
      </div>

      {msg && (
        <div className={`p-3.5 rounded-xl border text-sm flex items-start gap-2.5 ${
          msg.type === 'success' 
            ? 'bg-green-500/10 border-green-500/20 text-green-400' 
            : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          {msg.type === 'success' ? <Check size={16} className="mt-0.5" /> : <AlertCircle size={16} className="mt-0.5" />}
          <span className="flex-1">{msg.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side: Installed Plugins List */}
        <div className="lg:col-span-2 space-y-3">
          <h4 className="text-sm font-semibold text-text-primary px-1">Installed Plugins</h4>

          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 size={24} className="animate-spin text-text-muted" />
            </div>
          ) : plugins.length === 0 ? (
            <div className="py-10 text-center text-text-muted text-sm border border-dashed border-border-subtle rounded-xl bg-bg-secondary/40">
              No plugins installed yet. Use the panel on the right to install.
            </div>
          ) : (
            <div className="space-y-3">
              {plugins.map((p) => (
                <div key={p.id} className="p-4 bg-bg-secondary border border-border-subtle rounded-xl flex flex-col gap-2 group hover:border-border transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h5 className="text-sm font-bold text-text-primary">{p.name}</h5>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-secondary border border-border-subtle font-mono">v{p.version}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                          p.source === 'local' 
                            ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' 
                            : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                        }`}>
                          {p.source}
                        </span>
                      </div>
                      <p className="text-xs text-text-muted mt-1 leading-relaxed">{p.description}</p>
                    </div>

                    <button 
                      onClick={() => handleUninstall(p.id, p.name)}
                      className="p-1.5 text-text-muted hover:text-red-400 bg-bg-primary hover:bg-red-500/10 border border-border-subtle hover:border-red-500/20 rounded-lg transition-colors"
                      title="Uninstall Plugin"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {/* Contribution badges — what this plugin added on install */}
                  {(() => {
                    const c = p.contribution
                    if (!c) return null
                    const needsSignIn = (p.actions || []).some(a => a.id === 'login') && c.models.length > 0
                    const badges: { icon: React.ReactNode; label: string }[] = []
                    if (c.models.length) badges.push({ icon: <Box size={10} />, label: `${c.models.length} model${c.models.length > 1 ? 's' : ''}` })
                    if (c.skills) badges.push({ icon: <BookOpen size={10} />, label: `${c.skills} skill${c.skills > 1 ? 's' : ''}` })
                    if (c.tools) badges.push({ icon: <Wrench size={10} />, label: `${c.tools} tool${c.tools > 1 ? 's' : ''}` })
                    if (c.providers.length) badges.push({ icon: <KeyRound size={10} />, label: `${c.providers.length} provider${c.providers.length > 1 ? 's' : ''}` })
                    if (badges.length === 0 && !needsSignIn) return null
                    return (
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {badges.map((b, i) => (
                          <span key={i} className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-bg-tertiary text-text-secondary border border-border-subtle">
                            {b.icon}{b.label}
                          </span>
                        ))}
                        {needsSignIn && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                            <Lock size={10} /> Sign-in required
                          </span>
                        )}
                      </div>
                    )
                  })()}

                  {/* Where to run it — surfaced hint + action buttons */}
                  {p.contribution?.models?.length > 0 && (
                    <p className="text-[10px] text-text-muted/80 mt-1.5 leading-relaxed">
                      Run from the <span className="text-text-secondary font-medium">model picker</span> in the composer.
                    </p>
                  )}

                  {(p.actions || []).length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {(p.actions || []).map((action) => {
                        const key = `${p.id}:${action.id}`
                        const running = runningAction === key
                        return (
                          <button
                            key={action.id}
                            onClick={() => handleRunAction(p.id, action)}
                            disabled={!!runningAction}
                            title={action.description || action.title}
                            className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-50 transition-colors"
                          >
                            {running
                              ? <Loader2 size={12} className="animate-spin" />
                              : action.id === 'login' ? <LogIn size={12} /> : <ArrowRight size={12} />}
                            {running ? (actionLog || 'Working…') : action.title}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  <div className="mt-2 pt-2 border-t border-border-subtle/60 flex items-center justify-between gap-4">
                    <span className="text-[10px] font-mono text-text-muted truncate select-all">{p.dir}</span>
                    <button 
                      onClick={() => copyPath(p.dir, p.id)}
                      className="flex items-center gap-1 text-[10px] text-accent hover:underline flex-shrink-0"
                    >
                      <Copy size={10} /> {copiedId === p.id ? 'Copied' : 'Copy path'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Side: Install Plugin Form */}
        <div className="p-5 bg-bg-secondary border border-border-subtle rounded-xl flex flex-col gap-4 self-start">
          <div>
            <h4 className="text-sm font-semibold text-text-primary">Install New Plugin</h4>
            <p className="text-xs text-text-muted mt-1">Add features to Cowrangler CLI & Desktop.</p>
          </div>

          {/* Installation method tabs */}
          <div className="grid grid-cols-3 bg-bg-tertiary p-0.5 rounded-lg border border-border-subtle">
            {(['git', 'local', 'zip'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setInstallTab(tab)}
                className={`py-1 text-2xs font-semibold rounded transition-colors capitalize ${
                  installTab === tab 
                    ? 'bg-accent text-accent-fg' 
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab contents */}
          <div className="space-y-3.5 min-h-[90px]">
            {installTab === 'git' && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider block">Git Repository URL</label>
                <div className="relative">
                  <GitBranch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" size={13} />
                  <input
                    type="text"
                    value={gitUrl}
                    onChange={(e) => setGitUrl(e.target.value)}
                    placeholder="https://github.com/user/plugin.git"
                    className="w-full bg-bg-primary text-xs text-text-primary rounded-lg pl-8 pr-3 py-2 border border-border-subtle focus:border-accent/60 focus:outline-none transition-colors"
                  />
                </div>
              </div>
            )}

            {installTab === 'local' && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider block">Local Folder Path</label>
                <div className="flex gap-1.5">
                  <div className="relative flex-1">
                    <Folder className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" size={13} />
                    <input
                      type="text"
                      value={localPath}
                      onChange={(e) => setLocalPath(e.target.value)}
                      placeholder="/path/to/my-plugin-folder"
                      className="w-full bg-bg-primary text-xs text-text-primary rounded-lg pl-8 pr-3 py-2 border border-border-subtle focus:border-accent/60 focus:outline-none transition-colors"
                    />
                  </div>
                  <button
                    onClick={handleBrowseFolder}
                    className="px-2.5 bg-bg-tertiary border border-border-subtle hover:bg-bg-hover text-xs font-medium rounded-lg text-text-primary transition-colors shrink-0"
                  >
                    Browse
                  </button>
                </div>
              </div>
            )}

            {installTab === 'zip' && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider block">ZIP Archive Path</label>
                <div 
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border border-dashed p-4 rounded-lg flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer transition-colors ${
                    isDragging 
                      ? 'border-accent bg-accent/5' 
                      : 'border-border-subtle hover:border-border hover:bg-bg-hover/40'
                  }`}
                  onClick={handleBrowseZip}
                >
                  <FileArchive size={20} className="text-text-muted animate-pulse" />
                  <span className="text-[10px] text-text-secondary font-medium">
                    {zipPath ? (zipPath.split(/[/\\]/).pop() || zipPath) : 'Click to browse or Drag ZIP here'}
                  </span>
                  {zipPath && <span className="text-[8px] text-text-muted truncate max-w-full select-all px-2">{zipPath}</span>}
                </div>
              </div>
            )}
          </div>

          {/* Always installed globally in Desktop Customize view */}

          <button
            onClick={handleInstall}
            disabled={installing || !(gitUrl || localPath || zipPath)}
            className="w-full py-2 bg-accent text-accent-fg font-medium text-xs rounded-lg hover:bg-accent-hover transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40"
          >
            {installing ? (
              <>
                <Loader2 size={12} className="animate-spin" /> Installing...
              </>
            ) : (
              <>
                Install Plugin <ArrowRight size={12} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
