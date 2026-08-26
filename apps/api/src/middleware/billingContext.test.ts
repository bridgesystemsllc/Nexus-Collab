// apps/api/src/middleware/billingContext.test.ts
import { describe, it, expect } from 'vitest'
import { getActingOrgId, NoActingOrgError } from './billingContext'

// The whole point of this helper is that there is exactly one way to learn the
// acting org, and it is not the request body. A route that reads an org id a
// client supplied is a cross-tenant read waiting to happen, so the tests below
// assert the helper ignores every client-controllable surface.

const req = (over: Record<string, unknown> = {}) => ({ body: {}, params: {}, query: {}, ...over }) as any

describe('getActingOrgId', () => {
  it('returns the org of the attached member', () => {
    expect(getActingOrgId(req({ member: { id: 'm1', orgId: 'org_A' } }))).toBe('org_A')
  })

  it('throws when no member is attached', () => {
    expect(() => getActingOrgId(req())).toThrow(NoActingOrgError)
  })

  it('throws when the attached member has no org', () => {
    expect(() => getActingOrgId(req({ member: { id: 'm1' } }))).toThrow(NoActingOrgError)
  })

  it('ignores an orgId in the body', () => {
    const r = req({ member: { id: 'm1', orgId: 'org_A' }, body: { orgId: 'org_B' } })
    expect(getActingOrgId(r)).toBe('org_A')
  })

  it('ignores an orgId in params and query', () => {
    const r = req({
      member: { id: 'm1', orgId: 'org_A' },
      params: { orgId: 'org_B' },
      query: { orgId: 'org_C' },
    })
    expect(getActingOrgId(r)).toBe('org_A')
  })
})
