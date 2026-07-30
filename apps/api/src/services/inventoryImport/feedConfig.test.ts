import { describe, it, expect } from 'vitest'
import { normalizeFeedConfig, DEFAULT_GEODIS_COLUMN_MAP, DEFAULT_GUARD } from './feedConfig'

describe('normalizeFeedConfig', () => {
  it('returns usable defaults for an empty config', () => {
    const config = normalizeFeedConfig({})
    expect(config.columnMap).toEqual(DEFAULT_GEODIS_COLUMN_MAP)
    expect(config.guard).toEqual(DEFAULT_GUARD)
    expect(config.warehouse).toBe('GEODIS')
  })

  it('tolerates null and undefined', () => {
    expect(normalizeFeedConfig(null).guard).toEqual(DEFAULT_GUARD)
    expect(normalizeFeedConfig(undefined).guard).toEqual(DEFAULT_GUARD)
  })

  it('keeps a valid override', () => {
    const config = normalizeFeedConfig({ columnMap: { sku: 'SKU Code', onHand: 'Qty' } })
    expect(config.columnMap.sku).toBe('SKU Code')
    expect(config.columnMap.onHand).toBe('Qty')
    // Unspecified columns still fall back rather than becoming undefined.
    expect(config.columnMap.available).toBe(DEFAULT_GEODIS_COLUMN_MAP.available)
  })

  it('rejects a blank column name rather than mapping to an empty header', () => {
    const config = normalizeFeedConfig({ columnMap: { sku: '   ' } })
    expect(config.columnMap.sku).toBe(DEFAULT_GEODIS_COLUMN_MAP.sku)
  })

  it('rejects non-string column names', () => {
    const config = normalizeFeedConfig({ columnMap: { sku: 42 } })
    expect(config.columnMap.sku).toBe(DEFAULT_GEODIS_COLUMN_MAP.sku)
  })

  it('accepts guard ratios within range', () => {
    const config = normalizeFeedConfig({ guard: { minRowRatio: 0.9, maxBadRowRatio: 0.05 } })
    expect(config.guard).toEqual({ minRowRatio: 0.9, maxBadRowRatio: 0.05 })
  })

  it('rejects out-of-range guard ratios, which would silently disable the guard', () => {
    expect(normalizeFeedConfig({ guard: { minRowRatio: 5 } }).guard.minRowRatio)
      .toBe(DEFAULT_GUARD.minRowRatio)
    expect(normalizeFeedConfig({ guard: { minRowRatio: -1 } }).guard.minRowRatio)
      .toBe(DEFAULT_GUARD.minRowRatio)
    expect(normalizeFeedConfig({ guard: { minRowRatio: 'off' } }).guard.minRowRatio)
      .toBe(DEFAULT_GUARD.minRowRatio)
  })

  it('allows an explicit zero ratio, which is a real choice', () => {
    expect(normalizeFeedConfig({ guard: { minRowRatio: 0 } }).guard.minRowRatio).toBe(0)
  })

  it('trims matching rules', () => {
    const config = normalizeFeedConfig({ match: { fromContains: '  geodis.com  ' } })
    expect(config.match.fromContains).toBe('geodis.com')
  })

  it('normalizes a missing targetModuleId to null', () => {
    expect(normalizeFeedConfig({}).targetModuleId).toBeNull()
    expect(normalizeFeedConfig({ targetModuleId: '' }).targetModuleId).toBeNull()
  })
})
