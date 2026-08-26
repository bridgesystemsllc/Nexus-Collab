// apps/api/src/lib/microsoftGraph.test.ts
import { describe, it, expect } from 'vitest'
import { tenantIdFromIdToken } from './microsoftGraph'

// Builds a JWT-shaped string. The signature is garbage on purpose: this
// decoder must never be mistaken for a verifier, and a test that fed it a
// real signature would imply otherwise.
function idToken(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(payload)}.not-a-signature`
}

describe('tenantIdFromIdToken', () => {
  it('reads the tid claim', () => {
    expect(tenantIdFromIdToken(idToken({ tid: 'f8c0-tenant', oid: 'user-1' })))
      .toBe('f8c0-tenant')
  })

  it('returns null when the token is absent', () => {
    expect(tenantIdFromIdToken(undefined)).toBeNull()
  })

  it('returns null when there is no tid claim', () => {
    expect(tenantIdFromIdToken(idToken({ oid: 'user-1' }))).toBeNull()
  })

  it('returns null for an empty tid rather than an empty-string org key', () => {
    expect(tenantIdFromIdToken(idToken({ tid: '' }))).toBeNull()
  })

  it('returns null when tid is not a string', () => {
    expect(tenantIdFromIdToken(idToken({ tid: 42 }))).toBeNull()
  })

  it('returns null for a malformed token instead of throwing', () => {
    // A throw here would turn a bad token into a 500 during login.
    expect(tenantIdFromIdToken('not.a.jwt')).toBeNull()
    expect(tenantIdFromIdToken('only-one-segment')).toBeNull()
    expect(tenantIdFromIdToken('')).toBeNull()
  })
})
