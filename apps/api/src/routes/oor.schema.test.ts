import { describe, it, expect } from 'vitest'
import {
  listLinesQuerySchema,
  buildLineWhere,
  buildLineOrderBy,
  patchLineSchema,
  patchNodeSchema,
  MAX_PAGE_SIZE,
} from './oor.schema'

const parse = (q: Record<string, unknown>) => listLinesQuerySchema.parse(q)

describe('listLinesQuerySchema', () => {
  it('defaults to the first page of open lines by required date', () => {
    const q = parse({})
    expect(q).toMatchObject({ page: 1, pageSize: 50, sort: 'requiredDeliveryDate', dir: 'asc', openOnly: true })
  })

  it('accepts a repeated query param and a comma-separated one alike', () => {
    expect(parse({ status: ['OPEN', 'SHIPPED'] }).status).toEqual(['OPEN', 'SHIPPED'])
    expect(parse({ status: 'OPEN,SHIPPED' }).status).toEqual(['OPEN', 'SHIPPED'])
  })

  it('rejects a status that is not in the vocabulary', () => {
    expect(() => parse({ status: 'INVENTED' })).toThrow()
  })

  it('caps the page size so one request cannot ask for the whole table', () => {
    expect(() => parse({ pageSize: MAX_PAGE_SIZE + 1 })).toThrow()
  })

  it('rejects a sort on a column that is not indexed for it', () => {
    expect(() => parse({ sort: 'rawRow' })).toThrow()
  })
})

describe('buildLineWhere', () => {
  it('always scopes to the organization', () => {
    expect(buildLineWhere('org_1', parse({})).orgId).toBe('org_1')
  })

  it('shows only open lines unless asked otherwise', () => {
    expect(buildLineWhere('org_1', parse({})).isOpen).toBe(true)
    expect(buildLineWhere('org_1', parse({ openOnly: 'false' })).isOpen).toBeUndefined()
  })

  it('searches every identifier an operator might paste in', () => {
    const where = buildLineWhere('org_1', parse({ search: 'S010' }))
    const fields = (where.OR as Record<string, unknown>[]).map((c) => Object.keys(c)[0])
    expect(fields).toEqual([
      'customerPoNumber', 'salesOrderNumber', 'itemNumber', 'custPartNumber',
      'description', 'workOrderNumber', 'jobNumber',
    ])
  })

  it('asks the tree whether a line is short, both ways round', () => {
    expect(buildLineWhere('org_1', parse({ hasShortage: 'true' })).nodes).toHaveProperty('some')
    expect(buildLineWhere('org_1', parse({ hasShortage: 'false' })).nodes).toHaveProperty('none')
  })

  it('leaves the shortage filter out entirely when it was not asked for', () => {
    expect(buildLineWhere('org_1', parse({})).nodes).toBeUndefined()
  })

  it('filters by brand, fulfillment type, CM, PO and required date', () => {
    const where = buildLineWhere('org_1', parse({
      brandId: 'brand_1',
      fulfillmentType: 'CONTRACT_MFG',
      cmCode: 'ACT',
      customerPoNumber: 'PO-123',
      requiredBefore: '2026-09-30',
    }))
    expect(where.brandId).toBe('brand_1')
    expect(where.fulfillmentType).toBe('CONTRACT_MFG')
    expect(where.cmCode).toEqual({ equals: 'ACT', mode: 'insensitive' })
    expect(where.customerPoNumber).toEqual({ equals: 'PO-123', mode: 'insensitive' })
    expect(where.requiredDeliveryDate).toEqual({ lte: new Date('2026-09-30') })
  })
})

describe('buildLineOrderBy', () => {
  it('adds a stable secondary key so pages cannot shuffle', () => {
    expect(buildLineOrderBy(parse({ sort: 'qtyRemaining', dir: 'desc' }))).toEqual([
      { qtyRemaining: 'desc' },
      { id: 'asc' },
    ])
  })
})

describe('patchLineSchema', () => {
  it('refuses a status override with no reason', () => {
    expect(() => patchLineSchema.parse({ lineStatus: 'ON_HOLD_QC' })).toThrow()
  })

  it('accepts a status override that explains itself', () => {
    const parsed = patchLineSchema.parse({ lineStatus: 'ON_HOLD_QC', statusOverrideReason: 'Failed micro' })
    expect(parsed.lineStatus).toBe('ON_HOLD_QC')
  })

  it('allows editing other fields without a reason', () => {
    expect(patchLineSchema.parse({ ownerId: 'member_1' }).ownerId).toBe('member_1')
  })

  it('allows clearing the owner', () => {
    expect(patchLineSchema.parse({ ownerId: null }).ownerId).toBeNull()
  })
})

describe('patchNodeSchema', () => {
  it('accepts the fields the production tracker edits inline', () => {
    const parsed = patchNodeSchema.parse({
      qtyOnHand: '250', etaDate: '2026-09-10', etaConfidence: 'confirmed',
      shortageReason: 'MOQ_CONSTRAINT', nodeStatus: 'RESOLVED', mfgComment: 'Hot fill',
    })
    expect(parsed.qtyOnHand).toBe(250)
    expect(parsed.etaDate).toEqual(new Date('2026-09-10'))
  })

  it('allows clearing an ETA', () => {
    expect(patchNodeSchema.parse({ etaDate: null }).etaDate).toBeNull()
  })

  it('rejects a shortage reason outside the vocabulary', () => {
    expect(() => patchNodeSchema.parse({ shortageReason: 'BECAUSE' })).toThrow()
  })
})
