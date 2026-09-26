import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BriefFormPage } from './BriefFormPage'
import { EMPTY_FORM } from './NewBriefModal'
import * as api from '@/lib/api'
import * as appStore from '@/stores/appStore'

vi.mock('@/lib/api', () => ({
  api: {
    patch: vi.fn(),
    post: vi.fn(),
  },
  getApiErrorMessage: vi.fn((err, fallback) => {
    if (err?.response?.data?.error?.message) {
      return err.response.data.error.message
    }
    return fallback
  }),
}))

vi.mock('@/stores/appStore', async (importOriginal) => {
  const actual = await importOriginal() as typeof appStore
  return {
    ...actual,
    useAppStore: vi.fn(),
  }
})

const createQueryClient = () => new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
})

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  )
}

describe('BriefFormPage', () => {
  const mockCloseForm = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(appStore.useAppStore as any).mockImplementation((selector: (state: any) => any) => {
      const state = { closeForm: mockCloseForm }
      return selector(state)
    })
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('T-W5: edit saves with real ids and clean data', () => {
    it('calls api.patch with correct URL and data without id/moduleId', async () => {
      const initialData = {
        ...EMPTY_FORM,
        projectName: 'Test Project',
        brand: 'Test Brand',
        id: 'stale-id',
        moduleId: 'stale-module',
      }

      const activeForm = {
        formType: 'brief' as const,
        mode: 'edit' as const,
        recordId: 'item-1',
        context: {
          moduleId: 'mod-1',
          departmentId: 'dept-1',
          initialData,
        },
      }

      ;(api.api.patch as any).mockResolvedValue({ data: {} })

      renderWithProviders(<BriefFormPage form={activeForm} />)

      // Click Save Draft button
      const saveDraftButton = screen.getByRole('button', { name: /save draft/i })
      fireEvent.click(saveDraftButton)

      await waitFor(() => {
        expect(api.api.patch).toHaveBeenCalledTimes(1)
      })

      // Check the URL uses real ids
      const [[url, body]] = (api.api.patch as any).mock.calls
      expect(url).toBe('/departments/dept-1/modules/mod-1/items/item-1')

      // Check the body data does not contain id or moduleId
      expect(body.data).not.toHaveProperty('id')
      expect(body.data).not.toHaveProperty('moduleId')
      expect(body.data.projectName).toBe('Test Project')
      expect(body.data.briefStatus).toBe('Draft')
    })
  })

  describe('T-W3: missing recordId shows error, no request', () => {
    it('shows missing id message when recordId is null in edit mode', async () => {
      const activeForm = {
        formType: 'brief' as const,
        mode: 'edit' as const,
        recordId: null,
        context: {
          moduleId: 'mod-1',
          departmentId: 'dept-1',
          initialData: { ...EMPTY_FORM, projectName: 'Test' },
        },
      }

      renderWithProviders(<BriefFormPage form={activeForm} />)

      const saveDraftButton = screen.getByRole('button', { name: /save draft/i })
      fireEvent.click(saveDraftButton)

      await waitFor(() => {
        expect(screen.getByText(/can't save: this brief is missing its id/i)).toBeInTheDocument()
      })

      expect(api.api.patch).not.toHaveBeenCalled()
      expect(api.api.post).not.toHaveBeenCalled()
    })
  })

  describe('T-W4: server error shows message, form stays open', () => {
    it('displays error message from server on patch failure', async () => {
      const activeForm = {
        formType: 'brief' as const,
        mode: 'edit' as const,
        recordId: 'item-1',
        context: {
          moduleId: 'mod-1',
          departmentId: 'dept-1',
          initialData: { ...EMPTY_FORM, projectName: 'Test' },
        },
      }

      const serverError = {
        response: {
          data: {
            error: { message: 'Failed to update module item' },
          },
        },
      }
      ;(api.api.patch as any).mockRejectedValue(serverError)

      renderWithProviders(<BriefFormPage form={activeForm} />)

      const saveDraftButton = screen.getByRole('button', { name: /save draft/i })
      fireEvent.click(saveDraftButton)

      await waitFor(() => {
        expect(screen.getByText('Failed to update module item')).toBeInTheDocument()
      })

      // Form should still be visible (not closed)
      expect(mockCloseForm).not.toHaveBeenCalled()
    })
  })
})
