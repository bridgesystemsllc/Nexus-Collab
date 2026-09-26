import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useFormDraft } from './useFormDraft'
import type { ActiveForm } from '@/stores/appStore'
import * as reauth from '@/lib/reauth'

const mockForm: ActiveForm = {
  formType: 'brief',
  mode: 'create',
  recordId: null,
  returnPage: 'rd',
}

describe('useFormDraft', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // T-W5: Given a stored draft, onRestore is called once and restored is true
  it('restores draft from sessionStorage on mount', async () => {
    const draftData = { name: 'Test Brief', description: 'A test' }
    sessionStorage.setItem(
      'nexus.formDraft.v1:brief:create:new',
      JSON.stringify(draftData)
    )

    const onRestore = vi.fn()
    const { result } = renderHook(() =>
      useFormDraft(mockForm, { name: '', description: '' }, onRestore)
    )

    expect(onRestore).toHaveBeenCalledWith(draftData)
    expect(onRestore).toHaveBeenCalledTimes(1)
    expect(result.current.restored).toBe(true)
  })

  it('does not call onRestore when no draft exists', () => {
    const onRestore = vi.fn()
    const { result } = renderHook(() =>
      useFormDraft(mockForm, { name: '', description: '' }, onRestore)
    )

    expect(onRestore).not.toHaveBeenCalled()
    expect(result.current.restored).toBe(false)
  })

  // T-W5: clear() removes the key
  it('clear removes the draft from sessionStorage', () => {
    sessionStorage.setItem('nexus.formDraft.v1:brief:create:new', '{"name":"test"}')

    const { result } = renderHook(() =>
      useFormDraft(mockForm, { name: 'test' }, vi.fn())
    )

    act(() => {
      result.current.clear()
    })

    expect(sessionStorage.getItem('nexus.formDraft.v1:brief:create:new')).toBeNull()
  })

  // T-W5: The live source is registered and unregistered on unmount
  it('registers and unregisters live draft source', () => {
    const setLiveDraftSourceSpy = vi.spyOn(reauth, 'setLiveDraftSource')

    const { unmount } = renderHook(() =>
      useFormDraft(mockForm, { name: 'test' }, vi.fn())
    )

    expect(setLiveDraftSourceSpy).toHaveBeenCalledWith(expect.any(Function))

    unmount()

    expect(setLiveDraftSourceSpy).toHaveBeenLastCalledWith(null)
  })

  it('writes draft to sessionStorage after debounce', async () => {
    const { rerender } = renderHook(
      ({ values }) => useFormDraft(mockForm, values, vi.fn()),
      { initialProps: { values: { name: 'initial' } } }
    )

    // Update values
    rerender({ values: { name: 'updated' } })

    // Before debounce
    expect(sessionStorage.getItem('nexus.formDraft.v1:brief:create:new')).toBeNull()

    // After debounce (400ms)
    act(() => {
      vi.advanceTimersByTime(400)
    })

    expect(sessionStorage.getItem('nexus.formDraft.v1:brief:create:new')).toBe(
      JSON.stringify({ name: 'updated' })
    )
  })

  it('uses correct key for edit mode with recordId', () => {
    const editForm: ActiveForm = {
      formType: 'brief',
      mode: 'edit',
      recordId: 'r123',
      returnPage: 'rd',
    }

    renderHook(() => useFormDraft(editForm, { name: 'test' }, vi.fn()))

    act(() => {
      vi.advanceTimersByTime(400)
    })

    expect(sessionStorage.getItem('nexus.formDraft.v1:brief:edit:r123')).toBe(
      JSON.stringify({ name: 'test' })
    )
  })

  it('handles invalid JSON in sessionStorage gracefully', () => {
    sessionStorage.setItem('nexus.formDraft.v1:brief:create:new', 'not valid json')

    const onRestore = vi.fn()
    const { result } = renderHook(() =>
      useFormDraft(mockForm, { name: '' }, onRestore)
    )

    expect(onRestore).not.toHaveBeenCalled()
    expect(result.current.restored).toBe(false)
  })
})
