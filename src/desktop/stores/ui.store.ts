import { create } from 'zustand'

interface UIState {
  rightPanelOpen: boolean
  searchOpen: boolean
  searchQuery: string
  onboardingVisible: boolean
  newProjectModalOpen: boolean
  settingsPage: string | null  // null = settings kapalı, 'models' | 'connectors' | 'skills' | 'appearance'

  toggleRightPanel: () => void
  setRightPanelOpen: (open: boolean) => void
  setSearchOpen: (open: boolean) => void
  setSearchQuery: (q: string) => void
  setOnboardingVisible: (v: boolean) => void
  setNewProjectModal: (open: boolean) => void
  openSettings: (page?: string) => void
  closeSettings: () => void
}

export const useUIStore = create<UIState>((set) => ({
  rightPanelOpen: true,
  searchOpen: false,
  searchQuery: '',
  onboardingVisible: false,
  newProjectModalOpen: false,
  settingsPage: null,

  toggleRightPanel: () => set(s => ({ rightPanelOpen: !s.rightPanelOpen })),
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setOnboardingVisible: (v) => set({ onboardingVisible: v }),
  setNewProjectModal: (open) => set({ newProjectModalOpen: open }),
  openSettings: (page = 'models') => set({ settingsPage: page }),
  closeSettings: () => set({ settingsPage: null }),
}))
