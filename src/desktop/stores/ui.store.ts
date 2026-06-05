import { create } from 'zustand'

type RightPanelTab = 'progress' | 'context' | 'memory' | 'instructions' | 'scheduled'

interface UIState {
  rightPanelOpen: boolean
  rightPanelTab: RightPanelTab
  searchOpen: boolean
  searchQuery: string
  onboardingVisible: boolean
  newProjectModalOpen: boolean
  settingsPage: string | null  // null = settings kapalı, 'models' | 'mcp' | 'skills' | 'appearance' | 'profiles'

  setRightPanelOpen: (open: boolean) => void
  setRightPanelTab: (tab: RightPanelTab) => void
  toggleRightPanel: () => void
  setSearchOpen: (open: boolean) => void
  setSearchQuery: (q: string) => void
  setOnboardingVisible: (v: boolean) => void
  setNewProjectModal: (open: boolean) => void
  openSettings: (page?: string) => void
  closeSettings: () => void
}

export const useUIStore = create<UIState>((set) => ({
  rightPanelOpen: true,
  rightPanelTab: 'context',
  searchOpen: false,
  searchQuery: '',
  onboardingVisible: false,
  newProjectModalOpen: false,
  settingsPage: null,

  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
  toggleRightPanel: () => set(s => ({ rightPanelOpen: !s.rightPanelOpen })),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setOnboardingVisible: (v) => set({ onboardingVisible: v }),
  setNewProjectModal: (open) => set({ newProjectModalOpen: open }),
  openSettings: (page = 'models') => set({ settingsPage: page }),
  closeSettings: () => set({ settingsPage: null }),
}))
