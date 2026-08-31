import { describe, it, expect } from 'vitest'
import { ErpSourceAdapter, erpOrderToLines } from './erpSourceAdapter'
import type { ErpOpenOrder } from '../../lib/erpOpenOrders'

const order = (over: Partial<ErpOpenOrder> = {}): ErpOpenOrder => ({
  erpPoId: 'erp_1',
  poNumber: 'PO-100',
  manufacturer: 'ACT',
  poStatus: 'In Production',
  urgency: 'Normal',
  orderDate: '2026-08-01',
  deliveryDue: '2026-09-15',
  eta: '',
  qtyOrdered: 1000,
  qtyReceived: 250,
  qtyRemaining: 750,
  lines: [],
  notes: '',
  source: 'ERP_KAREVE',
  ...over,
})

describe('erpOrderToLines', () => {
  it('produces one OOR line per PO line, because a line is what can be short', () => {
    const lines = erpOrderToLines(
      order({
        lines: [
          { lineNo: 1, sku: 'SKU-A', description: 'Cream 4oz', qtyOrdered: 600, qtyReceived: 100, unitPrice: 3.5 },
          { lineNo: 2, sku: 'SKU-B', description: 'Lotion 8oz', qtyOrdered: 400, qtyReceived: 150, unitPrice: 2 },
        ],
      }),
    )
    expect(lines).toHaveLength(2)
    expect(lines[0].itemNumber).toBe('SKU-A')
    expect(lines[0].qtyRemaining).toBe(500)
    expect(lines[0].valueComputed).toBe(1750)
    expect(lines[1].qtyRemaining).toBe(250)
  })

  it('falls back to a single header-level line when the ERP sends no lines', () => {
    const lines = erpOrderToLines(order())
    expect(lines).toHaveLength(1)
    expect(lines[0].qtyRemaining).toBe(750)
  })

  it('carries the ERP id so a later sync can find the same row', () => {
    expect(erpOrderToLines(order())[0].externalIds).toEqual({ erpPoId: 'erp_1' })
  })

  it('treats a manufacturer as contract manufacture and records the code', () => {
    const line = erpOrderToLines(order())[0]
    expect(line.fulfillmentType).toBe('CONTRACT_MFG')
    expect(line.cmCode).toBe('ACT')
  })

  it('treats an unassigned manufacturer as internal', () => {
    const line = erpOrderToLines(order({ manufacturer: 'Unassigned' }))[0]
    expect(line.fulfillmentType).toBe('INTERNAL')
    expect(line.cmCode).toBeNull()
  })

  it('zeroes the remaining quantity once the ERP calls the PO received', () => {
    const line = erpOrderToLines(order({ poStatus: 'Received' }))[0]
    expect(line.qtyRemaining).toBe(0)
  })

  it('never invents a shortage tree the ERP does not have', () => {
    expect(erpOrderToLines(order())[0].nodes).toEqual([])
  })
})

describe('ErpSourceAdapter', () => {
  it('satisfies the same interface the file drop does', async () => {
    const adapter = new ErpSourceAdapter([order(), order({ erpPoId: 'erp_2', poNumber: 'PO-200' })])
    const report = await adapter.load({ brandId: 'b', orgId: 'o' })
    expect(adapter.key).toBe('erp')
    expect(report.lines).toHaveLength(2)
    expect(report.warnings).toEqual([])
  })
})
