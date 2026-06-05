import { create } from 'zustand'
import { ipc, ProjectSummary, ProjectRecord, ProjectFolder } from '../lib/ipc'

interface ProjectsState {
  projects: ProjectSummary[]
  activeProjectId: string | null
  loading: boolean
  folders: Record<string, ProjectFolder[]>  // projectId → folders
  instructions: Record<string, string>       // projectId → instructions text

  loadProjects: () => Promise<void>
  createProject: (data: { name: string; description?: string; workdir?: string; icon?: string }) => Promise<ProjectRecord>
  updateProject: (id: string, data: any) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  setActiveProject: (id: string | null) => void
  loadFolders: (id: string) => Promise<void>
  addFolder: (id: string, folderPath: string) => Promise<void>
  removeFolder: (id: string, folderPath: string) => Promise<void>
  loadInstructions: (id: string) => Promise<void>
  setInstructions: (id: string, content: string) => Promise<void>
  getActiveProject: () => ProjectSummary | null
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  activeProjectId: null,
  loading: false,
  folders: {},
  instructions: {},

  loadProjects: async () => {
    set({ loading: true })
    try {
      const projects = await ipc.projects.list()
      set({ projects, loading: false })
    } catch (e) {
      console.error('loadProjects failed', e)
      set({ loading: false })
    }
  },

  createProject: async (data) => {
    const project = await ipc.projects.create(data)
    await get().loadProjects()
    return project
  },

  updateProject: async (id, data) => {
    await ipc.projects.update(id, data)
    await get().loadProjects()
  },

  deleteProject: async (id) => {
    await ipc.projects.delete(id)
    if (get().activeProjectId === id) set({ activeProjectId: null })
    await get().loadProjects()
  },

  setActiveProject: (id) => set({ activeProjectId: id }),

  loadFolders: async (id) => {
    const folders = await ipc.projects.getFolders(id)
    set(s => ({ folders: { ...s.folders, [id]: folders } }))
  },

  addFolder: async (id, folderPath) => {
    await ipc.projects.addFolder(id, folderPath)
    await get().loadFolders(id)
    await get().loadProjects()
  },

  removeFolder: async (id, folderPath) => {
    await ipc.projects.removeFolder(id, folderPath)
    await get().loadFolders(id)
  },

  loadInstructions: async (id) => {
    const content = await ipc.projects.getInstructions(id)
    set(s => ({ instructions: { ...s.instructions, [id]: content } }))
  },

  setInstructions: async (id, content) => {
    await ipc.projects.setInstructions(id, content)
    set(s => ({ instructions: { ...s.instructions, [id]: content } }))
  },

  getActiveProject: () => {
    const { projects, activeProjectId } = get()
    return projects.find(p => p.id === activeProjectId) ?? null
  },
}))
