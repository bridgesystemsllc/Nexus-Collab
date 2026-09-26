import { create } from 'zustand'

type Page =
  | 'onboarding'
  | 'dashboard'
  | 'everything'
  | 'rd'
  | 'ops'
  | 'finance'
  | 'cowork'
  | 'cowork-detail'
  | 'docs'
  | 'product-catalog'
  | 'integrations'
  | 'email-agent'
  | 'dept-manager'
  | 'pulse'
  | 'people'
  | 'billing'
  | 'settings'
  | 'organization'
  | 'custom-dept'
  | 'projects'
  | 'tasks'
  | 'follow-ups'
  | 'agent-settings'
  | 'product-catalog'

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
  aiPanelOpen: boolean
  sidebarCollapsed: boolean
  selectedCoworkId: string | null
  selectedDeptId: string | null
  // Portfolio-scoped project selection; department tabs keep their own.
  selectedProjectId: string | null
  theme: Theme
  activeForm: ActiveForm | null

  setPage: (page: Page) => void
  toggleAIPanel: () => void
  toggleSidebar: () => void
  setSelectedCowork: (id: string | null) => void
  setSelectedDept: (id: string | null) => void
  setSelectedProject: (id: string | null) => void
  openForm: (form: Omit<ActiveForm, 'returnPage'>) => void
  closeForm: () => void
}

// ─── Pages restored from the URL ───────────────────────────
// The app navigates through this store rather than routes, so a refresh
// normally lands back on the dashboard. All pages used by PageContent/setPage
// are now restorable via ?view= so refresh returns the user to the same page.
const RESTORABLE: Page[] = [
  'onboarding',
  'dashboard',
  'everything',
  'rd',
  'ops',
  'finance',
  'cowork',
  'cowork-detail',
  'docs',
  'product-catalog',
  'integrations',
  'email-agent',
  'dept-manager',
  'pulse',
  'people',
  'billing',
  'settings',
  'organization',
  'custom-dept',
  'projects',
  'tasks',
  'follow-ups',
  'agent-settings',
]

function isPage(value: string | null): value is Page {
  return value !== null && RESTORABLE.includes(value as Page)
}

function pageFromUrl(): Page {
  if (typeof window === 'undefined') return 'dashboard'
  const view = new URLSearchParams(window.location.search).get('view')
  return isPage(view) ? view : 'dashboard'
}

function syncUrlView(page: Page): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.set('view', page)
  window.history.replaceState(null, '', url.toString())
}

export const useAppStore = create<AppState>((set) => ({
  currentPage: pageFromUrl(),
  aiPanelOpen: false,
  sidebarCollapsed: false,
  selectedCoworkId: null,
  selectedDeptId: null,
  selectedProjectId: null,
  theme: 'light',
  activeForm: null,

  // Navigating to Projects from the sidebar means "go to the list". Without
  // clearing the selection the user lands back inside whichever project they
  // last opened, with no obvious way to tell why.
  // Sync URL on every page change so refresh restores the same view.
  setPage: (page) => {
    syncUrlView(page)
    return set(page === 'projects' ? { currentPage: page, selectedProjectId: null } : { currentPage: page })
  },
  toggleAIPanel: () => set((s) => ({ aiPanelOpen: !s.aiPanelOpen })),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSelectedCowork: (id) => {
    const page = id ? 'cowork-detail' : 'cowork'
    syncUrlView(page)
    return set({ selectedCoworkId: id, currentPage: page })
  },
  setSelectedDept: (id) => {
    syncUrlView('custom-dept')
    return set({ selectedDeptId: id, currentPage: 'custom-dept' })
  },
  setSelectedProject: (id) => set({ selectedProjectId: id }),
  openForm: (form) => set((s) => ({ activeForm: { ...form, returnPage: s.currentPage } })),
  closeForm: () =>
    set((s) => {
      const returnPage = s.activeForm?.returnPage ?? s.currentPage
      syncUrlView(returnPage)
      return { activeForm: null, currentPage: returnPage }
    }),
}))
