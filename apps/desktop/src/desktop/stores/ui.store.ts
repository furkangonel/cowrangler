import { create } from 'zustand'

/** WP-3 diff kartı kullanıcı kararı — tool çağrısı id'sine göre. */
export type DiffDecision = 'accepted' | 'rejected'

/** Code sekmesi sağ paneldeki aktif sekme. */
export type CodeRightTab = 'terminal' | 'files' | 'run' | 'plan' | 'task' | null

interface UIState {
  rightPanelOpen: boolean
  sidebarCollapsed: boolean
  /** WP-3: diff kartlarının Accept/Reject kararları — tool çağrısı id → karar. */
  diffDecisions: Record<string, DiffDecision>
  activeCodeSessionId: string | null     // 'code' sekmesinde açık olan kod oturumu; null = home
  searchOpen: boolean
  searchQuery: string
  onboardingVisible: boolean
  newProjectModalOpen: boolean
  settingsPage: string | null  // null = settings kapalı, 'models' | 'permissions' | 'appearance'
  customizeOpen: boolean
  previewFile: string | null
  /** Code sekmesi sağ panelin hangi sekmesinin açık olduğu (null = kapalı) */
  codeRightTab: CodeRightTab
  /**
   * WP-B2: sağ panel (GitPanel) → Code agent'ına gönderilecek bekleyen prompt.
   * CodeSessionView bunu izler, handleSend'e verir ve temizler. Böylece git
   * aksiyonları (Create PR) elle git yerine agent'a talimat olur.
   */
  pendingCodePrompt: string | null

  toggleRightPanel: () => void
  setRightPanelOpen: (open: boolean) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setDiffDecision: (toolCallId: string, decision: DiffDecision) => void
  clearDiffDecisions: () => void
  setActiveCodeSession: (id: string | null) => void
  setSearchOpen: (open: boolean) => void
  setSearchQuery: (q: string) => void
  setOnboardingVisible: (v: boolean) => void
  setNewProjectModal: (open: boolean) => void
  openSettings: (page?: string) => void
  closeSettings: () => void
  openCustomize: () => void
  closeCustomize: () => void
  setPreviewFile: (file: string | null) => void
  toggleCodeRightTab: (tab: NonNullable<CodeRightTab>) => void
  setCodeRightTab: (tab: CodeRightTab) => void
  requestCodePrompt: (text: string) => void
  clearCodePrompt: () => void
}

export const useUIStore = create<UIState>((set) => ({
  rightPanelOpen: true,
  sidebarCollapsed: false,
  diffDecisions: {},
  activeCodeSessionId: null,
  searchOpen: false,
  searchQuery: '',
  onboardingVisible: false,
  newProjectModalOpen: false,
  settingsPage: null,
  customizeOpen: false,
  previewFile: null,
  codeRightTab: null,
  pendingCodePrompt: null,

  toggleRightPanel: () => set(s => ({ rightPanelOpen: !s.rightPanelOpen })),
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
  toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setDiffDecision: (toolCallId, decision) =>
    set(s => ({ diffDecisions: { ...s.diffDecisions, [toolCallId]: decision } })),
  clearDiffDecisions: () => set({ diffDecisions: {} }),
  setActiveCodeSession: (id) => set({ activeCodeSessionId: id }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setOnboardingVisible: (v) => set({ onboardingVisible: v }),
  setNewProjectModal: (open) => set({ newProjectModalOpen: open }),
  openSettings: (page = 'models') => set({ settingsPage: page, customizeOpen: false }),
  closeSettings: () => set({ settingsPage: null }),
  openCustomize: () => set({ customizeOpen: true, settingsPage: null }),
  closeCustomize: () => set({ customizeOpen: false }),
  setPreviewFile: (file) => set({ previewFile: file }),
  toggleCodeRightTab: (tab) =>
    set(s => ({ codeRightTab: s.codeRightTab === tab ? null : tab })),
  setCodeRightTab: (tab) => set({ codeRightTab: tab }),
  requestCodePrompt: (text) => set({ pendingCodePrompt: text }),
  clearCodePrompt: () => set({ pendingCodePrompt: null }),
}))
