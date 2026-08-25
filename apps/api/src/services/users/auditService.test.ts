import { describe, it, expect } from 'vitest'
import { redactChanges, diff } from './auditService'

// The audit log is the most-read table during an incident and one of the least
// guarded. A secret that lands here is a secret in every export and every
// screenshot of the Activity tab.

describe('redactChanges', () => {
  it('keeps ordinary fields intact', () => {
    expect(redactChanges({ jobTitle: { from: 'Analyst', to: 'Lead' } }))
      .toEqual({ jobTitle: { from: 'Analyst', to: 'Lead' } })
  })

  for (const field of [
    'password', 'passwordHash', 'password_hash', 'token', 'tokenHash',
    'token_hash', 'accessToken', 'refreshToken', 'secret', 'apiKey',
    'api_key', 'authorization', 'cookie', 'sessionId',
  ]) {
    it(`redacts ${field}`, () => {
      const out = redactChanges({ [field]: { from: 'sk-real-secret', to: 'sk-newer-secret' } })
      expect(JSON.stringify(out)).not.toContain('sk-real-secret')
      expect(JSON.stringify(out)).not.toContain('sk-newer-secret')
      expect(out![field]).toEqual({ from: '[redacted]', to: '[redacted]' })
    })
  }

  it('records THAT a secret changed, without its value', () => {
    // "password changed" is what an auditor needs. The value is what they
    // must not have.
    const out = redactChanges({ passwordHash: { from: 'a', to: 'b' } })
    expect(Object.keys(out!)).toContain('passwordHash')
  })

  it('matches case-insensitively and ignores separators', () => {
    const out = redactChanges({ 'Invite-Token': { from: 'raw', to: 'raw2' } })
    expect(JSON.stringify(out)).not.toContain('raw')
  })

  it('normalises dates so the row survives JSON', () => {
    const out = redactChanges({ dueDate: { from: new Date('2026-01-01T00:00:00Z'), to: null } })
    expect(out!.dueDate!.from).toBe('2026-01-01T00:00:00.000Z')
  })

  it('turns undefined into null rather than dropping the key', () => {
    expect(redactChanges({ phone: { from: undefined, to: '+15551234' } })!.phone!.from).toBeNull()
  })

  it('returns null for nothing', () => {
    expect(redactChanges(null)).toBeNull()
    expect(redactChanges(undefined)).toBeNull()
  })
})

describe('diff', () => {
  it('reports only what changed', () => {
    expect(diff({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual({ b: { from: 2, to: 3 } })
  })

  it('ignores keys absent from the patch', () => {
    // A partial update must not report every untouched column as noise.
    expect(diff({ a: 1, b: 2 }, { a: 1 })).toEqual({})
  })

  it('skips undefined, which means "not supplied"', () => {
    expect(diff({ a: 1 }, { a: undefined })).toEqual({})
  })

  it('reports an explicit null, which means cleared', () => {
    expect(diff({ a: 'x' }, { a: null })).toEqual({ a: { from: 'x', to: null } })
  })

  it('treats a Date and its ISO string as unchanged', () => {
    const d = new Date('2026-03-01T00:00:00Z')
    expect(diff({ at: d }, { at: '2026-03-01T00:00:00.000Z' })).toEqual({})
  })

  it('ignores updatedAt by default', () => {
    expect(diff({ updatedAt: new Date(1) }, { updatedAt: new Date(2) })).toEqual({})
  })
})
