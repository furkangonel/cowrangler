import { create } from 'zustand'
import { ipc, GitStatus, GitBranchInfo } from '../lib/ipc'

/**
 * git.store — Desktop Code arayüzü git durumu (WP-4).
 *
 * Tüm çağrılar aktif projenin `workdir`'ini geçirir; git.ipc bu dizinde çalışır.
 * workdir null ise (global sohbet) git paneli anlamsızdır — repo=false döner.
 */

interface GitState {
  workdir: string | null
  status: GitStatus | null
  branches: GitBranchInfo | null
  /** Seçili dosyanın diff'i (orta panel/inline gösterim için). */
  activeDiff: { file: string; staged: boolean; text: string } | null
  loading: boolean
  busy: boolean
  error: string | null

  setWorkdir: (workdir: string | null) => void
  refresh: () => Promise<void>
  loadDiff: (file: string, staged: boolean) => Promise<void>
  clearDiff: () => void
  stage: (files: string[]) => Promise<void>
  unstage: (files: string[]) => Promise<void>
  commit: (message: string) => Promise<{ ok: boolean; error?: string }>
  createBranch: (name: string) => Promise<{ ok: boolean; error?: string }>
  checkout: (name: string) => Promise<{ ok: boolean; error?: string }>
  push: (opts?: { force?: boolean }) => Promise<{ ok: boolean; error?: string }>
  suggestCommitMessage: (model: string) => Promise<{ ok: boolean; message?: string; error?: string }>
}

export const useGitStore = create<GitState>((set, get) => ({
  workdir: null,
  status: null,
  branches: null,
  activeDiff: null,
  loading: false,
  busy: false,
  error: null,

  setWorkdir: (workdir) => {
    if (workdir === get().workdir) return
    set({ workdir, status: null, branches: null, activeDiff: null, error: null })
    if (workdir) void get().refresh()
  },

  refresh: async () => {
    const wd = get().workdir
    if (!wd) {
      set({ status: null, branches: null })
      return
    }
    set({ loading: true, error: null })
    try {
      const [status, branches] = await Promise.all([
        ipc.git.status(wd),
        ipc.git.branchList(wd),
      ])
      set({ status, branches, loading: false })
    } catch (e: any) {
      set({ loading: false, error: e?.message ?? String(e) })
    }
  },

  loadDiff: async (file, staged) => {
    const wd = get().workdir
    if (!wd) return
    const text = await ipc.git.diff({ file, staged }, wd)
    set({ activeDiff: { file, staged, text } })
  },

  clearDiff: () => set({ activeDiff: null }),

  stage: async (files) => {
    const wd = get().workdir
    if (!wd || !files.length) return
    set({ busy: true })
    await ipc.git.stage(files, wd)
    set({ busy: false })
    await get().refresh()
  },

  unstage: async (files) => {
    const wd = get().workdir
    if (!wd || !files.length) return
    set({ busy: true })
    await ipc.git.unstage(files, wd)
    set({ busy: false })
    await get().refresh()
  },

  commit: async (message) => {
    const wd = get().workdir
    if (!wd) return { ok: false, error: 'No workdir' }
    set({ busy: true })
    const res = await ipc.git.commit(message, {}, wd)
    set({ busy: false })
    await get().refresh()
    return { ok: res.ok, error: res.ok ? undefined : res.stderr }
  },

  createBranch: async (name) => {
    const wd = get().workdir
    if (!wd) return { ok: false, error: 'No workdir' }
    set({ busy: true })
    const res = await ipc.git.branchCreate(name, wd)
    set({ busy: false })
    await get().refresh()
    return { ok: res.ok, error: res.ok ? undefined : res.stderr }
  },

  checkout: async (name) => {
    const wd = get().workdir
    if (!wd) return { ok: false, error: 'No workdir' }
    set({ busy: true })
    const res = await ipc.git.checkout(name, wd)
    set({ busy: false })
    await get().refresh()
    return { ok: res.ok, error: res.ok ? undefined : res.stderr }
  },

  push: async (opts) => {
    const wd = get().workdir
    if (!wd) return { ok: false, error: 'No workdir' }
    // Upstream yoksa ilk push'ta --set-upstream gerekir.
    const setUpstream = !get().status?.upstream
    set({ busy: true })
    const res = await ipc.git.push({ force: opts?.force, setUpstream }, wd)
    set({ busy: false })
    await get().refresh()
    return { ok: res.ok, error: res.ok ? undefined : res.stderr }
  },

  suggestCommitMessage: async (model) => {
    const wd = get().workdir
    if (!wd) return { ok: false, error: 'No workdir' }
    return ipc.git.suggestCommitMessage(model, wd)
  },
}))
