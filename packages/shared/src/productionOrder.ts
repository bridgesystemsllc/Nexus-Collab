// ─── ProductionOrder DTO + pure shapers ─────────────────────
import { erpStatusToDisplay } from './productionStatus'

export interface ProductionOrderRow {
  id: string
  erpId: string | null
  poNumber: string
  manufacturer: string
  brand: string | null
  status: string
  urgency: string
  orderDate: string | null
  deliveryDue: string | null
  eta: string | null
  qtyOrdered: number
  qtyReceived: number
  lineCount: number
  notes: string | null
  progress: number
  value: number
  syncStatus: string
  lastSyncedAt: string | null
}

export interface ProductionOrderDTO extends ProductionOrderRow {
  statusLabel: string
  statusColor: string
  qtyRemaining: number
}

export function toProductionOrderDTO(row: ProductionOrderRow): ProductionOrderDTO {
  const { label, colorVar } = erpStatusToDisplay(row.status)
  const qtyRemaining = Math.max(0, row.qtyOrdered - row.qtyReceived)
  return { ...row, statusLabel: label, statusColor: colorVar, qtyRemaining }
}

export interface ManufacturerGroup {
  manufacturer: string
  count: number
  unitsRemaining: number
  orders: ProductionOrderDTO[]
}

export function groupByManufacturer(orders: ProductionOrderDTO[]): ManufacturerGroup[] {
  const byName = new Map<string, ProductionOrderDTO[]>()
  for (const o of orders) {
    const key = o.manufacturer || 'Unassigned'
    const list = byName.get(key) ?? []
    list.push(o)
    byName.set(key, list)
  }
  const groups: ManufacturerGroup[] = []
  for (const [manufacturer, list] of byName) {
    groups.push({
      manufacturer,
      count: list.length,
      unitsRemaining: list.reduce((sum, o) => sum + o.qtyRemaining, 0),
      orders: list,
    })
  }
  groups.sort((a, b) => b.unitsRemaining - a.unitsRemaining)
  return groups
}

export interface ProductionSummary {
  activePOs: number
  lineItems: number
  unitsToReceive: number
  receivedToDate: number
  pastDue: number
}

export function computeSummary(orders: ProductionOrderDTO[], now: Date): ProductionSummary {
  let lineItems = 0
  let unitsToReceive = 0
  let receivedToDate = 0
  let pastDue = 0
  for (const o of orders) {
    lineItems += o.lineCount
    unitsToReceive += o.qtyRemaining
    receivedToDate += o.qtyReceived
    if (o.deliveryDue && o.qtyRemaining > 0 && new Date(o.deliveryDue) < now) {
      pastDue += 1
    }
  }
  return {
    activePOs: orders.length,
    lineItems,
    unitsToReceive,
    receivedToDate,
    pastDue,
  }
}
