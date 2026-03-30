import { create } from 'zustand'

type Page =
  | 'onboarding'
  | 'dashboard'
  | 'everything'
  | 'rd'
  | 'ops'
  | 'cowork'
  | 'cowork-detail'
  | 'docs'
  | 'integrations'
  | 'dept-manager'
  | 'pulse'
  | 'custom-dept'
  | 'agent-settings'

type Theme = 'light'

interface AppState {
  currentPage: Page
  aiPanelOpen: boolean
  sidebarCollapsed: boolean
  selectedCoworkId: string | null
  selectedDeptId: string | null
  theme: Theme

  setPage: (page: Page) => void
  toggleAIPanel: () => void
  toggleSidebar: () => void
  setSelectedCowork: (id: string | null) => void
  setSelectedDept: (id: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  currentPage: 'dashboard',
  aiPanelOpen: false,
  sidebarCollapsed: false,
  selectedCoworkId: null,
  selectedDeptId: null,
  theme: 'light',

  setPage: (page) => set({ currentPage: page }),
  toggleAIPanel: () => set((s) => ({ aiPanelOpen: !s.aiPanelOpen })),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSelectedCowork: (id) => set({ selectedCoworkId: id, currentPage: id ? 'cowork-detail' : 'cowork' }),
  setSelectedDept: (id) => set({ selectedDeptId: id, currentPage: 'custom-dept' }),
}))
