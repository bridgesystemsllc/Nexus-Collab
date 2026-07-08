// ─── Open-Order (Purchase Order) view helpers ───────────────
// Pure transforms over the OPEN_ORDERS module items. The ERP owns the PO
// lifecycle fields (mirrored from apps/api/src/lib/erpOpenOrders.ts); Nexus-only
// data lives under `nexusFields`. No I/O here so the view stays declarative.

export interface OpenOrderLine {
  lineNo: number
  sku: string
  description: string
  qtyOrdered: number
  qtyReceived: number
  unitPrice: number
}

export interface OpenOrderNote {
  id: string
  noteDate: string
  noteText: string
  createdBy: string
  createdAt: string
}

export interface OpenOrder {
  id: string
  erpPoId: string
  poNumber: string
  manufacturer: string
  poStatus: string
  urgency: 'Normal' | 'Urgent'
  orderDate: string
  deliveryDue: string
  eta: string
  qtyOrdered: number
  qtyReceived: number
  qtyRemaining: number
  lines: OpenOrderLine[]
  notes: OpenOrderNote[]
  nexusFields: Record<string, any>
}

/** The PO statuses used for the status filter (mirrors the ERP lifecycle). */
export const PO_STATUSES = [
  'Sent to Vendor',
  'Acknowledged',
  'In Production',
  'Shipped',
  'Received',
] as const

function s(v: unknown): string {
  return v === null || v === undefined ? '' : String(v)
}
function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Normalize a raw OPEN_ORDERS module item into a typed OpenOrder. */
export function toOpenOrder(item: { id: string; data: any }): OpenOrder {
  const d = item.data ?? {}
  const lines: OpenOrderLine[] = Array.isArray(d.lines)
    ? d.lines.map((l: any, i: number) => ({
        lineNo: num(l?.lineNo) || i + 1,
        sku: s(l?.sku),
        description: s(l?.description),
        qtyOrdered: num(l?.qtyOrdered),
        qtyReceived: num(l?.qtyReceived),
        unitPrice: num(l?.unitPrice),
      }))
    : []
  return {
    id: item.id,
    erpPoId: s(d.erpPoId),
    poNumber: s(d.poNumber ?? d.customerPo),
    manufacturer: s(d.manufacturer ?? d.cm) || 'Unassigned',
    poStatus: s(d.poStatus ?? d.status) || 'Sent to Vendor',
    urgency: s(d.urgency) === 'Urgent' ? 'Urgent' : 'Normal',
    orderDate: s(d.orderDate),
    deliveryDue: s(d.deliveryDue),
    eta: s(d.eta),
    qtyOrdered: num(d.qtyOrdered),
    qtyReceived: num(d.qtyReceived),
    qtyRemaining:
      d.qtyRemaining != null ? num(d.qtyRemaining) : Math.max(num(d.qtyOrdered) - num(d.qtyReceived), 0),
    lines,
    notes: Array.isArray(d.notes) ? d.notes : [],
    nexusFields: d.nexusFields ?? {},
  }
}

export interface ManufacturerGroup {
  manufacturer: string
  orders: OpenOrder[]
  poCount: number
  unitsRemaining: number
}

/** Group orders by manufacturer, sorted alphabetically; orders sorted by PO#. */
export function groupByManufacturer(orders: OpenOrder[]): ManufacturerGroup[] {
  const byMfr = new Map<string, OpenOrder[]>()
  for (const o of orders) {
    const key = o.manufacturer || 'Unassigned'
    const arr = byMfr.get(key)
    if (arr) arr.push(o)
    else byMfr.set(key, [o])
  }
  return Array.from(byMfr.entries())
    .map(([manufacturer, list]) => ({
      manufacturer,
      orders: [...list].sort((a, b) => a.poNumber.localeCompare(b.poNumber)),
      poCount: list.length,
      unitsRemaining: list.reduce((sum, o) => sum + o.qtyRemaining, 0),
    }))
    .sort((a, b) => a.manufacturer.localeCompare(b.manufacturer))
}

export interface OpenOrderKpis {
  activePOs: number
  lineItems: number
  toReceive: number
  received: number
  pastDue: number
}

/** Compute the KPI-strip numbers shown across the top of the Open Orders view. */
export function openOrderKpis(orders: OpenOrder[]): OpenOrderKpis {
  const today = new Date().toISOString().slice(0, 10)
  let lineItems = 0
  let toReceive = 0
  let received = 0
  let pastDue = 0
  for (const o of orders) {
    lineItems += o.lines.length
    toReceive += o.qtyRemaining
    received += o.qtyReceived
    const due = o.eta || o.deliveryDue
    if (due && due < today && o.qtyRemaining > 0) pastDue++
  }
  return { activePOs: orders.length, lineItems, toReceive, received, pastDue }
}
