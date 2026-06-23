import { create } from 'zustand'

interface UIState {
  rightPanelOpen: boolean
  sidebarCollapsed: boolean
  activeTab: 'projects' | 'chats'
  activeGlobalSessionId: string | null  // 'chats' sekmesinde açık olan projesiz sohbet; null = yeni sohbet
  searchOpen: boolean
  searchQuery: string
  onboardingVisible: boolean
  newProjectModalOpen: boolean
  settingsPage: string | null  // null = settings kapalı, 'models' | 'connectors' | 'skills' | 'appearance'

  toggleRightPanel: () => void
  setRightPanelOpen: (open: boolean) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setActiveTab: (tab: 'projects' | 'chats') => void
  setActiveGlobalSession: (id: string | null) => void
  setSearchOpen: (open: boolean) => void
  setSearchQuery: (q: string) => void
  setOnboardingVisible: (v: boolean) => void
  setNewProjectModal: (open: boolean) => void
  openSettings: (page?: string) => void
  closeSettings: () => void
}

export const useUIStore = create<UIState>((set) => ({
  rightPanelOpen: true,
  sidebarCollapsed: false,
  activeTab: 'projects',
  activeGlobalSessionId: null,
  searchOpen: false,
  searchQuery: '',
  onboardingVisible: false,
  newProjectModalOpen: false,
  settingsPage: null,

  toggleRightPanel: () => set(s => ({ rightPanelOpen: !s.rightPanelOpen })),
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
  toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setActiveGlobalSession: (id) => set({ activeGlobalSessionId: id }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setOnboardingVisible: (v) => set({ onboardingVisible: v }),
  setNewProjectModal: (open) => set({ newProjectModalOpen: open }),
  openSettings: (page = 'models') => set({ settingsPage: page }),
  closeSettings: () => set({ settingsPage: null }),
}))

