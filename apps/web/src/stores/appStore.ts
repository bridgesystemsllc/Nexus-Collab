import { create } from 'zustand'

type Page =
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

type Theme = 'dark' | 'light'

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
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
}

// Load saved theme from localStorage
function getInitialTheme(): Theme {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('nexus-theme') as Theme | null
    if (saved) return saved
  }
  return 'dark'
}

export const useAppStore = create<AppState>((set) => ({
  currentPage: 'dashboard',
  aiPanelOpen: false,
  sidebarCollapsed: false,
  selectedCoworkId: null,
  selectedDeptId: null,
  theme: getInitialTheme(),

  setPage: (page) => set({ currentPage: page }),
  toggleAIPanel: () => set((s) => ({ aiPanelOpen: !s.aiPanelOpen })),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSelectedCowork: (id) => set({ selectedCoworkId: id, currentPage: id ? 'cowork-detail' : 'cowork' }),
  setSelectedDept: (id) => set({ selectedDeptId: id, currentPage: 'custom-dept' }),
  toggleTheme: () => set((s) => {
    const next = s.theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('nexus-theme', next)
    document.documentElement.setAttribute('data-theme', next)
    return { theme: next }
  }),
  setTheme: (theme) => set(() => {
    localStorage.setItem('nexus-theme', theme)
    document.documentElement.setAttribute('data-theme', theme)
    return { theme }
  }),
}))
