import { describe, it, expect } from 'vitest'

describe('CMS list shape', () => {
  const validData = {
    name: 'Acme Manufacturing',
    contractStatus: 'Active',
    brands: ['BrandA', 'BrandB'],
    erpId: 'ERP-123',
    cmCode: 'CM001',
    legalName: 'Acme Manufacturing LLC',
    cmType: 'Full Service',
    vendorId: 'V-456',
    headquarters: { city: 'Los Angeles', state: 'CA', country: 'USA' },
    taxId: 'SHOULD-NEVER-APPEAR',
  }

  const str = (data: Record<string, unknown>, k: string) =>
    typeof data[k] === 'string' ? (data[k] as string) : null

  const mapItem = (item: { id: string; data: Record<string, unknown> }) => {
    const data = item.data || {}
    return {
      id: item.id,
      name: typeof data.name === 'string' ? data.name : '',
      status:
        typeof data.contractStatus === 'string'
          ? data.contractStatus
          : typeof data.status === 'string'
            ? data.status
            : null,
      brands: Array.isArray(data.brands) ? data.brands : [],
      erpId: str(data, 'erpId'),
      cmCode: str(data, 'cmCode'),
      legalName: str(data, 'legalName'),
      cmType: str(data, 'cmType'),
      vendorId: str(data, 'vendorId'),
      headquarters: data.headquarters ?? null,
    }
  }

  it('includes all six ERP fields', () => {
    const result = mapItem({ id: 'cm-1', data: validData })
    expect(result).toEqual({
      id: 'cm-1',
      name: 'Acme Manufacturing',
      status: 'Active',
      brands: ['BrandA', 'BrandB'],
      erpId: 'ERP-123',
      cmCode: 'CM001',
      legalName: 'Acme Manufacturing LLC',
      cmType: 'Full Service',
      vendorId: 'V-456',
      headquarters: { city: 'Los Angeles', state: 'CA', country: 'USA' },
    })
  })

  it('never includes taxId', () => {
    const result = mapItem({ id: 'cm-1', data: validData })
    expect(result).not.toHaveProperty('taxId')
    expect(JSON.stringify(result)).not.toContain('taxId')
    expect(JSON.stringify(result)).not.toContain('SHOULD-NEVER-APPEAR')
  })

  it('handles missing ERP fields with null', () => {
    const result = mapItem({ id: 'cm-2', data: { name: 'Local CM' } })
    expect(result).toEqual({
      id: 'cm-2',
      name: 'Local CM',
      status: null,
      brands: [],
      erpId: null,
      cmCode: null,
      legalName: null,
      cmType: null,
      vendorId: null,
      headquarters: null,
    })
  })

  it('handles string headquarters', () => {
    const result = mapItem({
      id: 'cm-3',
      data: { name: 'Test CM', headquarters: 'New York, NY' },
    })
    expect(result.headquarters).toBe('New York, NY')
  })

  it('handles object headquarters', () => {
    const result = mapItem({
      id: 'cm-4',
      data: { name: 'Test CM', headquarters: { city: 'Chicago', region: 'IL', country: 'USA' } },
    })
    expect(result.headquarters).toEqual({ city: 'Chicago', region: 'IL', country: 'USA' })
  })

  it('prefers contractStatus over status', () => {
    const result = mapItem({
      id: 'cm-5',
      data: { name: 'Test CM', contractStatus: 'Preferred', status: 'active' },
    })
    expect(result.status).toBe('Preferred')
  })

  it('falls back to status when contractStatus is missing', () => {
    const result = mapItem({
      id: 'cm-6',
      data: { name: 'Test CM', status: 'active' },
    })
    expect(result.status).toBe('active')
  })

  it('handles empty data object', () => {
    const result = mapItem({ id: 'cm-7', data: {} })
    expect(result).toEqual({
      id: 'cm-7',
      name: '',
      status: null,
      brands: [],
      erpId: null,
      cmCode: null,
      legalName: null,
      cmType: null,
      vendorId: null,
      headquarters: null,
    })
  })
})
