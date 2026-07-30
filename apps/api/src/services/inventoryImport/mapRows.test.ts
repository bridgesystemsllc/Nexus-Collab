import { describe, it, expect } from 'vitest'
import { mapRows, parseQuantity, MappingError, type ColumnMap } from './mapRows'
import type { ParsedSheet } from './parseSheet'

const MAP: ColumnMap = {
  sku: 'Item',
  name: 'Description',
  brand: 'Brand',
  onHand: 'On Hand',
  committed: 'Allocated',
  available: 'Available',
}

function sheet(headers: string[], rows: Record<string, string>[]): ParsedSheet {
  return { headers, rows }
}

describe('parseQuantity', () => {
  it('reads plain integers and decimals', () => {
    expect(parseQuantity('1150')).toBe(1150)
    expect(parseQuantity('12.5')).toBe(12.5)
  })

  it('reads thousands separators', () => {
    expect(parseQuantity('1,150')).toBe(1150)
    expect(parseQuantity('1,234,567')).toBe(1234567)
  })

  it('reads negatives in both minus and accounting form', () => {
    expect(parseQuantity('-40')).toBe(-40)
    expect(parseQuantity('(40)')).toBe(-40)
  })

  it('returns null for blanks and placeholders', () => {
    expect(parseQuantity('')).toBeNull()
    expect(parseQuantity('   ')).toBeNull()
    expect(parseQuantity('-')).toBeNull()
    expect(parseQuantity(undefined)).toBeNull()
  })

  it('returns null for text rather than guessing a number', () => {
    expect(parseQuantity('N/A')).toBeNull()
    expect(parseQuantity('see notes')).toBeNull()
    expect(parseQuantity('12 units')).toBeNull()
  })
})

describe('mapRows — header resolution', () => {
  it('matches headers case-insensitively and ignoring padding', () => {
    const result = mapRows(
      sheet(['  ITEM ', 'on   hand'], [{ '  ITEM ': 'AMB-1024', 'on   hand': '10' }]),
      { sku: 'Item', onHand: 'On Hand' },
    )
    expect(result.records).toEqual([
      { sku: 'AMB-1024', name: '', brand: '', onHand: 10, committed: 0, available: 10 },
    ])
  })

  it('throws when the SKU column is absent', () => {
    expect(() => mapRows(sheet(['Widget', 'On Hand'], []), MAP)).toThrow(MappingError)
  })

  it('throws when no quantity column is present at all', () => {
    // Applying such a file would zero out every SKU in the snapshot.
    expect(() => mapRows(sheet(['Item', 'Description'], []), MAP)).toThrow(MappingError)
  })

  it('reports both the missing and the found headers', () => {
    try {
      mapRows(sheet(['Widget'], []), MAP)
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(MappingError)
      expect((err as MappingError).expected).toContain('Item')
      expect((err as MappingError).found).toContain('Widget')
    }
  })
})

describe('mapRows — record building', () => {
  it('maps a full row', () => {
    const result = mapRows(
      sheet(
        ['Item', 'Description', 'Brand', 'On Hand', 'Allocated', 'Available'],
        [{ Item: 'AMB-1024', Description: 'Fade Cream', Brand: 'Ambi', 'On Hand': '1150', Allocated: '250', Available: '900' }],
      ),
      MAP,
    )
    expect(result.records[0]).toEqual({
      sku: 'AMB-1024', name: 'Fade Cream', brand: 'Ambi', onHand: 1150, committed: 250, available: 900,
    })
    expect(result.errors).toEqual([])
  })

  it('derives available from on-hand minus committed when absent', () => {
    const result = mapRows(
      sheet(['Item', 'On Hand', 'Allocated'], [{ Item: 'AMB-1024', 'On Hand': '1150', Allocated: '250' }]),
      MAP,
    )
    expect(result.records[0].available).toBe(900)
  })

  it('derives on-hand from available plus committed when absent', () => {
    const result = mapRows(
      sheet(['Item', 'Allocated', 'Available'], [{ Item: 'AMB-1024', Allocated: '250', Available: '900' }]),
      MAP,
    )
    expect(result.records[0].onHand).toBe(1150)
  })

  it('treats a missing committed column as zero', () => {
    const result = mapRows(sheet(['Item', 'On Hand'], [{ Item: 'AMB-1024', 'On Hand': '1150' }]), MAP)
    expect(result.records[0]).toMatchObject({ committed: 0, available: 1150 })
  })
})

describe('mapRows — bad data', () => {
  it('rejects a row with no SKU rather than importing it', () => {
    const result = mapRows(
      sheet(['Item', 'On Hand'], [{ Item: '  ', 'On Hand': '10' }, { Item: 'AMB-1024', 'On Hand': '20' }]),
      MAP,
    )
    expect(result.records).toHaveLength(1)
    expect(result.errors).toEqual([{ row: 1, reason: 'Missing SKU' }])
  })

  it('rejects a row whose quantity is unreadable, naming the column and value', () => {
    const result = mapRows(
      sheet(['Item', 'On Hand'], [{ Item: 'AMB-1024', 'On Hand': 'N/A' }]),
      MAP,
    )
    expect(result.records).toHaveLength(0)
    expect(result.errors[0].reason).toContain('AMB-1024')
    expect(result.errors[0].reason).toContain('On Hand')
    expect(result.errors[0].reason).toContain('N/A')
  })

  it('keeps a row whose committed value is unreadable, since stock is still trustworthy', () => {
    const result = mapRows(
      sheet(['Item', 'On Hand', 'Allocated'], [{ Item: 'AMB-1024', 'On Hand': '1150', Allocated: 'unknown' }]),
      MAP,
    )
    expect(result.records[0]).toMatchObject({ onHand: 1150, committed: 0 })
    expect(result.errors).toEqual([])
  })

  it('collapses duplicate SKUs, keeping the last occurrence', () => {
    const result = mapRows(
      sheet(['Item', 'On Hand'], [
        { Item: 'AMB-1024', 'On Hand': '100' },
        { Item: 'CD-0088', 'On Hand': '50' },
        { Item: 'AMB-1024', 'On Hand': '300' },
      ]),
      MAP,
    )
    expect(result.records).toHaveLength(2)
    expect(result.records.find((r) => r.sku === 'AMB-1024')?.onHand).toBe(300)
    expect(result.duplicateSkus).toEqual(['AMB-1024'])
  })

  it('reports row numbers as counted beneath the header', () => {
    const result = mapRows(
      sheet(['Item', 'On Hand'], [
        { Item: 'AMB-1024', 'On Hand': '10' },
        { Item: '', 'On Hand': '20' },
      ]),
      MAP,
    )
    expect(result.errors[0].row).toBe(2)
  })
})
