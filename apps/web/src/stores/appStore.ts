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
  | 'product-catalog'
  | 'integrations'
  | 'email-agent'
  | 'dept-manager'
  | 'pulse'
  | 'custom-dept'
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
  theme: Theme
  activeForm: ActiveForm | null

  setPage: (page: Page) => void
  toggleAIPanel: () => void
  toggleSidebar: () => void
  setSelectedCowork: (id: string | null) => void
  setSelectedDept: (id: string | null) => void
  openForm: (form: Omit<ActiveForm, 'returnPage'>) => void
  closeForm: () => void
}

export const useAppStore = create<AppState>((set) => ({
  currentPage: 'dashboard',
  aiPanelOpen: false,
  sidebarCollapsed: false,
  selectedCoworkId: null,
  selectedDeptId: null,
  theme: 'light',
  activeForm: null,

  setPage: (page) => set({ currentPage: page }),
  toggleAIPanel: () => set((s) => ({ aiPanelOpen: !s.aiPanelOpen })),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSelectedCowork: (id) => set({ selectedCoworkId: id, currentPage: id ? 'cowork-detail' : 'cowork' }),
  setSelectedDept: (id) => set({ selectedDeptId: id, currentPage: 'custom-dept' }),
  openForm: (form) => set((s) => ({ activeForm: { ...form, returnPage: s.currentPage } })),
  closeForm: () => set((s) => ({ activeForm: null, currentPage: s.activeForm?.returnPage ?? s.currentPage })),
}))
