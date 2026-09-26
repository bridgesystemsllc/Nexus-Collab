import { create } from 'zustand'
import { parseNavUrl, writeNavUrl, type Page } from '@/lib/navUrl'
import { clearFormDraft } from '@/lib/formDraftKey'

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
  currentSub: string | null
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
  setSub: (sub: string | null) => void
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
      currentSub: null,
      selectedCoworkId: null,
      selectedDeptId: null,
      selectedProjectId: null,
    }
  }
  const nav = parseNavUrl(window.location.search)
  return {
    currentPage: nav.page,
    currentTab: nav.tab,
    currentSub: nav.sub ?? null,
    selectedCoworkId: nav.coworkId,
    selectedDeptId: nav.deptId,
    selectedProjectId: nav.projectId,
  }
}

const initialState = getInitialNavState()

// Mirror the navigation slice of the store into the URL (replaceState only).
function syncUrl(state: AppState) {
  writeNavUrl({
    page: state.currentPage,
    coworkId: state.selectedCoworkId,
    deptId: state.selectedDeptId,
    projectId: state.selectedProjectId,
    tab: state.currentTab,
    sub: state.currentSub,
  })
}

export const useAppStore = create<AppState>((set, get) => ({
  currentPage: initialState.currentPage,
  currentTab: initialState.currentTab,
  currentSub: initialState.currentSub,
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
    // Tabs are page-scoped: keep them only when staying on the same page
    const samePage = page === state.currentPage
    set({
      currentPage: page,
      currentTab: samePage ? state.currentTab : null,
      currentSub: samePage ? state.currentSub : null,
      // Clear projectId when navigating to projects (existing behavior)
      selectedProjectId: page === 'projects' ? null : state.selectedProjectId,
    })
    syncUrl(get())
  },

  // Changing tab resets any sub-view that belonged to the previous tab.
  setTab: (tab) => {
    set((s) => ({ currentTab: tab, currentSub: tab === s.currentTab ? s.currentSub : null }))
    syncUrl(get())
  },

  setSub: (sub) => {
    set({ currentSub: sub })
    syncUrl(get())
  },

  toggleAIPanel: () => set((s) => ({ aiPanelOpen: !s.aiPanelOpen })),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  setSelectedCowork: (id) => {
    set({ selectedCoworkId: id, currentPage: id ? 'cowork-detail' : 'cowork', currentTab: null, currentSub: null })
    syncUrl(get())
  },

  setSelectedDept: (id) => {
    set({ selectedDeptId: id, currentPage: 'custom-dept', currentTab: null, currentSub: null })
    syncUrl(get())
  },

  setSelectedProject: (id) => {
    set({ selectedProjectId: id })
    syncUrl(get())
  },

  openForm: (form) => set((s) => ({ activeForm: { ...form, returnPage: s.currentPage } })),

  closeForm: () => {
    const state = get()
    // Closing (saved or backed out) discards the form's unsaved draft.
    if (state.activeForm) clearFormDraft(state.activeForm)
    set({ activeForm: null, currentPage: state.activeForm?.returnPage ?? state.currentPage })
    syncUrl(get())
  },
}))
