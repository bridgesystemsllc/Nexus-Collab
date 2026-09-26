/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from '@testing-library/react'

// We need to control window.location before the store is imported
const originalLocation = window.location

describe('appStore navigation', () => {
  let useAppStore: typeof import('./appStore').useAppStore

  beforeEach(async () => {
    // Reset modules so store reinitializes with new URL
    vi.resetModules()

    // Mock history.replaceState
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})
    vi.spyOn(window.history, 'pushState').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function setUrl(search: string) {
    Object.defineProperty(window, 'location', {
      value: {
        ...originalLocation,
        pathname: '/',
        search,
        hash: '',
      },
      writable: true,
    })
  }

  async function loadStore() {
    const mod = await import('./appStore')
    useAppStore = mod.useAppStore
    return mod
  }

  // T-W2: Booting with ?view=ops&tab=production
  it('boots with ops and production tab from URL', async () => {
    setUrl('?view=ops&tab=production')
    await loadStore()

    expect(useAppStore.getState().currentPage).toBe('ops')
    expect(useAppStore.getState().currentTab).toBe('production')
  })

  // T-W2: Booting with ?view=cowork-detail&cowork=c1
  it('boots with cowork-detail and coworkId from URL', async () => {
    setUrl('?view=cowork-detail&cowork=c1')
    await loadStore()

    expect(useAppStore.getState().currentPage).toBe('cowork-detail')
    expect(useAppStore.getState().selectedCoworkId).toBe('c1')
  })

  it('boots with dashboard for empty URL', async () => {
    setUrl('')
    await loadStore()

    expect(useAppStore.getState().currentPage).toBe('dashboard')
    expect(useAppStore.getState().currentTab).toBeNull()
  })

  it('boots with tasks from URL', async () => {
    setUrl('?view=tasks')
    await loadStore()

    expect(useAppStore.getState().currentPage).toBe('tasks')
  })

  // T-W2: setSelectedCowork(null) removes cowork
  it('setSelectedCowork(null) updates page and URL', async () => {
    setUrl('?view=cowork-detail&cowork=c1')
    await loadStore()

    act(() => {
      useAppStore.getState().setSelectedCowork(null)
    })

    expect(useAppStore.getState().selectedCoworkId).toBeNull()
    expect(useAppStore.getState().currentPage).toBe('cowork')
    expect(window.history.replaceState).toHaveBeenCalled()
  })

  // T-W2: setPage('tasks') from Ops clears tab
  it('setPage to different page clears tab', async () => {
    setUrl('?view=ops&tab=production')
    await loadStore()

    expect(useAppStore.getState().currentTab).toBe('production')

    act(() => {
      useAppStore.getState().setPage('tasks')
    })

    expect(useAppStore.getState().currentPage).toBe('tasks')
    expect(useAppStore.getState().currentTab).toBeNull()
  })

  // I4: writeNavUrl never adds history entries
  it('setPage uses replaceState, not pushState', async () => {
    setUrl('')
    await loadStore()

    act(() => {
      useAppStore.getState().setPage('tasks')
    })

    expect(window.history.pushState).not.toHaveBeenCalled()
    expect(window.history.replaceState).toHaveBeenCalled()
  })

  it('setTab updates currentTab and URL', async () => {
    setUrl('?view=ops')
    await loadStore()

    act(() => {
      useAppStore.getState().setTab('production')
    })

    expect(useAppStore.getState().currentTab).toBe('production')
    expect(window.history.replaceState).toHaveBeenCalled()
  })

  it('closeForm restores returnPage', async () => {
    setUrl('?view=rd')
    await loadStore()

    act(() => {
      useAppStore.getState().openForm({ formType: 'brief', mode: 'create' })
    })

    expect(useAppStore.getState().activeForm?.returnPage).toBe('rd')

    act(() => {
      useAppStore.getState().closeForm()
    })

    expect(useAppStore.getState().activeForm).toBeNull()
    expect(useAppStore.getState().currentPage).toBe('rd')
  })

  it('setSelectedDept updates page and URL', async () => {
    setUrl('')
    await loadStore()

    act(() => {
      useAppStore.getState().setSelectedDept('d1')
    })

    expect(useAppStore.getState().selectedDeptId).toBe('d1')
    expect(useAppStore.getState().currentPage).toBe('custom-dept')
    expect(window.history.replaceState).toHaveBeenCalled()
  })

  it('setSelectedProject updates projectId and URL', async () => {
    setUrl('?view=projects')
    await loadStore()

    act(() => {
      useAppStore.getState().setSelectedProject('p1')
    })

    expect(useAppStore.getState().selectedProjectId).toBe('p1')
    expect(window.history.replaceState).toHaveBeenCalled()
  })

  it('setPage to projects clears selectedProjectId', async () => {
    setUrl('?view=projects&project=p1')
    await loadStore()

    expect(useAppStore.getState().selectedProjectId).toBe('p1')

    act(() => {
      useAppStore.getState().setPage('projects')
    })

    expect(useAppStore.getState().selectedProjectId).toBeNull()
  })
})
