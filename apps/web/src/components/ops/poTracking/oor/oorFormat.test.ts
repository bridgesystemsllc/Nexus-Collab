import { describe, it, expect } from 'vitest'
import {
  formatCurrency, formatQty, formatQtyNeed, formatShortDate,
  daysUntil, formatCountdown, toTsv,
} from './oorFormat'

describe('formatCurrency', () => {
  it('matches the workbook $#,##0.00', () => {
    expect(formatCurrency(3277880.73)).toBe('$3,277,880.73')
    expect(formatCurrency(3.26)).toBe('$3.26')
  })
  it('renders nothing for an absent value rather than $0.00', () => {
    expect(formatCurrency(null)).toBe('')
    expect(formatCurrency(undefined)).toBe('')
    expect(formatCurrency('')).toBe('')
  })
  it('accepts the string a Decimal column serialises to', () => {
    expect(formatCurrency('1234.5')).toBe('$1,234.50')
  })
})

describe('formatQty', () => {
  it('matches the workbook #,##0', () => {
    expect(formatQty(704839)).toBe('704,839')
    expect(formatQty(11350)).toBe('11,350')
  })
  it('is blank when there is no quantity', () => {
    expect(formatQty(null)).toBe('')
  })
})

describe('formatQtyNeed', () => {
  it('matches the workbook #,##0.0', () => {
    expect(formatQtyNeed(746.2676529)).toBe('746.3')
  })
  it('puts negatives in parentheses, the way the source does', () => {
    expect(formatQtyNeed(-12.5)).toBe('(12.5)')
    expect(formatQtyNeed(-1234.56)).toBe('(1,234.6)')
  })
})

describe('formatShortDate', () => {
  it('matches the workbook mm-dd-yy', () => {
    expect(formatShortDate('2026-08-24T00:00:00.000Z')).toBe('08-24-26')
  })
  it('does not shift a calendar date into the viewer timezone', () => {
    // A date read as local time would render 08-23-26 anywhere west of UTC.
    expect(formatShortDate('2026-08-24T00:00:00.000Z')).toBe('08-24-26')
  })
  it('is blank for an absent or unreadable date', () => {
    expect(formatShortDate(null)).toBe('')
    expect(formatShortDate('not a date')).toBe('')
  })
})

describe('daysUntil / formatCountdown', () => {
  const today = new Date('2026-08-30T18:00:00Z')
  it('counts whole days regardless of the time of day', () => {
    expect(daysUntil('2026-09-09T00:00:00Z', today)).toBe(10)
  })
  it('goes negative once the date has passed', () => {
    expect(daysUntil('2026-08-28T00:00:00Z', today)).toBe(-2)
  })
  it('reads as English', () => {
    expect(formatCountdown('2026-08-31T00:00:00Z', today)).toBe('in 1 day')
    expect(formatCountdown('2026-09-09T00:00:00Z', today)).toBe('in 10 days')
    expect(formatCountdown('2026-08-30T00:00:00Z', today)).toBe('today')
    expect(formatCountdown('2026-08-29T00:00:00Z', today)).toBe('1 day ago')
  })
})

describe('toTsv', () => {
  it('joins cells with tabs so a paste lands in Excel columns', () => {
    expect(toTsv([['a', 'b'], ['c', 'd']])).toBe('a\tb\nc\td')
  })
  it('flattens tabs and newlines inside a cell so the shape survives', () => {
    expect(toTsv([['multi\nline', 'with\ttab']])).toBe('multi line\twith tab')
  })
})
