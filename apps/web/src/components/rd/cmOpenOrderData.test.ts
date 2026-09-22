import { describe, expect, it } from 'vitest'
import {
  buildProductionUpdates,
  isActiveOpenOrder,
  linesForOrders,
  selectCmOpenOrders,
  statusesByPo,
} from './cmOpenOrderData'

const item = (id: string, poNumber: string, manufacturer: string, extra: Record<string, unknown> = {}) => ({
  id,
  data: { poNumber, manufacturer, poStatus: 'In Production', qtyOrdered: 10, qtyReceived: 2, ...extra },
})

describe('CM canonical open-order projection', () => {
  it('matches normalized ERP names and organization mappings without leaking another CM', () => {
    const orders = selectCmOpenOrders(
      [
        item('1', 'PO-1', 'Acme, Inc.'),
        item('2', 'PO-2', 'Acme ERP West'),
        item('3', 'PO-3', 'Other ERP'),
      ],
      { name: '  ACME INC ', cmCode: 'ACM' },
      [
        { erpManufacturerName: 'Acme ERP West', cmCode: 'acm' },
        { erpManufacturerName: 'Other ERP', cmCode: 'OTH' },
      ],
    )
    expect(orders.map((order) => order.poNumber)).toEqual(['PO-1', 'PO-2'])
  })

  it('renders each canonical PO once even when duplicate snapshots are supplied', () => {
    const orders = selectCmOpenOrders(
      [item('1', 'PO-1', 'Acme'), item('2', 'PO-1', 'Acme')],
      { name: 'Acme' },
      [],
    )
    expect(orders).toHaveLength(1)
  })

  it('keeps line statuses and collaboration attached only to selected PO numbers', () => {
    const orders = selectCmOpenOrders([item('1', 'PO-1', 'Acme')], { name: 'Acme' }, [])
    const lines = [
      { id: 'line-1', productionOrderItemId: '1', customerPoNumber: 'po-1', lineStatus: 'SHORT_MATERIAL' },
      { id: 'line-2', productionOrderItemId: '2', customerPoNumber: 'PO-OTHER', lineStatus: 'ON_TRACK' },
    ] as any[]
    const relevant = linesForOrders(lines, orders)
    expect(relevant.map((line) => line.id)).toEqual(['line-1'])
    expect(statusesByPo(relevant).get('po 1')).toEqual(['SHORT_MATERIAL'])

    const updates = buildProductionUpdates(
      orders,
      relevant,
      {
        'line-1': [{ id: 'comment-1', kind: 'comment', at: '2025-01-02', actor: 'Ana', summary: 'Material delayed' }],
        'line-2': [{ id: 'comment-2', kind: 'comment', at: '2025-01-03', actor: 'Ben', summary: 'Must not leak' }],
      },
    )
    expect(updates.map((update) => update.text)).toEqual(['Material delayed'])
  })

  it('uses the canonical item link for an unmapped exact-name CM', () => {
    const orders = selectCmOpenOrders([item('order-acme', 'PO-1', 'Acme')], { name: 'ACME' }, [])
    const relevant = linesForOrders([
      { id: 'linked', productionOrderItemId: 'order-acme', customerPoNumber: 'PO-1' },
    ] as any[], orders)
    expect(relevant.map((line) => line.id)).toEqual(['linked'])
  })

  it('does not leak a same-number PO from another manufacturer', () => {
    const acme = selectCmOpenOrders([item('order-acme', 'PO-1', 'Acme')], { name: 'Acme' }, [])
    const lines = [
      { id: 'acme-line', productionOrderItemId: 'order-acme', customerPoNumber: 'PO-1' },
      { id: 'other-line', productionOrderItemId: 'order-other', customerPoNumber: 'PO-1' },
    ] as any[]
    expect(linesForOrders(lines, acme).map((line) => line.id)).toEqual(['acme-line'])
  })

  it('includes canonical PO notes and treats zero-remaining and closed orders as inactive', () => {
    const [zero] = selectCmOpenOrders(
      [item('1', 'PO-1', 'Acme', {
        qtyReceived: 10,
        notes: [{ id: 'note-1', noteText: 'Received in full', noteDate: '2025-01-04', createdAt: '', createdBy: 'Lee' }],
      })],
      { name: 'Acme' },
      [],
    )
    expect(isActiveOpenOrder(zero)).toBe(false)
    expect(buildProductionUpdates([zero], [], {})[0]).toMatchObject({ text: 'Received in full', poNumber: 'PO-1' })

    const [closed] = selectCmOpenOrders(
      [item('2', 'PO-2', 'Acme', { poStatus: 'Closed', qtyReceived: 0 })],
      { name: 'Acme' },
      [],
    )
    expect(isActiveOpenOrder(closed)).toBe(false)
  })
})