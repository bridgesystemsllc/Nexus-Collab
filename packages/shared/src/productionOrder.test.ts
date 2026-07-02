import { describe, it, expect } from 'vitest'
import {
  toProductionOrderDTO,
  groupByManufacturer,
  computeSummary,
  type ProductionOrderRow,
} from './productionOrder'

function row(overrides: Partial<ProductionOrderRow> = {}): ProductionOrderRow {
  return {
    id: 'n1',
    erpId: 'e1',
    poNumber: 'P0001',
    manufacturer: 'Paklab',
    brand: null,
    status: 'SENT_TO_VENDOR',
    urgency: 'NORMAL',
    orderDate: '2026-06-21',
    deliveryDue: '2026-11-29',
    eta: '2026-11-29',
    qtyOrdered: 100000,
    qtyReceived: 20000,
    lineCount: 2,
    notes: null,
    progress: 0,
    value: 0,
    syncStatus: 'SYNCED',
    lastSyncedAt: null,
    ...overrides,
  }
}

describe('toProductionOrderDTO', () => {
  it('adds label, color, and computed remaining', () => {
    const dto = toProductionOrderDTO(row())
    expect(dto.statusLabel).toBe('Sent to Vendor')
    expect(dto.statusColor).toBe('--info')
    expect(dto.qtyRemaining).toBe(80000)
  })

  it('never returns a negative remaining', () => {
    const dto = toProductionOrderDTO(row({ qtyOrdered: 100, qtyReceived: 250 }))
    expect(dto.qtyRemaining).toBe(0)
  })
})

describe('groupByManufacturer', () => {
  it('groups, counts, and sums remaining, sorted by unitsRemaining desc', () => {
    const orders = [
      toProductionOrderDTO(row({ id: 'a', manufacturer: 'Paklab', qtyOrdered: 100, qtyReceived: 0 })),
      toProductionOrderDTO(row({ id: 'b', manufacturer: 'Twincraft', qtyOrdered: 500, qtyReceived: 0 })),
      toProductionOrderDTO(row({ id: 'c', manufacturer: 'Paklab', qtyOrdered: 50, qtyReceived: 0 })),
    ]
    const groups = groupByManufacturer(orders)
    expect(groups.map((g) => g.manufacturer)).toEqual(['Twincraft', 'Paklab'])
    const paklab = groups.find((g) => g.manufacturer === 'Paklab')!
    expect(paklab.count).toBe(2)
    expect(paklab.unitsRemaining).toBe(150)
  })
})

describe('computeSummary', () => {
  it('computes KPIs including past-due against now', () => {
    const now = new Date('2026-07-02T00:00:00Z')
    const orders = [
      toProductionOrderDTO(row({ id: 'a', qtyOrdered: 100, qtyReceived: 40, lineCount: 2, deliveryDue: '2026-06-01' })),
      toProductionOrderDTO(row({ id: 'b', qtyOrdered: 200, qtyReceived: 0, lineCount: 3, deliveryDue: '2026-12-01' })),
    ]
    const s = computeSummary(orders, now)
    expect(s.activePOs).toBe(2)
    expect(s.lineItems).toBe(5)
    expect(s.unitsToReceive).toBe(260) // (100-40) + (200-0)
    expect(s.receivedToDate).toBe(40)
    expect(s.pastDue).toBe(1) // only order 'a' is past 2026-07-02
  })
})
