import { toOpenOrder, type OpenOrder } from '@/components/ops/production/openOrderData'
import type { OorLineRow } from '@/components/ops/poTracking/oor/useOorQueries'

export interface ManufacturerCodeMapping {
  erpManufacturerName: string
  cmCode: string
}

export interface CmProductionUpdate {
  id: string
  text: string
  at: string
  actor: string
  poNumber: string
  kind: string
}

export function normalizeManufacturer(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function cmCodeOf(cm: any): string {
  const data = cm?.data ?? cm ?? {}
  return String(data.cmCode ?? data.code ?? '').trim()
}

/**
 * Selects canonical OPEN_ORDERS records for one CM. Name matching is exact
 * after normalization; unlike the old production tracker this also follows the
 * organization's saved ERP-manufacturer -> report-CM-code mapping.
 */
export function selectCmOpenOrders(
  items: Array<{ id: string; data: any }>,
  cm: any,
  mappings: ManufacturerCodeMapping[],
): OpenOrder[] {
  const data = cm?.data ?? cm ?? {}
  const cmName = normalizeManufacturer(data.name)
  const cmCode = normalizeManufacturer(cmCodeOf(data))
  const mappedCodes = new Map(
    mappings.map((mapping) => [
      normalizeManufacturer(mapping.erpManufacturerName),
      normalizeManufacturer(mapping.cmCode),
    ]),
  )
  const seen = new Set<string>()

  return items
    .map(toOpenOrder)
    .filter((order) => {
      const manufacturer = normalizeManufacturer(order.manufacturer)
      const matchesName = Boolean(cmName && manufacturer === cmName)
      const matchesCode = Boolean(cmCode && mappedCodes.get(manufacturer) === cmCode)
      if (!matchesName && !matchesCode) return false

      // OPEN_ORDERS is PO-level. Guard against accidentally rendering one row
      // per OOR line (or duplicate snapshots) if malformed input is returned.
      const identity = normalizeManufacturer(order.erpPoId || order.poNumber) || order.id
      if (seen.has(identity)) return false
      seen.add(identity)
      return true
    })
}

export function isActiveOpenOrder(order: OpenOrder): boolean {
  const status = normalizeManufacturer(order.poStatus)
  if (['received', 'closed', 'cancelled', 'canceled', 'complete', 'completed'].includes(status)) return false
  return order.qtyRemaining > 0
}

export function linesForOrders(lines: OorLineRow[], orders: OpenOrder[]): OorLineRow[] {
  const orderIds = new Set(orders.map((order) => order.id))
  // ERP-reconciled lines carry the canonical OPEN_ORDERS ModuleItem id. Never
  // fall back to PO number for attribution: PO numbers are not globally unique
  // across manufacturers, so that can leak another CM's collaboration.
  return lines.filter((line) => Boolean(
    line.productionOrderItemId && orderIds.has(line.productionOrderItemId),
  ))
}

export function statusesByPo(lines: OorLineRow[]): Map<string, string[]> {
  const result = new Map<string, string[]>()
  for (const line of lines) {
    const po = normalizeManufacturer(line.customerPoNumber)
    if (!po) continue
    const statuses = result.get(po) ?? []
    if (line.lineStatus && !statuses.includes(line.lineStatus)) statuses.push(line.lineStatus)
    result.set(po, statuses)
  }
  return result
}

export function buildProductionUpdates(
  orders: OpenOrder[],
  lines: OorLineRow[],
  activityByLine: Record<string, Array<{ id: string; kind: string; at: string; actor: string | null; summary: string }>>,
): CmProductionUpdate[] {
  const updates: CmProductionUpdate[] = []

  for (const order of orders) {
    for (const note of order.notes) {
      updates.push({
        id: `open-order-note:${order.id}:${note.id}`,
        text: note.noteText,
        at: note.createdAt || note.noteDate,
        actor: note.createdBy || 'User',
        poNumber: order.poNumber,
        kind: 'note',
      })
    }
  }

  for (const line of lines) {
    for (const entry of activityByLine[line.id] ?? []) {
      updates.push({
        id: `oor:${line.id}:${entry.kind}:${entry.id}`,
        text: entry.summary,
        at: entry.at,
        actor: entry.actor || 'Operations',
        poNumber: line.customerPoNumber || '',
        kind: entry.kind,
      })
    }
  }

  return updates
    .filter((update) => Boolean(update.text))
    .sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime())
}