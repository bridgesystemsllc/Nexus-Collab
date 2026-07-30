import { describe, it, expect } from 'vitest'
import { statusFor, statusFromStock, coverageFor, gradeInventory } from './inventoryStatus'

describe('statusFor (coverage-based grading)', () => {
  it('grades no coverage as an emergency', () => {
    expect(statusFor(0)).toBe('emergency')
    expect(statusFor(-1)).toBe('emergency')
  })

  it('grades under a month of cover as critical', () => {
    expect(statusFor(0.1)).toBe('critical')
    expect(statusFor(0.9)).toBe('critical')
  })

  it('treats exactly one month as healthy, not critical', () => {
    expect(statusFor(1)).toBe('healthy')
  })

  it('grades a normal band as healthy up to the overstock boundary', () => {
    expect(statusFor(6)).toBe('healthy')
    expect(statusFor(20)).toBe('healthy')
  })

  it('grades beyond twenty months as overstock', () => {
    expect(statusFor(20.1)).toBe('overstock')
  })
})

describe('statusFromStock (fallback grading)', () => {
  it('grades zero or negative stock as an emergency', () => {
    expect(statusFromStock(0)).toBe('emergency')
    expect(statusFromStock(-5)).toBe('emergency')
  })

  it('grades thin stock as critical', () => {
    expect(statusFromStock(1)).toBe('critical')
    expect(statusFromStock(249)).toBe('critical')
  })

  it('grades the normal band as healthy', () => {
    expect(statusFromStock(250)).toBe('healthy')
    expect(statusFromStock(15000)).toBe('healthy')
  })

  it('grades a large position as overstock', () => {
    expect(statusFromStock(15001)).toBe('overstock')
  })
})

describe('coverageFor', () => {
  it('returns months of cover rounded to one decimal', () => {
    expect(coverageFor(900, 250)).toBe(3.6)
  })

  it('returns null when demand is unknown or zero', () => {
    expect(coverageFor(900, 0)).toBeNull()
    expect(coverageFor(900, -10)).toBeNull()
  })
})

describe('gradeInventory', () => {
  it('uses coverage when demand is known', () => {
    expect(gradeInventory(900, 1000)).toEqual({ coverageMonths: 0.9, status: 'critical' })
  })

  it('falls back to the stock heuristic when demand is missing', () => {
    // 900 units would be "critical" on coverage against high demand, but with
    // no demand figure the stock-only band calls it healthy.
    expect(gradeInventory(900, null)).toEqual({ coverageMonths: null, status: 'healthy' })
    expect(gradeInventory(900, undefined)).toEqual({ coverageMonths: null, status: 'healthy' })
  })

  it('reports an emergency for zero stock under either path', () => {
    expect(gradeInventory(0, 500).status).toBe('emergency')
    expect(gradeInventory(0, null).status).toBe('emergency')
  })
})
