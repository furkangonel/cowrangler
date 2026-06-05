import React, { useEffect, useState } from 'react'
import { Plus, Trash2, RefreshCw, CheckCircle, XCircle, Loader } from 'lucide-react'
import { ipc, MCPServerInfo } from '../../lib/ipc'

export function MCPTab() {
  const [servers, setServers] = useState<MCPServerInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [testing, setTesting] = useState<Record<string, boolean>>({})

  // New server form state
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<'stdio' | 'http' | 'sse'>('stdio')
  const [newCommand, setNewCommand] = useState('')
  const [newArgs, setNewArgs] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  async function loadServers() {
    setLoading(true)
    try {
      const list = await ipc.mcp.list()
      setServers(Array.isArray(list) ? list : [])
    } catch {
      setServers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadServers() }, [])

  async function addServer() {
    if (!newName.trim()) { setError('İsim gerekli'); return }
    if (newType === 'stdio' && !newCommand.trim()) { setError('Komut gerekli'); return }
    if (newType !== 'stdio' && !newUrl.trim()) { setError('URL gerekli'); return }
    setAdding(true)
    setError('')
    try {
      const args = newArgs.trim()
        ? newArgs.split(' ').map(s => s.trim()).filter(Boolean)
        : []
      await ipc.mcp.add({
        name: newName.trim(),
        type: newType,
        command: newType === 'stdio' ? newCommand.trim() : undefined,
        args: newType === 'stdio' ? args : undefined,
        url: newType !== 'stdio' ? newUrl.trim() : undefined,
      })
      await loadServers()
      setShowAdd(false)
      setNewName(''); setNewCommand(''); setNewArgs(''); setNewUrl('')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setAdding(false)
    }
  }

  async function removeServer(name: string) {
    await ipc.mcp.remove(name)
    await loadServers()
  }

  async function testServer(name: string) {
    setTesting(t => ({ ...t, [name]: true }))
    const result = await ipc.mcp.testConnection(name)
    setTesting(t => ({ ...t, [name]: false }))
    setServers(s => s.map(sv => sv.name === name
      ? { ...sv, status: result.ok ? 'connected' : 'error' }
      : sv
    ))
  }

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">
          MCP server'ları agent'ın araçlarını genişletir. Stdio, HTTP ve SSE transport desteklenir.
        </p>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white text-xs rounded-lg hover:bg-accent-hover transition-colors"
        >
          <Plus size={12} />
          Ekle
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="p-4 bg-bg-tertiary border border-border rounded-xl space-y-3 animate-fade-in">
          <h4 className="text-xs font-semibold text-text-primary">Yeni MCP Server</h4>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-2xs text-text-muted block mb-1">İsim *</label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="filesystem"
                className="w-full px-2.5 py-1.5 bg-bg-primary border border-border rounded text-xs text-text-primary focus:border-accent transition-colors"
              />
            </div>
            <div>
              <label className="text-2xs text-text-muted block mb-1">Transport</label>
              <select
                value={newType}
                onChange={e => setNewType(e.target.value as any)}
                className="w-full px-2.5 py-1.5 bg-bg-primary border border-border rounded text-xs text-text-primary focus:border-accent transition-colors"
              >
                <option value="stdio">stdio (subprocess)</option>
                <option value="http">HTTP / StreamableHTTP</option>
                <option value="sse">SSE</option>
              </select>
            </div>
          </div>

          {newType === 'stdio' ? (
            <div className="space-y-2">
              <div>
                <label className="text-2xs text-text-muted block mb-1">Komut *</label>
                <input
                  value={newCommand}
                  onChange={e => setNewCommand(e.target.value)}
                  placeholder="npx"
                  className="w-full px-2.5 py-1.5 bg-bg-primary border border-border rounded text-xs text-text-primary font-mono focus:border-accent transition-colors"
                />
              </div>
              <div>
                <label className="text-2xs text-text-muted block mb-1">Argümanlar (boşlukla ayrılmış)</label>
                <input
                  value={newArgs}
                  onChange={e => setNewArgs(e.target.value)}
                  placeholder="-y @modelcontextprotocol/server-filesystem /tmp"
                  className="w-full px-2.5 py-1.5 bg-bg-primary border border-border rounded text-xs text-text-primary font-mono focus:border-accent transition-colors"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="text-2xs text-text-muted block mb-1">URL *</label>
              <input
                value={newUrl}
                onChange={e => setNewUrl(e.target.value)}
                placeholder="https://my-mcp-server.example.com/mcp"
                className="w-full px-2.5 py-1.5 bg-bg-primary border border-border rounded text-xs text-text-primary font-mono focus:border-accent transition-colors"
              />
            </div>
          )}

          {error && <p className="text-2xs text-error">{error}</p>}

          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors">
              İptal
            </button>
            <button
              onClick={addServer}
              disabled={adding}
              className="px-3 py-1.5 bg-accent text-white text-xs rounded-lg disabled:opacity-50 hover:bg-accent-hover transition-colors"
            >
              {adding ? 'Ekleniyor...' : 'Ekle'}
            </button>
          </div>
        </div>
      )}

      {/* Server list */}
      {loading ? (
        <div className="text-xs text-text-muted text-center py-4">Yükleniyor...</div>
      ) : servers.length === 0 ? (
        <div className="text-center py-6">
          <span className="text-3xl opacity-40">🔌</span>
          <p className="text-xs text-text-muted mt-2">MCP server eklenmemiş.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {servers.map(server => (
            <div key={server.name} className="flex items-center gap-3 p-3 bg-bg-tertiary border border-border rounded-lg group">
              <div className="flex-shrink-0">
                {server.status === 'connected' ? (
                  <CheckCircle size={14} className="text-success" />
                ) : server.status === 'error' ? (
                  <XCircle size={14} className="text-error" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-text-muted" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-text-primary">{server.name}</p>
                <p className="text-2xs text-text-muted font-mono truncate">
                  {server.type === 'stdio'
                    ? `${server.command} ${(server.args ?? []).join(' ')}`
                    : server.url}
                </p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => testServer(server.name)}
                  disabled={testing[server.name]}
                  className="p-1.5 text-text-muted hover:text-text-secondary transition-colors rounded"
                  title="Test et"
                >
                  <RefreshCw size={12} className={testing[server.name] ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={() => removeServer(server.name)}
                  className="p-1.5 text-text-muted hover:text-error transition-colors rounded"
                  title="Sil"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
