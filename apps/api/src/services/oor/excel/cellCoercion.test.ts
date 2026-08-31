import { describe, it, expect } from 'vitest'
import { coerceDate, coerceNumber, coerceCurrency, splitChannelTag, classifyFulfillment } from './cellCoercion'

const ctx = { rowNumber: 3, column: 'Orig Date' }
const iso = (d: Date | null) => d?.toISOString().slice(0, 10)

describe('coerceDate', () => {
  it('reads an Excel serial', () => {
    expect(iso(coerceDate(46248, ctx).value)).toBe('2026-08-14')
  })
  it('reads the padded text form the report emits', () => {
    expect(iso(coerceDate('7/ 2/26', ctx).value)).toBe('2026-07-02')
  })
  it('resolves both encodings of the same day identically', () => {
    expect(coerceDate(46205, ctx).value?.toISOString()).toBe(coerceDate('7/ 2/26', ctx).value?.toISOString())
  })
  it('reads a four-digit year', () => {
    expect(iso(coerceDate('7/2/2026', ctx).value)).toBe('2026-07-02')
  })
  it('warns rather than throwing on an unreadable value', () => {
    const r = coerceDate('sometime next quarter', ctx)
    expect(r.value).toBeNull()
    expect(r.warning?.reason).toMatch(/date/i)
  })
  it('treats an empty cell as absent, not as a warning', () => {
    expect(coerceDate('', ctx)).toEqual({ value: null })
    expect(coerceDate(undefined, ctx)).toEqual({ value: null })
  })
})

describe('coerceNumber', () => {
  it('keeps the raw text and warns on the stacked-quantity cell', () => {
    const r = coerceNumber('50000+\n16,400', { rowNumber: 30, column: 'Qtys' })
    expect(r.value).toBeNull()
    expect(r.raw).toBe('50000+\n16,400')
    expect(r.warning?.rawValue).toBe('50000+\n16,400')
  })
  it('strips thousands separators', () => {
    expect(coerceNumber('16,400', { rowNumber: 1, column: 'Qtys' }).value).toBe(16400)
  })
  it('passes a real number straight through', () => {
    expect(coerceNumber(33600, { rowNumber: 1, column: 'Qtys' }).value).toBe(33600)
  })
})

describe('coerceCurrency', () => {
  it('warns on the double-decimal typo and stores nothing numeric', () => {
    const r = coerceCurrency('$114.004.22', { rowNumber: 51, column: 'Value' })
    expect(r.value).toBeNull()
    expect(r.warning?.reason).toMatch(/currency/i)
  })
  it('reads a normal currency string', () => {
    expect(coerceCurrency('$1,234.56', { rowNumber: 1, column: 'Value' }).value).toBe(1234.56)
  })
})

describe('splitChannelTag', () => {
  it.each([
    ['PO06302026>CMLEX LOI', 'PO06302026', 'CMLEX LOI'],
    ['P06282025>AMZ', 'P06282025', 'AMZ'],
    ['P06282025>Retail', 'P06282025', 'Retail'],
    ['P11192025', 'P11192025', null],
  ])('splits %s', (input, po, tag) => {
    expect(splitChannelTag(input)).toEqual({ poNumber: po, channelTag: tag })
  })
})

describe('classifyFulfillment', () => {
  it('classifies MISC lines', () => {
    expect(classifyFulfillment('MISC', null)).toBe('MISC')
  })
  it('classifies a line carrying a work order as contract manufacture', () => {
    expect(classifyFulfillment('S3977101A', 'W0100133948')).toBe('CONTRACT_MFG')
  })
  it('classifies a line with neither as internal', () => {
    expect(classifyFulfillment('S3976205', null)).toBe('INTERNAL')
  })
})
