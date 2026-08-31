import { describe, it, expect } from 'vitest'
import { splitLegacyComments } from './legacyComments'

const iso = (d: Date | null) => d?.toISOString().slice(0, 10)

// The real cell from sales order S0100057780 in the AcneFree fixture.
const REAL_CELL =
  '08.18.2026 - Fill date 09.04.2026.  Ship date 09.14.2026.  AD\n' +
  '07.20.2026 - Decreased order from 2500 pcs to 1459 and added to SO 57881 per customer request.  \n' +
  '08.06.2026 - Decreased order to 1041 and added to SO57881.  AD  '

describe('splitLegacyComments', () => {
  it('parses the canonical dated entry with trailing initials', () => {
    const out = splitLegacyComments(
      '08.18.2026 - Fill date 09.21.2026. Ship date 10.01.2026. Chemical issue resolved and is tracking for 9/21 fill date. AD',
    )
    expect(out).toHaveLength(1)
    expect(iso(out[0].entryDate)).toBe('2026-08-18')
    expect(out[0].authorInitials).toBe('AD')
    expect(out[0].body).toMatch(/^Fill date 09\.21\.2026\./)
    expect(out[0].body).not.toMatch(/AD$/)
  })

  it('accepts the single-digit month form', () => {
    const out = splitLegacyComments('8.18.2026 - Fill date 07.21.2026.  Ship date 07.31.2026.  AD')
    expect(iso(out[0].entryDate)).toBe('2026-08-18')
    expect(out[0].authorInitials).toBe('AD')
  })

  it('splits a real stacked cell into one entry per dated line, in source order', () => {
    const out = splitLegacyComments(REAL_CELL)
    expect(out).toHaveLength(3)
    expect(out.map((c) => iso(c.entryDate))).toEqual(['2026-08-18', '2026-07-20', '2026-08-06'])
    expect(out.map((c) => c.authorInitials)).toEqual(['AD', null, 'AD'])
    expect(out[1].body).toBe('Decreased order from 2500 pcs to 1459 and added to SO 57881 per customer request.')
  })

  it('keeps unparseable text as one comment with no date rather than discarding it', () => {
    const out = splitLegacyComments('waiting on the customer to confirm artwork')
    expect(out).toHaveLength(1)
    expect(out[0].entryDate).toBeNull()
    expect(out[0].body).toBe('waiting on the customer to confirm artwork')
  })

  it('keeps text that precedes the first dated entry', () => {
    const out = splitLegacyComments('holding for artwork  08.18.2026 - approved. AD')
    expect(out).toHaveLength(2)
    expect(out[0].entryDate).toBeNull()
    expect(out[0].body).toBe('holding for artwork')
    expect(iso(out[1].entryDate)).toBe('2026-08-18')
  })

  it('leaves a short-date fragment inside the entry it belongs to', () => {
    // "6.8" and "5.10" are not full dates. Splitting on them would also split
    // quantities, so they stay in the body of the entry that carries them.
    const out = splitLegacyComments('8.18.2026 - Moved out. AD  6.8 Moved out due to start date of 07/02. 5.10 customer sent revised PO.')
    expect(out).toHaveLength(1)
    expect(out[0].body).toContain('6.8 Moved out')
    expect(out[0].body).toContain('5.10 customer sent revised PO.')
  })

  it('returns nothing for an empty cell', () => {
    expect(splitLegacyComments('')).toEqual([])
    expect(splitLegacyComments(null)).toEqual([])
    expect(splitLegacyComments(undefined)).toEqual([])
  })

  it('never loses characters', () => {
    const joined = splitLegacyComments(REAL_CELL).map((c) => c.body).join(' ')
    expect(joined).toContain('Fill date 09.04.2026')
    expect(joined).toContain('Decreased order from 2500 pcs')
    expect(joined).toContain('added to SO57881')
  })
})
