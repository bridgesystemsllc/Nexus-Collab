import { describe, it, expect } from 'vitest'
import { safeReturnTo } from './returnTo'

describe('safeReturnTo', () => {
  // I1: returnTo is same-origin path only
  it('accepts valid same-origin paths', () => {
    expect(safeReturnTo('/')).toBe('/')
    expect(safeReturnTo('/?view=ops&tab=production')).toBe('/?view=ops&tab=production')
    expect(safeReturnTo('/page')).toBe('/page')
    expect(safeReturnTo('/page?foo=bar')).toBe('/page?foo=bar')
    expect(safeReturnTo('/a/b/c')).toBe('/a/b/c')
    expect(safeReturnTo('/?ms=connected&reason=ok')).toBe('/?ms=connected&reason=ok')
  })

  it('rejects double-slash (protocol-relative) URLs', () => {
    expect(safeReturnTo('//evil.com')).toBeNull()
    expect(safeReturnTo('//evil.com/path')).toBeNull()
  })

  it('rejects backslash variants', () => {
    expect(safeReturnTo('/\\evil.com')).toBeNull()
    expect(safeReturnTo('/a\\b')).toBeNull()
    expect(safeReturnTo('/path\\to\\file')).toBeNull()
  })

  it('rejects absolute URLs with schemes', () => {
    expect(safeReturnTo('https://evil.com')).toBeNull()
    expect(safeReturnTo('http://evil.com')).toBeNull()
    expect(safeReturnTo('javascript:alert(1)')).toBeNull()
    expect(safeReturnTo('data:text/html,<script>alert(1)</script>')).toBeNull()
  })

  it('rejects paths starting with /api/', () => {
    expect(safeReturnTo('/api/logout')).toBeNull()
    expect(safeReturnTo('/api/login')).toBeNull()
    expect(safeReturnTo('/api/v1/users')).toBeNull()
  })

  it('rejects non-string values', () => {
    expect(safeReturnTo(null)).toBeNull()
    expect(safeReturnTo(undefined)).toBeNull()
    expect(safeReturnTo(42)).toBeNull()
    expect(safeReturnTo({})).toBeNull()
    expect(safeReturnTo([])).toBeNull()
  })

  it('rejects empty string', () => {
    expect(safeReturnTo('')).toBeNull()
  })

  it('rejects strings not starting with /', () => {
    expect(safeReturnTo('page')).toBeNull()
    expect(safeReturnTo('?view=ops')).toBeNull()
  })

  it('rejects strings with control characters', () => {
    expect(safeReturnTo('/page\x00')).toBeNull()
    expect(safeReturnTo('/page\n')).toBeNull()
    expect(safeReturnTo('/page\r')).toBeNull()
    expect(safeReturnTo('/page\t')).toBeNull()
    expect(safeReturnTo('/page\x7f')).toBeNull()
  })

  it('rejects strings over 2048 characters', () => {
    const longPath = '/' + 'a'.repeat(2048)
    expect(safeReturnTo(longPath)).toBeNull()
  })

  it('accepts strings at exactly 2048 characters', () => {
    const maxPath = '/' + 'a'.repeat(2047)
    expect(maxPath.length).toBe(2048)
    expect(safeReturnTo(maxPath)).toBe(maxPath)
  })

  // Edge case: colon in query string is fine (e.g. time values)
  it('allows colon in query string after slash', () => {
    expect(safeReturnTo('/?time=12:30')).toBe('/?time=12:30')
    expect(safeReturnTo('/page?url=http://example')).toBe('/page?url=http://example')
  })
})
