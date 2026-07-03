import { create } from 'zustand'

/** WP-3 Code arayüzü effort seçimi. Model çağrısının reasoning yoğunluğu. */
export type CodeEffort = 'low' | 'medium' | 'high'
/** WP-3 diff kartı kullanıcı kararı — tool çağrısı id'sine göre. */
export type DiffDecision = 'accepted' | 'rejected'

interface UIState {
  rightPanelOpen: boolean
  sidebarCollapsed: boolean
  activeTab: 'projects' | 'chats'
  /** WP-3: aktif oturum Code yüzeyinde mi (inline diff + kontrol çubuğu). */
  codeMode: boolean
  /** WP-3: Code kontrol çubuğundaki effort seçimi. */
  codeEffort: CodeEffort
  /** WP-3: diff kartlarının Accept/Reject kararları — tool çağrısı id → karar. */
  diffDecisions: Record<string, DiffDecision>
  activeGlobalSessionId: string | null  // 'chats' sekmesinde açık olan projesiz sohbet; null = yeni sohbet
  searchOpen: boolean
  searchQuery: string
  onboardingVisible: boolean
  newProjectModalOpen: boolean
  /** New Task modal — hangi projeyle açıldığını tutar; null = global (proje seçilmemiş) */
  newTaskModalOpen: boolean
  newTaskPreselectedProjectId: string | null
  settingsPage: string | null  // null = settings kapalı, 'models' | 'permissions' | 'appearance'
  customizeOpen: boolean
  previewFile: string | null

  toggleRightPanel: () => void
  setRightPanelOpen: (open: boolean) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setActiveTab: (tab: 'projects' | 'chats') => void
  toggleCodeMode: () => void
  setCodeMode: (on: boolean) => void
  setCodeEffort: (effort: CodeEffort) => void
  setDiffDecision: (toolCallId: string, decision: DiffDecision) => void
  clearDiffDecisions: () => void
  setActiveGlobalSession: (id: string | null) => void
  setSearchOpen: (open: boolean) => void
  setSearchQuery: (q: string) => void
  setOnboardingVisible: (v: boolean) => void
  setNewProjectModal: (open: boolean) => void
  openNewTask: (preselectedProjectId?: string | null) => void
  closeNewTask: () => void
  openSettings: (page?: string) => void
  closeSettings: () => void
  openCustomize: () => void
  closeCustomize: () => void
  setPreviewFile: (file: string | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  rightPanelOpen: true,
  sidebarCollapsed: false,
  activeTab: 'projects',
  codeMode: false,
  codeEffort: 'medium',
  diffDecisions: {},
  activeGlobalSessionId: null,
  searchOpen: false,
  searchQuery: '',
  onboardingVisible: false,
  newProjectModalOpen: false,
  newTaskModalOpen: false,
  newTaskPreselectedProjectId: null,
  settingsPage: null,
  customizeOpen: false,
  previewFile: null,

  toggleRightPanel: () => set(s => ({ rightPanelOpen: !s.rightPanelOpen })),
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
  toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleCodeMode: () => set(s => ({ codeMode: !s.codeMode })),
  setCodeMode: (on) => set({ codeMode: on }),
  setCodeEffort: (effort) => set({ codeEffort: effort }),
  setDiffDecision: (toolCallId, decision) =>
    set(s => ({ diffDecisions: { ...s.diffDecisions, [toolCallId]: decision } })),
  clearDiffDecisions: () => set({ diffDecisions: {} }),
  setActiveGlobalSession: (id) => set({ activeGlobalSessionId: id }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setOnboardingVisible: (v) => set({ onboardingVisible: v }),
  setNewProjectModal: (open) => set({ newProjectModalOpen: open }),
  openNewTask: (preselectedProjectId = null) => set({ newTaskModalOpen: true, newTaskPreselectedProjectId: preselectedProjectId }),
  closeNewTask: () => set({ newTaskModalOpen: false, newTaskPreselectedProjectId: null }),
  openSettings: (page = 'models') => set({ settingsPage: page, customizeOpen: false }),
  closeSettings: () => set({ settingsPage: null }),
  openCustomize: () => set({ customizeOpen: true, settingsPage: null }),
  closeCustomize: () => set({ customizeOpen: false }),
  setPreviewFile: (file) => set({ previewFile: file }),
}))

