import { describe, it, expect } from 'vitest'
import { departmentScopeFromParam } from './moduleItemScope'

describe('departmentScopeFromParam', () => {
  it('returns null for underscore placeholder', () => {
    expect(departmentScopeFromParam('_')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(departmentScopeFromParam('')).toBeNull()
  })

  it('returns null for whitespace-only', () => {
    expect(departmentScopeFromParam('   ')).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(departmentScopeFromParam(undefined)).toBeNull()
  })

  it('returns trimmed id for real department id', () => {
    expect(departmentScopeFromParam('d1')).toBe('d1')
  })

  it('trims whitespace from real department id', () => {
    expect(departmentScopeFromParam(' dept-1 ')).toBe('dept-1')
  })

  it('preserves case of department id', () => {
    expect(departmentScopeFromParam('DeptABC')).toBe('DeptABC')
  })
})
