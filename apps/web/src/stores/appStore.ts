import { create } from 'zustand'
import { parseNavUrl, writeNavUrl, type Page } from '@/lib/navUrl'

// Re-export Page type for convenience
export type { Page }

type Theme = 'light'

// ─── Full-page form routing ────────────────────────────────
// A list/module opens a full-page form by calling `openForm({...})`.
// While `activeForm` is set, the layout renders the matching form
// (looked up in the form registry) instead of the normal page, and
// `closeForm()` returns the user to the originating page.
export interface ActiveForm {
  /** Unique key matching an entry in the form registry. */
  formType: string
  /** Whether the form is creating a new record or editing an existing one. */
  mode: 'create' | 'edit'
  /** The id of the record being edited (omitted for create). */
  recordId?: string | null
  /** Arbitrary data the form needs (initial values, module ids, etc.). */
  context?: Record<string, any>
  /** Page to return to when the form closes (captured automatically). */
  returnPage: Page
}

interface AppState {
  currentPage: Page
  currentTab: string | null
  aiPanelOpen: boolean
  sidebarCollapsed: boolean
  selectedCoworkId: string | null
  selectedDeptId: string | null
  // Portfolio-scoped project selection; department tabs keep their own.
  selectedProjectId: string | null
  theme: Theme
  activeForm: ActiveForm | null

  setPage: (page: Page) => void
  setTab: (tab: string | null) => void
  toggleAIPanel: () => void
  toggleSidebar: () => void
  setSelectedCowork: (id: string | null) => void
  setSelectedDept: (id: string | null) => void
  setSelectedProject: (id: string | null) => void
  openForm: (form: Omit<ActiveForm, 'returnPage'>) => void
  closeForm: () => void
}

// ─── URL-based navigation state ─────────────────────────────
// The URL is the source of truth for navigation state. On boot, we parse
// the URL to restore the page, entity ids, and tab. Every navigation setter
// updates the URL via replaceState (no history entries).
function getInitialNavState() {
  if (typeof window === 'undefined') {
    return {
      currentPage: 'dashboard' as Page,
      currentTab: null,
      selectedCoworkId: null,
      selectedDeptId: null,
      selectedProjectId: null,
    }
  }
  const nav = parseNavUrl(window.location.search)
  return {
    currentPage: nav.page,
    currentTab: nav.tab,
    selectedCoworkId: nav.coworkId,
    selectedDeptId: nav.deptId,
    selectedProjectId: nav.projectId,
  }
}

const initialState = getInitialNavState()

export const useAppStore = create<AppState>((set, get) => ({
  currentPage: initialState.currentPage,
  currentTab: initialState.currentTab,
  aiPanelOpen: false,
  sidebarCollapsed: false,
  selectedCoworkId: initialState.selectedCoworkId,
  selectedDeptId: initialState.selectedDeptId,
  selectedProjectId: initialState.selectedProjectId,
  theme: 'light',
  activeForm: null,

  // Navigating to Projects from the sidebar means "go to the list". Without
  // clearing the selection the user lands back inside whichever project they
  // last opened, with no obvious way to tell why.
  setPage: (page) => {
    const state = get()
    // Clear tab when changing to a different page
    const newTab = page === state.currentPage ? state.currentTab : null
    // Clear projectId when navigating to projects (existing behavior)
    const newProjectId = page === 'projects' ? null : state.selectedProjectId

    set({ currentPage: page, currentTab: newTab, selectedProjectId: newProjectId })

    writeNavUrl({
      page,
      coworkId: state.selectedCoworkId,
      deptId: state.selectedDeptId,
      projectId: newProjectId,
      tab: newTab,
    })
  },

  setTab: (tab) => {
    const state = get()
    set({ currentTab: tab })

    writeNavUrl({
      page: state.currentPage,
      coworkId: state.selectedCoworkId,
      deptId: state.selectedDeptId,
      projectId: state.selectedProjectId,
      tab,
    })
  },

  toggleAIPanel: () => set((s) => ({ aiPanelOpen: !s.aiPanelOpen })),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  setSelectedCowork: (id) => {
    const page = id ? 'cowork-detail' : 'cowork'
    const state = get()
    set({ selectedCoworkId: id, currentPage: page })

    writeNavUrl({
      page,
      coworkId: id,
      deptId: state.selectedDeptId,
      projectId: state.selectedProjectId,
      tab: null,
    })
  },

  setSelectedDept: (id) => {
    const state = get()
    set({ selectedDeptId: id, currentPage: 'custom-dept' })

    writeNavUrl({
      page: 'custom-dept',
      coworkId: state.selectedCoworkId,
      deptId: id,
      projectId: state.selectedProjectId,
      tab: null,
    })
  },

  setSelectedProject: (id) => {
    const state = get()
    set({ selectedProjectId: id })

    writeNavUrl({
      page: state.currentPage,
      coworkId: state.selectedCoworkId,
      deptId: state.selectedDeptId,
      projectId: id,
      tab: state.currentTab,
    })
  },

  openForm: (form) => set((s) => ({ activeForm: { ...form, returnPage: s.currentPage } })),

  closeForm: () => {
    const state = get()
    const returnPage = state.activeForm?.returnPage ?? state.currentPage
    set({ activeForm: null, currentPage: returnPage })

    writeNavUrl({
      page: returnPage,
      coworkId: state.selectedCoworkId,
      deptId: state.selectedDeptId,
      projectId: state.selectedProjectId,
      tab: state.currentTab,
    })
  },
}))
