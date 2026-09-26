import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  currentReturnTo,
  loginUrl,
  captureDraftForReauth,
  takePendingDraft,
  setStoreAccessors,
  setLiveDraftSource,
  getDraftKey,
  type PendingDraft,
} from './reauth'

// Mock formRegistry
vi.mock('@/app/formRegistry', () => ({
  formRegistry: {
    brief: () => null,
    task: () => null,
    cm: () => null,
  },
}))

describe('currentReturnTo', () => {
  const originalLocation = window.location

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/', search: '' },
      writable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true })
  })

  it('returns pathname + search', () => {
    ;(window.location as any).pathname = '/'
    ;(window.location as any).search = '?view=ops&tab=production'
    expect(currentReturnTo()).toBe('/?view=ops&tab=production')
  })
})

describe('loginUrl', () => {
  it('encodes returnTo in query param', () => {
    expect(loginUrl('/?view=ops&tab=production')).toBe(
      '/api/login?returnTo=%2F%3Fview%3Dops%26tab%3Dproduction'
    )
  })

  it('encodes special characters', () => {
    expect(loginUrl('/?q=hello world')).toBe('/api/login?returnTo=%2F%3Fq%3Dhello%20world')
  })
})

describe('captureDraftForReauth', () => {
  const originalLocation = window.location

  beforeEach(() => {
    sessionStorage.clear()
    Object.defineProperty(window, 'location', {
      value: { pathname: '/', search: '?view=rd' },
      writable: true,
    })
    setStoreAccessors(() => null, () => null)
    setLiveDraftSource(null)
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true })
  })

  it('does nothing when no activeForm', () => {
    setStoreAccessors(() => null, () => 'm1')
    captureDraftForReauth()
    expect(sessionStorage.getItem('nexus.pendingDraft.v1')).toBeNull()
  })

  it('captures draft when activeForm exists', () => {
    setStoreAccessors(
      () => ({
        formType: 'brief',
        mode: 'edit' as const,
        recordId: 'r1',
        returnPage: 'rd' as const,
        context: { moduleId: 'mod1' },
      }),
      () => 'm1'
    )
    setLiveDraftSource(() => ({ name: 'Test Brief' }))

    captureDraftForReauth()

    const raw = sessionStorage.getItem('nexus.pendingDraft.v1')
    expect(raw).not.toBeNull()

    const draft = JSON.parse(raw!) as PendingDraft
    expect(draft.v).toBe(1)
    expect(draft.activeForm.formType).toBe('brief')
    expect(draft.values).toEqual({ name: 'Test Brief' })
    expect(draft.memberId).toBe('m1')
    expect(draft.returnTo).toBe('/?view=rd')
  })

  it('handles sessionStorage errors gracefully', () => {
    setStoreAccessors(
      () => ({
        formType: 'brief',
        mode: 'create' as const,
        returnPage: 'rd' as const,
      }),
      () => 'm1'
    )

    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage full')
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    captureDraftForReauth()

    expect(warnSpy).toHaveBeenCalledWith('[reauth] draft not saved', expect.any(Error))

    setItemSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('filters non-serializable context values', () => {
    setStoreAccessors(
      () => ({
        formType: 'brief',
        mode: 'create' as const,
        returnPage: 'rd' as const,
        context: {
          moduleId: 'mod1',
          callback: () => {}, // should be filtered
          nested: { a: 1 },
        },
      }),
      () => 'm1'
    )

    captureDraftForReauth()

    const raw = sessionStorage.getItem('nexus.pendingDraft.v1')
    const draft = JSON.parse(raw!) as PendingDraft
    expect(draft.activeForm.context).toEqual({ moduleId: 'mod1', nested: { a: 1 } })
  })
})

describe('takePendingDraft', () => {
  const originalLocation = window.location

  beforeEach(() => {
    sessionStorage.clear()
    Object.defineProperty(window, 'location', {
      value: { pathname: '/', search: '?view=rd' },
      writable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true })
  })

  const validDraft: PendingDraft = {
    v: 1,
    activeForm: {
      formType: 'brief',
      mode: 'edit',
      recordId: 'r1',
      returnPage: 'rd',
      context: null,
    },
    values: { name: 'Test' },
    returnTo: '/?view=rd',
    memberId: 'm1',
    savedAt: Date.now(),
  }

  it('returns draft and removes key on success', () => {
    sessionStorage.setItem('nexus.pendingDraft.v1', JSON.stringify(validDraft))

    const result = takePendingDraft('m1')

    expect(result).toEqual(validDraft)
    expect(sessionStorage.getItem('nexus.pendingDraft.v1')).toBeNull()
  })

  it('returns null when no key exists', () => {
    expect(takePendingDraft('m1')).toBeNull()
  })

  it('returns null for invalid JSON', () => {
    sessionStorage.setItem('nexus.pendingDraft.v1', 'not json')
    expect(takePendingDraft('m1')).toBeNull()
    expect(sessionStorage.getItem('nexus.pendingDraft.v1')).toBeNull()
  })

  it('returns null for wrong version', () => {
    sessionStorage.setItem('nexus.pendingDraft.v1', JSON.stringify({ ...validDraft, v: 2 }))
    expect(takePendingDraft('m1')).toBeNull()
  })

  // I5: a pending draft is single-use and member-bound
  it('returns null when memberId differs', () => {
    sessionStorage.setItem('nexus.pendingDraft.v1', JSON.stringify(validDraft))

    expect(takePendingDraft('m2')).toBeNull()
    expect(sessionStorage.getItem('nexus.pendingDraft.v1')).toBeNull()
  })

  it('accepts null memberId only when returnTo matches', () => {
    const draftWithNullMember = { ...validDraft, memberId: null }
    sessionStorage.setItem('nexus.pendingDraft.v1', JSON.stringify(draftWithNullMember))

    expect(takePendingDraft('m1')).toEqual(draftWithNullMember)
  })

  it('rejects null memberId when returnTo does not match', () => {
    const draftWithNullMember = { ...validDraft, memberId: null, returnTo: '/?view=ops' }
    sessionStorage.setItem('nexus.pendingDraft.v1', JSON.stringify(draftWithNullMember))

    expect(takePendingDraft('m1')).toBeNull()
  })

  it('returns null for expired draft', () => {
    const oldDraft = { ...validDraft, savedAt: Date.now() - 31 * 60 * 1000 }
    sessionStorage.setItem('nexus.pendingDraft.v1', JSON.stringify(oldDraft))

    expect(takePendingDraft('m1')).toBeNull()
  })

  it('returns null for unknown formType', () => {
    const unknownForm = {
      ...validDraft,
      activeForm: { ...validDraft.activeForm, formType: 'unknown' },
    }
    sessionStorage.setItem('nexus.pendingDraft.v1', JSON.stringify(unknownForm))

    expect(takePendingDraft('m1')).toBeNull()
  })

  it('accepts draft with custom now parameter', () => {
    const now = Date.now()
    const draft = { ...validDraft, savedAt: now - 29 * 60 * 1000 }
    sessionStorage.setItem('nexus.pendingDraft.v1', JSON.stringify(draft))

    expect(takePendingDraft('m1', now)).not.toBeNull()
  })
})

describe('getDraftKey', () => {
  it('builds key with recordId', () => {
    expect(getDraftKey('brief', 'edit', 'r1')).toBe('nexus.formDraft.v1:brief:edit:r1')
  })

  it('builds key with new for null recordId', () => {
    expect(getDraftKey('brief', 'create', null)).toBe('nexus.formDraft.v1:brief:create:new')
  })
})
