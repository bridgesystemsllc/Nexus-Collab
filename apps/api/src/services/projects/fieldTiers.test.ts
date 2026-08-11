import { describe, it, expect } from 'vitest'
import { splitByTier, CONTENT_FIELDS, GOVERNANCE_FIELDS } from './fieldTiers'

describe('splitByTier', () => {
  it('routes content fields to the content tier', () => {
    const out = splitByTier({ title: 'New title', businessCase: 'Because' })
    expect(out.content).toEqual({ title: 'New title', businessCase: 'Because' })
    expect(out.governance).toEqual({})
    expect(out.unrecognised).toEqual([])
  })

  it('routes governance fields to the governance tier', () => {
    const out = splitByTier({ projectManagerId: 'u-2', isConfidential: true })
    expect(out.governance).toEqual({ projectManagerId: 'u-2', isConfidential: true })
    expect(out.content).toEqual({})
  })

  it('splits a mixed body across both tiers', () => {
    const out = splitByTier({ title: 'T', budgetAmount: 500 })
    expect(out.content).toEqual({ title: 'T' })
    expect(out.governance).toEqual({ budgetAmount: 500 })
  })

  it('reports unrecognised keys instead of silently dropping them', () => {
    const out = splitByTier({ title: 'T', wibble: 1 })
    expect(out.unrecognised).toEqual(['wibble'])
    expect(out.content).toEqual({ title: 'T' })
  })

  it('preserves an explicit null, which clears a field', () => {
    const out = splitByTier({ targetEndDate: null })
    expect(out.content).toEqual({ targetEndDate: null })
  })

  it('ignores a key whose value is undefined', () => {
    const out = splitByTier({ title: 'T', description: undefined })
    expect(out.content).toEqual({ title: 'T' })
  })

  it('keeps the two tiers disjoint', () => {
    const overlap = CONTENT_FIELDS.filter((f) => (GOVERNANCE_FIELDS as readonly string[]).includes(f))
    expect(overlap).toEqual([])
  })

  it('does not accept status, which has its own transition endpoint', () => {
    const out = splitByTier({ status: 'ACTIVE' })
    expect(out.unrecognised).toEqual(['status'])
  })
})
